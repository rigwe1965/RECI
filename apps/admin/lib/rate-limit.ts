import { createAdminClient } from './supabase/admin'

// DB-backed rate limiting — serverless-safe (no in-memory Map that resets
// per instance). Mirrors apps/web/lib/rate-limit.ts; shares the same
// api_rate_limits table and increment_rate_limit RPC (both apps point at
// the same Supabase project).
export async function checkDbRateLimit(
  ip: string,
  endpoint: string,
  maxPerWindow: number,
  windowMs: number
): Promise<boolean> {
  try {
    const supabase = createAdminClient()

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
