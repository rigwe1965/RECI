import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin-server'
import { getUserFromRequest } from '@/lib/supabase/server'
import { ADMIN_PORTAL_ROLES } from '@reci/types'

async function assertAdmin(request: NextRequest) {
  const { user } = await getUserFromRequest(request)
  if (!user) return null
  const supabase = createAdminClient()
  const { data } = await supabase.from('user_profiles').select('role').eq('id', user.id).single()
  if (!data || !ADMIN_PORTAL_ROLES.includes(data.role)) return null
  return user
}

export async function PATCH(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  if (!(await assertAdmin(request))) {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 })
  }

  const supabase = createAdminClient()

  const { error } = await supabase
    .from('api_keys')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', params.id)
    .is('revoked_at', null) // idempotent — only revoke if not already revoked

  if (error) return NextResponse.json({ error: 'Failed to revoke key' }, { status: 500 })
  return NextResponse.json({ success: true })
}
