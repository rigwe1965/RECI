import { NextResponse } from 'next/server'

// Admin routes are behind assertAdminSession()/assertAdminOnly(), so some
// detail is acceptable for a trusted, authenticated staff audience — but it's
// still routed through one place so NODE_ENV gating or message-shape changes
// only need to happen once. See audits/error-handling-audit-2026-09-29.md #4.
export function adminErrorResponse(context: string, error: { message: string }, status = 500): NextResponse {
  console.error(`[${context}]`, error)
  const detail = process.env.NODE_ENV === 'production' ? undefined : error.message
  return NextResponse.json({ error: 'Request failed', detail }, { status })
}
