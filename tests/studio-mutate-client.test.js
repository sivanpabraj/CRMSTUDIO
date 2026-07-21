import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { StudioMutateClient } from '../js/lib/studio-mutate-client.js'

describe('StudioMutateClient', () => {
  const prev = {}

  beforeEach(() => {
    prev.fetch = globalThis.fetch
    prev.DB = globalThis.DB
    prev.Cloud = globalThis.Cloud
    prev.window = globalThis.window
    globalThis.window = globalThis
    globalThis.DB = {
      get: () => ({
        mutateEnabled: false,
        supabaseStudioId: 'studio_1'
      })
    }
    delete globalThis.__SM_MUTATE_ENABLED
    delete globalThis.__SM_MUTATE_URL
  })

  afterEach(() => {
    globalThis.fetch = prev.fetch
    globalThis.DB = prev.DB
    globalThis.Cloud = prev.Cloud
    if (prev.window === undefined) delete globalThis.window
    else globalThis.window = prev.window
    vi.restoreAllMocks()
  })

  it('skips when feature flag off', async () => {
    const res = await StudioMutateClient.report('record_deposit', { amount: 1 })
    expect(res.skipped).toBe(true)
  })

  it('posts when enabled using Cloud.client() + resolvedConfig()', async () => {
    globalThis.__SM_MUTATE_ENABLED = true
    globalThis.Cloud = {
      resolvedConfig: () => ({ url: 'https://abc.supabase.co', anonKey: 'k', enabled: true }),
      client: async () => ({
        auth: {
          getSession: async () => ({ data: { session: { access_token: 'tok' } } })
        }
      })
    }
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ ok: true, result: { status: 'accepted_pending_ledger' } })
    }))
    globalThis.fetch = fetchMock

    const res = await StudioMutateClient.report('record_deposit', { transactionId: 't1', amount: 100 })
    expect(res.ok).toBe(true)
    expect(fetchMock).toHaveBeenCalledOnce()
    const [url, opts] = fetchMock.mock.calls[0]
    expect(url).toBe('https://abc.supabase.co/functions/v1/studio-mutate')
    expect(opts.headers.Authorization).toBe('Bearer tok')
    const body = JSON.parse(opts.body)
    expect(body.op).toBe('record_deposit')
    expect(body.studioId).toBe('studio_1')
    expect(body.idempotencyKey).toBeTruthy()
  })

  it('skips when cloud session missing', async () => {
    globalThis.__SM_MUTATE_ENABLED = true
    globalThis.Cloud = {
      resolvedConfig: () => ({ url: 'https://abc.supabase.co' }),
      client: async () => ({ auth: { getSession: async () => ({ data: { session: null } }) } })
    }
    const res = await StudioMutateClient.report('record_deposit', { amount: 1 })
    expect(res.skipped).toBe(true)
    expect(res.reason).toBe('no_cloud_session')
  })
})
