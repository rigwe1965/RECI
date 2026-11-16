import { AI_MODEL_SETTING_KEY, createStoredModelReader, resolveAiModel, type AiPurpose } from '@reci/utils'
import { createAdminClient } from '@/lib/supabase/admin-server'

/**
 * The model for one AI feature: a server setting for that feature, else the model an admin picked in the admin
 * portal (Settings > AI model), else AI_MODEL, else the built-in model. It never throws: if the setting cannot be
 * read (table not created yet, database hiccup) the feature simply runs on the built-in model. An admin's change
 * reaches every running instance within a minute.
 */
const readStored = createStoredModelReader(async () => {
  const { data, error } = await createAdminClient().from('app_settings').select('value').eq('key', AI_MODEL_SETTING_KEY).maybeSingle()
  if (error) throw error
  return data?.value
})

export async function getAiModel(purpose: AiPurpose): Promise<string> {
  return resolveAiModel(purpose, process.env, console.warn, await readStored())
}
