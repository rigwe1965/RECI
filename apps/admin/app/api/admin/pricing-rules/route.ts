import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { withAdminAuth } from '@/lib/with-admin-auth'
import { z } from 'zod'
import { adminErrorResponse } from '@/lib/errors'
import { parseJsonBody } from '@reci/api'

export const dynamic = 'force-dynamic'

const CreateSchema = z.object({
  category_id: z.string().uuid(),
  base_rate_per_day: z.number().positive(),
  effective_from: z.string(),
  effective_to: z.string().nullable().optional(),
})

export const GET = withAdminAuth(async () => {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('pricing_rules')
    .select('*, category:vehicle_categories(name, tier)')
    .order('effective_from', { ascending: false })
    .limit(500)
  if (error) return adminErrorResponse('admin/pricing-rules', error)
  return NextResponse.json(data)
})

export const POST = withAdminAuth(async (request: NextRequest) => {
  const parsed = await parseJsonBody(request, CreateSchema)
  if (!parsed.ok) return parsed.response

  const supabase = createAdminClient()
  const { data, error } = await supabase.from('pricing_rules').insert(parsed.data).select().single()
  if (error) return adminErrorResponse('admin/pricing-rules', error)
  return NextResponse.json(data, { status: 201 })
})
