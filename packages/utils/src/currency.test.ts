import { describe, it, expect } from 'vitest'
import { formatEUR } from './currency'

describe('formatEUR', () => {
  it('formats with de-DE thousands/decimal separators', () => {
    expect(formatEUR(1234.5)).toBe('1.234,50 €')
  })

  it('formats small amounts', () => {
    expect(formatEUR(9.9)).toBe('9,90 €')
  })

  it('formats zero', () => {
    expect(formatEUR(0)).toBe('0,00 €')
  })

  it('formats negative amounts', () => {
    expect(formatEUR(-30)).toBe('-30,00 €')
  })
})
