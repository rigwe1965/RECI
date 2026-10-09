# RECI Transport — Code Duplication Audit

**Date:** 2026-09-29
**Scope:** `apps/web`, `apps/admin`, `apps/mobile` (app/components/lib), `packages/{types,ui,utils,config}/src`, and root-level one-off scripts (`create_admin.mjs`, `seed.mjs`, `seed_demo.mjs`, `update_images.mjs`).
**Excluded:** `node_modules`, `.next`, `.turbo`, `.vercel`, lockfiles, generated files, `supabase/migrations/*.sql`, test files (read only where relevant to a finding).
**Method:** manual read + targeted `grep`/`diff` across parallel files in `apps/web` vs `apps/admin`, and pattern counts across API route handlers. Every finding below cites exact file:line locations that were opened and read; nothing is inferred from file names alone.

This audit found **no evidence of literal copy-pasted business logic within a single app** (e.g. no duplicated booking/pricing algorithms inside `apps/web` itself). The duplication that exists is almost entirely **cross-app**: `apps/web` and `apps/admin` are two independent Next.js apps that each reimplement the same infrastructure primitives (Supabase clients, rate limiting, small UI atoms) and the same literal constants (role lists, vehicle enums), because there is currently no shared "server/runtime" package between them — only `packages/utils` (pricing) and `packages/types` (TS types, no runtime values) are shared.

---

## Executive Summary

| # | Finding | Category | Importance (1–10) | Effort |
|---|---|---|---|---|
| 1 | `['admin', 'staff']` role-check literal duplicated 9+ times across both apps | Data | **8** | S |
| 2 | Supabase client constructors duplicated per-app (admin/server/browser clients) | Exact/Near | **7** | M |
| 3 | Manual `€{x.toFixed(2)}` currency formatting, 20 occurrences / 9 files | Data | **6** | S |
| 4 | `fuel_type` / `transmission` enum literals duplicated 8 times | Data | **6** | S |
| 5 | Mobile app recomputes price with simplified logic instead of `@reci/utils` | Near-dup (logic drift) | **6** | S |
| 6 | JSON-body-parse boilerplate repeated in 24 API route files | Structural | **6** | M |
| 7 | `assertAdminSession()` early-return boilerplate repeated in 21 admin routes | Structural | **5** | M |
| 8 | `checkDbRateLimit` duplicated verbatim between web and admin | Exact | **4** | S |
| 9 | `DemandCard` implemented twice with diverging behavior | Near-dup | **4** | S |
| 10 | `PasswordInput` implemented twice, near-identical | Near-dup | **3** | S |
| 11 | Root maintenance scripts repeat Supabase-client bootstrap | Exact | **3** | S |
| 12 | `@reci/utils` listed as an admin dependency but never imported | Data (dead config) | **2** | S |

---

## 1. EXACT DUPLICATES

### 1.1 Supabase browser client — 100% identical logic

- `apps/web/lib/supabase/client.ts:1-8` (`createClient`)
- `apps/admin/lib/supabase/browser.ts:1-9` (`createBrowserSupabaseClient`)

Both call `createBrowserClient(url, anonKey)` with no other logic — only the exported function name differs.

**Duplication:** ~100% identical.
**Remediation:** extract to a new shared package (browser-safe, no `next/headers`):

```ts
// packages/supabase/src/browser.ts
import { createBrowserClient } from '@supabase/ssr'

export function createSupabaseBrowserClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
```
Call sites become `import { createSupabaseBrowserClient } from '@reci/supabase/browser'`.

**Effort:** S · **Importance: 4/10** — low risk (trivial, stable code) but zero reason for two copies to exist.

---

### 1.2 `checkDbRateLimit` — verbatim duplicate

- `apps/web/lib/rate-limit.ts:3-31`
- `apps/admin/lib/rate-limit.ts:7-30`

Both implementations call the same `increment_rate_limit` RPC with identical parameters, identical fail-open `catch` behavior, and identical signature `(ip, endpoint, maxPerWindow, windowMs)`. The only differences are the import path for `createAdminClient` (`./supabase/admin-server` vs `./supabase/admin`) and comment wording. The admin file's own comment says *"Mirrors apps/web/lib/rate-limit.ts"* — the duplication is already known and was accepted in `audits/error-handling-audit-2026-09-29.md` finding #10 as **not a bug** (fail-open is intentional). This audit still flags it because the *code*, not just the behavior, is duplicated and will drift if one copy is edited without the other.

**Duplication:** ~95% identical (2-line import difference only).
**Remediation:**
```ts
// packages/supabase/src/rate-limit.ts (server-only; both apps run Next.js server runtime)
import { createAdminClient } from './admin'

export async function checkDbRateLimit(ip: string, endpoint: string, maxPerWindow: number, windowMs: number): Promise<boolean> {
  try {
    const supabase = createAdminClient()
    const { data, error } = await supabase.rpc('increment_rate_limit', { p_ip: ip, p_endpoint: endpoint, p_window_ms: windowMs, p_max: maxPerWindow })
    if (error) throw error
    return data === true
  } catch {
    return true // fail open by design — see audits/error-handling-audit-2026-09-29.md #10
  }
}
```
Both `apps/web/lib/rate-limit.ts` and `apps/admin/lib/rate-limit.ts` become 1-line re-exports (same pattern already used for the white-label `api/v1/*` routes, e.g. `apps/web/app/api/v1/ai/chat/route.ts:1-3`).

**Effort:** S · **Importance: 4/10** — behavior is correct and intentional per the prior audit; this is pure code-hygiene, not a bug.

---

### 1.3 Root scripts repeat Supabase admin-client bootstrap

- `create_admin.mjs:1-14`
- `seed.mjs:1-11`
- `seed_demo.mjs:5-15`
- `update_images.mjs:6-16`

All four scripts contain the same ~10-line block: import `createClient`, read `NEXT_PUBLIC_SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` from env, `console.error` + `process.exit(1)` if missing, construct the client.

**Duplication:** ~90% identical (message text and `auth` options vary slightly — `create_admin.mjs` passes `{ auth: { autoRefreshToken: false, persistSession: false } }`, the other three call `createClient(url, key)` with no options).

**Remediation:**
```js
// scripts/_supabase-admin.mjs
import { createClient } from '@supabase/supabase-js'

export function getAdminClient(scriptName) {
  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
  const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    console.error(`Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY. Run with: node --env-file=apps/web/.env.local ${scriptName}`)
    process.exit(1)
  }
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })
}
```
```js
// seed.mjs
import { getAdminClient } from './scripts/_supabase-admin.mjs'
const supabase = getAdminClient('seed.mjs')
```

**Effort:** S · **Importance: 3/10** — dev-only tooling, not shipped, low blast radius.

---

## 2. NEAR DUPLICATES

### 2.1 Supabase server client (SSR) — near-identical, one app missing a capability

- `apps/web/lib/supabase/server.ts:1-28` (`createClient`)
- `apps/admin/lib/supabase/server.ts:1-26` (`createServerSupabaseClient`)

The cookie-adapter block (`getAll`/`setAll`, try/catch for the Server-Component write restriction) is line-for-line the same logic with only comment wording differing (`"Server Component — can't set cookies, middleware handles session refresh"` vs `"setAll called from Server Component — safe to ignore"`).

The web version additionally exports `getUserFromRequest()` (`apps/web/lib/supabase/server.ts:35-57`) for Bearer-token auth (used by the mobile app's API calls). The admin app has no equivalent — not currently a bug (admin has no mobile client) but if a future admin API needs token-based auth, it would likely be re-implemented a third time rather than reused.

**Duplication:** ~90% for the cookie-adapter portion.
**Remediation:**
```ts
// packages/supabase/src/server.ts
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createSupabaseServerClient() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet) => {
          try {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
          } catch { /* Server Component — middleware handles session refresh */ }
        },
      },
    }
  )
}
```
`getUserFromRequest` stays in `apps/web` (or moves to the shared package if admin ever needs it) — don't force it into the shared module speculatively.

**Effort:** M (touches every route that imports the server client — dozens of call sites) · **Importance: 7/10** — this is core auth infrastructure; a fix applied to one app's copy (e.g. a cookie-security hardening change) silently does not apply to the other.

---

### 2.2 Supabase service-role ("admin") client — same logic, different strictness

- `apps/web/lib/supabase/admin-server.ts:7-16` (`createAdminClient`) — **throws** if env vars are missing.
- `apps/admin/lib/supabase/admin.ts:7-18` (`createAdminClient`) — uses non-null assertions (`!`), does **not** guard against missing env vars.

**Duplication:** ~85% (same call shape, web's version is strictly better — explicit guard clauses vs. silent `undefined` passed to the SDK).

**Remediation:** same shared package as 2.1:
```ts
// packages/supabase/src/admin.ts
import { createClient } from '@supabase/supabase-js'

export function createSupabaseAdminClient() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) throw new Error('NEXT_PUBLIC_SUPABASE_URL is not set')
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set')
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
```
This also **fixes a latent bug** in the admin copy (silent `undefined` URL/key instead of a clear startup error) as a side effect of deduplication.

**Effort:** M · **Importance: 7/10** — same reasoning as 2.1, plus it quietly fixes an error-handling gap.

---

### 2.3 `DemandCard` — two divergent implementations of the same widget

- `apps/admin/components/DemandCard.tsx:1-70` (approx.) — **presentational**: takes `rows: DemandRow[]` as a prop, no fetching, `computed_at: string | null`, keys off `row.category_name`, colors use `dark:` variants, uses a `track` background for the progress bar.
- `apps/web/components/admin/DemandCard.tsx:1-90` (approx.) — **container**: fetches `/api/admin/demand-overview` itself with `useEffect`, has its own loading spinner state, `computed_at: string` (non-null), keys off `row.category_id`, resolves category name via a local `getCategoryName()` helper because its row shape carries a raw `vehicle_categories` join instead of a flat `category_name`, uses the shared `.card` CSS class instead of inline Tailwind colors.

These are not copy-paste duplicates — they diverged in both **data-fetching strategy** (prop-driven vs self-fetching) and **row shape** (`category_name: string` vs `vehicle_categories: {name} | {name}[] | null`), which means the two apps' `/api/admin/demand-overview`-equivalent data sources are shaped differently by the time they reach this component. That shape mismatch is worth confirming isn't hiding an actual API inconsistency.

**Duplication:** ~40% structurally similar (same purpose, same visual language, different implementation).
**Remediation:** Not a drop-in merge (the fetch-vs-prop split is a real architectural difference — pick one). Minimal-risk option: keep both fetching internally (matches how it's already used in `apps/web`) and move only the presentational shell into `packages/ui`:
```ts
// packages/ui/src/DemandGauge.tsx
export function DemandGauge({ label, remaining, signal, pct }: { label: string; remaining?: number; signal: 'normal'|'high'|'peak'; pct: number }) { /* the <div> bar markup only */ }
```
Both `DemandCard` components then map their own `rows` into `<DemandGauge>` calls, keeping their existing data-fetching/shape logic untouched.

**Effort:** S · **Importance: 4/10** — cosmetic drift risk (a color/label tweak made in one app's card silently doesn't apply to the other), not a functional bug today.

---

### 2.4 `PasswordInput` — near-identical, differ only in styling approach

- `apps/admin/components/ui/PasswordInput.tsx` — inline Tailwind utility string (`className={\`w-full border ... ${className}\`}`).
- `apps/web/components/ui/PasswordInput.tsx` — uses a shared `.input` CSS class (`className={\`input w-full pr-10 ${className}\`}`).

Everything else — the `forwardRef`, the show/hide toggle state, the eye-icon SVGs — is identical logic, only the `type Props`/`type PasswordInputProps` name and the className strategy differ.

**Duplication:** ~90%.
**Remediation:** move to `packages/ui/src/PasswordInput.tsx`, parameterize the className so each app's own design tokens still apply:
```tsx
// packages/ui/src/PasswordInput.tsx
export const PasswordInput = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement> & { className?: string }>(
  ({ className = '', ...props }, ref) => { /* existing eye-toggle logic, unchanged */ }
)
```
Each app passes its own className: admin passes the long Tailwind string, web passes `"input"`.

**Effort:** S · **Importance: 3/10** — small, stable, low-risk component; worth doing opportunistically rather than urgently.

---

### 2.5 Mobile app reimplements pricing instead of using `@reci/utils`

- `apps/mobile/app/book/[vehicleId].tsx:73-74`:
  ```ts
  const days = pickupDate && dropoffDate ? daysBetween(pickupDate, dropoffDate) : 1
  const total = vehicle.daily_rate != null ? vehicle.daily_rate * days : null
  ```
- vs. the shared source of truth: `packages/utils/src/pricing.ts:20-65` (`calculatePrice`), whose own doc comment says *"Single source of truth for all pricing. Used by API routes AND UI — prevents display/charge drift."*

The mobile screen's inline calc ignores extras, corporate discount, and demand surcharge — all of which `calculatePrice` accounts for. This isn't just DRY; it's the exact class of bug `calculatePrice`'s comment says it exists to prevent (a customer-visible estimate that can disagree with what they're actually charged at `/book/extras` → `/book/payment`).

**Duplication:** ~20% of the real logic (only the day-count × base-rate term), but it is a **near-duplicate with silent logic drift**, which is worse than an exact duplicate.

**Remediation:**
```ts
// apps/mobile/app/book/[vehicleId].tsx
import { calculatePrice } from '@reci/utils'

const pricing = vehicle.daily_rate != null && pickupDate && dropoffDate
  ? calculatePrice({ base_rate_per_day: vehicle.daily_rate, pickup_datetime: pickupDate, dropoff_datetime: dropoffDate, extras: [] })
  : null
const total = pricing?.total ?? null
```
`@reci/utils` is a plain TS package with no DOM/Node dependency in `pricing.ts`, so it should resolve fine under Expo/React Native — confirm the mobile Metro config resolves workspace packages (**Unable to verify**: did not inspect `apps/mobile/metro.config.js` / mobile `package.json` for a `@reci/utils` dependency entry; if absent, that's the actual blocker to fix first).

**Effort:** S (once the workspace-resolution question above is confirmed) · **Importance: 6/10** — customer-facing price-quote accuracy.

---

## 3. STRUCTURAL DUPLICATES

### 3.1 JSON body-parse boilerplate repeated in 24 route files

Identical shape, repeated verbatim with only the schema variable name changing:
```ts
let body: unknown
try { body = await request.json() } catch {
  return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
}
const parsed = SomeSchema.safeParse(body)
if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })
```
Confirmed present (via the literal string `'Invalid JSON'`) in 24 files, 18 of which use the exact `let body: unknown` spelling, including:
- `apps/admin/app/api/admin/vehicles/route.ts:49-57`
- `apps/admin/app/api/admin/pricing-rules/route.ts:34-39`
- `apps/admin/app/api/admin/pricing-overrides/route.ts`
- `apps/admin/app/api/admin/users/route.ts`, `apps/admin/app/api/admin/users/[id]/route.ts`
- `apps/admin/app/api/admin/reviews/damage/[id]/route.ts`, `.../licences/[id]/route.ts`
- `apps/admin/app/api/admin/availability-blocks/route.ts`, `apps/admin/app/api/admin/maintenance/route.ts`, `apps/admin/app/api/admin/bookings/[id]/route.ts`, `apps/admin/app/api/admin/vehicles/[id]/route.ts`, `apps/admin/app/api/admin/pricing-rules/[id]/route.ts`
- `apps/web/app/api/bookings/route.ts`, `apps/web/app/api/corporate/route.ts`, `apps/web/app/api/payments/intent/route.ts`, `apps/web/app/api/ai/{chat,damage,licence,search,trip}/route.ts`, `apps/web/app/api/account/profile/route.ts`, `apps/web/app/api/admin/api-keys/route.ts`, `apps/web/app/api/inspections/upload/route.ts`, `apps/web/app/api/inspections/[bookingId]/route.ts`

**Duplication:** ~95% structurally identical (5 lines, only the schema name varies).
**Remediation:** a single generic helper, safe to add to either app's own `lib/` or a shared package (no server-only imports needed):
```ts
// packages/utils/src/api.ts (or apps/*/lib/parse-body.ts if kept per-app)
import { NextRequest, NextResponse } from 'next/server'
import type { ZodSchema } from 'zod'

export async function parseJsonBody<T>(request: NextRequest, schema: ZodSchema<T>):
  Promise<{ ok: true; data: T } | { ok: false; response: NextResponse }> {
  let body: unknown
  try { body = await request.json() } catch {
    return { ok: false, response: NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }
  }
  const parsed = schema.safeParse(body)
  if (!parsed.success) return { ok: false, response: NextResponse.json({ error: parsed.error.flatten() }, { status: 422 }) }
  return { ok: true, data: parsed.data }
}
```
Call site:
```ts
const result = await parseJsonBody(request, CreateVehicleSchema)
if (!result.ok) return result.response
const supabase = createAdminClient()
// use result.data instead of parsed.data
```

**Effort:** M — mechanical but touches 24 files; do incrementally, new/touched routes first (same rollout approach already used for `apps/web/lib/api-handler.ts`, see `audits/error-handling-audit-2026-09-29.md` #6).
**Importance: 6/10** — every one of these 24 spots is a place a future edit (e.g. changing the 422 error shape) has to be applied by hand 24 times.

---

### 3.2 `assertAdminSession()` / `assertAdminOnly()` early-return repeated in 21 files

```ts
const session = await assertAdminSession()
if (!session.authorized) return session.response
```
This exact two-line pattern (or the `assertAdminOnly()` variant) opens 21 files under `apps/admin/app/api/admin/**`. The underlying check itself is already centralized in `apps/admin/lib/auth.ts:21-53` (good — this is not the risk finding 4.1 below is about), but the *call-site wiring* is repeated by hand in every `GET`/`POST`/`PATCH` export.

**Duplication:** ~100% for the 2-line snippet, ×21 files ×(1-3 handlers per file) ≈ 30+ occurrences.
**Remediation:** a thin HOF wrapper, analogous to `apps/web/lib/api-handler.ts:16-28`'s `withErrorHandling`:
```ts
// apps/admin/lib/with-admin-auth.ts
import { NextRequest, NextResponse } from 'next/server'
import { assertAdminSession, assertAdminOnly, type AuthorizedSession } from './auth'

type Handler<Ctx> = (req: NextRequest, ctx: Ctx, session: AuthorizedSession) => Promise<NextResponse>

export function withAdminAuth<Ctx = unknown>(handler: Handler<Ctx>, opts: { adminOnly?: boolean } = {}): (req: NextRequest, ctx: Ctx) => Promise<NextResponse> {
  return async (req, ctx) => {
    const session = await (opts.adminOnly ? assertAdminOnly() : assertAdminSession())
    if (!session.authorized) return session.response
    return handler(req, ctx, session)
  }
}
```
```ts
// apps/admin/app/api/admin/vehicles/route.ts
export const GET = withAdminAuth(async (request) => { /* body unchanged, drop the session check lines */ })
```
**Effort:** M (mechanical, 21 files, but each edit is 2 lines removed + signature wrapped) · **Importance: 5/10** — the check itself is safe today because `assertAdminSession` is already the single source of truth; this finding is about call-site consistency, not a live vulnerability.

---

### 3.3 Admin app has no error-handling wrapper equivalent to web's `withErrorHandling`

`apps/web/lib/api-handler.ts` exists specifically so unhandled exceptions get one consistent shape (see its own comment, `apps/web/lib/api-handler.ts:3-7`, referencing `audits/error-handling-audit-2026-09-29.md` #6). `apps/admin` has no equivalent file at all — every admin route handles its own try/catch (or doesn't). This is a **structural gap**, not literal duplication, but it means the fix already designed and accepted for `apps/web` was never ported to `apps/admin`, so the admin app doesn't benefit from the same consistency web now has (and will need its own copy — or the shared package below — if the team wants parity).

**Unable to verify:** whether this gap was a deliberate scope decision in the prior audit or an oversight — the error-handling audit's finding #6 only discusses `apps/web`. Confirm by checking whether a follow-up admin-specific version was planned.

**Effort:** M · **Importance: 5/10** — consistency/observability gap, not a functional bug.

---

## 4. DATA DUPLICATION

### 4.1 `['admin', 'staff']` role-check literal — 9+ independent copies

Every one of these re-types the same two-element array or equivalent role check by hand:

| File | Line | Form |
|---|---|---|
| `apps/admin/lib/auth.ts` | 36 | `!['admin', 'staff'].includes(profile.role)` |
| `apps/admin/middleware.ts` | 114 | `!['admin', 'staff'].includes(profile.role)` |
| `apps/admin/app/api/auth/forgot-password/route.ts` | 46 | `['admin', 'staff'].includes(profile.role)` |
| `apps/admin/app/auth/login/page.tsx` | 64 | `!['admin', 'staff'].includes(profile.role)` |
| `apps/admin/app/api/admin/users/route.ts` | 25 | `.in('role', ['admin', 'staff'])` (server-side DB filter, same list) |
| `apps/admin/app/api/admin/users/[id]/route.ts` | 43, 84 | `!['admin', 'staff'].includes(existing.role)` (×2) |
| `apps/web/app/api/admin/demand-overview/route.ts` | 18 | `!['admin', 'staff'].includes(profile.role)` |
| `apps/web/app/api/admin/api-keys/route.ts` | 10 | `data?.role !== 'admin' && data?.role !== 'staff'` |
| `apps/web/app/api/admin/api-keys/[id]/route.ts` | 10 | same |
| `apps/web/app/api/inspections/[bookingId]/route.ts` | 30, 71 | same idea, two different spellings (×2) |

**Duplication:** ~100% (same two literal strings), 12 occurrences across both apps.
**Why importance 8 (highest in this report):** `packages/types/src/index.ts:21` already exports `export type UserRole = 'customer' | 'staff' | 'admin' | 'corporate_manager'` — but it's a **type**, not a runtime value, so it cannot be used in an `.includes()` check or a Supabase `.in()` filter. Every call site therefore re-derives its own runtime array. If a future role (e.g. `'support'`) is added to the type and only some of these 12 call sites are updated, the result is a **silent authorization inconsistency** — exactly the class of bug this repo's own two prior security audits were written to catch.

**Remediation:**
```ts
// packages/types/src/index.ts — add alongside the existing UserRole type
export const ADMIN_PORTAL_ROLES = ['admin', 'staff'] as const
export type AdminPortalRole = typeof ADMIN_PORTAL_ROLES[number]
```
```ts
// apps/admin/lib/auth.ts
import { ADMIN_PORTAL_ROLES, type AdminPortalRole } from '@reci/types'
// ...
if (!profile || !ADMIN_PORTAL_ROLES.includes(profile.role)) { ... }
```
```ts
// apps/admin/app/api/admin/users/route.ts
.in('role', ADMIN_PORTAL_ROLES)
```

**Effort:** S (one new export + ~12 mechanical call-site swaps) · **Importance: 8/10**.

---

### 4.2 `fuel_type` / `transmission` enum literals duplicated 8 times

```ts
z.enum(['petrol', 'diesel', 'electric', 'hybrid'])
z.enum(['manual', 'automatic'])
```
appear independently at:
- `apps/web/lib/schemas.ts:21-22, 42-43, 140, 173`
- `apps/admin/app/fleet/[id]/page.tsx:16-17`
- `apps/admin/app/fleet/new/page.tsx:16-17`
- `apps/admin/app/api/admin/vehicles/route.ts:16-17`
- `apps/admin/app/api/admin/vehicles/[id]/route.ts:16-17`

Same root cause as 4.1: `packages/types/src/index.ts:23` already has `export type FuelType = 'petrol' | 'diesel' | 'electric' | 'hybrid'`, but no runtime array, so every Zod schema re-lists the literals by hand instead of doing `z.enum(FUEL_TYPES)`.

**Duplication:** ~100% (identical 4-element / 2-element literal arrays), 8 occurrences.
**Remediation:**
```ts
// packages/types/src/index.ts
export const FUEL_TYPES = ['petrol', 'diesel', 'electric', 'hybrid'] as const
export type FuelType = typeof FUEL_TYPES[number]

export const TRANSMISSIONS = ['manual', 'automatic'] as const
export type Transmission = typeof TRANSMISSIONS[number]
```
```ts
// apps/web/lib/schemas.ts
import { FUEL_TYPES, TRANSMISSIONS } from '@reci/types'
fuel_type: z.enum(FUEL_TYPES),
transmission: z.enum(TRANSMISSIONS),
```
**Effort:** S · **Importance: 6/10** — adding/removing a fuel type today requires editing 8 files by hand; miss one and search filters silently reject or admin forms silently fail validation for the new value.

---

### 4.3 Manual currency formatting, `€{x.toFixed(2)}`, 20 occurrences / 9 files

Confirmed via grep (`€{` combined with `.toFixed(2)`) in:
`apps/web/app/account/bookings/page.tsx`, `apps/web/app/account/corporate/page.tsx`, `apps/web/app/book/confirmation/page.tsx`, `apps/web/app/book/payment/page.tsx`, `apps/web/app/book/[vehicleId]/page.tsx`, `apps/web/components/booking/OrderSummary.tsx` (7 occurrences alone, lines 80, 92, 100, 107, 115, 147, 158, 161), `apps/admin/app/bookings/page.tsx:165`, `apps/admin/app/bookings/[id]/page.tsx`, `apps/admin/app/pricing/page.tsx:164, 216`.

No use of `Intl.NumberFormat` anywhere in the codebase — every currency value is hand-formatted with template-literal `€{...toFixed(2)}`, which breaks for values ≥ 1000 (no thousands separator, e.g. `€1234.50` instead of `€1,234.50` / `€1.234,50` for `de-DE` locale — relevant since this is a German-market product).

**Duplication:** structural + data (same 2-argument formatting recipe repeated by hand 20 times).
**Remediation:**
```ts
// packages/utils/src/currency.ts
const EUR_FORMATTER = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' })
export function formatEUR(amount: number): string {
  return EUR_FORMATTER.format(amount)
}
```
```ts
// packages/utils/src/index.ts
export { calculatePrice, calcDays } from './pricing'
export { formatEUR } from './currency'
```
Call sites: `€{pricing.discount_amount.toFixed(2)}` → `{formatEUR(pricing.discount_amount)}` (note: drop the hardcoded `€` prefix — the formatter includes it).

**Effort:** S · **Importance: 6/10** — correctness (locale-correct number formatting) plus the largest single occurrence-count in this report.

---

### 4.4 `@reci/utils` declared as an admin dependency but never imported

- `apps/admin/package.json:21` lists `"@reci/utils": "workspace:*"`.
- Confirmed via grep: **zero** files under `apps/admin` import from `@reci/utils`.

**Unable to verify with certainty** that this is dead weight rather than a forward-looking addition (e.g. staged ahead of adding `formatEUR`/`calculatePrice` usage to admin, which finding 4.3 and this report's remediation would actually put to use) — but as of this audit, it is unused.

**Remediation:** either remove the line, or — better — treat it as already-done prep work and wire up `formatEUR`/`calculatePrice` per 4.3 above rather than deleting it.

**Effort:** S · **Importance: 2/10**.

---

## 5. Proposed Utilities Module Plan

Two separate shared modules are proposed, not one, because they have different runtime constraints:

**A. `packages/types/src/index.ts` (existing file — add runtime consts, no new package needed)**
```ts
export const ADMIN_PORTAL_ROLES = ['admin', 'staff'] as const
export type AdminPortalRole = typeof ADMIN_PORTAL_ROLES[number]

export const FUEL_TYPES = ['petrol', 'diesel', 'electric', 'hybrid'] as const
// (replaces the existing `export type FuelType = ...` literal union with `typeof FUEL_TYPES[number]`)

export const TRANSMISSIONS = ['manual', 'automatic'] as const
export type Transmission = typeof TRANSMISSIONS[number]
```

**B. `packages/utils/src/` (existing package — add two new files, browser+server safe, no `next/headers`)**
```ts
// packages/utils/src/currency.ts
export function formatEUR(amount: number): string { /* Intl.NumberFormat('de-DE', ...) — see 4.3 */ }

// packages/utils/src/api.ts
export async function parseJsonBody<T>(request: Request, schema: import('zod').ZodSchema<T>) { /* see 3.1 */ }
```
```ts
// packages/utils/src/index.ts
export { calculatePrice, calcDays } from './pricing'
export { formatEUR } from './currency'
export { parseJsonBody } from './api'
```

**C. New package `packages/supabase/src/` (server-only primitives — do NOT put in `packages/utils`, which mobile also consumes and should stay dependency-light)**
```
packages/supabase/
  src/
    browser.ts   → createSupabaseBrowserClient()      (2.1)
    server.ts    → createSupabaseServerClient()        (2.1)
    admin.ts     → createSupabaseAdminClient()          (2.2)
    rate-limit.ts→ checkDbRateLimit(...)                 (1.2, depends on admin.ts)
  package.json   → name "@reci/supabase", deps: @supabase/supabase-js, @supabase/ssr
```
This is the highest-leverage single change in this report (covers findings 1.1, 1.2, 2.1, 2.2 at once) but also the largest effort, since every route/component that currently does `import { createClient } from '@/lib/supabase/...'` needs its import path updated. Recommend doing it last, opportunistically, file-by-file, rather than as one large mechanical PR — same incremental philosophy already used for `apps/web/lib/api-handler.ts`.

**D. `apps/admin/lib/with-admin-auth.ts` (admin-only, not shared — the wrapped `assertAdminSession`/`assertAdminOnly` types are admin-specific)** — see 3.2.

Suggested rollout order by ROI (importance ÷ effort): **4.1 → 4.2 → 4.3 → 2.2/2.1 (package C) → 3.1 → 3.2 → the rest.**

---

## Unable to Verify

- **2.5 (mobile pricing):** whether `apps/mobile`'s Metro/workspace config can already resolve `@reci/utils` — would need `apps/mobile/package.json` and `apps/mobile/metro.config.js` inspected for workspace package resolution before assuming the drop-in import works unmodified.
- **3.3:** whether the absence of an admin-side `withErrorHandling` equivalent was a deliberate scope boundary in `audits/error-handling-audit-2026-09-29.md` or an oversight — that audit's finding #6 discusses only `apps/web`.
- **4.4:** whether `@reci/utils` in `apps/admin/package.json` is dead weight or intentional prep — would need commit history / PR context for that line to confirm intent.

---

## Positive Practices Already in Place (worth preserving, not duplicating away)

- `packages/utils/src/pricing.ts` is already correctly positioned as "single source of truth" for pricing and is used by both the web booking flow and (per its doc comment) intended for UI — the gap is only that `apps/mobile` doesn't use it yet (2.5).
- The `api/v1/ai/*` routes are **not** duplication — they are intentional 3-line re-export shims for a white-label API surface (`apps/web/app/api/v1/ai/{chat,search,trip,damage,licence}/route.ts`), correctly delegating to the internal routes rather than copying logic.
- `apps/web/lib/api-handler.ts`'s `withErrorHandling` is exactly the right pattern this report recommends extending to admin (3.3) and to body-parsing (3.1) — the precedent already exists in this codebase, it just hasn't been generalized yet.
