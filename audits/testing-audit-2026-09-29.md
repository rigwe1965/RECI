# RECI Transport — Testing Implementation Audit

**Date:** 2026-09-29
**Scope:** `apps/web`, `apps/admin`, `apps/mobile`, `packages/utils`, root `e2e/`, `load-tests/`, `.github/workflows/ci.yml`, `playwright.config.ts`, `turbo.json`.
**Excluded:** `node_modules`, `.next`, `.turbo`, generated files, `supabase/migrations/*.sql`.
**Method:** Read every existing test file in full. Ran `pnpm exec jest --coverage` in `apps/web` to get real, measured coverage numbers (not estimated). Read `.github/workflows/ci.yml`, `playwright.config.ts`, and every `package.json` `scripts` block to confirm what is/isn't wired into CI. Counted API route files via `find` to size the untested surface.

---

## Executive Summary

| # | Finding | Category | Importance (1–10) | Effort |
|---|---|---|---|---|
| 1 | `apps/web` API routes: **2.23% statement coverage** overall; every `app/api/**/route.ts` is 0% except none | Coverage | **9** | L |
| 2 | `apps/admin` has **no test runner configured at all** — no `test` script, no Jest/Vitest config, 23 API routes with zero coverage | Coverage | **9** | M |
| 3 | Stripe webhook (`apps/web/app/api/webhooks/stripe/route.ts`) has **zero test coverage** — payment confirmation + loyalty-point award logic is completely unverified | Coverage | **9** | M |
| 4 | `sanitization.test.ts` tests a **copy-pasted regex, not the real implementation** — it would not catch a regression in the actual routes | Quality | **8** | S |
| 5 | All 6 AI routes (`apps/web/app/api/ai/*`) and the AI Vision adapter: **zero test coverage**, no mocking strategy exists for the Anthropic client | Coverage | **8** | M |
| 6 | Zero integration tests anywhere in the repo — every existing test is a pure unit test of an isolated function/schema | Patterns | **7** | M |
| 7 | `apps/mobile` has **no test runner configured at all** — no test script, no test files | Coverage | **6** | M |
| 8 | Admin auth (`assertAdminSession`/`assertAdminOnly`, `ADMIN_PORTAL_ROLES`) has zero test coverage despite being the single point of enforcement for every admin route | Missing (Security) | **8** | S |
| 9 | `k6` load tests exist but are **not wired into CI at all** — purely manual, no regression protection | Missing (Perf) | **5** | M |
| 10 | E2E suite is 9 tests across 2 files covering only the homepage + a shallow vehicle-card click — no booking creation, no payment, no admin login, no AI search | Coverage | **7** | L |
| 11 | `schemas.test.ts` only exercises 3 of the ~13 schemas exported by `lib/schemas.ts` (61% line coverage on that file) | Coverage | **5** | S |
| 12 | No coverage thresholds configured in `apps/web/jest.config.js` — coverage can silently regress to 0% with no CI failure | Patterns | **6** | S |
| 13 | E2E tests assert on exact visible copy (`'RECI Transport'`, `'Available Vehicles'`, `'AI Search'`) with no `data-testid` fallback — brittle to copy changes | Patterns | **4** | S |
| 14 | `rate-limit.test.ts` is a strong example of good practice (see Quality section) — worth preserving as the house style | Quality | n/a (positive) | — |

---

## 1. TEST COVERAGE

### 1.1 Measured unit coverage — `apps/web`

Ran directly (not estimated):

```
cd apps/web && pnpm exec jest --coverage
```

```
All files                           |    2.23 |     0.15 |    0.75 |    2.15 |
```

Breakdown of the only files with non-zero coverage:

| File | % Stmts | Why |
|---|---|---|
| `lib/rate-limit.ts` | 100 | Fully covered by `rate-limit.test.ts` |
| `lib/schemas.ts` | 61.11 | Only `CreateBookingSchema`, `DriverDetailsSchema`, `SearchParamsSchema` tested — `VehicleSchema`, `PricingSignalSchema`, `CreatePaymentIntentSchema`, `PaymentIntentResponseSchema`, `BookingConfirmationSchema`, `LicenceOCRResponseSchema`, `TripCopilotRequestSchema`, `TripCopilotResponseSchema`, `DamageDetectionRequestSchema`, `DamageReportSchema` are untested |
| `lib/anthropic.ts`, `lib/supabase/admin-server.ts`, `lib/supabase/client.ts` | 0% stmts, 100% funcs/branch | Only "covered" because their single export is imported (not called) by a mocked module in `rate-limit.test.ts` — not real test coverage |

**Every single file under `app/api/**` is 0% covered** — 34 route files (confirmed via the full coverage table), including:
- All 6 AI routes: `app/api/ai/{chat,damage,extras-recommend,licence,search,trip}/route.ts`
- `app/api/webhooks/stripe/route.ts` (129 lines, 0%)
- `app/api/bookings/route.ts` (254 lines, 0%) and `app/api/bookings/[id]/route.ts` (109 lines, 0%)
- `app/api/payments/intent/route.ts` (110 lines, 0%)
- `app/api/corporate/route.ts`, `app/api/loyalty/route.ts`, `app/api/vehicles/**`, `app/api/inspections/**`, `app/api/cron/pricing-signals/route.ts` — all 0%

**Importance: 9/10** — the app's core revenue path (search → book → pay) has no automated safety net below the E2E layer, and the E2E layer (§1.3) doesn't cover it either.

**Remediation:** add a coverage floor so this can't silently stay at 2% forever, then grow it route-by-route starting with §1.3's priority list:
```js
// apps/web/jest.config.js — add to the config object
coverageThreshold: {
  global: { statements: 5, branches: 5, functions: 5, lines: 5 }, // ratchet up over time
},
```

### 1.2 `apps/admin` — no test infrastructure at all

`apps/admin/package.json` `scripts`:
```json
"scripts": {
  "dev": "next dev -p 3001 --turbo",
  "build": "next build",
  "start": "next start -p 3001",
  "lint": "next lint",
  "type-check": "tsc --noEmit"
}
```
No `"test"` key, no `jest.config.js`, no `vitest.config.ts`, no `__tests__/` directory. `find apps/admin/app/api -name route.ts | wc -l` → **23 route files**, all with zero possible coverage since there is no runner. This includes the admin review-approval endpoints (`api/admin/reviews/licences`, `api/admin/reviews/damage`) that commit human-in-the-loop decisions, and every CRUD endpoint under `api/admin/vehicles`, `api/admin/users`, `api/admin/bookings`.

**Importance: 9/10** — an entire app has no unit-test capability; a regression here is caught only by manual QA or production incidents.

**Remediation — minimal drop-in to make admin testable** (mirrors `apps/web/jest.config.js` exactly):
```js
// apps/admin/jest.config.js
const nextJest = require('next/jest')
const createJestConfig = nextJest({ dir: './' })
module.exports = createJestConfig({
  displayName: 'admin',
  testEnvironment: 'node',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
    '^@reci/(.*)$': '<rootDir>/../../packages/$1/src',
  },
  testMatch: ['**/__tests__/**/*.test.ts'],
})
```
```json
// apps/admin/package.json — add
"test": "jest"
```
Plus one seed test (see §4.3 for the `ADMIN_PORTAL_ROLES` example) so the harness is proven to run, not just configured.

### 1.3 Stripe webhook — zero coverage on the money-movement path

`apps/web/app/api/webhooks/stripe/route.ts` (129 lines) is 0% covered. This is the handler that confirms `payment_intent.succeeded`, marks bookings paid, and awards loyalty points (per `CLAUDE.md`'s documented booking flow). No unit test verifies signature validation, idempotency, or the loyalty-point award math.

**Importance: 9/10** — silent failure here means a customer is charged but the booking never confirms, or points are double-awarded on a webhook retry (Stripe redelivers webhooks on non-2xx).

**Remediation skeleton:**
```ts
// apps/web/__tests__/webhooks-stripe.test.ts
jest.mock('../lib/stripe', () => ({ stripe: { webhooks: { constructEvent: jest.fn() } } }))
jest.mock('../lib/supabase/admin-server', () => ({ createAdminClient: jest.fn() }))

import { stripe } from '../lib/stripe'
import { POST } from '../app/api/webhooks/stripe/route'

test('rejects request with invalid signature', async () => {
  ;(stripe.webhooks.constructEvent as jest.Mock).mockImplementation(() => { throw new Error('bad sig') })
  const req = new Request('http://x/api/webhooks/stripe', { method: 'POST', body: '{}', headers: { 'stripe-signature': 'bad' } })
  const res = await POST(req as any)
  expect(res.status).toBe(400)
})
```

### 1.4 AI routes — zero coverage, no Anthropic mocking pattern exists

`apps/web/app/api/ai/{chat,damage,extras-recommend,licence,search,trip}/route.ts` — all 0%. No test in the repo demonstrates how to mock `@/lib/anthropic`'s singleton export, so even a motivated contributor has no example to follow.

**Importance: 8/10** — these routes handle user-submitted content (search text, licence/damage photos) going to a paid external API; an unhandled schema-drift in Claude's response (e.g. `extras-recommend`'s expected JSON shape) fails silently in production today.

**Remediation skeleton (establishes the mocking pattern, reusable for all 6 routes):**
```ts
// apps/web/__tests__/ai-search.test.ts
jest.mock('@/lib/anthropic', () => ({
  __esModule: true,
  default: { messages: { create: jest.fn() } },
}))
import anthropic from '@/lib/anthropic'
import { POST } from '../app/api/ai/search/route'

test('returns 502 when Claude returns malformed JSON', async () => {
  ;(anthropic.messages.create as jest.Mock).mockResolvedValue({ content: [{ type: 'text', text: 'not json' }] })
  const req = new Request('http://x', { method: 'POST', body: JSON.stringify({ query: 'suv berlin' }) })
  const res = await POST(req as any)
  expect(res.status).toBeGreaterThanOrEqual(400)
})
```

### 1.5 Integration tests: none exist

Every test in the repo (`rate-limit.test.ts`, `sanitization.test.ts`, `schemas.test.ts`, `pricing.test.ts`, `currency.test.ts`) is a pure unit test against an isolated function or Zod schema with all I/O mocked or absent. There is no test anywhere that exercises a route handler end-to-end against even a mocked Supabase client (e.g. calling the actual exported `GET`/`POST` from a `route.ts` file). `rate-limit.test.ts` gets closest (it imports the real `checkDbRateLimit` and mocks only the Supabase client one layer down) but nothing does this for a full route handler.

**Importance: 7/10** (folded into Patterns §3.1, restated here for the Coverage lens) — the test pyramid has a unit layer and (thin) E2E layer with **nothing in between**; route-level bugs (wrong status code, wrong auth check ordering, wrong response shape) are only caught by E2E or production.

### 1.6 E2E coverage — 9 tests, 2 files, shallow

`e2e/homepage.spec.ts` (7 tests): homepage render, AI/Filters toggle, cookie banner show/hide, `/privacy`, `/terms`.
`e2e/booking-flow.spec.ts` (3 tests): vehicle card → detail page navigation, "Book Now" button visible, unauthenticated `/account/bookings` redirect.

**Not covered by E2E, and not covered by anything else either** (cross-referenced against §1.1–1.4):
- Completing a booking (`/book/[vehicleId]` → `/book/extras` → `/book/driver` → `/book/payment` → `/book/confirmation`) — the 5-step flow `CLAUDE.md` documents as the product's core loop has **zero test coverage of any kind**.
- Stripe payment submission (would need Stripe test-mode card via Payment Element).
- Admin login / admin dashboard access.
- AI conversational search actually returning results.
- Licence OCR / damage detection upload flow.

**Importance: 7/10** — the single most business-critical user journey in the product is entirely unverified by automation.

**Remediation:** extend `e2e/booking-flow.spec.ts` past step 1. Minimal proof-of-concept:
```ts
// e2e/booking-flow.spec.ts — add
test('can progress from vehicle detail through to driver details step', async ({ page }) => {
  await page.goto('/')
  await page.locator('[href^="/vehicles/"]').first().click()
  await page.getByRole('link', { name: /book now/i }).click()
  await expect(page).toHaveURL(/\/book\//)
  // continue through date selection / extras / driver form once selectors are confirmed
})
```

---

## 2. TEST QUALITY

### 2.1 `rate-limit.test.ts` — good example, worth citing as house style

`apps/web/__tests__/rate-limit.test.ts:20-61`. Four tests, each named as a behavior (`'allows request when RPC reports under limit'`, `'fails open when the RPC call errors'`), clear Arrange (mock factory `makeMockSupabase`, line 14-18) → Act (`await checkDbRateLimit(...)`) → Assert. `beforeEach(() => jest.clearAllMocks())` (line 21) guarantees test independence — no shared mutable state leaks between tests. The comment block at the top (lines 1-5) explains *why* the implementation is RPC-based, which is genuinely useful context for a future reader. This is the strongest file in the suite.

### 2.2 `sanitization.test.ts` — tests a copy, not the source (Critical quality defect)

`apps/web/__tests__/sanitization.test.ts:4`:
```ts
const sanitize = (input: string) => input.replace(/[^a-zA-Z0-9 @.\-]/g, '').slice(0, 100)
```
This regex is **redefined inline in the test file** rather than imported. The real pattern lives duplicated in three **admin** route files — confirmed via grep:
- `apps/admin/app/api/admin/users/route.ts`
- `apps/admin/app/api/admin/bookings/route.ts`
- `apps/admin/app/api/admin/customers/route.ts`

None of these are imported by the test (confirmed: zero occurrences of this regex pattern anywhere under `apps/web/`). This test file also lives in the **wrong app's** `__tests__/` directory relative to what it claims to test. If any of the three admin routes' sanitization regex is changed or removed, this test suite will continue to pass with 100% green — it provides **zero regression protection** for the actual code, only for an unreachable duplicate.

**Importance: 8/10** — this is the kind of finding that gives false confidence; a reviewer sees "9 sanitization tests passing" and reasonably assumes the XSS/injection defenses are verified, when they are not.

**Remediation:** extract the shared regex into one module `apps/admin/lib/sanitize.ts` (this also resolves the 3x duplication `code-duplication-audit-2026-09-29.md` would flag independently), have all three admin routes import it, and move+fix the test:
```ts
// apps/admin/lib/sanitize.ts
export function sanitizeSearchInput(input: string): string {
  return input.replace(/[^a-zA-Z0-9 @.\-]/g, '').slice(0, 100)
}
```
```ts
// apps/admin/__tests__/sanitize.test.ts
import { sanitizeSearchInput } from '../lib/sanitize'
test('strips SQL injection attempt', () => {
  expect(sanitizeSearchInput("'; DROP TABLE users; --")).not.toContain("'")
})
```

### 2.3 `schemas.test.ts` and `pricing.test.ts` / `currency.test.ts` — solid, narrow

`apps/web/__tests__/schemas.test.ts` and `packages/utils/src/{pricing,currency}.test.ts` all follow clear Arrange-Act-Assert, have descriptive names (`'rejects invalid vehicle_id (not UUID)'`, `'discount then surcharge ordering is correct'` in `pricing.test.ts:79`), and use no unnecessary mocking (correct — these are pure functions/schemas). `pricing.test.ts:90-98` (`'rounds to 2 decimal places'`) is a genuine edge-case test, not just a happy path. Test data is hardcoded inline rather than via fixtures/factories, but at this scale (single-object literals) that's appropriate, not a smell — a factory would be over-engineering here.

**No independence issues found** in any test file — no shared mutable module state, no test-order dependence observed (`describe` blocks don't reference outer `let` variables mutated across tests).

---

## 3. TEST PATTERNS

### 3.1 Test pyramid — inverted at the base, gap in the middle

| Layer | Count | Files |
|---|---|---|
| Unit | 41 tests | 3 files in `apps/web/__tests__`, 2 files in `packages/utils/src` |
| Integration | **0** | none |
| E2E | 9 tests | 2 files in `e2e/` |

The *shape* (41 unit : 0 integration : 9 E2E) looks pyramid-like by count, but the **coverage-weighted** picture is inverted: the 41 unit tests cover 3 small, low-risk modules (rate-limit, a subset of schemas, pricing/currency math) while the highest-risk, highest-complexity code (payment webhook, AI routes, all of `apps/admin`) is covered only by 9 shallow E2E tests that don't even reach it. A healthy pyramid needs a middle layer — route-level integration tests with a mocked Supabase/Stripe/Anthropic boundary — which is currently **entirely absent** (§1.5).

**Importance: 7/10.**

### 3.2 Anti-patterns

No tests found asserting on private/internal implementation state (no `.instance`, no reaching into closures, no snapshot tests of internal data structures). This is a genuine positive — every existing test asserts on public return values or thrown errors, which is correct behavior-testing.

### 3.3 Brittleness

`e2e/homepage.spec.ts:8-9,14-15,44,46,49,54` assert on exact literal copy (`'RECI Transport'`, `'Available Vehicles'`, `'AI Search'`, `'Filters'`, `'Privacy Policy'`, `'GDPR'`, `'Terms of Service'`) with no `data-testid` alternative. A copy change (e.g. rebranding "AI Search" to "Smart Search") breaks the test even though behavior is unchanged — the classic E2E brittleness trap. The file's own comments (lines 6-7, 47-48) already show the author fighting this by adding `.first()` to work around duplicate text matches, which is a symptom of the underlying fragility rather than a fix for it.

**Importance: 4/10** — annoying maintenance cost, not a correctness risk; flagged because it will only get worse as more E2E tests are added on the same pattern.

**Remediation:** add `data-testid` to the key nav/toggle elements referenced repeatedly:
```tsx
// wherever the AI/Filters toggle is rendered
<button data-testid="search-mode-ai">AI Search</button>
```
```ts
// e2e/homepage.spec.ts
await expect(page.getByTestId('search-mode-ai')).toBeVisible()
```

### 3.4 Test speed

Unit tests are fast — confirmed by the actual run: `apps/web` Jest suite completes in 3.578s (26 tests), `packages/utils` Vitest suite in ~0.5–0.7s (15 tests) per this session's earlier runs. No real network/DB calls in any unit test — all Supabase access is `jest.mock`'d (`rate-limit.test.ts:7-9`). This is correct and fast.

E2E requires a running dev server: `playwright.config.ts:18-23` has a `webServer` block (`command: 'pnpm exec turbo run dev --parallel'`, 120s timeout, `reuseExistingServer: !process.env.CI`) — Playwright auto-starts it, so **CLAUDE.md's "requires dev server running on 3002" instruction is stricter than necessary for the E2E job itself** (Playwright's `webServer` will start it if absent), though a human running `pnpm test:e2e` locally still benefits from having one already running to skip the ~5-10s Turbopack boot.

**Importance: n/a** — not a defect, noted for completeness.

---

## 4. MISSING TESTS

### 4.1 Error scenarios in already-tested modules

`rate-limit.test.ts` is the only file with explicit failure-path tests (`'fails open when the RPC call errors'` line 45, `'fails open when creating the client throws'` line 53) — genuinely good coverage of the fail-open security posture.

`schemas.test.ts` and `sanitization.test.ts` test **rejection** cases (invalid UUID, bad email, SQL injection strings) but these are still "happy path from the test's perspective" — the schema/regex is expected to correctly reject bad input, and it does. There's no test of what happens *downstream* when validation fails (e.g. does the route return a consistent 422 shape? Untestable today since no route-level test exists — see §1.5).

### 4.2 Edge cases

`schemas.test.ts` covers some boundaries well (`'rejects negative points_redeemed'` line 46, `'rejects extra with non-positive quantity'` line 51) but misses others present in the schema itself:
- `SearchParamsSchema.passenger_capacity` is `z.number().int().positive()` — no test for a non-integer (e.g. `2.5`) or zero.
- `CreateBookingSchema.pickup_datetime`/`dropoff_datetime` are plain `z.string()` with no format validation in the schema itself, and no test documents whether `dropoff` before `pickup` is expected to be rejected at this layer (it isn't — that logic lives in `packages/utils/pricing.ts`'s `calcDays`, which *does* test it: `pricing.test.ts:17-19` `'throws if dropoff before pickup'`). This is fine as designed, but nothing documents the boundary between schema-layer and business-logic-layer validation for a new contributor.

**Importance: 5/10.**

### 4.3 Security tests — the biggest gap relative to the codebase's own risk profile

Given this repo has **two prior security audits** (`security-audit-2026-09-28.md`, `security-audit-2026-09-29.md`) and this session's own work adding `ADMIN_PORTAL_ROLES` as the single source of truth for admin/staff role checks, it is notable that:
- `apps/admin/lib/auth.ts`'s `assertAdminSession`/`assertAdminOnly` — the function every one of admin's 23 API routes calls as its defense-in-depth check — has **zero unit tests**. No test proves that a `customer`-role session is rejected, that a missing `user_profiles` row is rejected, or that `assertAdminOnly` correctly distinguishes `'staff'` from `'admin'`.
- `ADMIN_PORTAL_ROLES` (`packages/types/src/index.ts`) itself has no test — trivial as the array is, a test here is what would catch someone accidentally changing it to include `'customer'`.
- No test exercises rate-limit bypass attempts (e.g. spoofed `X-Forwarded-For` headers) — `checkDbRateLimit`'s IP-extraction logic in each route (e.g. `apps/admin/app/api/auth/forgot-password/route.ts:10-13`) is untested for header-spoofing edge cases.

**Importance: 8/10** — this is the single highest-leverage gap: one function, tested once, protects 23+ routes.

**Remediation:**
```ts
// apps/admin/__tests__/auth.test.ts
jest.mock('../lib/supabase/server', () => ({ createServerSupabaseClient: jest.fn() }))
jest.mock('../lib/supabase/admin', () => ({ createAdminClient: jest.fn() }))
import { createServerSupabaseClient } from '../lib/supabase/server'
import { createAdminClient } from '../lib/supabase/admin'
import { assertAdminSession, assertAdminOnly } from '../lib/auth'

test('rejects a customer-role user', async () => {
  ;(createServerSupabaseClient as jest.Mock).mockResolvedValue({
    auth: { getUser: () => ({ data: { user: { id: 'u1' } } }) },
  })
  ;(createAdminClient as jest.Mock).mockReturnValue({
    from: () => ({ select: () => ({ eq: () => ({ single: () => ({ data: { role: 'customer' } }) }) }) }),
  })
  const result = await assertAdminSession()
  expect(result.authorized).toBe(false)
})
```
*(requires §1.2's `apps/admin/jest.config.js` to exist first.)*

### 4.4 Performance tests

`load-tests/vehicle-search.js` and `load-tests/booking-api.js` (k6) exist and are documented in `CLAUDE.md` (§ "Load Tests") but **confirmed absent from `.github/workflows/ci.yml`** — the workflow has exactly three jobs (`quality`, `build`, `e2e`), none of which reference `k6` or `load-tests/`. This is purely a manual/on-demand tool today.

No performance assertions exist in the unit or integration suite (none of `rate-limit.test.ts`, `schemas.test.ts`, `pricing.test.ts`, `currency.test.ts` assert on timing) — expected at this test-suite maturity level, noted as confirmed-absent rather than a surprise.

**Importance: 5/10** — reasonable to keep load tests manual/on-demand at this scale (they hit real infra per `load-tests/README.md`'s "safe to run against production" note for `vehicle-search.js`), but zero automated regression protection means a performance regression ships silently until someone remembers to run k6 by hand.

**Remediation (optional, low-cost first step — informational, not blocking):**
```yaml
# .github/workflows/ci.yml — new manually-triggered job, not on every PR
load-test:
  name: k6 Load Test (manual)
  runs-on: ubuntu-latest
  if: github.event_name == 'workflow_dispatch'
  steps:
    - uses: actions/checkout@v4
    - uses: grafana/setup-k6-action@v1
    - run: k6 run load-tests/vehicle-search.js --env BASE_URL=${{ secrets.STAGING_URL }}
```

---

## Recommended Priority Order

Highest confidence-per-effort first:

1. **Fix `sanitization.test.ts` (§2.2)** — S effort, and until fixed it's actively misleading; extract the real function, delete the copy.
2. **Add `apps/admin/jest.config.js` + one test for `assertAdminSession` (§1.2, §4.3)** — S/M effort, unlocks testing for 23 routes and directly covers the highest-leverage security function in the app.
3. **Add a Stripe webhook test (§1.3)** — M effort, closes the single scariest silent-failure gap (money movement + loyalty points).
4. **Add a coverage threshold to `apps/web/jest.config.js` (§3, Patterns)** — S effort, prevents further silent erosion from the current 2.23% floor.
5. **Extend `e2e/booking-flow.spec.ts` through checkout (§1.6)** — L effort but highest business value; the core product loop currently has no automated coverage of any kind.

---

## Unable to Verify

- **Exact admin coverage percentage**: no runner exists, so no number can be produced (confirmed absent, not estimated) — running `pnpm exec jest --coverage` after applying §1.2's config would produce a real baseline (expected: 0% until tests are added).
- **`apps/mobile` test posture beyond "no script exists"**: did not exhaustively search for ad-hoc test files outside a conventional `__tests__/`/`.test.ts` naming pattern; `find apps/mobile -name "*.test.*"` would confirm definitively (a spot check found none).
- **Whether `packages/ui`/`packages/config`/`packages/types` warrant tests**: these are near-zero-logic packages (types/config/thin UI wrappers); did not enumerate every export to confirm none contain testable logic — a `find packages/ui/src packages/config/src -name "*.ts" -exec wc -l {} +` would settle it definitively.
