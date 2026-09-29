import { NextRequest, NextResponse } from 'next/server'
import { assertAdminSession, assertAdminOnly, type AuthorizedSession } from './auth'

type RouteHandler<Ctx> = (request: NextRequest, ctx: Ctx, session: AuthorizedSession) => Promise<NextResponse>

export function withAdminAuth<Ctx = unknown>(
  handler: RouteHandler<Ctx>,
  opts: { adminOnly?: boolean } = {}
): (request: NextRequest, ctx: Ctx) => Promise<NextResponse> {
  return async (request, ctx) => {
    const session = await (opts.adminOnly ? assertAdminOnly() : assertAdminSession())
    if (!session.authorized) return session.response
    return handler(request, ctx, session)
  }
}
