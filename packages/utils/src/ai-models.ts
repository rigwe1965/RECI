/**
 * Which Claude model each AI feature uses. A deployment picks models with environment variables; with none set,
 * every feature uses exactly the model it always did. Only models Anthropic's Models API lists with image input,
 * PDF input and tool use are accepted (checked 2026-11-16), so a typo can never send a request to a model that
 * would reject it: an unknown value is ignored with a warning and the feature keeps working on its default.
 */
export type AiPurpose = 'chat' | 'search' | 'trip' | 'corporate' | 'extras' | 'maintenance' | 'vision'

/** What each feature used before models became selectable. */
export const AI_MODEL_DEFAULTS: Record<AiPurpose, string> = {
  chat: 'claude-sonnet-4-6',
  search: 'claude-sonnet-4-6',
  trip: 'claude-sonnet-4-6',
  corporate: 'claude-sonnet-4-6',
  extras: 'claude-haiku-4-5-20251001', // runs on every extras page load: keep it cheap
  maintenance: 'claude-haiku-4-5-20251001',
  vision: 'claude-sonnet-4-6',
}

export const AI_MODEL_CHOICES = [
  'claude-haiku-5-5',
  'claude-sonnet-5-5',
  'claude-opus-5-5',
  'claude-fable-5-2',
  'claude-sonnet-5',
  'claude-opus-5',
  'claude-opus-4-8',
  'claude-sonnet-4-6',
  'claude-opus-4-6',
  'claude-haiku-4-5-20251001',
] as const

/** The variable that overrides one feature. `AI_MODEL` overrides all features that have no variable of their own. */
export const AI_MODEL_ENV: Record<AiPurpose, string> = {
  chat: 'AI_MODEL_CHAT',
  search: 'AI_MODEL_SEARCH',
  trip: 'AI_MODEL_TRIP',
  corporate: 'AI_MODEL_CORPORATE',
  extras: 'AI_MODEL_EXTRAS',
  maintenance: 'AI_MODEL_MAINTENANCE',
  vision: 'AI_VISION_MODEL', // existing name, kept
}

export function isAiModel(id: unknown): id is (typeof AI_MODEL_CHOICES)[number] {
  return typeof id === 'string' && (AI_MODEL_CHOICES as readonly string[]).includes(id)
}

export function resolveAiModel(
  purpose: AiPurpose,
  env: Record<string, string | undefined> = process.env,
  warn: (message: string) => void = console.warn,
): string {
  for (const name of [AI_MODEL_ENV[purpose], 'AI_MODEL']) {
    const raw = env[name]?.trim()
    if (!raw) continue
    if (isAiModel(raw)) return raw
    warn(`[ai] ${name}="${raw}" is not a supported Claude model; using ${AI_MODEL_DEFAULTS[purpose]} for ${purpose}.`)
  }
  return AI_MODEL_DEFAULTS[purpose]
}
