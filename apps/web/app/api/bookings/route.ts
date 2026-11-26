import { NextRequest, NextResponse } from 'next/server'
import { getUserFromRequest } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin-server'
import { checkDbRateLimit } from '@/lib/rate-limit'
import { CreateBookingSchema } from '@/lib/schemas'
import { calculatePrice, activeBookingFilter } from '@reci/utils'
import { runCorporateAgent } from '@/lib/corporate-agent'
import { withErrorHandling } from '@/lib/api-handler'
import { parseJsonBody } from '@reci/api'
import { VEHICLE_WITH_PRICING_SELECT, baseRateFromVehicle } from '@/lib/vehicle-pricing'

// Wrapped so any exception this handler doesn't explicitly catch (e.g. a
// Supabase call throwing instead of returning { error }) still gets a
// consistent { error } JSON shape and one logged line, instead of an
// unstructured framework 500. See audits/error-handling-audit-2026-09-29.md #6.
export const POST = withErrorHandling(async function POST(request: NextRequest) {
  const ip =
    request.headers.get('x-forwarded-for') ?? request.headers.get('x-real-ip') ?? 'unknown'
  if (!(await checkDbRateLimit(ip, 'bookings', 10, 60_000))) {
    return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 })
  }

  const parsed = await parseJsonBody(request, CreateBookingSchema)
  if (!parsed.ok) return parsed.response

  const data = parsed.data

  // Get session user (optional — guest checkout supported)
  const { user } = await getUserFromRequest(request)

  // All reads/writes below use the admin client, never the caller's anon/session
  // client — RLS on `bookings` intentionally has no client-facing INSERT policy,
  // so this route is the only path allowed to create a booking, and the
  // availability conflict-check below needs visibility across ALL users'
  // bookings (RLS's `own_bookings` policy would otherwise hide other users'
  // conflicting bookings from a session-scoped client and defeat this check).
  const supabase = createAdminClient()

  // Re-check availability (TOCTOU guard) + fetch vehicle + profile in parallel
  const today = new Date().toISOString().split('T')[0]

  const [
    { data: conflictingBookings },
    { data: blockConflicts },
    { data: vehicle, error: vehicleError },
    { data: profile },
  ] = await Promise.all([
    supabase
      .from('bookings')
      .select('id')
      .eq('vehicle_id', data.vehicle_id)
      .not('status', 'in', '("cancelled")')
      .or(activeBookingFilter()) // an unpaid booking holds the car for 30 minutes only
      .lt('pickup_datetime', data.dropoff_datetime)
      .gt('dropoff_datetime', data.pickup_datetime),
    supabase
      .from('availability_blocks')
      .select('id')
      .eq('vehicle_id', data.vehicle_id)
      .lt('start_date', data.dropoff_datetime)
      .gt('end_date', data.pickup_datetime),
    supabase
      .from('vehicles')
      .select(VEHICLE_WITH_PRICING_SELECT)
      .eq('id', data.vehicle_id)
      .eq('is_active', true)
      .maybeSingle(),
    user
      ? supabase
          .from('user_profiles')
          .select('corporate_account_id')
          .eq('id', user.id)
          .single()
      : Promise.resolve({ data: null }),
  ])

  if (conflictingBookings && conflictingBookings.length > 0) {
    return NextResponse.json(
      { error: 'Vehicle no longer available for these dates' },
      { status: 409 }
    )
  }

  if (blockConflicts && blockConflicts.length > 0) {
    return NextResponse.json(
      { error: 'Vehicle is blocked for these dates' },
      { status: 409 }
    )
  }

  if (vehicleError) {
    // A failing query is a server fault, not a missing vehicle: say so and log why.
    console.error('[bookings] vehicle lookup failed:', vehicleError.code, vehicleError.message)
    return NextResponse.json({ error: 'Could not load the vehicle' }, { status: 500 })
  }

  if (!vehicle) {
    return NextResponse.json({ error: 'Vehicle not found' }, { status: 404 })
  }

  let base_rate_per_day = baseRateFromVehicle(vehicle)
  if (!base_rate_per_day) {
    return NextResponse.json({ error: 'Pricing not configured for this vehicle' }, { status: 422 })
  }

  // Corporate pricing: if logged-in user has a corporate account, check for custom rate
  let corporateAccountId: string | null = null
  let corporateDiscountPct = 0

  if (profile?.corporate_account_id) {
    corporateAccountId = profile.corporate_account_id

    // Fetch specific rate + fallback discount in parallel
    const [{ data: corpRate }, { data: corpAccount }] = await Promise.all([
      supabase
        .from('corporate_pricing')
        .select('rate_per_day')
        .eq('corporate_account_id', corporateAccountId)
        .eq('category_id', vehicle.category_id)
        .lte('effective_from', today)
        .or(`effective_to.is.null,effective_to.gte.${today}`)
        .order('effective_from', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from('corporate_accounts')
        .select('discount_pct')
        .eq('id', corporateAccountId)
        .single(),
    ])

    if (corpRate) {
      base_rate_per_day = corpRate.rate_per_day
    } else {
      corporateDiscountPct = corpAccount?.discount_pct ?? 0
    }
  }

  // Fetch extra details for price calculation
  const extraIds = data.extras.map((e) => e.extra_id)
  const { data: extraRows } = extraIds.length
    ? await supabase.from('extras').select('id, price_per_day, is_one_time_fee').in('id', extraIds)
    : { data: [] }

  const extrasForCalc = (extraRows ?? []).map((row) => {
    const match = data.extras.find((e) => e.extra_id === row.id)
    return {
      price_per_day: row.price_per_day,
      is_one_time_fee: row.is_one_time_fee,
      quantity: match?.quantity ?? 1,
    }
  })

  // Server-side canonical price
  const pricing = calculatePrice({
    base_rate_per_day: base_rate_per_day!,
    pickup_datetime: data.pickup_datetime,
    dropoff_datetime: data.dropoff_datetime,
    extras: extrasForCalc,
    corporate_discount_pct: corporateDiscountPct,
  })

  // Points redemption — only for authenticated users
  const POINTS_TO_EUR = 100
  const MAX_REDEEM_PCT = 0.20
  let pointsRedeemed = 0
  let pointsDiscountEur = 0

  if (user && data.points_redeemed && data.points_redeemed > 0) {
    // Fetch user's current balance
    const { data: loyaltyAccount } = await supabase
      .from('loyalty_accounts')
      .select('points_balance')
      .eq('user_id', user.id)
      .maybeSingle()

    const balance = loyaltyAccount?.points_balance ?? 0
    const maxAllowed = Math.floor((pricing.total * MAX_REDEEM_PCT) * POINTS_TO_EUR)
    pointsRedeemed = Math.min(data.points_redeemed, balance, maxAllowed)
    pointsDiscountEur = pointsRedeemed / POINTS_TO_EUR
  }

  const finalTotal = Math.max(0, pricing.total - pointsDiscountEur)

  // Insert booking
  const { data: booking, error: bookingError } = await supabase
    .from('bookings')
    .insert({
      vehicle_id: data.vehicle_id,
      pickup_datetime: data.pickup_datetime,
      dropoff_datetime: data.dropoff_datetime,
      pickup_location_id: data.pickup_location_id,
      dropoff_location_id: data.dropoff_location_id,
      driver_first_name: data.driver_first_name,
      driver_last_name: data.driver_last_name,
      driver_email: data.driver_email,
      driver_phone: data.driver_phone,
      driver_licence_number: data.driver_licence_number ?? null,
      base_price: pricing.base_subtotal,
      extras_price: pricing.extras_subtotal,
      total_price: finalTotal,
      points_redeemed: pointsRedeemed,
      status: 'pending',
      user_id: user?.id ?? null,
      corporate_account_id: corporateAccountId,
    })
    .select('id, booking_ref')
    .single()

  if (bookingError || !booking) {
    console.error('booking insert error:', bookingError)
    return NextResponse.json({ error: 'Failed to create booking' }, { status: 500 })
  }

  // Insert booking_extras
  if (data.extras.length > 0) {
    const extrasInsert = data.extras.map((e) => ({
      booking_id: booking.id,
      extra_id: e.extra_id,
      quantity: e.quantity,
      price_snapshot: e.price_snapshot,
    }))
    const { error: extrasError } = await supabase.from('booking_extras').insert(extrasInsert)
    if (extrasError) {
      console.error('booking_extras insert error:', extrasError)
    }
  }

  // Deduct redeemed points — must be awaited and must succeed. The RPC locks the
  // loyalty row (FOR UPDATE) and raises if the balance is insufficient, which is
  // what makes redemption race-safe. If it fires-and-forgets (or its failure is
  // only logged), the points discount above is granted without ever being paid
  // for — and on serverless the un-awaited call may never run at all.
  if (user && pointsRedeemed > 0) {
    const { error: deductError } = await supabase.rpc('deduct_loyalty_points', {
      p_user_id: user.id,
      p_points: pointsRedeemed,
      p_booking_id: booking.id,
    })
    if (deductError) {
      console.error('[bookings] deduct_loyalty_points failed — cancelling booking:', deductError, {
        bookingId: booking.id,
        userId: user.id,
        pointsRedeemed,
      })
      await supabase.from('bookings').update({ status: 'cancelled' }).eq('id', booking.id)
      return NextResponse.json(
        { error: 'Loyalty points could not be redeemed. Please retry.' },
        { status: 409 }
      )
    }
  }

  // Corporate AI policy check — non-blocking, runs after booking is created
  if (corporateAccountId) {
    runCorporateAgent(booking.id).catch((err) =>
      console.error('[bookings] corporate agent error:', err)
    )
  }

  return NextResponse.json(
    {
      booking_id: booking.id,
      booking_ref: booking.booking_ref,
      total_price: pricing.total,
      pricing,
    },
    { status: 201 }
  )
})
