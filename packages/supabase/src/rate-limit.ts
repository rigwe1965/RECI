import { createSupabaseAdminClient } from './admin'

// DB-backed rate limiting — serverless-safe (no in-memory Map that resets
// per instance). Shared by apps/web and apps/admin, which point at the same
// Supabase project and api_rate_limits table / increment_rate_limit RPC.
export async function checkDbRateLimit(
  ip: string,
  endpoint: string,
  maxPerWindow: number,
  windowMs: number
): Promise<boolean> {
  try {
    const supabase = createSupabaseAdminClient()

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
    // Fail OPEN by design: this guards general abuse prevention, where
    // availability outweighs strictness. Contrast with the daily API-key
    // usage check in apps/web/middleware.ts (handleApiKeyAuth), which fails
    // CLOSED because it meters a paid quota. Not an oversight — see
    // audits/error-handling-audit-2026-09-29.md #10.
    return true
  }
}
