import { NextResponse } from 'next/server'

// Never forward raw Postgres/Supabase error text to a client — it can include
// table/column/constraint names. Log the real error server-side and return a
// generic message instead. See audits/error-handling-audit-2026-09-29.md #4.
export function dbErrorResponse(context: string, error: unknown, status = 500): NextResponse {
  console.error(`[${context}]`, error)
  return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status })
}
