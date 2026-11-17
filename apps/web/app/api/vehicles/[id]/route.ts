import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { MOCK_VEHICLES } from '@/lib/mock-vehicles'

export const revalidate = 3600

export async function GET(_request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;

  // Same placeholder-only guard as the list route: local dev and CI have no database.
  if (process.env.NEXT_PUBLIC_SUPABASE_URL === 'https://placeholder.supabase.co') {
    const mock = MOCK_VEHICLES.find(v => v.id === params.id)
    return mock ? NextResponse.json(mock) : NextResponse.json({ error: 'Vehicle not found' }, { status: 404 })
  }

  const supabase = await createClient()

  const { data, error } = await supabase
    .from('vehicles')
    .select(`
      *,
      category:vehicle_categories(
        *,
        pricing:pricing_rules(base_rate_per_day)
      )
    `)
    .eq('id', params.id)
    .eq('is_active', true)
    .single()

  if (error || !data) {
    return NextResponse.json({ error: 'Vehicle not found' }, { status: 404 })
  }

  const category = data.category as { pricing?: Array<{ base_rate_per_day: number }> } & Record<string, unknown> | null
  const daily_rate = category?.pricing?.[0]?.base_rate_per_day ?? null
  const vehicle = data

  return NextResponse.json({ ...vehicle, daily_rate })
}
