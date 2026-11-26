import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { withAdminAuth } from '@/lib/with-admin-auth'
import { z } from 'zod'
import { adminErrorResponse } from '@/lib/errors'
import { parseJsonBody } from '@reci/api'

export const dynamic = 'force-dynamic'

const CreateSchema = z.object({
  vehicle_id: z.guid(),
  start_date: z.string(),
  end_date: z.string(),
  reason: z.string().optional(),
})

export const GET = withAdminAuth(async () => {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('availability_blocks')
    .select('*, vehicle:vehicles(make, model, year, registration_plate)')
    .order('start_date', { ascending: false })
    .limit(500)
  if (error) return adminErrorResponse('admin/availability-blocks', error)
  return NextResponse.json(data)
})

export const POST = withAdminAuth(async (request: NextRequest) => {
  const parsed = await parseJsonBody(request, CreateSchema)
  if (!parsed.ok) return parsed.response

  const supabase = createAdminClient()
  const { data, error } = await supabase.from('availability_blocks').insert(parsed.data).select().single()
  if (error) return adminErrorResponse('admin/availability-blocks', error)
  return NextResponse.json(data, { status: 201 })
})
