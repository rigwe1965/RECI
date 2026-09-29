import { adminErrorResponse } from '@/lib/errors'
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { withAdminAuth } from '@/lib/with-admin-auth'

export const dynamic = 'force-dynamic'

export const DELETE = withAdminAuth(async (_req: NextRequest, props: { params: Promise<{ id: string }> }) => {
  const params = await props.params
  const supabase = createAdminClient()
  const { error } = await supabase.from('pricing_overrides').delete().eq('id', params.id)
  if (error) return adminErrorResponse('admin/pricing-overrides/[id]', error)
  return NextResponse.json({ success: true })
})
