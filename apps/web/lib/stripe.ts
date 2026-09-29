import Stripe from 'stripe'

let _stripe: Stripe | null = null

export function getStripe(): Stripe {
  if (!_stripe) {
    if (!process.env.STRIPE_SECRET_KEY) {
      throw new Error('STRIPE_SECRET_KEY is not set')
    }
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: '2025-02-24.acacia',
      typescript: true,
    })
  }
  return _stripe
}

// Convenience alias used by routes
export const stripe = new Proxy({} as Stripe, {
  get(_target, prop) {
    return (getStripe() as unknown as Record<string | symbol, unknown>)[prop]
  },
})

// Bounded retry for PaymentIntent creation — only for errors that are safe to
// retry (connection-level failures where Stripe never received the request).
// An idempotencyKey is required so that a retry after an *ambiguous* failure
// (e.g. a timeout where Stripe *did* receive the request) can never create a
// duplicate PaymentIntent — Stripe returns the original one instead.
// See audits/error-handling-audit-2026-09-29.md #7.
export async function createPaymentIntentWithRetry(
  params: Stripe.PaymentIntentCreateParams,
  idempotencyKey: string,
  attempts = 2
): Promise<Stripe.PaymentIntent> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await stripe.paymentIntents.create(params, { idempotencyKey })
    } catch (err) {
      const retryable = err instanceof Stripe.errors.StripeConnectionError
      if (!retryable || attempt >= attempts) throw err
      await new Promise((resolve) => setTimeout(resolve, 300 * 2 ** attempt))
    }
  }
}
