import { adminErrorResponse } from '@/lib/errors'
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { withAdminAuth } from '@/lib/with-admin-auth'
import { z } from 'zod'
import { ADMIN_PORTAL_ROLES } from '@reci/types'
import { parseJsonBody } from '@reci/api'

export const dynamic = 'force-dynamic'

const PatchUserSchema = z.object({
  role: z.enum(['staff', 'admin']).optional(),
  first_name: z.string().min(1).optional(),
  last_name: z.string().min(1).optional(),
})

export const PATCH = withAdminAuth(async (request: NextRequest, props: { params: Promise<{ id: string }> }) => {
  const params = await props.params
  const parsed = await parseJsonBody(request, PatchUserSchema)
  if (!parsed.ok) return parsed.response

  if (Object.keys(parsed.data).length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
  }

  const supabase = createAdminClient()

  // Verify target is an internal user
  const { data: existing } = await supabase
    .from('user_profiles')
    .select('role')
    .eq('id', params.id)
    .single()

  if (!existing || !ADMIN_PORTAL_ROLES.includes(existing.role)) {
    return NextResponse.json({ error: 'User not found or not an internal user' }, { status: 404 })
  }

  const { data, error } = await supabase
    .from('user_profiles')
    .update(parsed.data)
    .eq('id', params.id)
    .select()
    .single()

  if (error) return adminErrorResponse('admin/users/[id]', error)

  // Keep the JWT's app_metadata.role claim in sync with user_profiles.role
  // (documented "Two-Layer Check" in CLAUDE.md) whenever role changes.
  if (parsed.data.role) {
    const { error: metaError } = await supabase.auth.admin.updateUserById(params.id, {
      app_metadata: { role: parsed.data.role },
    })
    if (metaError) {
      console.error('[admin/users PATCH] failed to sync app_metadata.role:', metaError)
    }
  }

  return NextResponse.json(data)
}, { adminOnly: true })

export const DELETE = withAdminAuth(async (_req: NextRequest, props: { params: Promise<{ id: string }> }) => {
  const params = await props.params
  const supabase = createAdminClient()

  // Verify target is an internal user before deleting
  const { data: existing } = await supabase
    .from('user_profiles')
    .select('role')
    .eq('id', params.id)
    .single()

  if (!existing || !ADMIN_PORTAL_ROLES.includes(existing.role)) {
    return NextResponse.json({ error: 'User not found or not an internal user' }, { status: 404 })
  }

  // Hard-delete from auth — cascades to user_profiles via ON DELETE CASCADE
  const { error } = await supabase.auth.admin.deleteUser(params.id)
  if (error) return adminErrorResponse('admin/users/[id]', error)
  return NextResponse.json({ success: true })
}, { adminOnly: true })
