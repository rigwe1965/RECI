import { NextRequest, NextResponse } from 'next/server'
import { stripe } from '@/lib/stripe'
import { createAdminClient } from '@/lib/supabase/admin-server'
import { sendBookingConfirmation, sendCorporateInvoice } from '@/lib/email'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const sig = request.headers.get('stripe-signature')
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET

  if (!sig || !webhookSecret) {
    return NextResponse.json({ error: 'Missing stripe signature or webhook secret' }, { status: 400 })
  }

  let event: ReturnType<typeof stripe.webhooks.constructEvent>
  try {
    const buf = Buffer.from(await request.arrayBuffer())
    event = stripe.webhooks.constructEvent(buf, sig, webhookSecret)
  } catch (err) {
    console.error('[webhook] Signature verification failed:', err)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  const supabase = createAdminClient()

  if (event.type === 'payment_intent.succeeded') {
    const intent = event.data.object
    const bookingId: string | undefined = intent.metadata?.booking_id

    if (!bookingId) {
      console.error('[webhook] payment_intent.succeeded missing booking_id in metadata')
      return NextResponse.json({ received: true })
    }

    // Idempotency: check payment not already processed
    const { data: payment } = await supabase
      .from('payments')
      .select('id, status')
      .eq('stripe_payment_intent_id', intent.id)
      .maybeSingle()

    if (payment?.status === 'paid') {
      return NextResponse.json({ received: true })
    }

    const chargeId =
      typeof intent.latest_charge === 'string'
        ? intent.latest_charge
        : (intent.latest_charge as { id: string } | null)?.id ?? null

    // Update payment row — must succeed before we touch the booking, or we'd
    // mark a booking confirmed with no corresponding paid record.
    const { error: payErr } = await supabase
      .from('payments')
      .update({
        status: 'paid',
        stripe_charge_id: chargeId,
        paid_at: new Date().toISOString(),
      })
      .eq('stripe_payment_intent_id', intent.id)

    if (payErr) {
      console.error('[webhook] failed to mark payment paid — returning 500 so Stripe retries:', payErr, { bookingId, intentId: intent.id })
      return NextResponse.json({ error: 'payment update failed' }, { status: 500 })
    }

    // Confirm booking — if this fails after the payment update above already
    // succeeded, the idempotency check on line ~43 would otherwise swallow
    // every future retry (payment.status is already 'paid'). Returning 500
    // here surfaces the split-brain state instead of silently losing it.
    const { error: bookErr } = await supabase
      .from('bookings')
      .update({ status: 'confirmed' })
      .eq('id', bookingId)

    if (bookErr) {
      console.error('[webhook] payment marked paid but booking confirm failed — needs manual reconciliation:', bookErr, { bookingId, intentId: intent.id })
      return NextResponse.json({ error: 'booking update failed' }, { status: 500 })
    }

    // Send confirmation email — failure silently logged inside sendBookingConfirmation
    await sendBookingConfirmation(bookingId)

    // Fetch booking for corporate invoice + loyalty points
    const { data: confirmedBooking, error: fetchErr } = await supabase
      .from('bookings')
      .select('corporate_account_id, user_id, total_price, points_redeemed')
      .eq('id', bookingId)
      .single()

    if (fetchErr) {
      console.error('[webhook] failed to re-fetch confirmed booking for invoice/points:', fetchErr, { bookingId })
    }

    if (confirmedBooking?.corporate_account_id) {
      await sendCorporateInvoice(bookingId)
    }

    // Award loyalty points: 1 pt per €1 of final total paid (floor)
    if (confirmedBooking?.user_id) {
      const totalPaid = Number(confirmedBooking.total_price)
      const pointsEarned = Math.floor(totalPaid)
      if (pointsEarned > 0) {
        const { error: pointsErr } = await supabase.rpc('award_loyalty_points', {
          p_user_id: confirmedBooking.user_id,
          p_points: pointsEarned,
          p_booking_id: bookingId,
        })
        if (pointsErr) {
          console.error('[webhook] award_loyalty_points failed:', pointsErr, { bookingId, userId: confirmedBooking.user_id, pointsEarned })
        }
      }
    }
  }

  if (event.type === 'payment_intent.payment_failed') {
    const intent = event.data.object

    // Mark payment failed — booking stays 'pending' to allow retry
    await supabase
      .from('payments')
      .update({ status: 'failed' })
      .eq('stripe_payment_intent_id', intent.id)

    console.warn('[webhook] payment_intent.payment_failed for intent:', intent.id)
  }

  return NextResponse.json({ received: true })
}
