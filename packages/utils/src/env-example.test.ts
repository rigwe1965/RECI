// Every environment variable the code reads is documented in the .env.example of the app that reads it, and everything
// documented is still used. Each Next.js app loads only its own .env.local, so a setting the admin app reads must be in
// apps/admin/.env.example: listed in the root file, it would be set where the admin app never sees it.
//   apps/admin/**  -> apps/admin/.env.example
//   apps/mobile/** -> apps/mobile/.env.example
//   everything else (apps/web, packages, root scripts) -> .env.example
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const ROOT = fileURLToPath(new URL('../../../', import.meta.url))
const SKIP = new Set(['node_modules', '.git', '.next', '.turbo', 'coverage', 'dist', 'e2e', 'load-tests', '__tests__', 'tests'])
// Provided by Node, Next.js or CI, never set by hand.
const SET_BY_PLATFORM = new Set(['NODE_ENV', 'NEXT_RUNTIME', 'CI'])

const EXAMPLES = { admin: 'apps/admin/.env.example', mobile: 'apps/mobile/.env.example', web: '.env.example' } as const
type App = keyof typeof EXAMPLES
const appOf = (file: string): App => (file.startsWith('apps/admin/') ? 'admin' : file.startsWith('apps/mobile/') ? 'mobile' : 'web')

function sources(dir = ROOT): { file: string; text: string }[] {
  return readdirSync(dir).flatMap((name) => {
    if (SKIP.has(name)) return []
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return sources(path)
    if (!/\.(ts|tsx|mjs|js|cjs)$/.test(name) || /\.(test|spec)\./.test(name)) return []
    return [{ file: relative(ROOT, path).split(sep).join('/'), text: readFileSync(path, 'utf8') }]
  })
}

const code = sources()
const documented = (app: App) =>
  new Set([...readFileSync(join(ROOT, EXAMPLES[app]), 'utf8').matchAll(/^#?\s*([A-Z][A-Z0-9_]*)=/gm)].map((m) => m[1]))

describe('.env.example files', () => {
  it('the scan finds settings in each app', () => {
    const files = code.filter((c) => /process\.env\.AI_VISION_PROVIDER/.test(c.text)).map((c) => appOf(c.file))
    expect(files).toContain('web')
    expect(code.some((c) => appOf(c.file) === 'admin' && /process\.env\.LICENCE_KEY/.test(c.text))).toBe(true)
  })

  for (const app of Object.keys(EXAMPLES) as App[]) {
    it(`${EXAMPLES[app]} lists every setting ${app === 'web' ? 'the web app, the packages and root scripts read' : `the ${app} app reads`}`, () => {
      const listed = documented(app)
      const missing = new Set<string>()
      for (const { file, text } of code.filter((c) => appOf(c.file) === app)) {
        for (const m of text.matchAll(/process\.env\.([A-Z][A-Z0-9_]*)|process\.env\[\s*["'`]([A-Z][A-Z0-9_]*)["'`]\s*\]/g)) {
          const name = m[1] ?? m[2]
          if (!listed.has(name) && !SET_BY_PLATFORM.has(name)) missing.add(`${name} (${file})`)
        }
      }
      expect([...missing]).toEqual([])
    })
  }

  it('lists nothing the code no longer uses', () => {
    // Some names are read through a table (packages/utils/src/ai-models.ts), so a name counts as used when it appears
    // anywhere in the code.
    const all = code.map((c) => c.text).join('\n')
    const unused = (Object.keys(EXAMPLES) as App[]).flatMap((app) =>
      [...documented(app)].filter((name) => !new RegExp(`(?<![A-Za-z0-9_])${name}(?![A-Za-z0-9_])`).test(all)).map((name) => `${name} (${EXAMPLES[app]})`),
    )
    expect(unused).toEqual([])
  })
})
