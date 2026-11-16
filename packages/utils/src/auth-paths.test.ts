import { describe, it, expect } from 'vitest'
import { isClearResetPath } from './auth-paths'

const ID = '0d9c6d2e-6a45-4b6e-9a53-3d4c8b1d9f10'

describe('isClearResetPath', () => {
  it('allows only the clear-reset POST', () => {
    expect(isClearResetPath(`/api/admin/users/${ID}/clear-reset`, 'POST')).toBe(true)
    expect(isClearResetPath(`/api/admin/users/${ID}/clear-reset/`, 'post')).toBe(true)
  })
  it('does not open anything else to a user who still has a temporary password', () => {
    expect(isClearResetPath(`/api/admin/users/${ID}/clear-reset`, 'GET')).toBe(false)
    expect(isClearResetPath(`/api/admin/users/${ID}`, 'POST')).toBe(false)
    expect(isClearResetPath('/api/admin/users', 'POST')).toBe(false)
    expect(isClearResetPath('/api/admin/bookings', 'POST')).toBe(false)
    expect(isClearResetPath(`/api/admin/users/${ID}/clear-reset/extra`, 'POST')).toBe(false)
    expect(isClearResetPath(`/api/admin/users/../bookings/${ID}/clear-reset`, 'POST')).toBe(false)
    expect(isClearResetPath('/api/admin/users/not-an-id/clear-reset', 'POST')).toBe(false)
  })
})
