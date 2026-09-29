import { createServerClient } from '@supabase/ssr'
import type { User } from '@supabase/supabase-js'
import { createSupabaseServerClient } from '@reci/supabase/server'

export { createSupabaseServerClient as createClient } from '@reci/supabase/server'

/**
 * For mobile/API clients that send Authorization: Bearer <jwt>.
 * Falls back to cookie-based session when no Bearer header is present.
 * Returns both the supabase client (with correct RLS context) and the user.
 */
export async function getUserFromRequest(
  request: Request
): Promise<{ supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>; user: User | null }> {
  const authHeader = request.headers.get('Authorization')
  const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : null

  if (bearerToken) {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: { getAll: () => [], setAll: () => {} },
        global: { headers: { Authorization: `Bearer ${bearerToken}` } },
      }
    )
    const { data } = await supabase.auth.getUser(bearerToken)
    return { supabase, user: data.user }
  }

  const supabase = await createSupabaseServerClient()
  const { data } = await supabase.auth.getUser()
  return { supabase, user: data.user }
}
