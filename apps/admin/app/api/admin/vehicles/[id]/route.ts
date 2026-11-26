import { adminErrorResponse } from '@/lib/errors'
import { getLicenceStatus, licenceRefusal } from '@/lib/licence'
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { withAdminAuth } from '@/lib/with-admin-auth'
import { z } from 'zod'
import { FUEL_TYPES, TRANSMISSIONS } from '@reci/types'
import { parseJsonBody } from '@reci/api'

export const dynamic = 'force-dynamic'

const PatchVehicleSchema = z.object({
  make: z.string().min(1).optional(),
  model: z.string().min(1).optional(),
  year: z.number().int().optional(),
  registration_plate: z.string().min(1).optional(),
  category_id: z.guid().optional(),
  location_id: z.guid().optional(),
  fuel_type: z.enum(FUEL_TYPES).optional(),
  transmission: z.enum(TRANSMISSIONS).optional(),
  color: z.string().optional(),
  seats: z.number().int().optional(),
  mileage: z.number().int().optional(),
  last_service_mileage: z.number().int().min(0).optional(),
  last_service_date: z.string().optional(),
  image_url: z.string().url().optional(),
  is_active: z.boolean().optional(),
  guaranteed_model: z.boolean().optional(),
})

export const GET = withAdminAuth(async (_req: NextRequest, props: { params: Promise<{ id: string }> }) => {
  const params = await props.params
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('vehicles')
    .select('*, category:vehicle_categories(id, name, tier), location:locations(id, name)')
    .eq('id', params.id)
    .single()

  if (error || !data) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(data)
})

export const PATCH = withAdminAuth(async (request: NextRequest, props: { params: Promise<{ id: string }> }) => {
  const params = await props.params
  const parsed = await parseJsonBody(request, PatchVehicleSchema)
  if (!parsed.ok) return parsed.response

  const supabase = createAdminClient()

  // Bringing a retired vehicle back is adding one, so a licence limit applies. Nothing else here is ever refused.
  if (parsed.data.is_active === true) {
    const licence = await getLicenceStatus()
    if (!licence.canAddVehicle) {
      const { data: current } = await supabase.from('vehicles').select('is_active').eq('id', params.id).maybeSingle()
      if (current && current.is_active === false) return NextResponse.json(licenceRefusal(licence), { status: 403 })
    }
  }

  const { data, error } = await supabase
    .from('vehicles')
    .update(parsed.data)
    .eq('id', params.id)
    .select()
    .single()

  if (error) return adminErrorResponse('admin/vehicles/[id]', error)
  return NextResponse.json(data)
})

export const DELETE = withAdminAuth(async (_req: NextRequest, props: { params: Promise<{ id: string }> }) => {
  const params = await props.params
  const supabase = createAdminClient()
  const { error } = await supabase
    .from('vehicles')
    .update({ is_active: false })
    .eq('id', params.id)

  if (error) return adminErrorResponse('admin/vehicles/[id]', error)
  return NextResponse.json({ success: true })
})
