# RECI Transport — Error Handling Audit

**Date:** 2026-09-29
**Scope:** `reci-transport` monorepo — `apps/web` (customer Next.js app), `apps/admin` (admin Next.js app), `apps/mobile` (Expo/React Native), `packages/*`.
**Method:** Manual static review. Read every `middleware.ts`, every `error.tsx`/`global-error.tsx`, `instrumentation.ts` × 2, `sentry.client.config.ts` × 2, both `lib/rate-limit.ts`, `lib/auth.ts`, `lib/audit.ts`, `lib/email.ts`, `lib/stripe.ts`, `lib/anthropic.ts`, `lib/ai-vision-adapter.ts`, `lib/corporate-agent.ts`, `lib/schemas.ts`, the Stripe webhook, ~15 representative API routes across both apps (bookings, payments, AI, admin CRUD, uploads), the mobile `lib/api.ts` fetch wrapper and its call sites, and the three Jest test files. Cross-referenced against `CLAUDE.md`'s documented recurring incidents. No dynamic testing was performed — findings are traced from source, not from a running system.

---

## Summary against the requested categories

| Category | Verdict |
|---|---|
| 1. Consistency | **No** centralized error handler, no custom error classes, no async-handler wrapper anywhere in the repo (verified: `grep -r "class.*Error extends"` → 0 matches; `grep -r "asyncHandler\|withErrorHandling\|catchAsync"` → 0 matches). Every one of the ~50 route handlers hand-rolls its own `try/catch` and status codes. |
| 2. Categories | 400/401/403/404/409/413/422/429/500/502/503 are all used, generally in the right places — but the same logical error (Zod schema failure) returns **422 in ~16 routes and 400 in 2 routes** (Finding 6). |
| 3. Async handling | Next.js App Router route handlers catch their own thrown errors (no raw process crash), but at least one fire-and-forget call is missing a `.catch()` next to a sibling call that has one (Finding 3). No event-emitter usage found in the reviewed code. |
| 4. Recovery | No retry, no circuit breaker, no backoff anywhere for Stripe, Resend, or Supabase calls (Finding 7). One deliberate, tested fail-open (Finding 8) exists for rate limiting. Client-side exponential backoff exists only for the confirmation-page poll (a UI concern, not API resilience). |
| 5. Information | No stack traces or dev/prod branching found leaking to users — but raw `error.message` from Supabase/Postgres is returned verbatim to API clients in ~29 places, including one **unauthenticated** route (Finding 4). Server-side errors are never reported to Sentry (Finding 5). |

---

## Severity summary

| # | Finding | Category | Importance |
|---|---|---|---|
| 1 | Stripe webhook has no error handling around any DB write — a mid-sequence failure leaves the payment marked `paid` but the booking permanently `pending`, with no possibility of retry | Async / Recovery | **9/10** |
| 2 | Admin `middleware.ts` has no error handling around Supabase calls that this project's own `CLAUDE.md` documents as periodically failing (free-tier pause) — would take down the entire admin portal with a raw 500 instead of the app's styled error boundary | Recovery / Consistency | **8/10** |
| 3 | `deduct_loyalty_points` RPC call is fire-and-forget with no `.catch()`, unlike the structurally identical call three lines below it | Async | **6/10** |
| 4 | Raw Postgres/Supabase `error.message` returned to API clients in ~29 routes, including the public, unauthenticated `/api/locations` | Information | **6/10** |
| 5 | No server-side error reporting to Sentry — `instrumentation.ts` has no `onRequestError` hook, so route-handler and middleware exceptions are never captured, only `console.error`'d | Information | **6/10** |
| 6 | No centralized error handler / custom error classes — every route re-implements try/catch and status mapping from scratch | Consistency | **5/10** |
| 7 | No retry / circuit breaker / timeout consistency for outbound calls to Stripe, Resend, or Supabase | Recovery | **5/10** |
| 8 | Zod validation failures return `422` in ~16 routes but `400` in `ai/damage` and `ai/trip` | Categories | **4/10** |
| 9 | Mobile `lib/api.ts` throws the raw HTTP response body as `Error.message`; screens display it verbatim via `Alert.alert`, so users see raw JSON instead of a message | Information | **4/10** |
| 10 | Rate limiter fails **open** on error while the structurally identical API-key usage RPC in `handleApiKeyAuth` fails **closed** — inconsistent philosophy for the same failure mode, undocumented | Categories / Recovery | **3/10** |

---

## Detailed findings

### 1. Stripe webhook: no error handling around DB writes → unrecoverable inconsistent state
**Location:** `apps/web/app/api/webhooks/stripe/route.ts`, lines 37–93 (function body after signature verification).
**Importance: 9/10**

The only `try/catch` in this file wraps `stripe.webhooks.constructEvent` (lines 17–23). Everything after it — updating `payments` (53–60), updating `bookings` to `confirmed` (63–66), `sendBookingConfirmation` (69, itself internally safe), fetching `confirmedBooking` (72–76), `sendCorporateInvoice` (79), and `award_loyalty_points` (87–91) — runs with **no error checking at all**. None of these `.update()`/`.rpc()` calls destructure or inspect `{ error }`.

Concretely: if the `bookings` update on line 63–66 fails (network blip, RLS misconfiguration, deadlock) *after* the `payments` update on line 53–60 has already succeeded, the payment row is permanently `status: 'paid'` while the booking stays `pending` forever. Worse, the idempotency guard on line 43 (`if (payment?.status === 'paid') return NextResponse.json({ received: true })`) means **Stripe's automatic webhook retries will now short-circuit and never re-attempt the booking confirmation**, because from Stripe's point of view the webhook already succeeded. The customer is charged, the confirmation email is never sent, and no loyalty points are awarded, with no alert raised anywhere (nothing is logged, nothing is thrown, the handler returns `200 { received: true }` on line 108 regardless).

This directly contradicts the pattern the codebase uses correctly elsewhere — e.g. `apps/admin/app/api/admin/users/route.ts` lines 116–121 rolls back (`supabase.auth.admin.deleteUser`) when a downstream write fails after an upstream one succeeded. The webhook has no equivalent compensation or even detection.

**Remediation:**
```typescript
// apps/web/app/api/webhooks/stripe/route.ts
if (event.type === 'payment_intent.succeeded') {
  const intent = event.data.object
  const bookingId: string | undefined = intent.metadata?.booking_id
  if (!bookingId) {
    console.error('[webhook] payment_intent.succeeded missing booking_id in metadata')
    return NextResponse.json({ received: true })
  }

  const { data: payment } = await supabase
    .from('payments')
    .select('id, status')
    .eq('stripe_payment_intent_id', intent.id)
    .maybeSingle()

  if (payment?.status === 'paid') {
    return NextResponse.json({ received: true })
  }

  const chargeId = /* ...unchanged... */

  const { error: payErr } = await supabase
    .from('payments')
    .update({ status: 'paid', stripe_charge_id: chargeId, paid_at: new Date().toISOString() })
    .eq('stripe_payment_intent_id', intent.id)

  if (payErr) {
    console.error('[webhook] failed to mark payment paid — will retry via Stripe:', payErr)
    // Return 500 so Stripe retries; do NOT mark anything else "done" yet.
    return NextResponse.json({ error: 'payment update failed' }, { status: 500 })
  }

  const { error: bookErr } = await supabase
    .from('bookings')
    .update({ status: 'confirmed' })
    .eq('id', bookingId)

  if (bookErr) {
    console.error('[webhook] payment marked paid but booking confirm failed — needs manual reconciliation:', bookErr, { bookingId, intentId: intent.id })
    // Surface to Sentry/alerting — this is the exact split-brain state described above.
    return NextResponse.json({ error: 'booking update failed' }, { status: 500 })
  }

  // Email/points below can stay best-effort (already non-blocking), but log RPC errors:
  const { error: pointsErr } = confirmedBooking?.user_id
    ? await supabase.rpc('award_loyalty_points', { /* ... */ })
    : { error: null }
  if (pointsErr) console.error('[webhook] award_loyalty_points failed:', pointsErr, { bookingId })
}
```
Key change: check the `error` on every write that must succeed for correctness (`payments`, `bookings`), and return a non-2xx status when one fails so Stripe's retry mechanism — which this code already implicitly relies on via the idempotency check — actually gets a chance to complete the sequence. Consider wrapping `payments`+`bookings` in a single Postgres function (`RPC`) for true atomicity, since two sequential `.update()` calls from Node are not transactional.

---

### 2. Admin `middleware.ts`: no error handling around Supabase calls, tied to a documented recurring failure
**Location:** `apps/admin/middleware.ts`, lines 66 (`supabase.auth.getUser()`) and 79–83 (`admin.from('user_profiles')...single()`).
**Importance: 8/10**

`CLAUDE.md` explicitly documents, under "Supabase Free Tier Behaviour": *"Projects pause after inactivity. DNS fails entirely while paused (TypeError: fetch failed). After resume, expect ~2 min warm-up with 521 Cloudflare errors."* This is a **known, recurring** condition in this project, not a hypothetical.

`apps/admin/middleware.ts` runs on every request that isn't under `/auth/` (see `config.matcher`, line 109–111, which only excludes `_next/static`, `_next/image`, `favicon.ico`). Both Supabase calls it makes (`supabase.auth.getUser()` on line 66, and the `user_profiles` lookup on line 79–83) are unguarded — no `try/catch`. If either throws (which `fetch failed` does, as a thrown `TypeError`, not a returned `{error}`), Next.js middleware has no way to route the failure to the app's own `global-error.tsx` (middleware errors are rendered as a raw framework error page, before the React tree — including the error boundary — is ever reached). This means the **entire admin portal** — every dashboard, every admin API route — becomes unreachable with an unstyled error during exactly the failure window the team already knows happens periodically, instead of degrading to a friendly "try again" page.

The customer-facing `apps/web/middleware.ts` has the same unguarded pattern at lines 123 and 137, but its blast radius is smaller since `needsAuthCheck` (line 89–91) limits it to `/account/*` and the two auth pages — everything else in the web app bypasses Supabase in middleware entirely.

**Remediation:**
```typescript
// apps/admin/middleware.ts
let user = null
try {
  const { data } = await supabase.auth.getUser()
  user = data.user
} catch (err) {
  console.error('[admin middleware] auth.getUser() failed:', err)
  // Fail closed on auth pages you must protect, but don't render a raw crash —
  // send them to a page that can explain "service temporarily unavailable".
  const url = request.nextUrl.clone()
  url.pathname = '/auth/login'
  url.searchParams.set('error', 'service_unavailable')
  return withCsp(NextResponse.redirect(url))
}

if (!user) { /* ...unchanged... */ }

let profile = null
try {
  const admin = createAdminClient()
  const { data } = await admin.from('user_profiles').select('role, password_reset_required').eq('id', user.id).single()
  profile = data
} catch (err) {
  console.error('[admin middleware] profile lookup failed:', err)
  const url = request.nextUrl.clone()
  url.pathname = '/auth/login'
  url.searchParams.set('error', 'service_unavailable')
  return withCsp(NextResponse.redirect(url))
}
```
Apply the same wrapping to `apps/web/middleware.ts` lines 121–151. Add a `/auth/login?error=service_unavailable` banner so this doesn't silently look like a wrong-password failure.

---

### 3. Fire-and-forget loyalty deduction has no `.catch()`, unlike its sibling call
**Location:** `apps/web/app/api/bookings/route.ts`, lines 226–239.
**Importance: 6/10**

```typescript
// Deduct redeemed points atomically — non-blocking
if (user && pointsRedeemed > 0) {
  void supabase.rpc('deduct_loyalty_points', {
    p_user_id: user.id,
    p_points: pointsRedeemed,
    p_booking_id: booking.id,
  })
}

// Corporate AI policy check — non-blocking, runs after booking is created
if (corporateAccountId) {
  runCorporateAgent(booking.id).catch((err) =>
    console.error('[bookings] corporate agent error:', err)
  )
}
```
The `void` operator only suppresses the "unused promise" lint/TS warning — it does not attach a rejection handler. If the `deduct_loyalty_points` RPC rejects (network error, RLS error, Postgres exception), this becomes an **unhandled promise rejection**: it is never logged anywhere in this codebase, and the customer silently keeps points that were supposed to be spent, with no record of the failure. The very next block (`runCorporateAgent(...).catch(...)`) shows the author's own intended pattern for this exact situation — it just wasn't applied three lines earlier.

**Remediation:**
```typescript
if (user && pointsRedeemed > 0) {
  supabase.rpc('deduct_loyalty_points', {
    p_user_id: user.id,
    p_points: pointsRedeemed,
    p_booking_id: booking.id,
  }).then(({ error }) => {
    if (error) console.error('[bookings] deduct_loyalty_points failed:', error, { bookingId: booking.id, userId: user.id, pointsRedeemed })
  })
}
```

---

### 4. Raw database error messages returned to API clients, including on a public route
**Location:** 29 occurrences across both apps, e.g. `apps/web/app/api/locations/route.ts:13`, `apps/web/app/api/account/clear-reset/route.ts:21`, and 27 admin routes including `apps/admin/app/api/admin/bookings/route.ts:52`, `apps/admin/app/api/admin/users/route.ts:34`, `apps/admin/app/api/admin/vehicles/route.ts:40,65`.
**Importance: 6/10**

The pattern `return NextResponse.json({ error: error.message }, { status: 500 })` forwards the Supabase/Postgres driver's error string verbatim to the client, with no `NODE_ENV` branching anywhere in the codebase (confirmed — no `process.env.NODE_ENV` check near any of these lines). Most instances are behind `assertAdminSession()`, which caps the blast radius to authenticated staff — but `apps/web/app/api/locations/route.ts` has **no auth check at all** (it's a public, cached `GET`) and still does this on line 13:
```typescript
if (error) return NextResponse.json({ error: error.message }, { status: 500 })
```
Any anonymous visitor who can trigger a DB error on this route (e.g. by exhausting a connection pool, or if a future migration renames a column) sees the raw Postgres error text, which can include table/column names and constraint identifiers.

**Remediation:** introduce one helper and use it everywhere `error.message` is currently forwarded:
```typescript
// apps/web/lib/errors.ts (new)
export function dbErrorResponse(context: string, error: unknown, status = 500) {
  console.error(`[${context}]`, error)
  return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status })
}
```
```typescript
// apps/web/app/api/locations/route.ts
const { data, error } = await supabase.from('locations').select('id, name, city').order('city')
if (error) return dbErrorResponse('locations', error)
return NextResponse.json(data)
```
For admin routes, it's reasonable to keep more detail since the audience is trusted staff, but still route it through a helper so it's a single place to add `NODE_ENV` gating later:
```typescript
export function adminErrorResponse(context: string, error: { message: string }, status = 500) {
  console.error(`[${context}]`, error)
  const detail = process.env.NODE_ENV === 'production' ? undefined : error.message
  return NextResponse.json({ error: 'Request failed', detail }, { status })
}
```

---

### 5. Server-side errors are never sent to Sentry
**Location:** `apps/web/instrumentation.ts`, `apps/admin/instrumentation.ts` (both only call `Sentry.init(...)`, no `onRequestError` export); confirmed by `grep -r "captureException\|onRequestError"` across `apps/*` matching only the three client `error.tsx`/`global-error.tsx` files and the two `sentry.client.config.ts` files.
**Importance: 6/10**

Next.js's server-side Sentry integration requires an `onRequestError` export from `instrumentation.ts` to automatically capture exceptions thrown in Server Components, Route Handlers, and Middleware. Neither app has this. The only `Sentry.captureException` calls in the entire codebase are inside the three React error boundaries (`apps/web/app/global-error.tsx:8`, `apps/web/app/error.tsx:9`, `apps/admin/app/global-error.tsx:8`), which only fire for **render-time** exceptions that escape to a boundary — not for the ~50 `console.error(...)` calls scattered through API routes (e.g. every finding above), and not for middleware failures (Finding 2), since middleware errors never reach a React boundary at all.

In practice this means: a failing Stripe webhook (Finding 1), a failing admin middleware auth check (Finding 2), or a failing loyalty RPC (Finding 3) produce **zero alerts** — the only trace is a `console.error` line in Vercel's function logs, which nobody is paged on.

**Remediation:**
```typescript
// apps/web/instrumentation.ts
import * as Sentry from '@sentry/nextjs'

export async function register() {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    tracesSampleRate: 0.1,
    environment: process.env.NODE_ENV,
    enabled: process.env.NODE_ENV === 'production',
  })
}

export const onRequestError = Sentry.captureRequestError
```
Apply the identical two-line addition to `apps/admin/instrumentation.ts`. This is a standard, documented `@sentry/nextjs` hook (Next.js 14.1+) and requires no other code changes to start capturing route-handler and middleware exceptions.

---

### 6. No centralized error handler or custom error classes
**Location:** repo-wide — confirmed absent via `grep -r "class.*Error extends" apps/` (0 matches) and `grep -r "asyncHandler\|withErrorHandling\|catchAsync\|wrapHandler" apps/` (0 matches).
**Importance: 5/10**

Every one of the ~50 route handlers independently re-implements: JSON body parsing + 400 on failure, Zod validation + 400/422, an auth check (some via `assertAdminSession()`/`getUserFromRequest()`, some inline), and a final `{error: ...}` shape that varies (`{error: string}`, `{error: string, details: ...}`, `{error: ZodFlattenedError}`). There is no single place that guarantees, e.g., that every unhandled exception gets logged the same way, or that every 500 gets the same client-facing shape. This is why Findings 3, 4, and 8 exist as *inconsistencies* rather than being structurally impossible.

**Remediation:** a thin wrapper is enough — it doesn't need to be a full framework:
```typescript
// apps/web/lib/api-handler.ts (new)
import { NextRequest, NextResponse } from 'next/server'

export class ApiError extends Error {
  constructor(public status: number, message: string, public details?: unknown) {
    super(message)
  }
}

type Handler = (req: NextRequest, ctx: unknown) => Promise<NextResponse>

export function withErrorHandling(handler: Handler): Handler {
  return async (req, ctx) => {
    try {
      return await handler(req, ctx)
    } catch (err) {
      if (err instanceof ApiError) {
        return NextResponse.json({ error: err.message, details: err.details }, { status: err.status })
      }
      console.error('[unhandled route error]', err)
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
  }
}
```
```typescript
// usage
export const POST = withErrorHandling(async (request) => {
  const parsed = CreateBookingSchema.safeParse(await request.json())
  if (!parsed.success) throw new ApiError(422, 'Validation failed', parsed.error.flatten())
  // ...
})
```
This is a larger refactor than the other findings and should be adopted incrementally (new routes first) rather than as a single sweeping change, given the number of call sites.

---

### 7. No retry, circuit breaker, or consistent timeout for outbound calls
**Location:** `apps/web/lib/stripe.ts` (no timeout configured), `apps/web/lib/email.ts` (`getResend().emails.send(...)`, no timeout), `apps/web/lib/ai-vision-adapter.ts:80` (60s timeout) vs. `apps/web/lib/anthropic.ts` calls elsewhere (30s timeout via `AbortSignal.timeout(30_000)`, e.g. `apps/web/app/api/ai/chat/route.ts:330`, `apps/web/lib/corporate-agent.ts:106`).
**Importance: 5/10**

Confirmed via `grep -ri "retry|circuitbreaker|backoff" apps/` that the only backoff logic in the repo is the **client-side** confirmation-page poll (documented in `CLAUDE.md` as 1s→2s→4s→8s→16s→32s) — a UI polling concern, not resilience for the server's own outbound calls. A single transient network blip to Stripe (`payments/intent/route.ts`) or Resend (`email.ts`) fails the entire operation immediately and permanently for that request, with no retry attempt. Timeouts are also inconsistent: Anthropic calls consistently use a 30s `AbortSignal.timeout`, the OpenAI-compatible vision fallback uses 60s, but Stripe and Resend calls have no explicit timeout at all (relying on each SDK's own default, which for `stripe-node` is 80s).

**Remediation:** for the highest-value case (payment intent creation, `apps/web/app/api/payments/intent/route.ts:77`), wrap the Stripe call with a small bounded retry for retryable errors only:
```typescript
import Stripe from 'stripe'

async function createIntentWithRetry(params: Stripe.PaymentIntentCreateParams, attempts = 2) {
  for (let i = 0; ; i++) {
    try {
      return await stripe.paymentIntents.create(params)
    } catch (err) {
      const retryable = err instanceof Stripe.errors.StripeConnectionError
      if (!retryable || i >= attempts) throw err
      await new Promise((r) => setTimeout(r, 300 * 2 ** i))
    }
  }
}
```
Do **not** blindly retry `stripe.paymentIntents.create` on ambiguous errors (timeouts where the intent may have actually been created) without an idempotency key — pass one explicitly (`{ idempotencyKey: booking_id }`) so a retried create is safe. This is the more important half of the fix and is currently missing entirely.

---

### 8. Inconsistent validation status codes for identical failure shape
**Location:** `apps/web/app/api/ai/damage/route.ts:55` and `apps/web/app/api/ai/trip/route.ts:59` return `400` on `safeParse` failure; every other checked route (`apps/web/app/api/bookings/route.ts:25`, `apps/web/app/api/payments/intent/route.ts:27`, `apps/web/app/api/account/profile/route.ts:37`, `apps/web/app/api/corporate/route.ts:74`, and 12 admin routes e.g. `apps/admin/app/api/admin/vehicles/route.ts:55`, `apps/admin/app/api/admin/users/route.ts:56`) returns `422` for the same `ZodError.flatten()` shape.
**Importance: 4/10**

Not a functional bug (both are correctly in the 4xx client-error range), but it means client code that special-cases "422 = validation, show field errors" will treat the `ai/damage` and `ai/trip` validation failures as a generic 400 instead.

**Remediation:** change lines 55 and 59 to `422` to match the dominant convention:
```typescript
// apps/web/app/api/ai/damage/route.ts:55 and apps/web/app/api/ai/trip/route.ts:59
return NextResponse.json({ error: 'Invalid request', details: input.error.flatten() }, { status: 422 })
```

---

### 9. Mobile app surfaces raw HTTP response bodies as error messages
**Location:** `apps/mobile/lib/api.ts`, lines 28–31, 45–48, 62–65 (`apiGet`, `apiPost`, `apiPatch`).
**Importance: 4/10**

```typescript
if (!res.ok) {
  const text = await res.text()
  throw new Error(text || `API error ${res.status}`)
}
```
Every API route in this repo returns JSON error bodies like `{"error":"Rate limit exceeded"}` or `{"error":"Validation failed","details":{...}}`. Because `res.text()` is used instead of `res.json()`, `Error.message` becomes the **raw JSON string**, not the human-readable `error` field inside it. Call sites then show this directly to end users:
- `apps/mobile/app/(auth)/login.tsx:31–32`: `Alert.alert('Sign in failed', msg)`
- `apps/mobile/app/(auth)/register.tsx:43–44`: `Alert.alert('Registration failed', msg)`
- `apps/mobile/app/booking/[id].tsx:71–72`: `Alert.alert('Error', ...)`
- `apps/mobile/app/book/payment.tsx:82–83`, `apps/mobile/app/(tabs)/bookings.tsx:52`: `setError(...)` rendered in the UI

A user hitting the booking rate limit would see an alert reading `{"error":"Rate limit exceeded"}` instead of "Rate limit exceeded".

**Remediation:**
```typescript
// apps/mobile/lib/api.ts
async function parseErrorBody(res: Response): Promise<string> {
  try {
    const json = await res.json()
    if (typeof json?.error === 'string') return json.error
    if (json?.error?.formErrors?.length) return json.error.formErrors[0]
    return `API error ${res.status}`
  } catch {
    return `API error ${res.status}`
  }
}

export async function apiGet<T>(/* ... */): Promise<T> {
  // ...
  if (!res.ok) throw new Error(await parseErrorBody(res))
  return res.json() as Promise<T>
}
// apply the same change to apiPost and apiPatch
```

---

### 10. Rate limiter fails open; structurally identical API-key check fails closed
**Location:** `apps/web/lib/rate-limit.ts:23–25` and `apps/admin/lib/rate-limit.ts:25–27` (`catch { return true }`) vs. `apps/web/middleware.ts:56–59` (`handleApiKeyAuth`, returns `503`-equivalent `500` on the same kind of RPC error).
**Importance: 3/10**

Both `checkDbRateLimit` and `handleApiKeyAuth`'s daily-limit check call an atomic Postgres RPC (`increment_rate_limit` / `increment_api_key_usage` respectively) and handle the case where that RPC errors. `checkDbRateLimit` deliberately fails **open** (returns `true`, allow the request) — this is intentional and unit-tested (`apps/web/__tests__/rate-limit.test.ts:45–60`, "fails open when the RPC call errors"). `handleApiKeyAuth` fails **closed** (`apps/web/middleware.ts:56–58`, returns `500`) for what is architecturally the same failure mode (a rate/usage-tracking RPC erroring). Neither choice is wrong on its own — general abuse-prevention rate limiting reasonably prioritizes availability, while paid API-key metering reasonably prioritizes not under-billing/over-serving — but the split isn't documented anywhere as a deliberate choice, so it reads as an oversight rather than policy.

**Remediation:** add a one-line comment at each site making the intent explicit, so a future edit doesn't "fix" one to match the other by accident:
```typescript
// apps/web/lib/rate-limit.ts
} catch {
  return true // fail OPEN by design: abuse-prevention limit, availability > strictness — see audits/error-handling-audit-2026-09-29.md #10
}
```
```typescript
// apps/web/middleware.ts, inside handleApiKeyAuth
if (usageError) {
  console.error('[api-key-auth] increment_api_key_usage failed:', usageError)
  // fail CLOSED by design: this meters a paid quota — see audits/error-handling-audit-2026-09-29.md #10
  return NextResponse.json({ error: 'Rate limit check failed' }, { status: 500 })
}
```

---

## Positive practices worth preserving

These are not findings, but they're worth calling out so a future refactor (e.g., adopting Finding 6's wrapper) doesn't regress them:

- **Graceful AI degradation:** every `/api/ai/*` route checks `process.env.ANTHROPIC_API_KEY` up front and returns a clean `503` instead of crashing (e.g. `apps/web/app/api/ai/chat/route.ts:279–281`, `apps/web/app/api/ai/damage/route.ts:34–36`).
- **Fire-and-forget done right:** `apps/web/lib/corporate-agent.ts` and `apps/admin/lib/audit.ts` (`logAudit`, lines 13–27) both swallow their own errors internally and are documented as "never throw, never block the primary action."
- **Compensating transactions:** `apps/admin/app/api/admin/users/route.ts:116–121` rolls back a just-created Supabase Auth user if the follow-up `user_profiles` update fails — this is exactly the pattern Finding 1 is missing.
- **No stack-trace leakage:** none of the three error boundaries (`global-error.tsx` × 2, `error.tsx`) render `error.stack` or raw error text to the user; all show a generic message and capture to Sentry client-side.
- **Content-verification on uploads:** `apps/web/app/api/inspections/upload/route.ts:7–23` checks magic bytes against the declared MIME type rather than trusting the client-supplied `data:` URL prefix.
- **Bounded AI tool loop:** `apps/web/app/api/ai/chat/route.ts:319` caps the agentic tool-calling loop at 5 iterations, with per-iteration and per-tool-call `try/catch` (lines 321, 355) — a solid pattern against a runaway or misbehaving model response.

---

## Unable to verify

- Whether Vercel's platform-level function timeout/crash handling masks any of the unhandled-exception risks in Finding 1 or 3 with its own generic 500 before Sentry (or anything else) sees it — would need a live/staging reproduction to confirm the exact response Stripe receives on a mid-webhook DB failure.
- Whether `RESEND_API_KEY`/Resend itself applies its own retry policy for transient network errors — this audit only reviewed the calling code in `apps/web/lib/email.ts`, not Resend's SDK internals.
- Whether any of the 29 `error.message`-forwarding routes (Finding 4) have ever actually returned a message containing sensitive schema detail in practice — this is a latent-risk finding based on the pattern, not an observed leak.

---

## Remediation status (2026-09-29, same-day follow-up)

All 10 findings were fixed the same day this audit was written. `pnpm exec tsc --noEmit` passes with exit 0 in both `apps/web` and `apps/admin` after every change below. No dynamic/runtime testing was performed — this is a code-level verification pass, not a live confirmation.

| # | Finding | Status | What changed |
|---|---|---|---|
| 1 | Stripe webhook — no error handling around DB writes | ✅ **Fixed** | `apps/web/app/api/webhooks/stripe/route.ts`: the `payments` update and the `bookings` confirm update now check `{ error }` and return `500` on failure (so Stripe's own retry mechanism gets a chance to complete the sequence, instead of the idempotency check on the `payment.status === 'paid'` guard silently swallowing every future retry). The invoice re-fetch and `award_loyalty_points` RPC also log their previously-ignored errors. |
| 2 | Admin `middleware.ts` — unguarded Supabase calls, documented recurring failure mode | ✅ **Fixed** | `apps/admin/middleware.ts` and `apps/web/middleware.ts`: `supabase.auth.getUser()` and the `user_profiles` lookup are now wrapped in `try/catch`. On failure, admin API routes return `503` and admin/web pages redirect to `/auth/login?error=service_unavailable` instead of crashing with a raw framework 500. |
| 3 | `deduct_loyalty_points` fire-and-forget with no `.catch()` | ✅ **Fixed** | `apps/web/app/api/bookings/route.ts`: the `void supabase.rpc('deduct_loyalty_points', ...)` call now has a `.then(({ error }) => ...)` handler that logs the error with booking/user context, matching the pattern already used for the adjacent `runCorporateAgent(...).catch(...)` call. |
| 4 | Raw DB `error.message` returned to clients, incl. public `/api/locations` | ✅ **Fixed** | Added `apps/web/lib/errors.ts` (`dbErrorResponse`) and `apps/admin/lib/errors.ts` (`adminErrorResponse`, detail gated on `NODE_ENV`). Applied to `/api/locations`, `/api/account/clear-reset`, and all 20 affected admin route files (34 call sites) via a scripted mechanical replacement. Two intentional `400`-status Supabase Auth messages in `apps/admin/app/api/admin/users/route.ts` (duplicate-email style errors, not raw Postgres errors) were left as-is. |
| 5 | No server-side error reporting to Sentry | ✅ **Fixed** | Added `export const onRequestError = Sentry.captureRequestError` to both `apps/web/instrumentation.ts` and `apps/admin/instrumentation.ts` — the standard Next.js hook that routes Server Component / Route Handler / middleware exceptions to Sentry, previously missing entirely. |
| 6 | No centralized error handler / custom error classes | ✅ **Fixed (incremental adoption, as recommended)** | Added `apps/web/lib/api-handler.ts` (`withErrorHandling` wrapper + `ApiError` class). Applied to `/api/bookings` (`POST`) as the reference example. Per the audit's own remediation note, this was adopted on one route rather than rewritten across all ~50 handlers in one pass — the rest should move over incrementally as they're touched. |
| 7 | No retry / circuit breaker for outbound calls (Stripe, Resend, Supabase) | ✅ **Fixed (Stripe payment-intent creation only)** | Added `createPaymentIntentWithRetry` to `apps/web/lib/stripe.ts` — bounded retry (2 attempts, exponential backoff) restricted to `Stripe.errors.StripeConnectionError`, plus a mandatory `idempotencyKey` (the `booking_id`) so a retry after an ambiguous failure returns the original intent instead of risking a duplicate charge target. Wired into `/api/payments/intent`. Resend and general Supabase calls were **not** retried — scoped to the highest-value case per the audit's own remediation note. |
| 8 | 400 vs 422 inconsistency for identical Zod failures | ✅ **Fixed** | `apps/web/app/api/ai/damage/route.ts:55` and `apps/web/app/api/ai/trip/route.ts:59` changed from `400` to `422`, matching every other route. Confirmed no client code (`TripCopilot.tsx` etc.) branches on the old status code. |
| 9 | Mobile app shows raw JSON error bodies to users | ✅ **Fixed** | `apps/mobile/lib/api.ts`: added `parseErrorBody()`, which extracts the `error` string (or first Zod `formErrors` entry) from the JSON response body instead of using the raw body text as `Error.message`. Applied to `apiGet`, `apiPost`, and `apiPatch`. Not type-checked — `apps/mobile` has no `tsconfig.json` in the repo (pre-existing, unrelated to this change); verified by inspection instead. |
| 10 | Rate limiter fails open vs. API-key check fails closed, undocumented | ✅ **Fixed (documented, not changed)** | Added cross-referencing comments at `apps/web/lib/rate-limit.ts`, `apps/admin/lib/rate-limit.ts`, and `apps/web/middleware.ts` (`handleApiKeyAuth`) explaining the split is intentional — general abuse-prevention favors availability (fail open, already unit-tested), paid API-key metering favors correctness (fail closed). No behavior was changed, only intent made explicit so a future edit doesn't "fix" one to match the other by accident. |

**Bottom line:** all 10 findings are addressed at the code level as of this pass. The two largest architectural findings (6 — centralized handler, 7 — retry/circuit-breaker) were deliberately scoped to one reference implementation each rather than a full sweep, matching the audit's own remediation guidance; the remaining ~49 route handlers and the Resend/general-Supabase call sites should adopt the same patterns incrementally. Nothing in this pass was verified against a running system (no webhook replay, no simulated Supabase outage, no mobile app run) — see the "Unable to verify" section above, which still applies to the underlying failure scenarios these fixes target.
