/**
 * An unpaid ("pending") booking holds its vehicle for this many minutes. After that it stops blocking the dates
 * (it stays in the database and can still be cancelled); a booking that is paid ("confirmed" and later) never expires.
 */
export const PENDING_HOLD_MINUTES = 30

/** ISO time (whole seconds, UTC) before which a still-pending booking no longer holds its vehicle. */
export function pendingHoldCutoff(now: Date = new Date()): string {
  return new Date(now.getTime() - PENDING_HOLD_MINUTES * 60_000).toISOString().replace(/\.\d{3}Z$/, 'Z')
}

/** PostgREST `.or()` filter: keep every booking except a pending one older than the hold. Use with `.not('status','in','("cancelled")')`. */
export function activeBookingFilter(now: Date = new Date()): string {
  return `status.neq.pending,created_at.gte.${pendingHoldCutoff(now)}`
}

/** True when a pending booking's hold has run out. */
export function isPendingHoldExpired(createdAt: string | Date, now: Date = new Date()): boolean {
  return new Date(createdAt).getTime() < new Date(pendingHoldCutoff(now)).getTime()
}
