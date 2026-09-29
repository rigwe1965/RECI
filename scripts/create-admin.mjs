import { getAdminClient } from './_supabase-admin.mjs'

// Run with: node --env-file=apps/web/.env.local scripts/create-admin.mjs
const admin = getAdminClient('scripts/create-admin.mjs')

const EMAIL = process.env.ADMIN_EMAIL
const PASSWORD = process.env.ADMIN_PASSWORD
if (!EMAIL || !PASSWORD) {
  console.error('Missing ADMIN_EMAIL / ADMIN_PASSWORD env vars. Example:\n  ADMIN_EMAIL=you@example.com ADMIN_PASSWORD=... node --env-file=apps/web/.env.local scripts/create-admin.mjs')
  process.exit(1)
}

// Create user
const { data: user, error: createError } = await admin.auth.admin.createUser({
  email: EMAIL,
  password: PASSWORD,
  email_confirm: true,
  // JWT claim checked by the admin portal's "Two-Layer Check" (see CLAUDE.md)
  app_metadata: { role: 'admin' },
})

if (createError) {
  if (createError.message.includes('already been registered')) {
    console.log('User already exists — skipping creation')
  } else {
    console.error('Create user failed:', createError.message)
    process.exit(1)
  }
}

const userId = user?.user?.id

// Get ID if user already existed
let finalId = userId
if (!finalId) {
  const { data } = await admin.auth.admin.listUsers()
  const existing = data?.users?.find(u => u.email === EMAIL)
  finalId = existing?.id
}

if (!finalId) {
  console.error('Could not find user ID')
  process.exit(1)
}

console.log('User ID:', finalId)

// Ensure app_metadata.role is set even if the user already existed
// (createUser's app_metadata above only applies on first creation)
const { error: metaError } = await admin.auth.admin.updateUserById(finalId, {
  app_metadata: { role: 'admin' },
})
if (metaError) console.error('app_metadata update failed:', metaError.message)

// Upsert admin profile
const { error: profileError } = await admin
  .from('user_profiles')
  .upsert({ id: finalId, email: EMAIL, role: 'admin' }, { onConflict: 'id' })

if (profileError) {
  console.error('Profile upsert failed:', profileError.message)
  process.exit(1)
}

console.log('Done! Login with:')
console.log('  Email:', EMAIL)
console.log('  Password:', PASSWORD)
