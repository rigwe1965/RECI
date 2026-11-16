/**
 * Signed licences for white-label copies of RECI (reference: licensing/licence.mjs in the ProjectsDashboard repo;
 * licensing/test-vectors.json is the contract and is replayed in licence.test.ts).
 *
 * SERVER ONLY. It uses node:crypto, so it is imported as `@reci/utils/licence` and is deliberately not part of the
 * main `@reci/utils` barrel, which browser code imports.
 *
 * A licence is one line: FKL1.<base64url JSON payload>.<base64url Ed25519 signature>. It is checked offline against the
 * owner's public key. This module decides whether a licence is genuine and what it allows; it never switches anything off.
 * A deployment over its limit, or with a lapsed licence, may only be refused when ADDING something.
 */
import { createPublicKey, verify as edVerify } from 'node:crypto'

export const FORMAT = 'FKL1'
export const GRACE_DAYS = 30
export const EXPIRY_WARNING_DAYS = 30
const DAY_MS = 86_400_000

/** The owner's public key (raw 32 bytes, base64url). The matching private key never leaves the owner. */
export const BUILT_IN_PUBLIC_KEYS: readonly string[] = ['YgAlykUDmOaANaYUOgaOA4-2bFR8gTf-Y8mkPwTqRzU']

const SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex')
const fromB64u = (s: string) => Buffer.from(s, 'base64url')

export interface LicencePayload {
  v: 1
  id: string
  product: string
  customer: string
  tier: string
  iat: string
  exp: string
  limits: Record<string, number | null>
}

export type VerifyResult =
  | { ok: true; licence: LicencePayload }
  | { ok: false; reason: 'malformed' | 'unsupported' | 'bad_signature' | 'wrong_product' }

const isIsoDate = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}(T[\d:.]+Z)?$/.test(s) && !Number.isNaN(Date.parse(s))

function checkPayload(p: unknown): LicencePayload {
  const fail = (m: string): never => {
    throw new Error(`Licence is not valid: ${m}`)
  }
  if (!p || typeof p !== 'object' || Array.isArray(p)) return fail('it is not an object')
  const o = p as Record<string, unknown>
  if (o.v !== 1) fail('unsupported version')
  for (const k of ['id', 'product', 'customer', 'tier']) if (typeof o[k] !== 'string' || !(o[k] as string).trim()) fail(`${k} is missing`)
  if (!/^[a-z0-9-]{2,40}$/.test(o.product as string)) fail('product must be lower-case letters, digits and hyphens')
  if (!isIsoDate(o.iat) || !isIsoDate(o.exp)) fail('dates must be ISO dates')
  if (Date.parse(o.exp as string) <= Date.parse(o.iat as string)) fail('the end date must be after the start date')
  const limits = o.limits
  if (!limits || typeof limits !== 'object' || Array.isArray(limits)) fail('limits are missing')
  for (const [k, v] of Object.entries(limits as Record<string, unknown>)) {
    if (!/^[a-z]{2,20}$/.test(k)) fail(`limit name "${k}" is not allowed`)
    if (v !== null && !(Number.isInteger(v) && (v as number) >= 0)) fail(`limit "${k}" must be a whole number, or null for unlimited`)
  }
  return o as unknown as LicencePayload
}

/** Is the text a genuine licence, signed by one of `publicKeys`, for `product`? Dates are not looked at here. */
export function verify(token: unknown, opts: { publicKeys?: readonly string[]; product?: string } = {}): VerifyResult {
  const parts = typeof token === 'string' ? token.trim().split('.') : []
  if (parts.length !== 3) return { ok: false, reason: 'malformed' }
  if (parts[0] !== FORMAT) return { ok: false, reason: parts[0].startsWith('FKL') ? 'unsupported' : 'malformed' }
  let payload: LicencePayload
  let signature: Buffer
  try {
    payload = checkPayload(JSON.parse(fromB64u(parts[1]).toString('utf8')))
    signature = fromB64u(parts[2])
  } catch {
    return { ok: false, reason: 'malformed' }
  }
  const body = Buffer.from(`${parts[0]}.${parts[1]}`)
  const signedByOwner = (opts.publicKeys ?? []).some((raw) => {
    try {
      const key = createPublicKey({ key: Buffer.concat([SPKI_PREFIX, fromB64u(raw)]), format: 'der', type: 'spki' })
      return edVerify(null, body, key, signature)
    } catch {
      return false
    }
  })
  if (!signedByOwner) return { ok: false, reason: 'bad_signature' }
  if (opts.product && payload.product !== opts.product) return { ok: false, reason: 'wrong_product' }
  return { ok: true, licence: payload }
}

const dateOnly = (ms: number) => new Date(ms).toISOString().slice(0, 10)

export type LicenceState = 'active' | 'expiring' | 'grace' | 'lapsed'

export interface Evaluation {
  state: LicenceState
  daysLeft: number
  endsOn: string
  graceEndsOn: string
  limits: Record<string, number | null>
  usage: Record<string, number>
  canAdd: Record<string, boolean>
  over: Record<string, { used: number; limit: number }>
  banner: string | null
}

/** What a verified licence allows at `now` given current `usage`. Never decides to switch anything off. */
export function evaluate(licence: LicencePayload, now: Date | string = new Date(), usage: Record<string, number> = {}): Evaluation {
  const t = now instanceof Date ? now.getTime() : Date.parse(now)
  const end = Date.parse(licence.exp)
  const daysLeft = Math.ceil((end - t) / DAY_MS) + 0 // + 0 turns -0 into 0
  const graceEnd = end + GRACE_DAYS * DAY_MS
  const state: LicenceState = t < end - EXPIRY_WARNING_DAYS * DAY_MS ? 'active' : t < end ? 'expiring' : t < graceEnd ? 'grace' : 'lapsed'
  const canAdd: Record<string, boolean> = {}
  const over: Record<string, { used: number; limit: number }> = {}
  for (const [name, limit] of Object.entries(licence.limits)) {
    const used = usage[name] ?? 0
    canAdd[name] = state !== 'lapsed' && (limit === null || used < limit)
    if (limit !== null && used > limit) over[name] = { used, limit }
  }
  const notes: string[] = []
  if (state === 'expiring') notes.push(`Your licence ends on ${dateOnly(end)}. Renew it to keep adding more.`)
  if (state === 'grace') notes.push(`Your licence ended on ${dateOnly(end)}. You can keep adding until ${dateOnly(graceEnd)}; renew it to continue after that.`)
  if (state === 'lapsed') notes.push(`Your licence ended on ${dateOnly(end)}. Everything you have keeps working, but you cannot add more until it is renewed.`)
  for (const [name, o] of Object.entries(over)) notes.push(`You are using ${o.used} ${name}; your licence covers ${o.limit}.`)
  return { state, daysLeft, endsOn: dateOnly(end), graceEndsOn: dateOnly(graceEnd), limits: licence.limits, usage, canAdd, over, banner: notes.length ? notes.join(' ') : null }
}

export const PRODUCT = 'reci'

export interface LicenceEnv {
  LICENCE_ENFORCEMENT?: string
  LICENCE_KEY?: string
}

export interface LicenceStatus {
  /** False on every deployment until a licence is being enforced; then nothing below applies. */
  enforced: boolean
  state: 'not_enforced' | 'unlicensed' | LicenceState
  banner: string | null
  /** May another vehicle be added right now? */
  canAddVehicle: boolean
  customer?: string
  tier?: string
  endsOn?: string
  vehicleLimit?: number | null
}

/**
 * The one decision the app needs. `countVehicles` is called lazily and only when a licence is being enforced, so a
 * deployment that does not enforce one never pays for the count. `product` is overridable only for tests.
 */
export async function licenceStatus(
  env: LicenceEnv,
  countVehicles: () => Promise<number>,
  now: Date = new Date(),
  publicKeys: readonly string[] = BUILT_IN_PUBLIC_KEYS,
  product: string = PRODUCT,
): Promise<LicenceStatus> {
  if (env.LICENCE_ENFORCEMENT !== '1') return { enforced: false, state: 'not_enforced', banner: null, canAddVehicle: true }
  const checked = verify(env.LICENCE_KEY, { publicKeys, product })
  if (!checked.ok) {
    return {
      enforced: true,
      state: 'unlicensed',
      banner: 'No valid licence was found. Everything already set up keeps working, but no more vehicles can be added until one is installed.',
      canAddVehicle: false,
    }
  }
  const vehicles = await countVehicles()
  const e = evaluate(checked.licence, now, { vehicles })
  const limit = checked.licence.limits.vehicles
  const canAddVehicle = limit === undefined ? e.state !== 'lapsed' : e.canAdd.vehicles
  // Exactly at the limit is not "over", so evaluate() has nothing to say; say why adding is refused.
  const atLimit = typeof limit === 'number' && vehicles === limit && e.state !== 'lapsed'
  const banner = e.banner ?? (atLimit ? `Your licence covers ${limit} vehicles and all ${limit} are in use. Contact the supplier to add more.` : null)
  return {
    enforced: true,
    state: e.state,
    banner,
    // A licence with no vehicle limit at all means unlimited vehicles; only a lapsed one still refuses.
    canAddVehicle,
    customer: checked.licence.customer,
    tier: checked.licence.tier,
    endsOn: e.endsOn,
    vehicleLimit: limit === undefined ? null : limit,
  }
}
