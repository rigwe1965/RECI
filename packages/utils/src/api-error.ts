/**
 * Turns an API error body into one line of text a page can show.
 *
 * Routes answer `{ error: 'text' }`, but the ones that validate their input with zod answer
 * `{ error: { formErrors: string[], fieldErrors: { field: string[] } } }` (status 422). Putting that object
 * on screen crashes a React page ("Objects are not valid as a React child"), so pages pass the parsed body
 * through this instead of using `data.error` directly.
 */
export function apiErrorMessage(body: unknown, fallback: string): string {
  const error = body && typeof body === 'object' ? (body as { error?: unknown }).error : undefined
  if (typeof error === 'string' && error.trim()) return error
  if (error && typeof error === 'object') {
    const { formErrors, fieldErrors } = error as { formErrors?: unknown; fieldErrors?: unknown }
    if (Array.isArray(formErrors) && typeof formErrors[0] === 'string' && formErrors[0]) return formErrors[0]
    if (fieldErrors && typeof fieldErrors === 'object') {
      for (const [field, messages] of Object.entries(fieldErrors as Record<string, unknown>)) {
        if (Array.isArray(messages) && typeof messages[0] === 'string') return `${field.replace(/_/g, ' ')}: ${messages[0]}`
      }
    }
  }
  return fallback
}
