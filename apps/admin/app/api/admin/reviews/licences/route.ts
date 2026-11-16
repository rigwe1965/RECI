import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { assertAdminSession } from '@/lib/auth'
import { SUPABASE_CONFIGURED } from '@/lib/mock-data'
import { adminErrorResponse } from '@/lib/errors'

export const dynamic = 'force-dynamic'

export async function GET(_req: NextRequest) {
  if (!SUPABASE_CONFIGURED) {
    return NextResponse.json({ licences: [], total: 0 })
  }

  const session = await assertAdminSession()
  if (!session.authorized) return session.response

  const supabase = createAdminClient()

  // A licence waits for staff while its status is still 'pending'; approving or rejecting changes the status.
  // (admin_override defaults to FALSE in the database, so it cannot tell "undecided" from "decided".)
  const { data, error, count } = await supabase
    .from('licence_verifications')
    .select('id, user_id, confidence, status, created_at, extracted_data', { count: 'exact' })
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(50)

  if (error) {
    return adminErrorResponse('admin/reviews/licences', error)
  }

  // licence_verifications.user_id points at auth.users, not user_profiles, so PostgREST cannot join them: look the people up separately.
  const userIds = [...new Set((data ?? []).map((l) => l.user_id))]
  const { data: profiles, error: profileError } = userIds.length
    ? await supabase.from('user_profiles').select('id, first_name, last_name, email').in('id', userIds)
    : { data: [], error: null }
  if (profileError) {
    return adminErrorResponse('admin/reviews/licences', profileError)
  }
  const byId = new Map((profiles ?? []).map((p) => [p.id, p]))
  const licences = (data ?? [])
    .filter((l) => byId.has(l.user_id))
    .map((l) => {
      const p = byId.get(l.user_id)!
      return { ...l, profile: { first_name: p.first_name, last_name: p.last_name, email: p.email } }
    })

  return NextResponse.json({ licences, total: licences.length === (data ?? []).length ? (count ?? 0) : licences.length })
}
