import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

const SUPABASE_CONFIGURED =
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
  process.env.NEXT_PUBLIC_SUPABASE_URL !== 'https://placeholder.supabase.co' &&
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY !== 'placeholder-anon-key'

function buildCspHeader(nonce: string): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: blob: https://*.supabase.co https://images.unsplash.com",
    "connect-src 'self' https://*.supabase.co https://o*.ingest.sentry.io",
    "object-src 'none'",
    "base-uri 'self'",
  ].join('; ')
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  const nonce = Buffer.from(crypto.randomUUID()).toString('base64')
  const cspHeader = buildCspHeader(nonce)
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-nonce', nonce)

  const withCsp = (response: NextResponse): NextResponse => {
    response.headers.set('Content-Security-Policy', cspHeader)
    return response
  }

  // Allow all auth pages through (login, forgot-password, reset-password)
  if (pathname.startsWith('/auth/')) {
    return withCsp(NextResponse.next({ request: { headers: requestHeaders } }))
  }

  if (!SUPABASE_CONFIGURED) return withCsp(NextResponse.next({ request: { headers: requestHeaders } }))

  const response = NextResponse.next({ request: { headers: requestHeaders } })

  // SSR client to check session
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet: { name: string; value: string; options?: object }[]) {
          cookiesToSet.forEach(({ name, value, options }) => {
            request.cookies.set(name, value)
            response.cookies.set(name, value, options as Parameters<typeof response.cookies.set>[2])
          })
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    if (pathname.startsWith('/api/')) {
      return withCsp(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }))
    }
    const loginUrl = request.nextUrl.clone()
    loginUrl.pathname = '/auth/login'
    return withCsp(NextResponse.redirect(loginUrl))
  }

  // Role check via service role client
  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('user_profiles')
    .select('role, password_reset_required')
    .eq('id', user.id)
    .single()

  if (!profile || !['admin', 'staff'].includes(profile.role)) {
    if (pathname.startsWith('/api/')) {
      return withCsp(NextResponse.json({ error: 'Forbidden' }, { status: 403 }))
    }
    const loginUrl = request.nextUrl.clone()
    loginUrl.pathname = '/auth/login'
    loginUrl.searchParams.set('error', 'unauthorized')
    return withCsp(NextResponse.redirect(loginUrl))
  }

  // Force password reset for admin-created accounts on first login
  if (profile.password_reset_required && !pathname.startsWith('/auth/reset-password')) {
    if (pathname.startsWith('/api/')) {
      return withCsp(NextResponse.json({ error: 'Password reset required' }, { status: 403 }))
    }
    const resetUrl = request.nextUrl.clone()
    resetUrl.pathname = '/auth/reset-password'
    resetUrl.searchParams.set('required', 'true')
    return withCsp(NextResponse.redirect(resetUrl))
  }

  return withCsp(response)
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
