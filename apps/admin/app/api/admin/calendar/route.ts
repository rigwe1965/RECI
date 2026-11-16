import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { withAdminAuth } from '@/lib/with-admin-auth'
import { adminErrorResponse } from '@/lib/errors'
import { normalizeIsoOffset } from '@reci/utils'

export const dynamic = 'force-dynamic'

const STATUS_COLORS: Record<string, string> = {
  pending: '#F97316',
  confirmed: '#407E3C',
  active: '#3B82F6',
  completed: '#9CA3AF',
  cancelled: '#DC2626',
  no_show: '#7C3AED',
  payment_failed: '#EF4444',
}

export const GET = withAdminAuth(async (request: NextRequest) => {
  const { searchParams } = request.nextUrl
  // A '+' in a timezone offset (+01:00) arrives as a space when the caller did not encode it; read it back as '+'.
  const start = normalizeIsoOffset(searchParams.get('start'))
  const end = normalizeIsoOffset(searchParams.get('end'))

  if (!start || !end) {
    return NextResponse.json({ error: 'start and end required' }, { status: 400 })
  }

  try {
    const supabase = createAdminClient()

    const [{ data: vehicles, error: vErr }, { data: bookings, error: bErr }, { data: blocks, error: blErr }] = await Promise.all([
      supabase
        .from('vehicles')
        .select('id, make, model, year, registration_plate')
        .eq('is_active', true)
        .order('make'),
      supabase
        .from('bookings')
        .select('id, booking_ref, vehicle_id, pickup_datetime, dropoff_datetime, status, driver_first_name, driver_last_name')
        .gte('dropoff_datetime', start)
        .lte('pickup_datetime', end)
        .in('status', ['pending', 'confirmed', 'active', 'completed']),
      supabase
        .from('availability_blocks')
        .select('id, vehicle_id, start_date, end_date, reason')
        .gte('end_date', start.split('T')[0])
        .lte('start_date', end.split('T')[0]),
    ])

    if (vErr) return adminErrorResponse('admin/calendar', vErr)
    if (bErr) return adminErrorResponse('admin/calendar', bErr)
    if (blErr) return adminErrorResponse('admin/calendar', blErr)

    const resources = (vehicles ?? []).map((v) => ({
      id: v.id,
      title: `${v.year} ${v.make} ${v.model} · ${v.registration_plate}`,
    }))

    const bookingEvents = (bookings ?? []).map((b) => ({
      id: b.id,
      resourceId: b.vehicle_id,
      title: `${b.booking_ref} · ${b.driver_first_name} ${b.driver_last_name}`,
      start: b.pickup_datetime,
      end: b.dropoff_datetime,
      color: STATUS_COLORS[b.status] ?? '#6B7280',
      extendedProps: { type: 'booking', status: b.status },
    }))

    const blockEvents = (blocks ?? []).map((bl) => ({
      id: `block-${bl.id}`,
      resourceId: bl.vehicle_id,
      title: bl.reason ?? 'Blocked',
      start: bl.start_date,
      end: bl.end_date,
      color: '#374151',
      extendedProps: { type: 'block' },
    }))

    return NextResponse.json({
      resources,
      events: [...bookingEvents, ...blockEvents],
    })
  } catch (err) {
    console.error('[calendar API]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
})
