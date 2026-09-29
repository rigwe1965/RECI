/**
 * Service role client — bypasses RLS.
 * ADMIN APP ONLY. Never expose to browser or public API routes.
 */
export { createSupabaseAdminClient as createAdminClient } from '@reci/supabase/admin'
