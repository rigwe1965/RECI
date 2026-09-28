# RECI Transport — Security Audit

**Date:** 2026-09-28 (remediation pass same day)
**Scope:** `reci-transport` monorepo (`apps/web`, `apps/admin`, `apps/mobile`, `packages/*`, `supabase/migrations`)
**Method:** Manual static review — auth flow tracing, RLS policy review, API route audit, secret scanning, dependency version check. No dynamic/pen-test exploitation was performed; exploit chains below are traced from code, not confirmed against a live target.

## Remediation status (2026-09-28, same day)

Everything below was actioned the same day this audit was written. Status legend: ✅ fixed in code and verified (type-check + tests + live dev-server smoke test) · ⚠️ fixed in code but requires a manual step from you to take effect live · 🆕 discovered during remediation, not in the original findings below.

| # | Finding | Status |
|---|---|---|
| 1 | Hardcoded service-role key in 8 files | ✅ removed from all 9 files found (one more turned up: `apps/web/seed_demo.mjs`) — now read from env. **⚠️ You must still rotate the key in the Supabase dashboard** — code fixes don't invalidate the already-leaked value. |
| 2 | `bookings` RLS insert gap | ✅ `/api/bookings` switched to the admin client for all reads/writes (`/api/ai/damage` already used it — confirmed, not changed). Also fixes a related bug: the old session-scoped client silently under-counted availability conflicts because of `own_bookings` RLS — a functional double-booking risk, not just a security one. **⚠️ New migration `010_rls_hardening.sql` must be run via the Supabase SQL Editor** — the permissive `WITH CHECK (true)` policies are still live until you do. |
| 3 | Demo admin credentials in docs | ✅ removed from `CLAUDE.md` and `docs/RECI_TRANSPORT_DOCS.md`. **⚠️ `docs/RECI_TRANSPORT_DOCS.pdf` still contains it** (binary export, not regenerated) — and **you must confirm/rotate the actual Supabase Auth account** if it still exists. |
| 4 | Next.js 14.2.21 → CVE-2025-29927 | ✅ upgraded to 14.2.25 in both apps. **🆕 Superseded by a much bigger finding — see "New critical finding" below.** |
| 5 | In-memory rate limiting on 6 routes | ✅ all 6 (`bookings`, `payments/intent`, `ai/chat`, `ai/search`, `ai/trip`, `corporate`) switched to `checkDbRateLimit`. **⚠️ Ineffective until migration 011 is applied — see below.** |
| 6 | GDPR erasure leaves driver PII | ✅ fixed — `driver_first_name/last_name/email/phone/licence_number` now masked on account deletion. |
| 7 | CSP `unsafe-inline`/`unsafe-eval` | ✅ replaced with a per-request nonce (`'nonce-...' 'strict-dynamic'`) in both apps' `middleware.ts`; verified live that Next.js applies the nonce to its own hydration scripts and all smoke-tested pages still return 200. `style-src` still allows `'unsafe-inline'` (lower-risk, left as-is — see note in finding). |
| 8 | Upload MIME trust | ✅ magic-byte check added for JPEG/PNG/WebP before storing. |
| 9 | `checkDbRateLimit` TOCTOU race | ✅ replaced with an atomic RPC (`increment_rate_limit`, migration `011_atomic_rate_limit.sql`). **⚠️ Until this migration is applied, `checkDbRateLimit` fails open (RPC doesn't exist yet) — confirmed against the live DB. This means rate limiting is currently non-functional on ALL 9 routes that use it, not just the 6 fixed here, until you run the migration.** |
| 10 | Cron-secret timing attack | ✅ fixed with `crypto.timingSafeEqual`. |
| 11 | Admin CSP missing `Permissions-Policy` | ✅ added. |
| 12 | No live vulnerability-DB check | ✅ ran `pnpm audit --prod` — see "New critical finding" below; this is what surfaced it. |

### 🆕 New critical finding: Next.js is critically outdated — 2 unauthenticated RCEs, dozens of other CVEs

`pnpm audit --prod` (not run during the original review) found **132 advisories**, the overwhelming majority tracing to a single root cause: `next@14.2.25` — the version this audit's Finding 4 upgraded *to* — is itself far behind current and carries:

- **`GHSA-p293-qw3h-jr36`** — critical — unauthenticated RCE on Windows-hosted servers (>=13.4.0 <15.5.24)
- **`GHSA-2xp9-vwfh-vxw4`** — critical — unauthenticated RCE in the Image Optimization API when AVIF files are processed (>=10.0.0 <15.5.24) — this one has no OS qualifier and is plausibly reachable on the production Vercel deployment given `next/image` is used with external `remotePatterns` (Unsplash, Supabase Storage)
- ~30 more `next` advisories ranging low→high: several Server-Components DoS variants, SSRF via Server Actions/rewrites/WebSocket upgrades, cache poisoning, a Pages Router i18n middleware bypass, and a CSP-nonce-specific XSS advisory that directly concerns the nonce work done in Finding 7

**No patched 14.x release exists for the two critical RCEs** — the fix requires upgrading to **Next.js 15.5.24 or later**, a major-version migration (Next 15 assumes React 19 in most setups; App Router, Sentry SDK, Stripe Elements, and FullCalendar compatibility all need re-verification). This is a materially larger, harder-to-reverse change than anything else in this remediation pass, so **it was not performed automatically** — it needs a dedicated migration effort with real browser testing, which this session flagged to the user rather than attempting blind.

**Importance: 10/10** (two unauthenticated RCEs) — highest-priority follow-up, above even the items still marked ⚠️ in the table above.

## Severity summary

| # | Finding | Category | Severity |
|---|---|---|---|
| 1 | Live Supabase `service_role` key hardcoded in 8 committed files | Secrets & Sensitive Data | **10/10** |
| 2 | `bookings` RLS INSERT policy allows client-controlled price/status/user_id, exploitable end-to-end via `/api/payments/intent` | Auth & Access Control / Injection | **9/10** |
| 3 | Documented demo admin credentials for what appears to be the live production admin portal | Auth & Access Control / Config | **9/10** |
| 4 | Next.js 14.2.21 pinned — vulnerable to CVE-2025-29927 middleware auth-bypass | Dependencies & Supply Chain | **8/10** |
| 5 | Rate limiting on 6 sensitive routes uses a per-instance in-memory `Map`, ineffective on serverless | Configuration & Hardening | **7/10** |
| 6 | GDPR erasure endpoint leaves driver PII intact on retained booking rows | Data Flow & Privacy | **5/10** |
| 7 | CSP allows `'unsafe-inline' 'unsafe-eval'` in `script-src` on both apps | Configuration & Hardening | **5/10** |
| 8 | Image upload accepts client-declared MIME type with no magic-byte verification | Input Validation & Injection | **4/10** |
| 9 | `checkDbRateLimit` has a TOCTOU race and fails open on DB errors | Configuration & Hardening | **4/10** |
| 10 | Cron-secret comparison is not constant-time | Cryptography & Transport | **2/10** |
| 11 | Admin app CSP missing `Permissions-Policy` present on web app | Configuration & Hardening | **2/10** |
| 12 | No live vulnerability-DB check run against pinned dependency versions | Dependencies & Supply Chain | **3/10** |

---

## Critical

### 1. Live Supabase `service_role` key hardcoded and committed to git
**Location:** `create_admin.mjs:5`, `apps/web/create_admin.mjs:5`, `seed.mjs:5`, `seed_demo.mjs:9`, `update_images.mjs:10`, `apps/web/patch_old_images.mjs:5`, `apps/web/seed.mjs:5`, `apps/web/update_images.mjs:10`, `scripts/create-admin.mjs:4`
**Importance: 10/10**

**Description:** All eight files hardcode the same Supabase `service_role` JWT in plaintext:
```
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6...role":"service_role"...[REDACTED — see files above]
```
This is not a stale/test key — it is byte-for-byte identical to the `SUPABASE_SERVICE_ROLE_KEY` currently configured in both `apps/web/.env.local` and `apps/admin/.env.local` (verified via direct string match), i.e. it is the live production key. It was introduced in `9ba4b8d` ("First commit") and is present in the repo's entire history, which is pushed to `https://github.com/Obinwanne1/RECI-Transport.git`. **Unable to verify** whether that GitHub repository is public or private (no `gh auth` available in this environment) — check this directly, but treat the key as compromised regardless of visibility, since anyone who has ever had read access to the repo (including any CI logs, forks, or cached clones) has it.

**Risk:** The `service_role` key bypasses every RLS policy in the database (see Finding 2 for what RLS is supposed to be doing). Anyone holding it has unrestricted read/write/delete on every table — customer PII, driver's licence numbers, payment records, corporate contracts, the works — with no audit trail beyond what Supabase's own service-role logging provides.

**Remediation:**
1. Rotate the key immediately: Supabase Dashboard → Project Settings → API → "Reset service_role key". This invalidates the leaked key.
2. Update `SUPABASE_SERVICE_ROLE_KEY` in Vercel (both projects) and local `.env.local` files.
3. Remove the hardcoded key from all 8 files — they should read from `process.env.SUPABASE_SERVICE_ROLE_KEY` and refuse to run without it:
   ```js
   const key = process.env.SUPABASE_SERVICE_ROLE_KEY
   if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY not set')
   const supabase = createClient(process.env.SUPABASE_URL, key, { auth: { autoRefreshToken: false, persistSession: false } })
   ```
4. Treat the git history as permanently burned for this secret — rotation makes the old value inert, so history rewriting is optional cleanup, not a substitute for rotation.
5. Audit Supabase logs for the key's usage history for signs of prior misuse, if log retention allows.

---

### 2. `bookings` table can be inserted with attacker-controlled price and status via the public anon key
**Location:** `supabase/migrations/001_initial_schema.sql` (policy `create_booking`, `~line 393`); `apps/web/lib/supabase/server.ts` (`getUserFromRequest`, lines 35-57); `apps/web/app/api/bookings/route.ts` (lines 188-215); `apps/web/app/api/payments/intent/route.ts` (lines 88-101)
**Importance: 9/10**

**Description:** The RLS policy on `bookings` is:
```sql
CREATE POLICY "create_booking" ON bookings FOR INSERT
  WITH CHECK (true); -- anyone can create (guest checkout supported)
```
This was written to support guest checkout, but `WITH CHECK (true)` places **no constraint at all** on the inserted row's contents. `apps/web/app/api/bookings/route.ts` does compute price server-side correctly (`calculatePrice(...)`) — but that protection only matters if a client is forced through that route. It isn't: `getUserFromRequest()` (`apps/web/lib/supabase/server.ts:35`) returns a Supabase client authenticated with the **public anon key** plus the caller's session cookie — the same credentials embedded in `NEXT_PUBLIC_SUPABASE_ANON_KEY` on every page load. That means the RLS policy above is the *entire* enforcement boundary, and it enforces nothing.

**Traced exploit chain (not executed against the live system):**
1. Attacker reads `NEXT_PUBLIC_SUPABASE_ANON_KEY` from any page's bundled JS (it's public by design).
2. Attacker calls Supabase's PostgREST API directly — `POST https://ewrknfmpdifdgxlmqbzi.supabase.co/rest/v1/bookings` with the anon key — bypassing `/api/bookings` entirely, and sets `total_price: 0.01`, `status: 'pending'`, a real `vehicle_id`, and arbitrary driver fields.
3. RLS's `create_booking` policy allows the insert unconditionally.
4. Attacker calls the legitimate `POST /api/payments/intent` with the resulting `booking_id`. That route (`apps/web/app/api/payments/intent/route.ts:88-89`) does:
   ```ts
   const amountCents = Math.round(Number(booking.total_price) * 100)
   ```
   — it trusts `booking.total_price` as read from the database, with no recomputation against the canonical pricing formula.
5. Attacker completes a real Stripe payment for €0.01, the webhook (`apps/web/app/api/webhooks/stripe/route.ts`) marks the booking `confirmed`, and the attacker has a fully confirmed rental at a fraction of the actual price.

The same `WITH CHECK (true)` pattern also exists on `booking_extras` (`insert_booking_extras`) and `vehicle_inspections` (`insert_inspections`) INSERT policies. I did not trace a full exploit chain for those two — **unable to verify** exploitability without checking every route that reads from `vehicle_inspections`/`booking_extras` — but they share the same root cause and should be fixed the same way.

**Risk:** Direct, unauthenticated (or trivially authenticated) financial fraud and identity impersonation (arbitrary `user_id` can also be set on insert, attributing a booking to any other user).

**Remediation — pick one:**
- **Preferred:** Stop inserting `bookings` via the anon/session-scoped client from the API route at all. Have `/api/bookings` insert via the admin/service-role client (server-side only, after all validation) and remove the client-facing INSERT policy entirely (`DROP POLICY create_booking ON bookings;` — leave no INSERT policy, which defaults to deny under RLS). This makes `/api/bookings` the only path capable of creating a row, matching how `payments` is already (correctly) locked down.
- **If direct client inserts must remain supported:** constrain the `WITH CHECK` clause to values a client cannot spoof for its own benefit, e.g.:
  ```sql
  WITH CHECK (
    status = 'pending'
    AND (user_id IS NULL OR user_id = auth.uid())
  )
  ```
  This still doesn't stop price tampering (Postgres RLS can't recompute your pricing formula), so it only closes the impersonation/status angle — the price problem requires moving price computation server-side-only regardless, and `/api/payments/intent` should additionally re-validate `booking.total_price` against a recomputed price before creating the Stripe intent, not just trust the stored value.

---

### 3. Documented demo admin credentials for what the same docs call the live production admin portal
**Location:** `CLAUDE.md:330`; `docs/RECI_TRANSPORT_DOCS.md:403`
**Importance: 9/10**

**Description:** Both files publish:
```
Demo admin login: demo@reci-transport.com / RecIDemo2026!
```
`CLAUDE.md:330` lists this directly inside a table titled "Live Production URLs" alongside the actual production Vercel URLs for the customer and admin portals and the actual Supabase project URL — strongly implying this accessible account exists with real `admin` role in the production database, not a sandboxed/staging environment.

**Unable to verify** from static review alone whether this account (a) still exists, (b) still has this password, and (c) still carries `role: admin` in both `user_profiles` and the Supabase Auth `app_metadata` claim (both are required per the "Two-Layer Check" documented elsewhere in `CLAUDE.md`). Confirming this requires checking the live Supabase Auth users table and `user_profiles`.

**Risk:** If live, this is a fully documented, publicly-guessable (it's *in the docs*) admin credential with access to bookings, customer PII, licence/damage review queues, pricing, and user management for the whole platform. `CLAUDE.md` and the docs directory are committed to the same repository as Finding 1, compounding the exposure.

**Remediation:**
1. Confirm in Supabase whether `demo@reci-transport.com` currently has `role IN ('admin','staff')`.
2. If it does and is meant for prospective-customer demos, downgrade it to a role with read-only/limited scope, or gate the demo behind a separate, non-production Supabase project.
3. If it's meant for internal use only, remove it from any doc that leaves the internal team's hands, or at minimum stop describing it as usable against the *production* URL.
4. Rotate its password regardless, as a matter of hygiene once these docs have been shared externally.

---

## High

### 4. Next.js 14.2.21 is vulnerable to CVE-2025-29927 (middleware authorization bypass)
**Location:** `apps/web/package.json:25` (`"next": "14.2.21"`), `apps/admin/package.json` (same version)
**Importance: 8/10**

**Description:** CVE-2025-29927 allows a request carrying a crafted `x-middleware-subrequest` header to skip Next.js middleware execution entirely. It affects Next.js versions before 12.3.5, 13.5.9, **14.2.25**, and 15.2.3. Both apps pin `14.2.21`, which is before the patched `14.2.25`.

This matters specifically here because middleware is the *primary* authorization gate in both apps:
- `apps/admin/middleware.ts` performs the role check that redirects non-admin/staff users to login.
- `apps/web/middleware.ts` gates `/account/*` and the white-label `/api/v1/ai/*` API-key check.

Admin API routes have a defense-in-depth check (`assertAdminSession()`, confirmed present on all 21 relevant routes — see below), so data-layer access wouldn't fully open up. But the middleware bypass would still let an unauthenticated caller reach admin *pages* directly and bypass the web app's `/account/*` and API-key gating, which have no independent second check.

**Unable to verify without a live target** whether the specific request pattern still works against this exact build/hosting setup (Vercel's edge runtime has since added its own mitigations independent of the Next.js patch) — but there's no reason not to take the free fix.

**Remediation:**
```bash
pnpm --filter @reci/web add next@14.2.25
pnpm --filter @reci/admin add next@14.2.25
```
(Or later 14.2.x — check `apps/*/package.json` after for exact resolved version, and re-run `pnpm install`.)

---

### 5. Rate limiting on 6 sensitive routes is in-memory and non-functional across serverless instances
**Location:** `apps/web/app/api/bookings/route.ts:9`, `apps/web/app/api/payments/intent/route.ts:8`, `apps/web/app/api/ai/chat/route.ts:10`, `apps/web/app/api/ai/search/route.ts:7`, `apps/web/app/api/ai/trip/route.ts:9`, `apps/web/app/api/corporate/route.ts:8`
**Importance: 7/10**

**Description:** Each of these routes defines its own local rate limiter:
```ts
const ipCounts = new Map<string, { count: number; resetAt: number }>()
```
`CLAUDE.md`'s own "Common Issues and Fixes" table documents this exact pattern as a known-bad anti-pattern ("Rate limiting bypassed on Vercel | In-memory Map resets per serverless instance") and names `checkDbRateLimit()` (`apps/web/lib/rate-limit.ts`) as the fix. That DB-backed limiter is in fact used correctly by three sibling routes (`ai/damage`, `ai/extras-recommend`, `ai/licence`) — but the fix was never applied to the six routes above, including the two most abuse-sensitive ones in the app: booking creation and Stripe payment-intent creation.

On Vercel, each serverless function invocation may run in a fresh execution context with an empty `Map`, and concurrent invocations each hold their own `Map` — so the "5 requests per 60s per IP" limit on `/api/payments/intent`, for example, is enforced only within a single warm instance, not globally. This directly weakens the practical effectiveness of the anti-fraud control described in Finding 2 (an attacker retrying the exploit isn't meaningfully throttled) and allows cost-amplification abuse of the Claude-backed `ai/chat` and `ai/search` endpoints.

**Remediation:** Replace each local `ipCounts` implementation with the existing helper, matching the pattern already used in `ai/damage/route.ts:42`:
```ts
import { checkDbRateLimit } from '@/lib/rate-limit'
// ...
if (!(await checkDbRateLimit(ip, 'bookings', 10, 60_000))) {
  return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 })
}
```

---

## Medium

### 6. GDPR erasure endpoint leaves identifying driver data on retained booking rows
**Location:** `apps/web/app/api/account/delete/route.ts:31-35`
**Importance: 5/10**

**Description:** On account deletion, the route sets `bookings.user_id = NULL` and deletes `user_profiles`, but each booking row also independently stores `driver_first_name`, `driver_last_name`, `driver_email`, `driver_phone`, and `driver_licence_number` as free-text columns captured at booking time (see `apps/web/app/api/bookings/route.ts:196-200`). None of these are cleared or masked by the delete flow. The code comment says "Anonymise PII in historical bookings" but only decouples the foreign key — the directly identifying fields remain fully intact and queryable.

**Risk:** A user who exercises their Art. 17 right to erasure retains their full name, email, phone number, and driving licence number in the database indefinitely, attached to historical bookings. Financial/legal retention obligations typically justify keeping the *transaction* record (amounts, dates, tax data) but not full contact and licence details.

**Remediation:** Null or mask the directly-identifying driver fields on the same rows, keeping only what's needed for accounting/legal retention:
```ts
await admin
  .from('bookings')
  .update({
    user_id: null,
    driver_first_name: 'Deleted',
    driver_last_name: 'User',
    driver_email: null,
    driver_phone: null,
    driver_licence_number: null,
  })
  .eq('user_id', user.id)
```
(Confirm with legal/compliance which fields, if any, must be retained for invoicing before finalizing the exact list.)

---

### 7. CSP permits `'unsafe-inline'` and `'unsafe-eval'` in `script-src` on both apps
**Location:** `apps/web/next.config.mjs:38`, `apps/admin/next.config.mjs:23`
**Importance: 5/10**

**Description:** Both apps' Content-Security-Policy headers include:
```
script-src 'self' 'unsafe-inline' 'unsafe-eval' ...
```
This is a common Next.js default-friction workaround (inline hydration scripts, some dev tooling), but it neutralizes most of what CSP is meant to provide against XSS: with `'unsafe-inline'` present, any injected `<script>` tag or inline event handler executes regardless of the rest of the policy.

**Risk:** Reduces the CSP to little more than the `frame-ancestors`/`img-src`/`connect-src` restrictions; does not mitigate reflected/stored XSS the way a strict CSP would.

**Remediation:** Move to a nonce- or hash-based CSP for production builds. Next.js supports per-request nonces via middleware:
```ts
// middleware.ts
const nonce = Buffer.from(crypto.randomUUID()).toString('base64')
// pass nonce through to next.config's headers() via a response header, or use next-safe-middleware
```
This is a larger change than the other fixes here — treat as a follow-up hardening project rather than a one-line patch, and re-test hydration carefully since Next.js's own inline bootstrap scripts need the nonce wired through.

---

### 8. Uploaded inspection images are trusted by their declared MIME type, not their actual content
**Location:** `apps/web/app/api/inspections/upload/route.ts:40-47`
**Importance: 4/10**

**Description:** The route extracts the MIME type from the client-supplied data URL prefix (`data:(image/[\w+]+);base64,...`) and checks it against an allowlist — which is good practice compared to trusting a raw `Content-Type` header — but never inspects the decoded bytes to confirm they're actually a JPEG/PNG/WebP (no magic-byte / `file-type` check). A client can label arbitrary bytes as `image/png` and they'll be stored and served with that content-type.

**Risk:** Low-to-moderate on its own (the file is later fed to an AI vision adapter and displayed as an `<img>`, not executed), but it means the MIME allowlist is a labeling convention rather than a real content guarantee — a mismatch between declared and actual type could confuse downstream consumers (e.g. the vision adapter) or, in combination with a future change (e.g. serving these files with a browser-sniffing-prone `Content-Type`), open an XSS/content-sniffing vector.

**Remediation:** Verify the decoded buffer's magic bytes match the declared type before upload, e.g. with a lightweight sniffing check:
```ts
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47])
const JPEG_MAGIC = Buffer.from([0xff, 0xd8, 0xff])
// WebP: 'RIFF' .... 'WEBP'
function matchesDeclaredType(buffer: Buffer, mime: string): boolean {
  if (mime === 'image/png') return buffer.subarray(0, 4).equals(PNG_MAGIC)
  if (mime === 'image/jpeg') return buffer.subarray(0, 3).equals(JPEG_MAGIC)
  if (mime === 'image/webp') return buffer.subarray(0, 4).toString() === 'RIFF' && buffer.subarray(8, 12).toString() === 'WEBP'
  return false
}
```

---

### 9. `checkDbRateLimit` has a read-then-write race and fails open on error
**Location:** `apps/web/lib/rate-limit.ts:9-40`
**Importance: 4/10**

**Description:** The function reads the current `count`, then separately issues an `update`/`upsert` — not an atomic increment. Two concurrent requests arriving within the same window can both read `count` below `maxPerWindow`, both pass, and both write, letting the effective limit be exceeded under concurrency. Separately, any Supabase error (including transient network issues) causes the function to `return true` (comment: `// fail open`), which is a reasonable availability tradeoff but is worth being a deliberate, documented decision rather than an incidental one.

**Risk:** Low in isolation (rate limiting is an abuse-mitigation control, not a hard security boundary), but it partially undercuts the fix recommended in Finding 5 — moving the 6 routes to this helper closes the "resets on cold start" hole but not a small race window.

**Remediation:** Use a single atomic upsert with a Postgres increment expression (via an RPC function) instead of read-then-write:
```sql
create or replace function increment_rate_limit(p_ip text, p_endpoint text, p_window_ms int, p_max int)
returns boolean language plpgsql as $$
declare v_count int;
begin
  insert into api_rate_limits (ip, endpoint, count, reset_at)
  values (p_ip, p_endpoint, 1, now() + (p_window_ms || ' ms')::interval)
  on conflict (ip, endpoint) do update
    set count = case when api_rate_limits.reset_at < now() then 1 else api_rate_limits.count + 1 end,
        reset_at = case when api_rate_limits.reset_at < now() then now() + (p_window_ms || ' ms')::interval else api_rate_limits.reset_at end
  returning count into v_count;
  return v_count <= p_max;
end; $$;
```
Call this via `supabase.rpc('increment_rate_limit', ...)` for a single atomic round-trip.

---

## Low / Informational

### 10. Cron-secret comparison is not constant-time
**Location:** `apps/web/app/api/cron/pricing-signals/route.ts:6`
**Importance: 2/10**

**Description:** `secret !== process.env.CRON_SECRET` is a standard JS string comparison, which short-circuits on the first differing byte — theoretically enabling a timing side-channel to recover the secret byte-by-byte. In practice, network jitter to a Vercel function overwhelms any measurable timing difference, making this a defense-in-depth nit rather than a practical risk.

**Remediation:**
```ts
import { timingSafeEqual } from 'crypto'
function safeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a), bufB = Buffer.from(b)
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB)
}
```

### 11. Admin app's CSP is missing the `Permissions-Policy` header present on the web app
**Location:** `apps/admin/next.config.mjs:11-29` (compare to `apps/web/next.config.mjs:29`)
**Importance: 2/10**

**Description:** `apps/web/next.config.mjs` sets `Permissions-Policy: camera=(), microphone=(), geolocation=()`; the equivalent header is absent from `apps/admin/next.config.mjs`. Low impact since the admin app doesn't obviously need camera/mic/geolocation, but the inconsistency suggests the header was added ad hoc to one app rather than as a shared hardening baseline.

**Remediation:** Add the same header to `apps/admin/next.config.mjs`, or better, extract the shared header list into `packages/config` so both apps stay in sync.

### 12. No live vulnerability-database check was run against pinned dependency versions
**Location:** `apps/web/package.json`, `apps/admin/package.json`, root `package.json`
**Importance: 3/10**

**Description:** This review checked dependency versions by reading `package.json` and cross-referencing one well-known CVE (Finding 4) from training knowledge. It did **not** run `pnpm audit` / `npm audit` or query a live advisory database (e.g. GitHub Advisory, Snyk) against the full dependency tree (`@supabase/supabase-js@^2.47.2`, `stripe@^17.5.0`, `resend@^6.12.3`, `@sentry/nextjs@^8.0.0`, etc.). **Unable to verify** whether any of these carry known CVEs beyond what's noted above.

**Remediation:** Run `pnpm audit --prod` (and `pnpm audit` for dev deps) from the repo root and address anything it surfaces; wire this into CI (`.github/workflows/ci.yml`) as a non-blocking report step at minimum.

---

## What was checked and found sound (no action needed)

- **Admin two-layer auth:** all 21 relevant `apps/admin/app/api/admin/**/route.ts` routes call `assertAdminSession()`/`assertAdminOnly()` (`apps/admin/lib/auth.ts`); the one exception (`users/[id]/clear-reset/route.ts`) intentionally uses a different, correct check (`user.id === params.id`, self-service password-reset-flag clear, not an admin-over-others action).
- **Stripe webhook** (`apps/web/app/api/webhooks/stripe/route.ts`): signature verified via raw body + `stripe.webhooks.constructEvent`, correct try/catch, idempotency check before processing.
- **API-key auth for the white-label API** (`apps/admin/middleware.ts` / `apps/web` v1 routes): keys are SHA-256 hashed at rest, raw key shown once at creation, per-key daily limit enforced.
- **RLS is enabled on all 24 tables** across all migrations — no table was found with RLS disabled.
- **Admin search sanitization** (`bookings`, `customers`, `users` admin search routes): the documented allowlist regex is applied consistently before interpolation into PostgREST `.or()` filter strings, which blocks filter-injection via the operator-significant characters (`,`, `(`, `)`, `*`).
- **`.env.local` handling:** correctly listed in `.gitignore`; confirmed via `git log --all` that no `.env.local` file has ever been committed.
- **GDPR delete endpoint gating:** correctly blocks deletion while bookings are pending/confirmed/active, and deletes in the correct dependency order (bookings anonymize → profile delete → auth delete last, since that invalidates the session).
- **`CreateBookingSchema` / booking pricing:** client cannot supply `total_price`/`status` directly through the intended API route — price is computed server-side from DB-fetched rates (the vulnerability in Finding 2 is that this route can be bypassed, not that the route itself is poorly written).
- **No CORS wildcards** (`Access-Control-Allow-Origin`) found anywhere in the codebase.
