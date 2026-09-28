-- Atomic rate-limit check — replaces the read-then-write pattern in
-- apps/web/lib/rate-limit.ts, which had a race window: two concurrent
-- requests could both read a count below the limit before either wrote
-- back, letting the effective limit be exceeded under concurrency.
CREATE OR REPLACE FUNCTION increment_rate_limit(
  p_ip TEXT,
  p_endpoint TEXT,
  p_window_ms INT,
  p_max INT
) RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
DECLARE
  v_count INT;
BEGIN
  INSERT INTO api_rate_limits (ip, endpoint, count, reset_at)
  VALUES (p_ip, p_endpoint, 1, now() + (p_window_ms || ' ms')::interval)
  ON CONFLICT (ip, endpoint) DO UPDATE
    SET count = CASE
          WHEN api_rate_limits.reset_at < now() THEN 1
          ELSE api_rate_limits.count + 1
        END,
        reset_at = CASE
          WHEN api_rate_limits.reset_at < now() THEN now() + (p_window_ms || ' ms')::interval
          ELSE api_rate_limits.reset_at
        END
  RETURNING count INTO v_count;

  RETURN v_count <= p_max;
END;
$$;
