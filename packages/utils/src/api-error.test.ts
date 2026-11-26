import { describe, expect, test } from 'vitest'
import { apiErrorMessage } from './api-error'

describe('apiErrorMessage', () => {
  test('passes a plain error string through', () => {
    expect(apiErrorMessage({ error: 'Vehicle not found' }, 'x')).toBe('Vehicle not found')
  })

  test('uses the first form error of a validation answer', () => {
    expect(apiErrorMessage({ error: { formErrors: ['Dates are in the past'], fieldErrors: {} } }, 'x')).toBe('Dates are in the past')
  })

  test('names the first field with an error otherwise', () => {
    const body = { error: { formErrors: [], fieldErrors: { driver_email: ['Invalid email address'], driver_phone: ['Too short'] } } }
    expect(apiErrorMessage(body, 'x')).toBe('driver email: Invalid email address')
  })

  test('falls back for anything else', () => {
    for (const body of [null, undefined, 'text', 42, {}, { error: '' }, { error: 7 }, { error: { formErrors: [], fieldErrors: {} } }]) {
      expect(apiErrorMessage(body, 'Booking failed')).toBe('Booking failed')
    }
  })
})
