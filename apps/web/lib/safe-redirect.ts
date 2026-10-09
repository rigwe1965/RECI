const DEFAULT_NEXT = '/account/bookings'

/**
 * Validates a post-login `next` redirect target. Only same-origin relative
 * paths are allowed — anything else (absolute URLs, protocol-relative `//host`,
 * backslash tricks like `/\host`, control characters) falls back to the default.
 * Without this, `/auth/login?next=https://evil.example` is an open redirect.
 */
export function safeNextPath(next: string | null | undefined, fallback: string = DEFAULT_NEXT): string {
  if (!next || typeof next !== 'string') return fallback
  if (!next.startsWith('/')) return fallback
  if (next.startsWith('//') || next.startsWith('/\\')) return fallback
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f\\]/.test(next)) return fallback
  return next
}
