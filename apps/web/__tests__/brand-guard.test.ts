import { readdirSync, readFileSync, statSync } from 'fs'
import path from 'path'

/**
 * Keeps the white-label work from being undone: the company name and the city must come from `brand`
 * (packages/utils/src/brand.ts), not be typed into pages, e-mails or AI prompts.
 */
const APPS = path.resolve(__dirname, '../..')
const SKIP_DIRS = new Set(['node_modules', '.next', '__tests__', 'e2e', 'public'])

function sources(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue
    const full = path.join(dir, name)
    if (statSync(full).isDirectory()) sources(full, out)
    else if (/\.(ts|tsx)$/.test(name) && !/\.(test|spec|d)\.tsx?$/.test(name)) out.push(full)
  }
  return out
}

/** Places that still name Berlin, and why. Add a file here only for a real reason. */
const BERLIN_ALLOWED: Record<string, string> = {
  'web/app/privacy/page.tsx': 'names the Berlin data protection authority, which is a legal fact for a Berlin business',
  'admin/app/integrations/page.tsx': 'describes a third-party key-cabinet network in Berlin',
  'web/app/admin/api-keys/page.tsx': 'an example name in an input hint',
}

describe('brand wording is not hard-coded', () => {
  const files = [...sources(path.join(APPS, 'web')), ...sources(path.join(APPS, 'admin'))].map((f) => ({
    rel: path.relative(APPS, f).split(path.sep).join('/'),
    text: readFileSync(f, 'utf8'),
  }))

  it('found the source files to check', () => {
    expect(files.length).toBeGreaterThan(50)
  })

  it('no file types the RECI name or its addresses', () => {
    const offenders = files.filter((f) => /RECI|recitransport|reci-transport/.test(f.text.replace(/RECI_[A-Z_]+/g, ''))).map((f) => f.rel)
    expect(offenders).toEqual([])
  })

  it('Berlin only appears where it is a fact about Berlin, not the name of this business\'s city', () => {
    const offenders = files.filter((f) => /Berlin/.test(f.text) && !(f.rel in BERLIN_ALLOWED)).map((f) => f.rel)
    expect(offenders).toEqual([])
  })

  it('the allowed list does not go stale', () => {
    const stale = Object.keys(BERLIN_ALLOWED).filter((rel) => !files.find((f) => f.rel === rel && /Berlin/.test(f.text)))
    expect(stale).toEqual([])
  })
})
