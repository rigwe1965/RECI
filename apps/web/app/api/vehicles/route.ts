import { NextRequest, NextResponse } from 'next/server'
import { activeBookingFilter } from '@reci/utils'
import { getUserFromRequest } from '@/lib/supabase/server'
import { MOCK_VEHICLES } from '@/lib/mock-vehicles'

export const revalidate = 60

const SUPABASE_CONFIGURED =
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
  process.env.NEXT_PUBLIC_SUPABASE_URL !== 'https://placeholder.supabase.co'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const pickup_date = searchParams.get('pickup_date')
  const dropoff_date = searchParams.get('dropoff_date')
  const location_id = searchParams.get('location_id')
  const category_slug = searchParams.get('category_slug')
  const fuel_type = searchParams.get('fuel_type')
  const transmission = searchParams.get('transmission')
  const passenger_capacity = searchParams.get('passenger_capacity')
    ? parseInt(searchParams.get('passenger_capacity')!, 10)
    : null

  if (!SUPABASE_CONFIGURED) {
    let filtered = MOCK_VEHICLES
    if (category_slug) filtered = filtered.filter(v => v.category.slug === category_slug)
    if (fuel_type) filtered = filtered.filter(v => v.fuel_type === fuel_type)
    if (transmission) filtered = filtered.filter(v => v.transmission === transmission)
    if (passenger_capacity) filtered = filtered.filter(v => v.category.passenger_capacity >= passenger_capacity)
    return NextResponse.json(filtered)
  }

  const { supabase, user } = await getUserFromRequest(request)

  // Check if authed user has corporate account (for custom rates)
  let corporateAccountId: string | null = null
  let corporateDiscountPct = 0
  let corporatePricingMap: Map<string, number> = new Map() // category_id → rate

  if (user) {
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('corporate_account_id')
      .eq('id', user.id)
      .single()

    if (profile?.corporate_account_id) {
      corporateAccountId = profile.corporate_account_id
      const today = new Date().toISOString().split('T')[0]

      const [{ data: corpAccount }, { data: corpRates }] = await Promise.all([
        supabase
          .from('corporate_accounts')
          .select('discount_pct')
          .eq('id', corporateAccountId)
          .single(),
        supabase
          .from('corporate_pricing')
          .select('category_id, rate_per_day')
          .eq('corporate_account_id', corporateAccountId)
          .lte('effective_from', today)
          .or(`effective_to.is.null,effective_to.gte.${today}`),
      ])

      corporateDiscountPct = corpAccount?.discount_pct ?? 0
      corporatePricingMap = new Map(
        (corpRates ?? []).map((r) => [r.category_id, r.rate_per_day])
      )
    }
  }

  // Base query — join category + pricing_rules for daily_rate
  let query = supabase
    .from('vehicles')
    .select(`
      *,
      category:vehicle_categories(
        *,
        pricing:pricing_rules(base_rate_per_day)
      )
    `)
    .eq('is_active', true)

  if (location_id) query = query.eq('location_id', location_id)
  if (fuel_type) query = query.eq('fuel_type', fuel_type)
  if (transmission) query = query.eq('transmission', transmission)

  const { data: vehicles, error } = await query

  if (error) {
    console.error('vehicles query error:', error)
    return NextResponse.json({ error: 'Failed to fetch vehicles' }, { status: 500 })
  }

  let available = vehicles ?? []

  if (pickup_date && dropoff_date) {
    const pickupTs = new Date(pickup_date).toISOString()
    const dropoffTs = new Date(dropoff_date).toISOString()

    const { data: bookedRows } = await supabase
      .from('bookings')
      .select('vehicle_id')
      .not('status', 'in', '("cancelled")')
      .or(activeBookingFilter())
      .lt('pickup_datetime', dropoffTs)
      .gt('dropoff_datetime', pickupTs)

    const { data: blockedRows } = await supabase
      .from('availability_blocks')
      .select('vehicle_id')
      .lt('start_date', dropoffTs)
      .gt('end_date', pickupTs)

    const unavailableIds = new Set([
      ...(bookedRows ?? []).map((r) => r.vehicle_id),
      ...(blockedRows ?? []).map((r) => r.vehicle_id),
    ])

    available = available.filter((v) => !unavailableIds.has(v.id))
  }

  // Attach daily_rate — corporate rate takes precedence over pricing_rules
  const result = available.map((v) => {
    const cat = v.category as { pricing?: Array<{ base_rate_per_day: number }> } | null
    const baseRate = cat?.pricing?.[0]?.base_rate_per_day ?? null

    let daily_rate = baseRate
    if (corporateAccountId && baseRate !== null) {
      const corpSpecificRate = corporatePricingMap.get(v.category_id)
      if (corpSpecificRate !== undefined) {
        daily_rate = corpSpecificRate
      } else if (corporateDiscountPct > 0) {
        daily_rate = Math.round(baseRate * (1 - corporateDiscountPct / 100) * 100) / 100
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { pricing, ...vehicle } = v
    return { ...vehicle, daily_rate }
  })

  let filtered = category_slug
    ? result.filter((v) => (v.category as { slug: string } | null)?.slug === category_slug)
    : result

  if (passenger_capacity) {
    filtered = filtered.filter((v) => {
      const cap = (v.category as { passenger_capacity?: number } | null)?.passenger_capacity ?? 0
      return cap >= passenger_capacity
    })
  }

  return NextResponse.json(filtered)
}
