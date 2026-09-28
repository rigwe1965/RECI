// Unit tests for DB-backed rate limit logic (mocks Supabase)
// checkDbRateLimit delegates to the atomic `increment_rate_limit` RPC
// (supabase/migrations/011_atomic_rate_limit.sql) rather than a
// read-then-write select/update, to avoid a check-then-act race under
// concurrent requests.

jest.mock('../lib/supabase/admin-server', () => ({
  createAdminClient: jest.fn(),
}))

import { createAdminClient } from '../lib/supabase/admin-server'
import { checkDbRateLimit } from '../lib/rate-limit'

function makeMockSupabase(rpcResult: { data: boolean | null; error: unknown }) {
  return {
    rpc: jest.fn().mockResolvedValue(rpcResult),
  }
}

describe('checkDbRateLimit', () => {
  beforeEach(() => jest.clearAllMocks())

  test('allows request when RPC reports under limit', async () => {
    const mock = makeMockSupabase({ data: true, error: null })
    ;(createAdminClient as jest.Mock).mockReturnValue(mock)

    const allowed = await checkDbRateLimit('1.2.3.4', '/api/ai/search', 5, 60_000)
    expect(allowed).toBe(true)
    expect(mock.rpc).toHaveBeenCalledWith('increment_rate_limit', {
      p_ip: '1.2.3.4',
      p_endpoint: '/api/ai/search',
      p_window_ms: 60_000,
      p_max: 5,
    })
  })

  test('blocks request when RPC reports at/over limit', async () => {
    const mock = makeMockSupabase({ data: false, error: null })
    ;(createAdminClient as jest.Mock).mockReturnValue(mock)

    const allowed = await checkDbRateLimit('1.2.3.4', '/api/ai/search', 5, 60_000)
    expect(allowed).toBe(false)
  })

  test('fails open when the RPC call errors (does not block legitimate requests)', async () => {
    const mock = makeMockSupabase({ data: null, error: new Error('DB down') })
    ;(createAdminClient as jest.Mock).mockReturnValue(mock)

    const allowed = await checkDbRateLimit('1.2.3.4', '/api/ai/search', 5, 60_000)
    expect(allowed).toBe(true)
  })

  test('fails open when creating the client throws', async () => {
    ;(createAdminClient as jest.Mock).mockImplementation(() => {
      throw new Error('DB down')
    })

    const allowed = await checkDbRateLimit('1.2.3.4', '/api/ai/search', 5, 60_000)
    expect(allowed).toBe(true)
  })
})
