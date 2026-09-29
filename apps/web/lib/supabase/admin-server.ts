/**
 * Service role client — bypasses RLS.
 * Use ONLY in server-side API routes, never import in client components.
 */
export { createSupabaseAdminClient as createAdminClient } from '@reci/supabase/admin'
