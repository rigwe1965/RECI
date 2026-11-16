/**
 * True for the admin portal's "clear my forced-password-reset flag" call: POST /api/admin/users/<id>/clear-reset
 * (path as the middleware sees it, i.e. without the /admin base path). A user who must change a temporary password has to
 * be able to make exactly this call, or the flag can never be cleared. The route itself checks the caller is that user.
 */
export function isClearResetPath(pathname: string, method: string): boolean {
  return method.toUpperCase() === 'POST' && /^\/api\/admin\/users\/[0-9a-fA-F-]{36}\/clear-reset\/?$/.test(pathname)
}
