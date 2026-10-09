# RECI Transport — Security Audit (Follow-up)

**Date:** 2026-09-29
**Scope:** `reci-transport` monorepo (`apps/web`, `apps/admin`, `apps/mobile`, `packages/*`, `supabase/migrations`) — full re-review, one day after `audits/security-audit-2026-09-28.md`.
**Method:** Manual static review — verified every remediation claimed in the 2026-09-28 audit against current code, then reviewed areas that audit did not cover in depth (loyalty RPCs, white-label API-key auth, mobile app, corporate AI agent, admin user-management, git history). No dynamic/pen-test exploitation was performed; exploit chains below are traced from code, not confirmed against a live target.

---

## Part 1 — Verification of 2026-09-28 findings

All twelve findings from the prior audit were re-checked against the current working tree (`git log` shows the remediation commits `0de4d36` and `1d91f5d` are present, on top of a clean tree except two unrelated cosmetic hydration-warning fixes in `layout.tsx`).

| # | 2026-09-28 Finding | Code-level status today |
|---|---|---|
| 1 | Hardcoded `service_role` key in 9 files | ✅ **Confirmed fixed.** All 9 files (`create_admin.mjs`, `seed.mjs`, `seed_demo.mjs`, `update_images.mjs`, and their `apps/web/` copies, plus `scripts/create-admin.mjs`) now read `process.env.SUPABASE_SERVICE_ROLE_KEY` and exit if unset. **Still open:** the key remains in git history (`9ba4b8d`, verified today via `git log --all`) — see Finding N1 below. **Unable to verify** whether the key was actually rotated in the Supabase dashboard as instructed; this is an operator action outside the repo. |
| 2 | `bookings`/`booking_extras`/`vehicle_inspections` RLS `WITH CHECK (true)` | ✅ **Code fixed and unchanged today** — `/api/bookings` and `/api/payments/intent` still exclusively use `createAdminClient()`, confirmed by re-reading both files line-by-line. **Still open:** this is only safe once `supabase/migrations/010_rls_hardening.sql` (which drops the three permissive policies) has actually been run against the live database. **Unable to verify** live DB state — this is the single highest-impact open item from either audit if not yet applied, since it fully re-opens the €0.01-booking exploit chain documented in the prior report. |
| 3 | Demo admin credentials in docs | ⚠️ **Partially fixed, and worse than previously reported** — see Finding N2 below: a *third*, plaintext HTML location was found today that the 2026-09-28 audit missed. |
| 4 | Next.js 14.2.21 (CVE-2025-29927) | ✅ **Superseded and fixed** — `next` is now `15.5.24` in both apps (commit `1d91f5d`), confirmed in `apps/web/package.json`/`apps/admin/package.json`. |
| 5 | In-memory rate limiting on 6 web routes | ✅ **Confirmed fixed** — `bookings`, `payments/intent`, `ai/chat`, `corporate` all call `checkDbRateLimit(...)`, verified by reading each file. **New, related gap found today** in a location outside the original 6 — see Finding N4. |
| 6 | GDPR erasure leaves driver PII | ✅ **Confirmed fixed** — `apps/web/app/api/account/delete/route.ts` now masks `driver_first_name/last_name/email/phone` and nulls `driver_licence_number`. |
| 7 | CSP `unsafe-inline`/`unsafe-eval` | ✅ **Confirmed fixed** — both `middleware.ts` files build a per-request nonce CSP with `'strict-dynamic'`; `next.config.mjs` in both apps now explicitly omits a static CSP to avoid conflicting with it (verified — no duplicate header). |
| 8 | Upload MIME trust | ✅ **Confirmed fixed** — `apps/web/app/api/inspections/upload/route.ts` now has `matchesDeclaredImageType()` checking magic bytes for JPEG/PNG/WebP before storage. |
| 9 | `checkDbRateLimit` TOCTOU race | ✅ **Confirmed fixed** — `apps/web/lib/rate-limit.ts` calls the atomic `increment_rate_limit` RPC (migration `011`). **Same root cause found in a different, uncovered location today** — see Finding N4. |
| 10 | Cron-secret timing attack | ✅ **Confirmed fixed** — `apps/web/app/api/cron/pricing-signals/route.ts` uses `timingSafeEqual`. |
| 11 | Admin CSP missing `Permissions-Policy` | ✅ **Confirmed fixed** — present in `apps/admin/next.config.mjs`. |
| 12 | No live vulnerability-DB check | ✅ Actioned in the 09-28 pass (`pnpm audit`, Next.js upgrade). Not re-run today. |

**Bottom line: every code-level fix from yesterday's audit is still in place today.** The two items still marked open (rotate the leaked key; run migration `010`) are operator actions this review cannot confirm from the repository alone — treat them as the top priority regardless of anything below.

---

## Part 2 — New findings

## Severity summary

| # | Finding | Category | Importance |
|---|---|---|---|
| N1 | `service_role` key still live in git history; rotation status unconfirmed | Secrets & Sensitive Data | **10/10 (unconfirmed)** |
| N2 | Demo production-admin credentials also committed in `docs/RECI_TRANSPORT_PITCH.html` | Secrets & Sensitive Data | **8/10** |
| N3 | Loyalty point RPCs (`award_loyalty_points`, `deduct_loyalty_points`) are `SECURITY DEFINER` with no caller-identity check and no privilege lockdown — plausibly callable directly by any anon/authenticated caller via PostgREST | Auth & Access Control / Injection | **7/10** |
| N4 | White-label API-key daily-limit counter uses the same non-atomic read-then-write pattern as the already-fixed `checkDbRateLimit` (Finding 9, 09-28) | Configuration & Hardening | **3/10** |
| N5 | `apps/admin`'s forgot-password route still uses in-memory, per-instance rate limiting — the exact anti-pattern fixed on 6 `apps/web` routes yesterday, left unaddressed here | Configuration & Hardening | **3/10** |
| N6 | Admin forgot-password `redirectTo` validation permanently allows `http://localhost:*`, including in production | Configuration & Hardening | **2/10** |
| N7 | Documented "Two-Layer" admin auth check (`user_profiles.role` **and** `app_metadata.role`) is not implemented anywhere in code; migration `010`'s `admin_all_*` RLS policies are consequently permanently inert | Documentation Accuracy / Auth Hardening | **3/10** |

---

## Critical / High

### N1. `service_role` key remains permanently in git history; rotation status unconfirmed
**Location:** commit `9ba4b8d` ("First commit"), `git log --all -- create_admin.mjs` (and the other 8 files) — verified present today.
**Importance: 10/10 if not yet rotated, 0/10 if it has been — unable to verify which.**

**Description:** The 09-28 audit correctly noted that removing the hardcoded key from the working tree does not invalidate it — rotation in the Supabase dashboard is the only real fix, and history rewriting is optional cleanup. Re-running `git log --all -- create_admin.mjs` today confirms the key is still reachable in the `9ba4b8d` commit object, as expected (this is not a regression — it's git being git). The repo is still configured with the same GitHub remote (`https://github.com/Obinwanne1/RECI-Transport.git`).

**Unable to verify** (no Supabase dashboard access from this environment): whether `SUPABASE_SERVICE_ROLE_KEY` was actually reset since yesterday's recommendation, and whether the GitHub repo is public or private.

**Remediation:** If this has not been done since the 09-28 audit, it is still the single most urgent action available: Supabase Dashboard → Project Settings → API → **Reset service_role key**, then update the key everywhere it's deployed (Vercel env vars for both projects, local `.env.local` files). Confirm the GitHub repo's visibility explicitly (`gh repo view Obinwanne1/RECI-Transport --json visibility` if `gh auth` is available) — a private repo lowers but does not eliminate exposure (anyone who ever cloned it, or any CI log, keeps the old key regardless).

---

### N2. Demo admin credentials for the live production portal are also committed in a marketing pitch deck (HTML, not the previously-known PDF)
**Location:** `docs/RECI_TRANSPORT_PITCH.html:664-668` and `:853-856`
**Importance: 8/10**

**Description:** The 09-28 audit's Finding #3 removed `demo@reci-transport.com` / `[REDACTED]` from `CLAUDE.md` and `docs/RECI_TRANSPORT_DOCS.md`, and flagged `docs/RECI_TRANSPORT_DOCS.pdf` as still containing the credential (a binary export that wasn't regenerated). Today's review found a **third** location the prior audit did not check: `docs/RECI_TRANSPORT_PITCH.html`, which still contains the same credential twice, in plaintext, human-readable HTML:

```html
<div class="ci-role">Admin Portal — Demo Login</div>
<span class="ci-email">demo@reci-transport.com</span>
<span class="ci-pass">Password: [REDACTED]</span>
```
```html
<p>Login with the demo credentials — full admin access, all modules visible. Explore fleet, bookings, pricing and AI damage detection live.</p>
<p>Email: <strong>demo@reci-transport.com</strong> | Password: <strong>[REDACTED]</strong></p>
```

This is arguably a higher-risk exposure than the PDF: it's a *pitch deck*, explicitly meant to be shared with prospective customers/investors outside the engineering team, it's plaintext and trivially `grep`-able (unlike a PDF, which at least requires opening/extracting), and its own text explicitly advertises "full admin access, all modules visible" as a selling point.

**Risk:** Same as the original Finding #3 — if this account still exists with `role IN ('admin','staff')` in the live production Supabase project, this file alone (independent of the PDF or git history) hands out full admin-portal access to anyone it's shared with.

**Remediation:**
1. Same underlying fix as Finding #3: confirm whether `demo@reci-transport.com` still carries an admin/staff role in the live database; if it does and is used for prospective-customer demos, downgrade it to a read-only/limited role or move it to a separate non-production Supabase project.
2. Remove the credential from `docs/RECI_TRANSPORT_PITCH.html` specifically (two occurrences, lines noted above) — same treatment as already applied to `CLAUDE.md`/`RECI_TRANSPORT_DOCS.md`.
3. Regenerate `docs/RECI_TRANSPORT_DOCS.pdf` from the now-cleaned `.md` source (still outstanding from yesterday).
4. Grep the rest of `docs/` for any other export formats (e.g. a `.pptx`/slides source) that might carry the same content before considering this fully closed.

---

## Medium

### N3. Loyalty-point RPCs are `SECURITY DEFINER` with no caller check and no privilege lockdown — plausible unauthenticated point injection
**Location:** `supabase/migrations/006_loyalty.sql:94-138` (`award_loyalty_points`, `deduct_loyalty_points`); called from `apps/web/app/api/webhooks/stripe/route.ts:87` and `apps/web/app/api/bookings/route.ts:227`
**Importance: 7/10**

**Description:** Both functions are declared `SECURITY DEFINER`:

```sql
CREATE OR REPLACE FUNCTION award_loyalty_points(
  p_user_id UUID, p_points INT, p_booking_id UUID
) RETURNS VOID AS $$
BEGIN
  INSERT INTO loyalty_accounts (user_id, points_balance, lifetime_points)
  VALUES (p_user_id, p_points, p_points)
  ON CONFLICT (user_id) DO UPDATE SET
    points_balance = loyalty_accounts.points_balance + p_points, ...
  ...
END; $$ LANGUAGE plpgsql SECURITY DEFINER;
```

`SECURITY DEFINER` means the function runs with the privileges of its owner (the migration-running role — typically bypasses RLS entirely, the same mechanism `handle_new_user` in `001_initial_schema.sql:169-179` relies on). Three things combine into a real problem here:

1. **No caller-identity check inside the function body.** `p_user_id` is taken as-is; there is no `IF p_user_id <> auth.uid() THEN RAISE EXCEPTION` guard.
2. **No `REVOKE`/`GRANT` anywhere in any migration.** A repo-wide search (`grep -rn "REVOKE\|GRANT EXECUTE"` across `supabase/migrations/`) returns zero results. PostgreSQL's default behavior on `CREATE FUNCTION` is to grant `EXECUTE` to `PUBLIC` — and Supabase's PostgREST layer exposes every `public`-schema function as a callable RPC endpoint (`POST /rest/v1/rpc/<function_name>`) to whatever role the caller's API key maps to (`anon` or `authenticated`), unless that grant is explicitly revoked. This project *does* follow the correct pattern elsewhere — `handle_new_user` additionally sets `SET search_path = ''` as a defense-in-depth measure against search-path hijacking — but the loyalty functions have neither that nor any grant lockdown.
3. **The app's own call sites are safe** (`deduct_loyalty_points` is invoked with `p_user_id: user.id` from the caller's own authenticated session; `award_loyalty_points` is only invoked server-side from the Stripe webhook with the DB's own `confirmedBooking.user_id`) — but that only means the *intended* path is safe. It does not stop a direct, unauthenticated-or-trivially-authenticated PostgREST call from bypassing the app entirely:

```
POST https://ewrknfmpdifdgxlmqbzi.supabase.co/rest/v1/rpc/award_loyalty_points
apikey: <public anon key>
Content-Type: application/json

{ "p_user_id": "<any-uuid>", "p_points": 999999, "p_booking_id": null }
```

If reachable (see verification note below), this lets any caller grant arbitrary loyalty points to any account — including their own — reaching Platinum tier (15% booking discount + guaranteed upgrade, per `006_loyalty.sql:69`) instantly, or grief another user by later draining their balance via `deduct_loyalty_points` (bounded by `IF current_balance < p_points THEN RAISE EXCEPTION`, so this direction is at worst a minor DoS on the victim's own points, not amplifiable).

**Unable to verify without either a live RPC call (out of scope for a static-only review) or a Supabase Dashboard → Database → Functions check** of whether "Expose via API" is toggled off for these two functions, or a direct query of `information_schema.role_routine_grants` against the live database. This is the standard, well-documented Supabase footgun for `SECURITY DEFINER` functions, and nothing in this codebase mitigates it for these two functions specifically — but I have not executed the call above against the live project.

**Remediation:**
1. Add a caller check inside each function (still keep `SECURITY DEFINER` so the underlying table writes work, but stop trusting the parameter):
   ```sql
   CREATE OR REPLACE FUNCTION deduct_loyalty_points(
     p_user_id UUID, p_points INT, p_booking_id UUID
   ) RETURNS VOID
   LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
   BEGIN
     IF auth.uid() IS DISTINCT FROM p_user_id THEN
       RAISE EXCEPTION 'Not authorized to modify this loyalty account';
     END IF;
     ...
   END; $$;
   ```
   (`award_loyalty_points` is only ever called server-side with the service-role key from the Stripe webhook, so the equivalent fix there is to lock it down via grants rather than an `auth.uid()` check, since the service role has no `auth.uid()`.)
2. Explicitly revoke public execute and grant only to the role(s) that should call it:
   ```sql
   REVOKE EXECUTE ON FUNCTION award_loyalty_points(UUID, INT, UUID) FROM PUBLIC, anon, authenticated;
   REVOKE EXECUTE ON FUNCTION deduct_loyalty_points(UUID, INT, UUID) FROM PUBLIC, anon, authenticated;
   GRANT EXECUTE ON FUNCTION award_loyalty_points(UUID, INT, UUID) TO service_role;
   -- deduct_loyalty_points additionally needs `authenticated` if you keep the auth.uid() check above,
   -- since apps/web/app/api/bookings/route.ts currently calls it via the admin client on the user's behalf —
   -- decide which pattern you want and grant accordingly.
   ```
3. Add `SET search_path = public, pg_temp` to both functions, matching the existing convention in `handle_new_user`.
4. Apply the same review to any other `SECURITY DEFINER` function added in the future — this is a class of bug, not a one-off.

---

## Low

### N4. White-label API-key daily-limit counter has the same non-atomic race the atomic rate-limit migration was written to fix
**Location:** `apps/web/middleware.ts:48-65` (`handleApiKeyAuth`)
**Importance: 3/10**

**Description:** `supabase/migrations/011_atomic_rate_limit.sql` exists specifically because a read-then-write rate-limit check has a race window (Finding 9, 09-28). The white-label API-key gate added around the same time reintroduces the identical pattern in a different table:

```ts
const DAILY_LIMIT = 100
if (keyRow.requests_today >= DAILY_LIMIT) { ... }
void supabase.from('api_keys').update({ requests_today: keyRow.requests_today + 1 }).eq('id', keyRow.id)
```

Two concurrent requests on the same key near the boundary can both read a count below 100 and both write, exceeding the daily limit by a small margin. Low impact — this only weakens an abuse-mitigation cap on a paid/allocated integration partner's key, not a security boundary — but it's the same root cause already fixed once elsewhere in this codebase.

**Remediation:** Use the same atomic-RPC pattern as `increment_rate_limit`, e.g. add a dedicated `increment_api_key_usage(p_key_id uuid, p_daily_limit int)` RPC that does the compare-and-increment in one statement, and call it here instead of the read-then-write pair.

---

### N5. `apps/admin`'s forgot-password endpoint still uses in-memory rate limiting
**Location:** `apps/admin/app/api/auth/forgot-password/route.ts:5-21`
**Importance: 3/10**

**Description:** This route defines its own `Map`-based limiter (3 attempts/15min per IP) with a comment acknowledging the tradeoff ("resets on cold start — acceptable on free tier where volume is low"). This is the exact anti-pattern that was fixed on 6 `apps/web` routes in the 09-28 audit (Finding 5) — but this route lives in `apps/admin`, which was outside that audit's fix list, so it was never touched. Given the admin app's low real user count the practical risk is smaller than the original finding, but it's an authentication-adjacent endpoint (password-reset triggering) and the inconsistency means the hardening applied to one app wasn't carried to the other.

**Remediation:** Same fix pattern as Finding 5 — replace the local `Map` with a call to a DB-backed limiter. `checkDbRateLimit` currently lives in `apps/web/lib/rate-limit.ts`; either duplicate a minimal version into `apps/admin/lib/`, or promote it to a shared `packages/` module both apps can import.

### N6. Admin forgot-password `redirectTo` allowlist permanently accepts `http://localhost:*`
**Location:** `apps/admin/app/api/auth/forgot-password/route.ts:42-47`
**Importance: 2/10**

**Description:**
```ts
const safeRedirectTo =
  redirectTo && typeof redirectTo === 'string' &&
  (redirectTo.startsWith(`${origin}/`) || redirectTo.startsWith('http://localhost:'))
    ? redirectTo : `${origin}/auth/reset-password`
```
The `http://localhost:` carve-out is presumably for local development, but nothing in this code path is gated by `NODE_ENV`/`VERCEL_ENV` — it applies identically in production. This narrowly widens the same-origin check the comment says is there "to prevent open redirect in reset email." Practical exploitability is low (an attacker would need the victim's browser to also reach something on `localhost` at the right moment), but it's an unconditional weakening of an otherwise-correct control.

**Remediation:** Gate the localhost allowance to non-production:
```ts
const allowLocalhost = process.env.NODE_ENV !== 'production'
const safeRedirectTo =
  redirectTo && typeof redirectTo === 'string' &&
  (redirectTo.startsWith(`${origin}/`) || (allowLocalhost && redirectTo.startsWith('http://localhost:')))
    ? redirectTo : `${origin}/auth/reset-password`
```

### N7. Documented "Two-Layer" admin authorization check does not exist in code — and the RLS policies that assume it are consequently dead
**Location:** `CLAUDE.md:119-124`, `docs/RECI_TRANSPORT_DOCS.md:954,1288-1299`, `SKILL.md:601,2305` (the claim) vs. `apps/admin/lib/auth.ts:21-53`, `apps/admin/middleware.ts:77-93` (the actual implementation)
**Importance: 3/10** (fails closed, not an active vulnerability — but a real gap between documented and actual security posture)

**Description:** `CLAUDE.md` states plainly: *"Admin portal requires BOTH: 1. `user_profiles.role = 'admin'|'staff'` (database) 2. `app_metadata.role = 'admin'|'staff'` in Supabase Auth (JWT claim). One alone is insufficient."* The same claim is repeated in `docs/RECI_TRANSPORT_DOCS.md` and `SKILL.md`.

In the actual code, `assertAdminSession()` (`apps/admin/lib/auth.ts:21-44`) and the admin `middleware.ts` role check (`apps/admin/middleware.ts:77-93`) both check **only** `user_profiles.role`, fetched via the service-role client. Neither reads `user.app_metadata` or the JWT claim at all. A repo-wide search for `app_metadata` confirms it is **never written** by any application code path — not in `POST /api/admin/users` (`apps/admin/app/api/admin/users/route.ts`, which creates admin/staff accounts and sets `user_profiles.role` only), not in the role-update `PATCH /api/admin/users/[id]/route.ts`, not anywhere. It is referenced only in documentation and in the `admin_all_*` RLS policies added by `supabase/migrations/010_rls_hardening.sql`, which check `(auth.jwt() -> 'app_metadata' ->> 'role')`.

The practical consequence: those `admin_all_*` policies — which migration `010`'s own comment describes as "defense-in-depth" — can never actually grant access, because the claim they check is never populated. This is **not exploitable** (it fails closed: the policies simply never match, so no unintended access is granted; the app doesn't rely on them anyway, since every admin route uses the service-role client per the 09-28 audit's own "what was checked and found sound" section). But it does mean:
- The documented security model and the implemented one have diverged, which risks someone (a future engineer, or a future audit) trusting the doc's claim of a second independent gate that isn't actually there.
- `CLAUDE.md`'s own troubleshooting table entry ("Admin returns 401 | `app_metadata.role` not set... Set both... user must re-login") describes a manual step that the user-creation flow doesn't automate and that, per the above, doesn't currently gate anything either way — it's a stale/inconsistent operational instruction.

**Remediation — pick one:**
- **If you want the two-layer check to be real:** wire `app_metadata.role` into both `apps/admin/app/api/admin/users/route.ts` (on create) and `.../[id]/route.ts` (on role update), via `supabase.auth.admin.updateUserById(userId, { app_metadata: { role: parsed.data.role } })`, and add the corresponding check into `assertAdminSession()`/`middleware.ts`.
- **If the single `user_profiles.role` check (already enforced server-side on every route) is considered sufficient** — which is a defensible position given the app never relies on the anon-key client for admin actions — update `CLAUDE.md`/`docs/RECI_TRANSPORT_DOCS.md`/`SKILL.md` to stop claiming a check that isn't implemented, and consider dropping the now-permanently-false `admin_all_*` policies from migration `010` (or leave them as inert-but-harmless defense-in-depth, clearly commented as aspirational until the metadata-sync is built).

---

## What was checked and found sound (no action needed)

- **Mobile app (`apps/mobile`):** session token stored via `expo-secure-store`, not `AsyncStorage`; no hardcoded API keys or secrets found; API client attaches `Authorization: Bearer` from the live Supabase session on every call; no obvious insecure-storage or SSRF issues.
- **Agentic AI chat (`apps/web/app/api/ai/chat/route.ts`):** tool-use loop is bounded (max 5 iterations), all three tools (`search_vehicles`, `get_categories`, `search_faq`) are read-only against public data, user input is length-capped (1000 chars) and rate-limited via `checkDbRateLimit`. No path from a crafted user message to a privileged action.
- **Corporate policy AI agent (`apps/web/lib/corporate-agent.ts`):** output is strictly Zod-validated (`AgentResultSchema`) before being written back to `bookings.ai_policy_decision`; a malformed/adversarial model response is discarded (`safeParse` failure → `null`, no partial write) rather than trusted as-is.
- **White-label API-key auth (`apps/web/app/api/admin/api-keys/route.ts`, `middleware.ts`):** keys are SHA-256 hashed at rest and never stored in plaintext; raw key shown exactly once at creation; both `GET`/`POST` on the management endpoint correctly gate on admin/staff role via `assertAdmin()`.
- **Account/profile/booking endpoints (`apps/web/app/api/account/*`, `/api/bookings/[id]`, `/api/inspections/[bookingId]`, `/api/loyalty`):** every one re-checked today enforces ownership (`.eq('user_id', user.id)` or an explicit `booking.user_id !== user.id` check) before returning or mutating data; the `account/profile` `PATCH` uses a Zod-whitelisted field set, not a raw-body mass-assignment.
- **Admin user-management (`apps/admin/app/api/admin/users/**`):** `POST`/`PATCH`/`DELETE` all correctly gate on `assertAdminOnly()` (admin role, not staff), matching the documented "Users tab is admin-only" rule; temp passwords are randomly generated and shown once.
- **RLS coverage on newer tables:** `loyalty_tiers`/`loyalty_accounts`/`loyalty_transactions`, `maintenance_alerts`, `api_keys`, `api_rate_limits`, `admin_audit_log` all have RLS enabled with policies scoped correctly for direct table access (the loyalty-RPC issue in Finding N3 is about function-level privilege, not table-level RLS, which is itself fine).
- **Stripe webhook:** still correctly verifies signature via raw body, checks idempotency before processing, and now additionally verified today that the loyalty-points award and corporate-invoice send both happen only after `payment_intent.succeeded` and a fetched `confirmedBooking`, not from client-supplied data.
- **`env.local` files:** confirmed today via `git ls-files` that no `.env.local` (root or per-app) is tracked by git, consistent with yesterday's finding.
