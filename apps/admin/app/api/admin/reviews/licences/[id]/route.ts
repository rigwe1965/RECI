import { adminErrorResponse } from '@/lib/errors'
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { withAdminAuth } from '@/lib/with-admin-auth'
import { logAudit } from '@/lib/audit'
import { z } from 'zod'
import { parseJsonBody } from '@reci/api'

export const dynamic = 'force-dynamic'

const PatchSchema = z.object({
  action: z.enum(['approve', 'reject']),
  note: z.string().optional(),
  // Staff-corrected fields (approve only)
  name: z.string().optional(),
  licence_number: z.string().optional(),
  expiry_date: z.string().optional(),
})

export const PATCH = withAdminAuth(async (request: NextRequest, props: { params: Promise<{ id: string }> }, session) => {
  const params = await props.params
  const parsed = await parseJsonBody(request, PatchSchema)
  if (!parsed.ok) return parsed.response

  const supabase = createAdminClient()

  const { data: existing, error: fetchErr } = await supabase
    .from('licence_verifications')
    .select('id, user_id, extracted_data, status')
    .eq('id', params.id)
    .single()

  if (fetchErr || !existing) {
    return NextResponse.json({ error: 'Licence verification not found' }, { status: 404 })
  }

  const { action, note, name, licence_number, expiry_date } = parsed.data

  if (action === 'approve') {
    // Merge any staff corrections into extracted_data
    const corrected = {
      ...existing.extracted_data,
      ...(name ? { name } : {}),
      ...(licence_number ? { licence_number } : {}),
      ...(expiry_date ? { expiry_date } : {}),
    }

    const { error: updateErr } = await supabase
      .from('licence_verifications')
      .update({
        status: 'verified',
        admin_override: true,
        admin_note: note ?? null,
        verified_at: new Date().toISOString(),
        extracted_data: corrected,
      })
      .eq('id', params.id)

    if (updateErr) {
      return adminErrorResponse('admin/reviews/licences/[id]', updateErr)
    }

    // Now mark user profile as verified
    const { error: profileErr } = await supabase
      .from('user_profiles')
      .update({ licence_verified: true })
      .eq('id', existing.user_id)

    if (profileErr) {
      console.error('[reviews/licences] Failed to update user_profiles:', profileErr)
      return NextResponse.json(
        { error: 'Licence marked verified in system but user profile update failed — user not yet verified. Retry or update manually.' },
        { status: 500 }
      )
    }

    void logAudit({ adminId: session.userId, adminEmail: session.email, action: 'licence.approved', resource: 'licence_verifications', resourceId: params.id })
    return NextResponse.json({ success: true, action: 'approved' })
  }

  // Reject
  const { error: rejectErr } = await supabase
    .from('licence_verifications')
    .update({
      status: 'failed',
      admin_override: false,
      admin_note: note ?? null,
    })
    .eq('id', params.id)

  if (rejectErr) {
    return adminErrorResponse('admin/reviews/licences/[id]', rejectErr)
  }

  void logAudit({ adminId: session.userId, adminEmail: session.email, action: 'licence.rejected', resource: 'licence_verifications', resourceId: params.id, details: { note } })
  return NextResponse.json({ success: true, action: 'rejected' })
})
