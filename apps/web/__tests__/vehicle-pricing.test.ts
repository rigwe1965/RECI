import { readFileSync } from 'fs'
import { join } from 'path'
import { VEHICLE_WITH_PRICING_SELECT, baseRateFromVehicle } from '../lib/vehicle-pricing'

describe('VEHICLE_WITH_PRICING_SELECT', () => {
  test('reads pricing_rules through vehicle_categories (pricing_rules has no foreign key to vehicles)', () => {
    expect(VEHICLE_WITH_PRICING_SELECT).toContain('category:vehicle_categories(pricing:pricing_rules(base_rate_per_day))')
  })

  test('the bookings route uses it and never embeds pricing_rules directly on vehicles', () => {
    const route = readFileSync(join(__dirname, '../app/api/bookings/route.ts'), 'utf8')
    expect(route).toContain('.select(VEHICLE_WITH_PRICING_SELECT)')
    expect(route).not.toMatch(/['"`]id, category_id, pricing:pricing_rules/)
  })
})

describe('baseRateFromVehicle', () => {
  test('takes the first pricing rule of the category, like /api/vehicles', () => {
    expect(baseRateFromVehicle({ category: { pricing: [{ base_rate_per_day: 120 }, { base_rate_per_day: 99 }] } })).toBe(120)
  })

  test('accepts a category returned as an array and a numeric string', () => {
    expect(baseRateFromVehicle({ category: [{ pricing: [{ base_rate_per_day: '89.50' }] }] })).toBe(89.5)
  })

  test('returns null when no usable rate is set', () => {
    expect(baseRateFromVehicle({})).toBeNull()
    expect(baseRateFromVehicle({ category: null })).toBeNull()
    expect(baseRateFromVehicle({ category: { pricing: [] } })).toBeNull()
    expect(baseRateFromVehicle({ category: { pricing: [{ base_rate_per_day: 0 }] } })).toBeNull()
    expect(baseRateFromVehicle({ category: { pricing: [{ base_rate_per_day: null }] } })).toBeNull()
  })
})
