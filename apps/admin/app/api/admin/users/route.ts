import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { withAdminAuth } from '@/lib/with-admin-auth'
import { z } from 'zod'
import { adminErrorResponse } from '@/lib/errors'
import { ADMIN_PORTAL_ROLES } from '@reci/types'
import { parseJsonBody } from '@reci/api'

export const dynamic = 'force-dynamic'

export const GET = withAdminAuth(async (request: NextRequest) => {
  const { searchParams } = request.nextUrl
  const search = searchParams.get('search') ?? ''
  const page = parseInt(searchParams.get('page') ?? '1', 10)
  const perPage = 50
  const from = (page - 1) * perPage
  const to = from + perPage - 1

  const supabase = createAdminClient()

  let query = supabase
    .from('user_profiles')
    .select('id, email, first_name, last_name, role, password_reset_required, created_at', { count: 'exact' })
    .in('role', ADMIN_PORTAL_ROLES)
    .order('created_at', { ascending: false })
    .range(from, to)

  if (search) {
    const safe = search.replace(/[^a-zA-Z0-9 @.\-]/g, '').slice(0, 100)
    query = query.or(`first_name.ilike.%${safe}%,last_name.ilike.%${safe}%,email.ilike.%${safe}%`)
  }

  const { data, error, count } = await query
  if (error) return adminErrorResponse('admin/users', error)
  return NextResponse.json({ users: data, total: count ?? 0, page, per_page: perPage })
}, { adminOnly: true })

const CreateUserSchema = z.object({
  email: z.string().email(),
  first_name: z.string().min(1),
  last_name: z.string().min(1),
  role: z.enum(['staff', 'admin']),
})

export const POST = withAdminAuth(async (request: NextRequest) => {
  const parsed = await parseJsonBody(request, CreateUserSchema)
  if (!parsed.ok) return parsed.response

  // Generate temp password — shown once, never stored in plain text
  const tempPassword = `Reci-${crypto.randomUUID().slice(0, 8).toUpperCase()}!`

  const supabase = createAdminClient()

  // Never take over an existing account: replacing the password and role of someone who already has a login (for example a
  // customer) would lock them out and hand their account to a new owner. Existing emails are refused; Supabase also rejects
  // duplicates, which covers installs with more than one page of users.
  const { data: { users: existingUsers } } = await supabase.auth.admin.listUsers({ perPage: 1000 })
  if (existingUsers.some((u) => u.email?.toLowerCase() === parsed.data.email.toLowerCase())) {
    return NextResponse.json({ error: 'An account with this email already exists. Use a different email address.' }, { status: 409 })
  }

  // New user — create auth entry (email_confirm=true skips verification email)
  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email: parsed.data.email,
    password: tempPassword,
    email_confirm: true,
    user_metadata: {
      first_name: parsed.data.first_name,
      last_name: parsed.data.last_name,
    },
    // Keep the JWT's app_metadata.role claim in sync with user_profiles.role (documented "Two-Layer Check" in CLAUDE.md).
    app_metadata: { role: parsed.data.role },
  })
  if (authError) {
    return NextResponse.json({ error: authError.message }, { status: authError.status === 422 ? 409 : 400 })
  }
  const userId = authData.user.id

  // Update profile — role + names + force reset flag
  const { error: profileError } = await supabase
    .from('user_profiles')
    .update({
      role: parsed.data.role,
      first_name: parsed.data.first_name,
      last_name: parsed.data.last_name,
      password_reset_required: true,
    })
    .eq('id', userId)

  if (profileError) {
    // Compensating action: remove the auth user we just created
    await supabase.auth.admin.deleteUser(userId)
    return adminErrorResponse('admin/users', profileError)
  }

  return NextResponse.json(
    { id: userId, email: parsed.data.email, temp_password: tempPassword },
    { status: 201 }
  )
}, { adminOnly: true })
