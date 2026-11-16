/**
 * Read back an ISO timestamp whose "+" (timezone offset) was turned into a space on its way through a web address.
 * "2026-11-01T00:00:00 01:00" -> "2026-11-01T00:00:00+01:00". Anything else (including null) is returned unchanged.
 */
export function normalizeIsoOffset(value: string | null): string | null {
  if (value === null) return null
  return value.replace(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?) (\d{2}:\d{2})$/, '$1+$2')
}
