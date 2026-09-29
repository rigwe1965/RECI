import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin-server'
import { dbErrorResponse } from '@/lib/errors'

export const dynamic = 'force-dynamic'

export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()
  const { error } = await admin
    .from('user_profiles')
    .update({ password_reset_required: false })
    .eq('id', user.id)

  if (error) return dbErrorResponse('account/clear-reset', error)
  return NextResponse.json({ success: true })
}
