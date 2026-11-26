import { readFileSync } from 'fs'
import { join } from 'path'

// The booking route stores each extra's price from the database, never the price the browser sent.
describe('bookings route: booking_extras price_snapshot', () => {
  const route = readFileSync(join(__dirname, '../app/api/bookings/route.ts'), 'utf8')

  test('takes the snapshot from the extras table row', () => {
    expect(route).toContain('price_snapshot: row.price_per_day')
  })

  test('never stores the client-sent snapshot', () => {
    expect(route).not.toMatch(/price_snapshot:\s*e\.price_snapshot/)
  })
})
