import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin-server'
import { getUserFromRequest } from '@/lib/supabase/server'
import { ADMIN_PORTAL_ROLES } from '@reci/types'
import { parseJsonBody } from '@reci/api'
import { z } from 'zod'

const OverrideSchema = z.object({
  inspection_type: z.enum(['pickup', 'return']).default('return'),
  admin_override: z.boolean().optional(),
  admin_override_note: z.string().optional(),
})

export async function GET(request: NextRequest, props: { params: Promise<{ bookingId: string }> }) {
  const params = await props.params;
  const { user } = await getUserFromRequest(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const type = searchParams.get('type') // 'pickup' | 'return' | null (both)

  const supabase = createAdminClient()

  // Verify booking ownership (or admin role)
  const { data: booking } = await supabase
    .from('bookings')
    .select('id, user_id')
    .eq('id', params.bookingId)
    .single()

  if (!booking) return NextResponse.json({ error: 'Booking not found' }, { status: 404 })

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  const isAdmin = !!profile && ADMIN_PORTAL_ROLES.includes(profile.role)
  if (booking.user_id !== user.id && !isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let query = supabase
    .from('vehicle_inspections')
    .select('*')
    .eq('booking_id', params.bookingId)
    .order('created_at', { ascending: true })

  if (type) {
    query = query.eq('inspection_type', type)
  }

  const { data, error } = await query

  if (error) return NextResponse.json({ error: 'Failed to fetch inspections' }, { status: 500 })

  // If fetching a specific type, return the first record directly
  if (type && data.length > 0) {
    return NextResponse.json(data[0])
  }

  return NextResponse.json(data ?? [])
}

// Admin override endpoint
export async function PATCH(request: NextRequest, props: { params: Promise<{ bookingId: string }> }) {
  const params = await props.params;
  const { user } = await getUserFromRequest(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createAdminClient()

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile || !ADMIN_PORTAL_ROLES.includes(profile.role)) {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 })
  }

  const parsed = await parseJsonBody(request, OverrideSchema)
  if (!parsed.ok) return parsed.response
  const { inspection_type, admin_override, admin_override_note } = parsed.data

  const { error } = await supabase
    .from('vehicle_inspections')
    .update({
      admin_override,
      admin_override_note,
      admin_override_at: new Date().toISOString(),
    })
    .eq('booking_id', params.bookingId)
    .eq('inspection_type', inspection_type)

  if (error) return NextResponse.json({ error: 'Update failed' }, { status: 500 })

  // Clear dispute note from booking if admin overrides
  if (admin_override === false) {
    await supabase
      .from('bookings')
      .update({ notes: `Dispute cleared by staff: ${admin_override_note ?? ''}` })
      .eq('id', params.bookingId)
  }

  return NextResponse.json({ success: true })
}
