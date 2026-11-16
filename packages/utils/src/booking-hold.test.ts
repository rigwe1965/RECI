import { describe, it, expect } from 'vitest'
import { PENDING_HOLD_MINUTES, pendingHoldCutoff, activeBookingFilter, isPendingHoldExpired } from './booking-hold'

const NOW = new Date('2026-11-16T12:00:00.000Z')

describe('pending booking hold', () => {
  it('is 30 minutes', () => expect(PENDING_HOLD_MINUTES).toBe(30))
  it('cutoff is 30 minutes before now, whole seconds', () => expect(pendingHoldCutoff(NOW)).toBe('2026-11-16T11:30:00Z'))
  it('filter keeps paid bookings and young pending ones', () => {
    expect(activeBookingFilter(NOW)).toBe('status.neq.pending,created_at.gte.2026-11-16T11:30:00Z')
  })
  it('expires only old bookings', () => {
    expect(isPendingHoldExpired('2026-11-16T11:29:00Z', NOW)).toBe(true)
    expect(isPendingHoldExpired('2026-11-16T11:31:00Z', NOW)).toBe(false)
    expect(isPendingHoldExpired(new Date('2026-11-16T11:30:00Z'), NOW)).toBe(false)
  })
})
