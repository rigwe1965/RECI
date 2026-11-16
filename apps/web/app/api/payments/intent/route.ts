import { brand, isPendingHoldExpired } from '@reci/utils'
import { NextRequest, NextResponse } from 'next/server'
import { stripe, createPaymentIntentWithRetry } from '@/lib/stripe'
import { createAdminClient } from '@/lib/supabase/admin-server'
import { CreatePaymentIntentSchema } from '@/lib/schemas'
import { checkDbRateLimit } from '@/lib/rate-limit'
import { parseJsonBody } from '@reci/api'

export async function POST(request: NextRequest) {
  const ip =
    request.headers.get('x-forwarded-for') ??
    request.headers.get('x-real-ip') ??
    'unknown'

  if (!(await checkDbRateLimit(ip, 'payments/intent', 5, 60_000))) {
    return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 })
  }

  const parsed = await parseJsonBody(request, CreatePaymentIntentSchema)
  if (!parsed.ok) return parsed.response

  const { booking_id } = parsed.data
  const supabase = createAdminClient()

  // Fetch booking — must exist and be pending
  const { data: booking, error: bookingErr } = await supabase
    .from('bookings')
    .select('id, booking_ref, status, total_price, driver_email, created_at')
    .eq('id', booking_id)
    .single()

  if (bookingErr || !booking) {
    return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
  }

  if (booking.status !== 'pending') {
    return NextResponse.json(
      { error: `Booking is already ${booking.status}` },
      { status: 409 }
    )
  }

  // An unpaid booking holds its car for 30 minutes; after that the car may have been booked by someone else, so take no payment.
  if (isPendingHoldExpired(booking.created_at)) {
    return NextResponse.json({ error: 'This booking has expired. Please start a new booking.' }, { status: 410 })
  }

  // Check if a PaymentIntent already exists for this booking (idempotency)
  const { data: existingPayment } = await supabase
    .from('payments')
    .select('stripe_payment_intent_id, amount')
    .eq('booking_id', booking_id)
    .eq('status', 'pending')
    .maybeSingle()

  if (existingPayment?.stripe_payment_intent_id) {
    // Retrieve and return existing intent (handles page refresh)
    const intent = await stripe.paymentIntents.retrieve(
      existingPayment.stripe_payment_intent_id
    )
    return NextResponse.json({
      client_secret: intent.client_secret,
      amount: existingPayment.amount,
      currency: 'eur',
    })
  }

  // Amount in cents — use server-stored total_price, never client value
  const amountCents = Math.round(Number(booking.total_price) * 100)

  // Create PaymentIntent — idempotency key keyed on booking_id means a retry
  // after an ambiguous network failure returns the original intent instead of
  // creating a duplicate charge target.
  const intent = await createPaymentIntentWithRetry(
    {
      amount: amountCents,
      currency: 'eur',
      receipt_email: booking.driver_email,
      metadata: {
        booking_id: booking.id,
        booking_ref: booking.booking_ref,
      },
      description: `${brand.name} — ${booking.booking_ref}`,
    },
    booking.id
  )

  // Insert payment row
  const { error: paymentErr } = await supabase.from('payments').insert({
    booking_id: booking.id,
    amount: booking.total_price,
    currency: 'EUR',
    method: 'stripe',
    status: 'pending',
    stripe_payment_intent_id: intent.id,
  })

  if (paymentErr) {
    console.error('[payments/intent] insert error:', paymentErr)
    // Cancel the intent to avoid orphaned charges
    await stripe.paymentIntents.cancel(intent.id)
    return NextResponse.json({ error: 'Failed to record payment' }, { status: 500 })
  }

  return NextResponse.json({
    client_secret: intent.client_secret,
    amount: Number(booking.total_price),
    currency: 'eur',
  })
}
