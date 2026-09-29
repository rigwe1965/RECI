import { createClient } from '@supabase/supabase-js'

// Run with: node --env-file=.env.local create_admin.mjs
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY. Run with: node --env-file=.env.local create_admin.mjs')
  process.exit(1)
}

const supabase = createClient(
  SUPABASE_URL,
  SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

const ADMIN_EMAIL = process.env.ADMIN_EMAIL
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD
if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
  console.error('Missing ADMIN_EMAIL / ADMIN_PASSWORD env vars. Example:\n  ADMIN_EMAIL=you@example.com ADMIN_PASSWORD=... node --env-file=.env.local create_admin.mjs')
  process.exit(1)
}

const { data, error } = await supabase.auth.admin.createUser({
  email: ADMIN_EMAIL,
  password: ADMIN_PASSWORD,
  email_confirm: true,
  user_metadata: { first_name: 'Romanus', last_name: 'Igwe' },
  // JWT claim checked by the admin portal's "Two-Layer Check" (see CLAUDE.md)
  app_metadata: { role: 'admin' }
})

if (error) { console.error('Error:', error.message); process.exit(1) }
console.log('User created:', data.user.id)

// Set role to admin in user_profiles
const { error: profileErr } = await supabase
  .from('user_profiles')
  .update({ role: 'admin' })
  .eq('id', data.user.id)

if (profileErr) console.error('Profile update error:', profileErr.message)
else console.log('Role set to admin. Done.')
