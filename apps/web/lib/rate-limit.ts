import { createAdminClient } from './supabase/admin-server'

export async function checkDbRateLimit(
  ip: string,
  endpoint: string,
  maxPerWindow: number,
  windowMs: number
): Promise<boolean> {
  try {
    const supabase = createAdminClient()

    // Atomic increment-and-check via RPC (supabase/migrations/011_atomic_rate_limit.sql)
    // — avoids the read-then-write race a client-side select+update/upsert would have.
    const { data, error } = await supabase.rpc('increment_rate_limit', {
      p_ip: ip,
      p_endpoint: endpoint,
      p_window_ms: windowMs,
      p_max: maxPerWindow,
    })

    if (error) throw error
    return data === true
  } catch {
    return true // fail open — don't block requests if rate limit check errors
  }
}
