import { NextResponse } from 'next/server'
import { withAdminAuth } from '@/lib/with-admin-auth'
import { getLicenceStatus } from '@/lib/licence'

export const dynamic = 'force-dynamic'

/** GET: the licence position, for the banner. Admins only. Says "not_enforced" and nothing else until a licence is in force. */
export const GET = withAdminAuth(async () => {
  try {
    return NextResponse.json(await getLicenceStatus())
  } catch {
    // A failed count must never break the admin screen: show no banner.
    return NextResponse.json({ enforced: false, state: 'not_enforced', banner: null, canAddVehicle: true })
  }
}, { adminOnly: true })
