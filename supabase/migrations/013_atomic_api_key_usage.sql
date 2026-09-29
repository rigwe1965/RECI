-- ============================================================
-- Security fix (audits/security-audit-2026-09-29.md, Finding N4):
--
-- The white-label API-key daily-limit check in apps/web/middleware.ts
-- (handleApiKeyAuth) read `requests_today`, compared it to DAILY_LIMIT, then
-- separately wrote `requests_today + 1` — the same read-then-write race
-- already fixed once for IP rate limiting in 011_atomic_rate_limit.sql.
-- Two concurrent requests on the same key near the boundary could both pass
-- the check before either write landed, exceeding the daily limit.
--
-- Fix: atomic check-and-increment in a single statement, mirroring
-- increment_rate_limit().
-- ============================================================

CREATE OR REPLACE FUNCTION increment_api_key_usage(
  p_key_id      UUID,
  p_daily_limit INT
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_count      INT;
  v_last_reset DATE;
  v_today      DATE := CURRENT_DATE;
BEGIN
  SELECT requests_today, last_reset_at INTO v_count, v_last_reset
  FROM api_keys
  WHERE id = p_key_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF v_last_reset < v_today THEN
    v_count := 0;
  END IF;

  IF v_count >= p_daily_limit THEN
    UPDATE api_keys SET last_reset_at = v_today WHERE id = p_key_id AND last_reset_at < v_today;
    RETURN false;
  END IF;

  UPDATE api_keys
  SET requests_today = v_count + 1,
      last_reset_at = v_today
  WHERE id = p_key_id;

  RETURN true;
END;
$$;

REVOKE EXECUTE ON FUNCTION increment_api_key_usage(UUID, INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION increment_api_key_usage(UUID, INT) TO service_role;
