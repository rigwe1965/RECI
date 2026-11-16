import { describe, it, expect } from 'vitest'
import { normalizeIsoOffset } from './datetime'

describe('normalizeIsoOffset', () => {
  it('restores the + that a web address turned into a space', () => {
    expect(normalizeIsoOffset('2026-11-01T00:00:00 01:00')).toBe('2026-11-01T00:00:00+01:00')
    expect(normalizeIsoOffset('2026-11-30T23:59:59.999 02:00')).toBe('2026-11-30T23:59:59.999+02:00')
  })
  it('leaves correct values alone', () => {
    expect(normalizeIsoOffset('2026-11-01T00:00:00+01:00')).toBe('2026-11-01T00:00:00+01:00')
    expect(normalizeIsoOffset('2026-11-01T00:00:00Z')).toBe('2026-11-01T00:00:00Z')
    expect(normalizeIsoOffset('2026-11-01T00:00:00.000-05:00')).toBe('2026-11-01T00:00:00.000-05:00')
  })
  it('passes null through and does not touch other text', () => {
    expect(normalizeIsoOffset(null)).toBeNull()
    expect(normalizeIsoOffset('hello world')).toBe('hello world')
  })
})
