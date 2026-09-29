import { NextRequest, NextResponse } from 'next/server'

// Thin, opt-in error-handling wrapper for route handlers. Not a mandatory
// rewrite of every route — new routes and routes touched going forward should
// use it so unhandled exceptions get one consistent shape and one consistent
// log line instead of each route reinventing both.
// See audits/error-handling-audit-2026-09-29.md #6.
export class ApiError extends Error {
  constructor(public status: number, message: string, public details?: unknown) {
    super(message)
  }
}

type RouteHandler<Ctx> = (req: NextRequest, ctx: Ctx) => Promise<NextResponse>

export function withErrorHandling<Ctx = unknown>(handler: RouteHandler<Ctx>): RouteHandler<Ctx> {
  return async (req, ctx) => {
    try {
      return await handler(req, ctx)
    } catch (err) {
      if (err instanceof ApiError) {
        return NextResponse.json({ error: err.message, details: err.details }, { status: err.status })
      }
      console.error(`[unhandled route error] ${req.method} ${req.nextUrl.pathname}:`, err)
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
  }
}
