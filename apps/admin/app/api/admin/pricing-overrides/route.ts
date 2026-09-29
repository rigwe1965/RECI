import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { withAdminAuth } from '@/lib/with-admin-auth'
import { z } from 'zod'
import { adminErrorResponse } from '@/lib/errors'
import { parseJsonBody } from '@reci/api'

export const dynamic = 'force-dynamic'

const CreateSchema = z.object({
  name: z.string().min(1),
  start_date: z.string(),
  end_date: z.string(),
  surcharge_pct: z.number().min(0).optional(),
  flat_surcharge: z.number().min(0).optional(),
  category_id: z.string().uuid().nullable().optional(),
})

export const GET = withAdminAuth(async () => {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('pricing_overrides')
    .select('*, category:vehicle_categories(name)')
    .order('start_date', { ascending: false })
    .limit(500)
  if (error) return adminErrorResponse('admin/pricing-overrides', error)
  return NextResponse.json(data)
})

export const POST = withAdminAuth(async (request: NextRequest) => {
  const parsed = await parseJsonBody(request, CreateSchema)
  if (!parsed.ok) return parsed.response

  const supabase = createAdminClient()
  const { data, error } = await supabase.from('pricing_overrides').insert(parsed.data).select().single()
  if (error) return adminErrorResponse('admin/pricing-overrides', error)
  return NextResponse.json(data, { status: 201 })
})
