import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin-server'

const SUPABASE_CONFIGURED =
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
  process.env.NEXT_PUBLIC_SUPABASE_URL !== 'https://placeholder.supabase.co' &&
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY !== 'placeholder-anon-key'

function buildCspHeader(nonce: string): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' https://js.stripe.com`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: blob: https://*.supabase.co https://images.unsplash.com",
    "connect-src 'self' https://*.supabase.co https://api.stripe.com https://o*.ingest.sentry.io",
    "frame-src https://js.stripe.com https://hooks.stripe.com",
    "object-src 'none'",
    "base-uri 'self'",
  ].join('; ')
}

async function handleApiKeyAuth(request: NextRequest): Promise<NextResponse> {
  const apiKey = request.headers.get('x-api-key')
  if (!apiKey) {
    return NextResponse.json({ error: 'API key required. Send x-api-key header.' }, { status: 401 })
  }

  const encoder = new TextEncoder()
  const keyBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(apiKey))
  const keyHash = Array.from(new Uint8Array(keyBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')

  const supabase = createAdminClient()
  const { data: keyRow } = await supabase
    .from('api_keys')
    .select('id, revoked_at')
    .eq('key_hash', keyHash)
    .single()

  if (!keyRow) return NextResponse.json({ error: 'Invalid API key' }, { status: 401 })
  if (keyRow.revoked_at) return NextResponse.json({ error: 'API key revoked' }, { status: 401 })

  const DAILY_LIMIT = 100
  // Atomic check-and-increment (migration 013_atomic_api_key_usage.sql) —
  // avoids the read-then-write race a separate select+update would have.
  const { data: allowed, error: usageError } = await supabase.rpc('increment_api_key_usage', {
    p_key_id: keyRow.id,
    p_daily_limit: DAILY_LIMIT,
  })

  if (usageError) {
    console.error('[api-key-auth] increment_api_key_usage failed:', usageError)
    return NextResponse.json({ error: 'Rate limit check failed' }, { status: 500 })
  }

  if (!allowed) {
    const midnight = new Date()
    midnight.setUTCHours(24, 0, 0, 0)
    const retryAfter = Math.ceil((midnight.getTime() - Date.now()) / 1000)
    return NextResponse.json(
      { error: 'Daily rate limit exceeded (100 req/day)' },
      { status: 429, headers: { 'Retry-After': String(retryAfter) } }
    )
  }

  return NextResponse.next()
}

export async function middleware(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64')
  const cspHeader = buildCspHeader(nonce)

  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-nonce', nonce)

  // White-label API: API key auth, no session needed
  if (request.nextUrl.pathname.startsWith('/api/v1/ai/')) {
    const apiKeyResponse = await handleApiKeyAuth(request)
    apiKeyResponse.headers.set('Content-Security-Policy', cspHeader)
    return apiKeyResponse
  }

  const path = request.nextUrl.pathname
  const needsAuthCheck =
    SUPABASE_CONFIGURED &&
    (path.startsWith('/account') || path === '/auth/login' || path === '/auth/register')

  if (!needsAuthCheck) {
    const response = NextResponse.next({ request: { headers: requestHeaders } })
    response.headers.set('Content-Security-Policy', cspHeader)
    return response
  }

  let supabaseResponse = NextResponse.next({ request: { headers: requestHeaders } })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet: Array<{ name: string; value: string; options?: Record<string, unknown> }>) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request: { headers: requestHeaders } })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options as Parameters<typeof supabaseResponse.cookies.set>[2])
          )
        },
      },
    }
  )

  // Refresh session — MUST call getUser() not getSession() per Supabase SSR docs
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user && path.startsWith('/account')) {
    const loginUrl = request.nextUrl.clone()
    loginUrl.pathname = '/auth/login'
    loginUrl.searchParams.set('next', path)
    const response = NextResponse.redirect(loginUrl)
    response.headers.set('Content-Security-Policy', cspHeader)
    return response
  }

  // Force password reset for admin-created accounts accessing frontend
  if (user && path.startsWith('/account')) {
    const adminClient = createAdminClient()
    const { data: profile } = await adminClient
      .from('user_profiles')
      .select('password_reset_required')
      .eq('id', user.id)
      .single()

    if (profile?.password_reset_required) {
      const resetUrl = request.nextUrl.clone()
      resetUrl.pathname = '/auth/reset-password'
      resetUrl.searchParams.set('required', 'true')
      const response = NextResponse.redirect(resetUrl)
      response.headers.set('Content-Security-Policy', cspHeader)
      return response
    }
  }

  // Redirect logged-in users away from auth pages
  if (user && (path === '/auth/login' || path === '/auth/register')) {
    const accountUrl = request.nextUrl.clone()
    accountUrl.pathname = '/account/bookings'
    const response = NextResponse.redirect(accountUrl)
    response.headers.set('Content-Security-Policy', cspHeader)
    return response
  }

  supabaseResponse.headers.set('Content-Security-Policy', cspHeader)
  return supabaseResponse
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
