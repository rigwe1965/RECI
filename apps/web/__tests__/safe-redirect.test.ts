import { safeNextPath } from '../lib/safe-redirect'

describe('safeNextPath', () => {
  test('allows same-origin relative paths', () => {
    expect(safeNextPath('/account/bookings')).toBe('/account/bookings')
    expect(safeNextPath('/book/abc?x=1#y')).toBe('/book/abc?x=1#y')
  })

  test('falls back for missing values', () => {
    expect(safeNextPath(null)).toBe('/account/bookings')
    expect(safeNextPath(undefined)).toBe('/account/bookings')
    expect(safeNextPath('')).toBe('/account/bookings')
  })

  test('rejects absolute and protocol-relative URLs', () => {
    expect(safeNextPath('https://evil.example')).toBe('/account/bookings')
    expect(safeNextPath('http://evil.example/x')).toBe('/account/bookings')
    expect(safeNextPath('//evil.example')).toBe('/account/bookings')
    expect(safeNextPath('javascript:alert(1)')).toBe('/account/bookings')
  })

  test('rejects backslash and control-character tricks', () => {
    expect(safeNextPath('/\\evil.example')).toBe('/account/bookings')
    expect(safeNextPath('/foo\\bar')).toBe('/account/bookings')
    expect(safeNextPath('/\t/evil.example')).toBe('/account/bookings')
    expect(safeNextPath('/foo\nbar')).toBe('/account/bookings')
  })

  test('honours a custom fallback', () => {
    expect(safeNextPath('//evil.example', '/')).toBe('/')
  })
})
