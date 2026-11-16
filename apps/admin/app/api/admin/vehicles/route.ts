import { getLicenceStatus, licenceRefusal } from '@/lib/licence'
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { withAdminAuth } from '@/lib/with-admin-auth'
import { z } from 'zod'
import { adminErrorResponse } from '@/lib/errors'
import { FUEL_TYPES, TRANSMISSIONS } from '@reci/types'
import { parseJsonBody } from '@reci/api'

export const dynamic = 'force-dynamic'

const CreateVehicleSchema = z.object({
  make: z.string().min(1),
  model: z.string().min(1),
  year: z.number().int().min(2000).max(2030),
  registration_plate: z.string().min(1),
  category_id: z.string().uuid(),
  location_id: z.string().uuid(),
  fuel_type: z.enum(FUEL_TYPES),
  transmission: z.enum(TRANSMISSIONS),
  color: z.string().min(1),
  seats: z.number().int().min(1).max(20).optional(),
  mileage: z.number().int().min(0).optional(),
  image_url: z.string().url().optional(),
})

export const GET = withAdminAuth(async (request: NextRequest) => {
  const { searchParams } = request.nextUrl
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10))
  const perPage = Math.min(50, parseInt(searchParams.get('perPage') ?? '20', 10))
  const from = (page - 1) * perPage
  const to = from + perPage - 1

  const supabase = createAdminClient()
  const { data, error, count } = await supabase
    .from('vehicles')
    .select('*, category:vehicle_categories(name, tier), location:locations(name)', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, to)

  if (error) return adminErrorResponse('admin/vehicles', error)
  return NextResponse.json({ vehicles: data, total: count ?? 0, page, per_page: perPage })
})

export const POST = withAdminAuth(async (request: NextRequest) => {
  const parsed = await parseJsonBody(request, CreateVehicleSchema)
  if (!parsed.ok) return parsed.response

  // Adding a vehicle is the one thing a licence can refuse. Unless LICENCE_ENFORCEMENT=1 this passes without a query.
  const licence = await getLicenceStatus()
  if (!licence.canAddVehicle) return NextResponse.json(licenceRefusal(licence), { status: 403 })

  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('vehicles')
    .insert({ ...parsed.data, is_active: true })
    .select()
    .single()

  if (error) return adminErrorResponse('admin/vehicles', error)
  return NextResponse.json(data, { status: 201 })
})
