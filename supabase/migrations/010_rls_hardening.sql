-- ============================================================
-- RLS hardening — closes three gaps found in security review:
--
-- 1. `bookings`, `booking_extras`, `vehicle_inspections` had client-facing
--    INSERT policies with `WITH CHECK (true)`, added to support guest
--    checkout. This let any caller holding the public anon key insert rows
--    directly via PostgREST — including `bookings.total_price`/`status`/
--    `user_id` — bypassing the app's server-computed pricing entirely.
--    All application code that inserts into these three tables now goes
--    exclusively through the service-role (admin) client (see
--    apps/web/app/api/bookings/route.ts, apps/web/app/api/ai/damage/route.ts),
--    which bypasses RLS by design — so these policies are dropped rather
--    than tightened. With RLS enabled and no INSERT policy present, insert
--    is denied by default for the anon/authenticated roles.
--
-- 2. `maintenance_alerts_staff_read` / `maintenance_alerts_staff_write` were
--    named for staff-only access but their USING clause was `true` —
--    granting public read AND write to any authenticated (or anon) caller.
--
-- 3. Every `admin_all_*` policy from 001_initial_schema.sql (and
--    `admin_all_api_keys` from 003_ai_layer.sql) checked
--    `auth.jwt() ->> 'role'`, which is the Postgres session role
--    (always 'authenticated'/'anon'/'service_role') — never the app's
--    'admin'/'staff' role, which Supabase stores under `app_metadata`.
--    These policies could never actually grant anyone access; they are
--    corrected here to match the pattern already used correctly in
--    009_admin_audit_log.sql. Note: the application itself does NOT rely
--    on these policies for admin authorization (every admin route checks
--    `user_profiles.role` server-side via the service-role client — see
--    apps/admin/lib/auth.ts) — this fix is defense-in-depth, not a patch
--    for a live authorization bypass in the app.
-- ============================================================

-- ─── 1. Drop unused, over-permissive client-facing INSERT policies ───────────

DROP POLICY IF EXISTS "create_booking" ON bookings;
DROP POLICY IF EXISTS "insert_booking_extras" ON booking_extras;
DROP POLICY IF EXISTS "insert_inspections" ON vehicle_inspections;

-- ─── 2. Fix maintenance_alerts: actually restrict to staff/admin ─────────────

DROP POLICY IF EXISTS "maintenance_alerts_staff_read" ON maintenance_alerts;
DROP POLICY IF EXISTS "maintenance_alerts_staff_write" ON maintenance_alerts;

CREATE POLICY "maintenance_alerts_staff_read" ON maintenance_alerts
  FOR SELECT USING ((auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'staff'));

CREATE POLICY "maintenance_alerts_staff_write" ON maintenance_alerts
  FOR ALL USING ((auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'staff'));

-- ─── 3. Fix admin_all_* policies to read the correct JWT claim path ──────────

DROP POLICY IF EXISTS "admin_all_locations" ON locations;
CREATE POLICY "admin_all_locations" ON locations FOR ALL
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'staff'));

DROP POLICY IF EXISTS "admin_all_categories" ON vehicle_categories;
CREATE POLICY "admin_all_categories" ON vehicle_categories FOR ALL
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'staff'));

DROP POLICY IF EXISTS "admin_all_vehicles" ON vehicles;
CREATE POLICY "admin_all_vehicles" ON vehicles FOR ALL
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'staff'));

DROP POLICY IF EXISTS "admin_all_pricing" ON pricing_rules;
CREATE POLICY "admin_all_pricing" ON pricing_rules FOR ALL
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'staff'));

DROP POLICY IF EXISTS "admin_all_overrides" ON pricing_overrides;
CREATE POLICY "admin_all_overrides" ON pricing_overrides FOR ALL
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'staff'));

DROP POLICY IF EXISTS "admin_all_extras" ON extras;
CREATE POLICY "admin_all_extras" ON extras FOR ALL
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'staff'));

DROP POLICY IF EXISTS "admin_all_profiles" ON user_profiles;
CREATE POLICY "admin_all_profiles" ON user_profiles FOR ALL
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'staff'));

DROP POLICY IF EXISTS "admin_all_bookings" ON bookings;
CREATE POLICY "admin_all_bookings" ON bookings FOR ALL
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'staff'));

DROP POLICY IF EXISTS "admin_all_booking_extras" ON booking_extras;
CREATE POLICY "admin_all_booking_extras" ON booking_extras FOR ALL
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'staff'));

DROP POLICY IF EXISTS "admin_all_payments" ON payments;
CREATE POLICY "admin_all_payments" ON payments FOR ALL
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'staff'));

DROP POLICY IF EXISTS "admin_all_blocks" ON availability_blocks;
CREATE POLICY "admin_all_blocks" ON availability_blocks FOR ALL
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'staff'));

DROP POLICY IF EXISTS "admin_all_corporate" ON corporate_accounts;
CREATE POLICY "admin_all_corporate" ON corporate_accounts FOR ALL
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'staff'));

DROP POLICY IF EXISTS "admin_all_inspections" ON vehicle_inspections;
CREATE POLICY "admin_all_inspections" ON vehicle_inspections FOR ALL
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'staff'));

DROP POLICY IF EXISTS "admin_all_licences" ON licence_verifications;
CREATE POLICY "admin_all_licences" ON licence_verifications FOR ALL
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'staff'));

DROP POLICY IF EXISTS "admin_all_signals" ON pricing_signals;
CREATE POLICY "admin_all_signals" ON pricing_signals FOR ALL
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'staff'));

DROP POLICY IF EXISTS "admin_all_email_logs" ON email_logs;
CREATE POLICY "admin_all_email_logs" ON email_logs FOR ALL
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'staff'));

DROP POLICY IF EXISTS "admin_all_corporate_pricing" ON corporate_pricing;
CREATE POLICY "admin_all_corporate_pricing" ON corporate_pricing FOR ALL
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'staff'));

DROP POLICY IF EXISTS "admin_all_api_keys" ON api_keys;
CREATE POLICY "admin_all_api_keys" ON api_keys FOR ALL
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'staff'));
