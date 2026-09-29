import { adminErrorResponse } from '@/lib/errors'
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { assertAdminSession } from '@/lib/auth'
import { z } from 'zod'
import { parseJsonBody } from '@reci/api'

export const dynamic = 'force-dynamic'

const PatchSchema = z.object({
  base_rate_per_day: z.number().positive().optional(),
  effective_from: z.string().optional(),
  effective_to: z.string().nullable().optional(),
})

export async function PATCH(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await assertAdminSession()
  if (!session.authorized) return session.response

  const parsed = await parseJsonBody(request, PatchSchema)
  if (!parsed.ok) return parsed.response

  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('pricing_rules').update(parsed.data).eq('id', params.id).select().single()
  if (error) return adminErrorResponse('admin/pricing-rules/[id]', error)
  return NextResponse.json(data)
}

export async function DELETE(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await assertAdminSession()
  if (!session.authorized) return session.response

  const supabase = createAdminClient()
  const { error } = await supabase.from('pricing_rules').delete().eq('id', params.id)
  if (error) return adminErrorResponse('admin/pricing-rules/[id]', error)
  return NextResponse.json({ success: true })
}
