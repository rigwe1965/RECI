import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { ADMIN_AI_MODEL_CHOICES, AI_MODEL_SETTING_KEY, parseStoredAiModel } from '@reci/utils'
import { parseJsonBody } from '@reci/api'
import { createAdminClient } from '@/lib/supabase/admin'
import { withAdminAuth } from '@/lib/with-admin-auth'
import { adminErrorResponse } from '@/lib/errors'
import { logAudit } from '@/lib/audit'

export const dynamic = 'force-dynamic'

/** What the admin can choose, in plain words for the settings card. */
const CHOICES = [
  { id: 'claude-haiku-5-5', label: 'Haiku 5.5', note: 'Fastest and cheapest. Good for everyday questions.' },
  { id: 'claude-sonnet-5-5', label: 'Sonnet 5.5', note: 'Balanced speed, quality and cost.' },
  { id: 'claude-opus-5-5', label: 'Opus 5.5', note: 'Most capable. Costs about twice as much as Sonnet.' },
] as const

const PutSchema = z.object({ model: z.enum(ADMIN_AI_MODEL_CHOICES).nullable() })

/** GET: the saved choice (null = the built-in models). Admins only. */
export const GET = withAdminAuth(async () => {
  const { data, error } = await createAdminClient().from('app_settings').select('value').eq('key', AI_MODEL_SETTING_KEY).maybeSingle()
  // A missing table (migration 015 not applied yet) reads as "no choice", so the card still opens.
  const model = error ? null : parseStoredAiModel(data?.value)
  return NextResponse.json({ model, choices: CHOICES, ready: !error })
}, { adminOnly: true })

/** PUT { model }: saves the choice, or clears it with null. Takes effect on the website within a minute. */
export const PUT = withAdminAuth(async (request: NextRequest, _ctx, session) => {
  const parsed = await parseJsonBody(request, PutSchema)
  if (!parsed.ok) return parsed.response
  const supabase = createAdminClient()

  const { data: before } = await supabase.from('app_settings').select('value').eq('key', AI_MODEL_SETTING_KEY).maybeSingle()

  const { error } = parsed.data.model === null
    ? await supabase.from('app_settings').delete().eq('key', AI_MODEL_SETTING_KEY)
    : await supabase.from('app_settings').upsert({ key: AI_MODEL_SETTING_KEY, value: parsed.data.model, updated_at: new Date().toISOString(), updated_by: session.userId })
  if (error) return adminErrorResponse('admin/ai-model', error)

  await logAudit({
    adminId: session.userId,
    adminEmail: session.email,
    action: 'ai_model.changed',
    resource: 'app_settings',
    resourceId: AI_MODEL_SETTING_KEY,
    details: { from: parseStoredAiModel(before?.value), to: parsed.data.model },
  })
  return NextResponse.json({ model: parsed.data.model })
}, { adminOnly: true })
