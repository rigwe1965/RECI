import { getAdminClient } from './scripts/_supabase-admin.mjs'

// Run with: node --env-file=apps/web/.env.local create_admin.mjs
const supabase = getAdminClient('create_admin.mjs')

const ADMIN_EMAIL = process.env.ADMIN_EMAIL
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD
if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
  console.error('Missing ADMIN_EMAIL / ADMIN_PASSWORD env vars. Example:\n  ADMIN_EMAIL=you@example.com ADMIN_PASSWORD=... node --env-file=apps/web/.env.local create_admin.mjs')
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
