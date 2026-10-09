# RECI Transport — Security Audit (2026-10-09)

**Scope:** `apps/web`, `apps/admin`, `packages/*`, `supabase/migrations` (001–013), CI workflow, repo hygiene.
**Method:** Manual static review of current code, building on `security-audit-2026-09-28/29.md` (their fixes were re-verified as still present). No live exploitation; no access to the live Supabase project, so DB-side items are traced from migration SQL and must be confirmed against the live database.
**Not deeply reviewed:** `apps/mobile`, `ai/chat`, `ai/search`, `ai/extras-recommend`, `v1/ai/*` (judged sound in the 09-29 audit; not re-read line by line), admin UI pages.

## Summary

| # | Finding | Severity | Status |
|---|---|---|---|
| 1 | Full git history (incl. hardcoded `service_role` key, demo admin creds) pushed to a **public** repo | **Critical** | Operator action required |
| 2 | `bookings` RLS UPDATE policy lets a customer rewrite price/vehicle/dates of own pending booking → pay ~€0.50 | **Critical** | Fixed in migration 014 |
| 3 | `user_profiles` self-update can set `licence_verified`, `corporate_account_id`, `email` | **High** | Fixed in migration 014 |
| 4 | `licence_verifications` `FOR ALL` own-row policy → self-approve licence | **High** | Fixed in migration 014 |
| 5 | `ai_conversations` policy exposes all server-written rows to anonymous callers (read/edit/delete) | **High** | Fixed in migration 014 |
| 6 | Loyalty-points deduction is fire-and-forget; discount granted even if deduction fails / never runs | **High** | Fixed in code |
| 7 | Open redirect via `next` param on login and OAuth callback | Medium | Fixed in code |
| 8 | Unescaped HTML in booking-confirmation and corporate-invoice emails | Medium | Fixed in code |
| 9 | Demo admin password still in tracked docs | Medium | Redacted (history still has it) |
| 10 | Pending bookings never expire and block inventory; unauthenticated creation | Medium | Open — recommendation |
| 11 | `clear-reset` endpoints let a user drop `password_reset_required` without changing password | Medium | Open — recommendation |
| 12 | `/api/ai/licence` runs a paid vision call for unauthenticated callers | Low | Open — recommendation |
| 13 | Any user can self-create and auto-approve a corporate account; invoice goes to attacker-chosen `billing_email` | Low | Open — recommendation |
| 14 | `/api/ai/trip` and `/api/ai/damage`: unbounded strings / arbitrary image URLs forwarded to the model | Low | Open — recommendation |
| 15 | `increment_rate_limit` had default PUBLIC execute | Low | Fixed in migration 014 |
| 16 | Live Anthropic key present in gitignored `apps/web/.env.local` | Info | Not tracked — no repo action |

---

## Critical

### 1. Public GitHub repo contains the leaked `service_role` key and demo credentials in history
**Where:** `rigwe1965/RECI` (visibility: **PUBLIC**). Commit `9ba4b8d` ("First commit") — confirmed an ancestor of `rigwe/main` — is where the 09-28 audit found the hardcoded Supabase `service_role` key (9 files). Commits `0de4d36`/`1dc99c0` contain the demo admin password for the production admin portal (`git log --all -S"RecIDemo2026"`).
**Risk:** `service_role` bypasses all RLS: full read/write of every table, auth admin API (create admins, reset passwords). Scrapers monitor public pushes for JWTs within minutes. The history was pushed to this public repo during this session's git work; removing the working-tree copy does not help.
**Fix (cannot be done from code):**
1. Supabase Dashboard → Project Settings → API → **reset the `service_role` key** (and JWT secret if you want the old anon key dead too); update Vercel env vars for both projects and local `.env.local`.
2. Rotate or delete `demo@reci-transport.com` in the production project.
3. Make the repo private (Settings → Danger zone) or rewrite history (`git filter-repo`) and force-push — but rotation is the only thing that actually closes the exposure.

### 2. Customer can rewrite their own pending booking's price via PostgREST
**Where:** `supabase/migrations/001_initial_schema.sql:396-397`
```sql
CREATE POLICY "own_booking_update" ON bookings FOR UPDATE
  USING (auth.uid() = user_id AND status = 'pending');
```
**Attack:** Create a normal booking (`POST /api/bookings`), then with the public anon key + own JWT: `PATCH /rest/v1/bookings?id=eq.<id>` `{"total_price":0.5,"vehicle_id":"<luxury vehicle>","pickup_datetime":…}`. The USING clause doubles as WITH CHECK, and `status` stays `pending`, so it passes. `POST /api/payments/intent` then charges the stored `total_price` (`payments/intent/route.ts:63`), and the Stripe webhook confirms the booking. Also bypasses the availability check (dates/vehicle changed after the conflict check). The 09-28 audit fixed INSERT but missed UPDATE.
**Fix:** `014_rls_privilege_hardening.sql` drops the policy. Cancellation already uses the admin client (`bookings/[id]/route.ts:102`), so nothing in the app depended on it.

## High

### 3. `user_profiles` self-update leaves sensitive columns writable
**Where:** `004_internal_users.sql:22-28` froze only `role` and `password_reset_required`.
**Attack:** `PATCH /rest/v1/user_profiles?id=eq.<me>` `{"licence_verified":true}` skips staff licence approval; `{"corporate_account_id":"<other company uuid>"}` inherits that company's rates (`bookings/route.ts:103-130`) and bills it; `{"email":…}` desyncs identity.
**Fix:** migration 014 recreates `own_profile_update` with `licence_verified`, `corporate_account_id`, `corporate_application_status`, `email` frozen too. The only legitimate client write (`account/profile` PATCH) touches `first_name/last_name/phone` and is unaffected.

### 4. `licence_verifications`: `own_licence FOR ALL`
**Where:** `001_initial_schema.sql:455-456`. A user can INSERT/UPDATE their own row with `status='verified'`, defeating the human-in-the-loop design in `ai/licence/route.ts:121-137`.
**Fix:** replaced by a SELECT-only policy (migration 014); rows are written only by the admin client.

### 5. `ai_conversations`: anonymous read/write of server logs
**Where:** `001_initial_schema.sql:450-451` — `USING (user_id = auth.uid() OR user_id IS NULL)`, `FOR ALL`. `ai-logger.ts` writes every row with `user_id` NULL, so anyone with the anon key can read (booking ids, licence-OCR and damage decisions) and edit/delete the audit trail.
**Fix:** migration 014 → `FOR SELECT USING (user_id = auth.uid())`.

### 6. Loyalty points discount granted without a reliable deduction
**Where:** `apps/web/app/api/bookings/route.ts` (previously lines 222-237). The discount is applied to `total_price`, then `deduct_loyalty_points` was called without `await` and its error only logged. On serverless the un-awaited promise may never run once the response is returned; if the RPC raised "Insufficient points" (e.g. two concurrent bookings reusing one balance) the discount stayed.
**Fix:** the RPC is now awaited; on failure the booking is cancelled and a 409 returned. The RPC's `FOR UPDATE` lock makes concurrent redemption race-safe.

## Medium

### 7. Open redirect (`next` parameter)
**Where:** `apps/web/app/auth/callback/route.ts:7,21` (`new URL(next, request.url)`) and `apps/web/app/auth/login/page.tsx:22,50` (`router.push(next)`). `?next=https://evil.example` or `//evil.example` redirects a freshly authenticated user off-site (phishing).
**Fix:** new `lib/safe-redirect.ts` (`safeNextPath`) allows only single-slash relative paths; used in both places; unit-tested (`__tests__/safe-redirect.test.ts`).

### 8. HTML injection in transactional emails
**Where:** `apps/web/lib/email.ts` — `driver_first_name`, `driver_last_name`, extras names, `company_name`, `billing_address`, `vat_number` interpolated raw into HTML sent from `bookings@recitransport.de`. Guest checkout lets anyone choose both `driver_first_name` and `driver_email`; corporate invoices go to a self-chosen `billing_email` (finding 13) — a phishing channel from a trusted sender.
**Fix:** `escapeHtml()` applied to every interpolated user/DB string in both templates.

### 9. Demo admin password in tracked docs
`CLAUDE.md:333`, `audits/security-audit-2026-09-28.md:137`, `audits/security-audit-2026-09-29.md:66,71,75` contained the plaintext password. Redacted in the working tree; remains in git history (see finding 1). `docs/RECI_TRANSPORT_PITCH.html` no longer contains it. `docs/RECI_TRANSPORT_DOCS.pdf` could not be confirmed either way by text search — regenerate it.

### 10. Pending bookings hold inventory indefinitely
`bookings/route.ts:47-53` treats any non-`cancelled` booking as blocking, including `pending`. An unauthenticated caller (10 req/min/IP, guest checkout) can reserve vehicles for any dates and never pay. **Recommendation:** expire `pending` bookings (cron: cancel after ~15–30 min without a paid `payments` row) and exclude expired ones from the conflict query.

### 11. `clear-reset` does not verify a password change
`apps/web/app/api/account/clear-reset/route.ts` and `apps/admin/app/api/admin/users/[id]/clear-reset/route.ts` clear `password_reset_required` for the caller unconditionally. An admin-created user holding the temp password can call the endpoint and keep it. **Recommendation:** clear the flag server-side only as part of the password-update flow (or compare `auth.users.updated_at`/`last_sign_in_at` against the flag set time).

## Low / Info

- **12.** `ai/licence/route.ts:41-65` — vision call before auth check; only IP rate-limited (5/min). Require a session (or CAPTCHA) if guests don't need it.
- **13.** `api/corporate/route.ts:71-103` — any signed-in user gets an auto-`approved` corporate account and `corporate_manager` role. Discount is 0 until an admin sets it, so impact is limited to finding 8's email path and the corporate AI-policy call with attacker-written `travel_policy`. Consider `pending` status + admin approval.
- **14.** `ai/trip/route.ts` — `vehicle_name`/`pickup_location` unbounded and `booking_id` not ownership-checked; `ai/damage` forwards client-supplied image URLs to the model. Add `.max()` limits, restrict URLs to the project's Supabase storage host, check booking ownership.
- **15.** `increment_rate_limit` — EXECUTE restricted to `service_role` in migration 014.
- **16.** `apps/web/.env.local` holds a live `sk-ant-…` key. The file is gitignored and untracked (`git ls-files`, `git check-ignore` confirmed) — no action in-repo, but treat the key as exposed to anything that reads this workspace and rotate if it was ever shared.

## Verified sound this pass
Admin routes all wrapped in `withAdminAuth` (except the self-scoped `clear-reset` and the intentionally public `forgot-password`); `.or()` search inputs sanitized; Stripe webhook signature/idempotency; cron secret `timingSafeEqual`; upload magic-byte checks; ownership checks on bookings/inspections/damage; admin forgot-password `redirectTo` localhost carve-out now gated by `NODE_ENV`; `award_/deduct_loyalty_points` and `increment_api_key_usage` locked to `service_role` (012/013); `app_metadata.role` now synced on admin user create/update.

## Changes made
| File | Change |
|---|---|
| `supabase/migrations/014_rls_privilege_hardening.sql` | New — fixes 2, 3, 4, 5, 15. **Must be run in the Supabase SQL editor.** |
| `apps/web/app/api/bookings/route.ts` | Await + enforce loyalty deduction (6) |
| `apps/web/lib/safe-redirect.ts`, `app/auth/callback/route.ts`, `app/auth/login/page.tsx` | Open-redirect fix (7) |
| `apps/web/lib/email.ts` | HTML escaping (8) |
| `apps/web/__tests__/safe-redirect.test.ts` | New tests |
| `CLAUDE.md`, `audits/security-audit-2026-09-28.md`, `…09-29.md` | Password redacted (9) |

Verification: `tsc --noEmit` clean; `jest` 31/31 passing. Re-scan of changed files found no new issues (the new migration only removes/narrows policies; `safeNextPath` rejects `//`, `/\`, control chars and absolute URLs; `escapeHtml` covers `& < > " '`). Migration 014 is untested against a live DB — apply to a staging project first and re-run the booking → pay flow.

## Next steps
1. **Today:** rotate the `service_role` key; make the repo private; delete/rotate the demo admin account (finding 1).
2. Apply migrations 010–014 to the live DB and confirm with `select policyname, cmd from pg_policies where tablename in ('bookings','user_profiles','licence_verifications','ai_conversations');`.
3. Add a pending-booking expiry job (10) and fix `clear-reset` (11).
4. Add an RLS regression test that, using the anon key + a customer JWT, asserts UPDATE on `bookings`/`user_profiles.licence_verified`/`licence_verifications` is denied.
5. Enable GitHub secret scanning + push protection on the repo; run `pnpm audit --prod` in CI.
