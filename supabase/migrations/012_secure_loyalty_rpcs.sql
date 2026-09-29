-- ============================================================
-- Security fix (audits/security-audit-2026-09-29.md, Finding N3):
--
-- award_loyalty_points / deduct_loyalty_points (006_loyalty.sql) are
-- SECURITY DEFINER functions that take an arbitrary p_user_id/p_points with
-- no caller-identity check. PostgreSQL grants EXECUTE on new functions to
-- PUBLIC by default, and neither function had that revoked — so both were
-- plausibly callable directly via PostgREST's `/rest/v1/rpc/<fn>` using the
-- public anon key, letting any caller grant or drain arbitrary loyalty
-- points on any account, entirely bypassing the app.
--
-- Fix: lock execution down to service_role only (both functions are, today,
-- exclusively invoked server-side via the admin/service-role client — see
-- apps/web/app/api/webhooks/stripe/route.ts and apps/web/app/api/bookings/route.ts),
-- and add `SET search_path` to match the safe pattern already used by
-- handle_new_user() in 001_initial_schema.sql.
-- ============================================================

CREATE OR REPLACE FUNCTION award_loyalty_points(
  p_user_id   UUID,
  p_points    INT,
  p_booking_id UUID
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO loyalty_accounts (user_id, points_balance, lifetime_points)
  VALUES (p_user_id, p_points, p_points)
  ON CONFLICT (user_id) DO UPDATE
    SET points_balance  = loyalty_accounts.points_balance  + p_points,
        lifetime_points = loyalty_accounts.lifetime_points + p_points;

  INSERT INTO loyalty_transactions (user_id, booking_id, points, type, note)
  VALUES (p_user_id, p_booking_id, p_points, 'earned', 'Earned on booking');
END;
$$;

CREATE OR REPLACE FUNCTION deduct_loyalty_points(
  p_user_id    UUID,
  p_points     INT,
  p_booking_id UUID
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  current_balance INT;
BEGIN
  SELECT points_balance INTO current_balance
  FROM loyalty_accounts
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF current_balance IS NULL OR current_balance < p_points THEN
    RAISE EXCEPTION 'Insufficient points balance';
  END IF;

  UPDATE loyalty_accounts
  SET points_balance = points_balance - p_points
  WHERE user_id = p_user_id;

  INSERT INTO loyalty_transactions (user_id, booking_id, points, type, note)
  VALUES (p_user_id, p_booking_id, -p_points, 'redeemed', 'Redeemed at checkout');
END;
$$;

-- ─── Lock down execution to service_role only ─────────────────────────────
REVOKE EXECUTE ON FUNCTION award_loyalty_points(UUID, INT, UUID)  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION deduct_loyalty_points(UUID, INT, UUID) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION award_loyalty_points(UUID, INT, UUID)  TO service_role;
GRANT EXECUTE ON FUNCTION deduct_loyalty_points(UUID, INT, UUID) TO service_role;
