/**
 * Prices belong to vehicle categories: pricing_rules has a foreign key to vehicle_categories, not to vehicles.
 * So a vehicle's rate is read through its category. Embedding pricing_rules directly on vehicles makes PostgREST
 * fail (PGRST200), which is what broke every booking until 2026-11-26.
 */
export const VEHICLE_WITH_PRICING_SELECT =
  'id, category_id, category:vehicle_categories(pricing:pricing_rules(base_rate_per_day))'

type PricingRow = { base_rate_per_day: number | string | null }
type CategoryWithPricing = { pricing?: PricingRow[] | null } | null

/**
 * The daily base rate for a vehicle row selected with VEHICLE_WITH_PRICING_SELECT, or null when none is set.
 * Uses the first pricing rule, the same one /api/vehicles shows as daily_rate, so the booking charges the rate
 * the customer saw.
 */
export function baseRateFromVehicle(vehicle: { category?: CategoryWithPricing | CategoryWithPricing[] }): number | null {
  const category = Array.isArray(vehicle.category) ? vehicle.category[0] : vehicle.category
  const raw = category?.pricing?.[0]?.base_rate_per_day
  const rate = typeof raw === 'string' ? Number(raw) : raw
  return typeof rate === 'number' && Number.isFinite(rate) && rate > 0 ? rate : null
}
