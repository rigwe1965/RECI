import { licenceStatus, type LicenceStatus } from '@reci/utils/licence'
import { createAdminClient } from '@/lib/supabase/admin'

/** Vehicles in use: the active ones. A retired vehicle (is_active = false) does not count. */
async function countActiveVehicles(): Promise<number> {
  const { count, error } = await createAdminClient().from('vehicles').select('id', { count: 'exact', head: true }).eq('is_active', true)
  if (error) throw new Error(`Could not count vehicles: ${error.message}`)
  return count ?? 0
}

/**
 * The licence position of this deployment. On every deployment that has not switched LICENCE_ENFORCEMENT=1 on, this
 * returns "not enforced" without touching the database, so nothing changes until a copy is sold.
 */
export function getLicenceStatus(): Promise<LicenceStatus> {
  return licenceStatus({ LICENCE_ENFORCEMENT: process.env.LICENCE_ENFORCEMENT, LICENCE_KEY: process.env.LICENCE_KEY }, countActiveVehicles)
}

/** The refusal an admin sees when a licence does not allow another vehicle. Everything already set up keeps working. */
export function licenceRefusal(status: LicenceStatus) {
  return { error: status.banner ?? 'Your licence does not allow adding more vehicles.', code: 'LICENCE_LIMIT' as const }
}
