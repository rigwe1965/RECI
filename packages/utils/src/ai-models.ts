/**
 * Which Claude model each AI feature uses. A deployment picks models with environment variables (or an admin picks
 * one in the admin portal); with none set, each feature uses its default below. Only models Anthropic's Models API lists with image input,
 * PDF input and tool use are accepted (checked 2026-11-16), so a typo can never send a request to a model that
 * would reject it: an unknown value is ignored with a warning and the feature keeps working on its default.
 */
export type AiPurpose = 'chat' | 'search' | 'trip' | 'corporate' | 'extras' | 'maintenance' | 'vision'

/**
 * The model each feature uses when nothing is set. Customer-facing features use Sonnet 5.5; the two background features
 * use Haiku 5.5, the cheapest model. (Until 2026-11-25 these were Sonnet 4.6 and Haiku 4.5, which still can be set.)
 * None of these features forces a tool_choice, which Sonnet 5.5 would refuse.
 */
export const AI_MODEL_DEFAULTS: Record<AiPurpose, string> = {
  chat: 'claude-sonnet-5-5',
  search: 'claude-sonnet-5-5',
  trip: 'claude-sonnet-5-5',
  corporate: 'claude-sonnet-5-5',
  extras: 'claude-haiku-5-5', // runs on every extras page load: keep it cheap
  maintenance: 'claude-haiku-5-5',
  vision: 'claude-sonnet-5-5',
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

/** What an admin may pick in the admin portal (Settings > AI model). Empty = keep the built-in models. */
export const ADMIN_AI_MODEL_CHOICES = ['claude-haiku-5-5', 'claude-sonnet-5-5', 'claude-opus-5-5'] as const
export type AdminAiModel = (typeof ADMIN_AI_MODEL_CHOICES)[number]

/** The row in app_settings that holds the admin's choice. */
export const AI_MODEL_SETTING_KEY = 'ai_model'

/**
 * Features the admin's choice applies to. The two background features (extras suggestions run on every extras page
 * load; maintenance notes are a small summary) stay on their small default model so a big model cannot multiply cost.
 */
export const ADMIN_MODEL_PURPOSES: readonly AiPurpose[] = ['chat', 'search', 'trip', 'corporate', 'vision']

/** A stored value that is not one of the admin choices (a retired model, a hand edit) means "no choice". */
export function parseStoredAiModel(value: unknown): AdminAiModel | null {
  return typeof value === 'string' && (ADMIN_AI_MODEL_CHOICES as readonly string[]).includes(value) ? (value as AdminAiModel) : null
}

/**
 * Order of precedence: the server setting for one feature (AI_MODEL_CHAT ...), then the admin's saved choice,
 * then AI_MODEL, then the built-in model. `stored` is the admin's saved choice, if any.
 */
export function resolveAiModel(
  purpose: AiPurpose,
  env: Record<string, string | undefined> = process.env,
  warn: (message: string) => void = console.warn,
  stored: string | null = null,
): string {
  const fromEnv = (name: string): string | null => {
    const raw = env[name]?.trim()
    if (!raw) return null
    if (isAiModel(raw)) return raw
    warn(`[ai] ${name}="${raw}" is not a supported Claude model; ignoring it for ${purpose}.`)
    return null
  }
  const own = fromEnv(AI_MODEL_ENV[purpose])
  if (own) return own
  const chosen = ADMIN_MODEL_PURPOSES.includes(purpose) ? parseStoredAiModel(stored) : null
  if (chosen) return chosen
  return fromEnv('AI_MODEL') ?? AI_MODEL_DEFAULTS[purpose]
}

/**
 * Reads the admin's saved model choice through `read`, remembering it for a minute so a busy site does not query the
 * database on every AI request. It never throws: when `read` fails it keeps the last good value (or "no choice") and
 * waits a few seconds before asking again, so a database hiccup or a table that does not exist yet cannot break AI.
 */
export function createStoredModelReader(
  read: () => Promise<unknown>,
  opts: { freshMs?: number; retryMs?: number; now?: () => number } = {},
): () => Promise<AdminAiModel | null> {
  const { freshMs = 60_000, retryMs = 15_000, now = Date.now } = opts
  let cache: { at: number; ttl: number; value: AdminAiModel | null } | null = null
  return async () => {
    const t = now()
    if (cache && t - cache.at < cache.ttl) return cache.value
    try {
      cache = { at: t, ttl: freshMs, value: parseStoredAiModel(await read()) }
    } catch {
      cache = { at: t, ttl: retryMs, value: cache?.value ?? null }
    }
    return cache.value
  }
}
