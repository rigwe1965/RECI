import { NextRequest, NextResponse } from 'next/server'
import { z, type ZodSchema } from 'zod'

export type ParsedBody<T> = { ok: true; data: T } | { ok: false; response: NextResponse }

/**
 * Parses a route handler's JSON body against a Zod schema, returning a
 * consistent 400 (invalid JSON) / 422 (schema mismatch) response shape.
 * Call sites check `.ok` and return `.response` directly on failure.
 */
export async function parseJsonBody<T>(request: NextRequest, schema: ZodSchema<T>): Promise<ParsedBody<T>> {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return { ok: false, response: NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }
  }
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return { ok: false, response: NextResponse.json({ error: z.flattenError(parsed.error) }, { status: 422 }) }
  }
  return { ok: true, data: parsed.data }
}
