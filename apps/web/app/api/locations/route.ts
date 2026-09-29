import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin-server'
import { dbErrorResponse } from '@/lib/errors'

// `revalidate` (ISR) made Next.js execute this handler at *build* time to
// seed the cache, which requires real Supabase credentials — that broke the
// CI build, which only has placeholder secrets (works fine on Vercel, where
// real secrets are present at build time, which is why this was never
// caught). `force-dynamic` runs it per-request instead, and the 24h caching
// moves to the Cache-Control header so Vercel's edge/CDN still caches it —
// no build-time DB access required.
export const dynamic = 'force-dynamic'

export async function GET() {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('locations')
    .select('id, name, city')
    .order('city')

  if (error) return dbErrorResponse('locations', error)
  return NextResponse.json(data, {
    headers: { 'Cache-Control': 's-maxage=86400, stale-while-revalidate=3600' },
  })
}
