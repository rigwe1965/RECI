-- ============================================================
-- RLS privilege hardening — fixes found in audits/security-audit-2026-10-09.md
--
-- Every application write goes through the service-role (admin) client or
-- through a route that whitelists columns (see apps/web/app/api/account/profile).
-- None of the browser/mobile clients write these tables directly, so the
-- permissive policies below were pure attack surface: with the public anon key
-- plus any logged-in user's JWT, PostgREST (`/rest/v1/<table>`) accepts the
-- writes directly and bypasses every check in the Next.js API routes.
--
-- 1. bookings."own_booking_update"
--    USING (auth.uid() = user_id AND status = 'pending'), no column limits.
--    A customer could PATCH their own pending booking's total_price,
--    vehicle_id, dates, points_redeemed… and then call /api/payments/intent,
--    which charges the *stored* total_price — e.g. pay EUR 0.50 for a premium
--    vehicle. Cancellation goes through PATCH /api/bookings/[id] (admin client),
--    so no client-facing UPDATE policy is needed.
--
-- 2. user_profiles."own_profile_update"
--    004 froze `role` and `password_reset_required`, but left
--    `licence_verified`, `corporate_account_id`, `corporate_application_status`
--    and `email` writable. A customer could self-set licence_verified = true
--    (bypassing the staff-approval step for AI licence OCR) or point
--    corporate_account_id at another company's account to inherit its pricing
--    and have bookings invoiced to it. All sensitive columns are now frozen.
--
-- 3. licence_verifications."own_licence" (FOR ALL)
--    Let a user INSERT/UPDATE their own row, including status = 'verified'.
--    Reduced to SELECT; rows are only ever written by the admin client.
--
-- 4. ai_conversations."own_ai_conversations" (FOR ALL,
--    USING user_id = auth.uid() OR user_id IS NULL)
--    All server-written log rows have user_id NULL, so any anonymous caller
--    could read, edit or delete every AI decision log. Reduced to
--    "a user may read their own rows".
--
-- 5. increment_rate_limit() had default PUBLIC execute; restrict to service_role
--    like the other RPCs.
-- ============================================================

-- ─── 1. bookings ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "own_booking_update" ON bookings;

-- ─── 2. user_profiles ────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "own_profile_update" ON user_profiles;

CREATE POLICY "own_profile_update" ON user_profiles
  FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id
    AND role = (SELECT p.role FROM public.user_profiles p WHERE p.id = auth.uid())
    AND password_reset_required = (SELECT p.password_reset_required FROM public.user_profiles p WHERE p.id = auth.uid())
    AND licence_verified = (SELECT p.licence_verified FROM public.user_profiles p WHERE p.id = auth.uid())
    AND corporate_account_id IS NOT DISTINCT FROM (SELECT p.corporate_account_id FROM public.user_profiles p WHERE p.id = auth.uid())
    AND corporate_application_status IS NOT DISTINCT FROM (SELECT p.corporate_application_status FROM public.user_profiles p WHERE p.id = auth.uid())
    AND email = (SELECT p.email FROM public.user_profiles p WHERE p.id = auth.uid())
  );

-- ─── 3. licence_verifications ────────────────────────────────────────────────
DROP POLICY IF EXISTS "own_licence" ON licence_verifications;

CREATE POLICY "own_licence_select" ON licence_verifications
  FOR SELECT USING (user_id = auth.uid());

-- ─── 4. ai_conversations ─────────────────────────────────────────────────────
DROP POLICY IF EXISTS "own_ai_conversations" ON ai_conversations;

CREATE POLICY "own_ai_conversations_select" ON ai_conversations
  FOR SELECT USING (user_id = auth.uid());

-- ─── 5. increment_rate_limit ─────────────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION increment_rate_limit(TEXT, TEXT, INT, INT) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION increment_rate_limit(TEXT, TEXT, INT, INT) TO service_role;
