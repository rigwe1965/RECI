import { createHash, createPrivateKey, sign as edSign } from 'node:crypto'
import { readFileSync } from 'fs'
import path from 'path'
import { describe, expect, it } from 'vitest'
import { BUILT_IN_PUBLIC_KEYS, evaluate, licenceStatus, verify } from './licence'

// Same file the owner's tooling and the RMM product replay: the contract between the implementations.
const V = JSON.parse(readFileSync(path.join(__dirname, 'fixtures/licence-test-vectors.json'), 'utf8'))
const KEY: string[] = [V.publicKey]
const rmmLicence = V.verify[0].token as string

describe('shared vectors', () => {
  it.each(V.verify)('verify: $name', (c: any) => {
    const r = verify(c.token, { publicKeys: KEY, product: c.product })
    expect(r.ok).toBe(c.expect.ok)
    if (!c.expect.ok) expect((r as { reason: string }).reason).toBe(c.expect.reason)
  })

  it.each(V.evaluate)('evaluate: $name', (c: any) => {
    const r = verify(c.token, { publicKeys: KEY })
    if (!r.ok) throw new Error('vector licence must verify')
    const e = evaluate(r.licence, c.now, c.usage)
    expect({ state: e.state, daysLeft: e.daysLeft, endsOn: e.endsOn, graceEndsOn: e.graceEndsOn, canAdd: e.canAdd, over: e.over, banner: e.banner }).toEqual(c.expect)
  })
})

// The published TEST key (a deterministic seed), used here only to make RECI licences for the gate tests.
const seed = createHash('sha256').update('facyke-licence-test-vectors-v1').digest()
const testKey = createPrivateKey({ key: Buffer.concat([Buffer.from('302e020100300506032b657004220420', 'hex'), seed]), format: 'der', type: 'pkcs8' })
function reciLicence(limits: Record<string, number | null>, exp = '2027-11-30T23:59:59Z', product = 'reci') {
  const payload = { v: 1, id: 'lic_t1', product, customer: 'Acme Rentals (test)', tier: 'standard', iat: '2026-11-17T00:00:00Z', exp, limits }
  const body = `FKL1.${Buffer.from(JSON.stringify(payload)).toString('base64url')}`
  return `${body}.${edSign(null, Buffer.from(body), testKey).toString('base64url')}`
}

describe('the built-in key', () => {
  it('is the owner key, and does not accept the published test licences', () => {
    expect(BUILT_IN_PUBLIC_KEYS).toEqual(['YgAlykUDmOaANaYUOgaOA4-2bFR8gTf-Y8mkPwTqRzU'])
    expect(verify(reciLicence({ vehicles: 10 }), { publicKeys: BUILT_IN_PUBLIC_KEYS }).ok).toBe(false)
  })
})

describe('licenceStatus', () => {
  const never = async () => {
    throw new Error('must not count vehicles')
  }
  const now = new Date('2027-01-15T12:00:00Z')

  it('does nothing, and never counts vehicles, unless enforcement is switched on', async () => {
    expect(await licenceStatus({}, never, now, KEY)).toEqual({ enforced: false, state: 'not_enforced', banner: null, canAddVehicle: true })
    expect((await licenceStatus({ LICENCE_ENFORCEMENT: '0', LICENCE_KEY: reciLicence({ vehicles: 1 }) }, never, now, KEY)).enforced).toBe(false)
    expect((await licenceStatus({ LICENCE_ENFORCEMENT: 'true' }, never, now, KEY)).enforced).toBe(false)
  })

  it('with enforcement on and no licence, refuses to add but says everything keeps working', async () => {
    const s = await licenceStatus({ LICENCE_ENFORCEMENT: '1' }, async () => 3, now, KEY)
    expect(s).toMatchObject({ enforced: true, state: 'unlicensed', canAddVehicle: false })
    expect(s.banner).toContain('keeps working')
  })

  it('refuses a licence made for another product, and a tampered one', async () => {
    const env = (k: string) => ({ LICENCE_ENFORCEMENT: '1', LICENCE_KEY: k })
    expect((await licenceStatus(env(rmmLicence), async () => 3, now, KEY)).state).toBe('unlicensed')
    const good = reciLicence({ vehicles: 10 })
    const [h, p, s] = good.split('.')
    const raised = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(p, 'base64url').toString()), limits: { vehicles: 9999 } })).toString('base64url')
    expect((await licenceStatus(env(`${h}.${raised}.${s}`), async () => 3, now, KEY)).state).toBe('unlicensed')
  })

  it('lets a vehicle be added while under the limit and refuses at the limit', async () => {
    const env = { LICENCE_ENFORCEMENT: '1', LICENCE_KEY: reciLicence({ vehicles: 10 }) }
    expect(await licenceStatus(env, async () => 9, now, KEY)).toMatchObject({ state: 'active', canAddVehicle: true, vehicleLimit: 10, customer: 'Acme Rentals (test)' })
    const full = await licenceStatus(env, async () => 10, now, KEY)
    expect(full.canAddVehicle).toBe(false)
  })

  it('a fleet already over the limit is only told, never reduced', async () => {
    const s = await licenceStatus({ LICENCE_ENFORCEMENT: '1', LICENCE_KEY: reciLicence({ vehicles: 10 }) }, async () => 14, now, KEY)
    expect(s.canAddVehicle).toBe(false)
    expect(s.banner).toBe('You are using 14 vehicles; your licence covers 10.')
  })

  it('null means unlimited, and a licence without a vehicle limit does not limit vehicles', async () => {
    expect((await licenceStatus({ LICENCE_ENFORCEMENT: '1', LICENCE_KEY: reciLicence({ vehicles: null }) }, async () => 5000, now, KEY)).canAddVehicle).toBe(true)
    expect((await licenceStatus({ LICENCE_ENFORCEMENT: '1', LICENCE_KEY: reciLicence({ users: 3 }) }, async () => 5000, now, KEY)).canAddVehicle).toBe(true)
  })

  it('warns before the end, allows adding in the 30 days after, and refuses once lapsed', async () => {
    const env = { LICENCE_ENFORCEMENT: '1', LICENCE_KEY: reciLicence({ vehicles: 10 }) }
    const soon = await licenceStatus(env, async () => 2, new Date('2027-11-10T00:00:00Z'), KEY)
    expect(soon).toMatchObject({ state: 'expiring', canAddVehicle: true })
    expect(soon.banner).toContain('2027-11-30')
    expect(await licenceStatus(env, async () => 2, new Date('2027-12-15T00:00:00Z'), KEY)).toMatchObject({ state: 'grace', canAddVehicle: true })
    const lapsed = await licenceStatus(env, async () => 2, new Date('2028-01-15T00:00:00Z'), KEY)
    expect(lapsed).toMatchObject({ state: 'lapsed', canAddVehicle: false })
    expect(lapsed.banner).toContain('Everything you have keeps working')
  })
})
