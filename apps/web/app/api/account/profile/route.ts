import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getUserFromRequest } from '@/lib/supabase/server'
import { parseJsonBody } from '@reci/api'

const UpdateProfileSchema = z.object({
  first_name: z.string().min(1).optional(),
  last_name: z.string().min(1).optional(),
  phone: z.string().min(6).optional(),
})

export async function GET(request: NextRequest) {
  const { supabase, user } = await getUserFromRequest(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('user_profiles')
    .select('id, email, first_name, last_name, phone, role, licence_verified, corporate_account_id, corporate_application_status')
    .eq('id', user.id)
    .single()

  if (error || !data) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })

  return NextResponse.json(data)
}

export async function PATCH(request: NextRequest) {
  const { supabase, user } = await getUserFromRequest(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const parsed = await parseJsonBody(request, UpdateProfileSchema)
  if (!parsed.ok) return parsed.response

  const { error } = await supabase
    .from('user_profiles')
    .update(parsed.data)
    .eq('id', user.id)

  if (error) return NextResponse.json({ error: 'Update failed' }, { status: 500 })

  return NextResponse.json({ success: true })
}
