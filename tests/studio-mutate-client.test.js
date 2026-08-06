import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { StudioMutateClient } from '../js/lib/studio-mutate-client.js'

describe('StudioMutateClient SaaS authority', () => {
  const prev = {}

  beforeEach(() => {
    prev.fetch = globalThis.fetch
    prev.DB = globalThis.DB
    prev.Cloud = globalThis.Cloud
    prev.window = globalThis.window
    prev.navigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator')
    if (!globalThis.navigator) {
      Object.defineProperty(globalThis, 'navigator', { configurable: true, value: {} })
    }
    globalThis.window = globalThis
    globalThis.DB = {
      get: () => ({
        mutateEnabled: false,
        mutateRequiredWhenOnline: false,
        cloudEnabled: false,
        supabaseUrl: '',
        supabaseStudioId: 'studio_1'
      })
    }
    delete globalThis.__SM_MUTATE_ENABLED
    delete globalThis.__SM_MUTATE_REQUIRED
    delete globalThis.__SM_MUTATE_URL
    Object.defineProperty(globalThis.navigator, 'onLine', {
      configurable: true,
      get: () => true
    })
  })

  afterEach(() => {
    globalThis.fetch = prev.fetch
    globalThis.DB = prev.DB
    globalThis.Cloud = prev.Cloud
    if (prev.navigatorDescriptor) {
      Object.defineProperty(globalThis, 'navigator', prev.navigatorDescriptor)
    } else {
      delete globalThis.navigator
    }
    if (prev.window === undefined) delete globalThis.window
    else globalThis.window = prev.window
    vi.restoreAllMocks()
  })

  it('skips when feature flag off and not required', async () => {
    const res = await StudioMutateClient.authorize('record_deposit', { amount: 1 })
    expect(res.skipped).toBe(true)
    expect(res.reason).toBe('not_required')
  })

  it('stableKey is deterministic for same transaction id', () => {
    const a = StudioMutateClient.stableKey('record_deposit', { transactionId: 't1' })
    const b = StudioMutateClient.stableKey('record_deposit', { transactionId: 't1' })
    expect(a).toBe('record_deposit:t1')
    expect(b).toBe(a)
  })

  it('requiredWhenOnline defaults true when cloud enabled + url', () => {
    globalThis.DB = {
      get: () => ({
        cloudEnabled: true,
        supabaseUrl: 'https://abc.supabase.co',
        supabaseStudioId: 'studio_1'
      })
    }
    expect(StudioMutateClient.requiredWhenOnline()).toBe(true)
  })

  it('fail-closed when required and offline is queueable (not hard block)', async () => {
    globalThis.__SM_MUTATE_REQUIRED = true
    Object.defineProperty(globalThis.navigator, 'onLine', {
      configurable: true,
      get: () => false
    })
    const res = await StudioMutateClient.authorize('record_deposit', { transactionId: 't1', amount: 1 })
    expect(res.ok).toBe(false)
    expect(res.queueable).toBe(true)
    expect(res.reason).toBe('offline_blocked')
  })

  it('no cloud session is queueable when required', async () => {
    globalThis.__SM_MUTATE_REQUIRED = true
    globalThis.__SM_MUTATE_URL = 'https://abc.supabase.co/functions/v1/studio-mutate'
    globalThis.Cloud = {
      resolvedConfig: () => ({ url: 'https://abc.supabase.co' }),
      client: async () => ({ auth: { getSession: async () => ({ data: { session: null } }) } })
    }
    const res = await StudioMutateClient.authorize('record_deposit', {
      transactionId: 't1',
      amount: 100
    }, { idempotencyKey: 'record_deposit:t1' })
    expect(res.ok).toBe(false)
    expect(res.queueable).toBe(true)
    expect(res.reason).toBe('no_cloud_session')
  })

  it('posts stable idempotency key when authorized', async () => {
    globalThis.__SM_MUTATE_REQUIRED = true
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
      json: async () => ({ ok: true, result: { status: 'accepted', ledgerId: 'L1' } })
    }))
    globalThis.fetch = fetchMock

    const res = await StudioMutateClient.authorize(
      'record_deposit',
      { transactionId: 't1', amount: 100 },
      { idempotencyKey: 'record_deposit:t1' }
    )
    expect(res.ok).toBe(true)
    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.idempotencyKey).toBe('record_deposit:t1')
    expect(body.studioId).toBe('studio_1')
  })

  it('server 500 fails closed when required', async () => {
    globalThis.__SM_MUTATE_REQUIRED = true
    globalThis.Cloud = {
      resolvedConfig: () => ({ url: 'https://abc.supabase.co' }),
      client: async () => ({
        auth: { getSession: async () => ({ data: { session: { access_token: 'tok' } } }) }
      })
    }
    globalThis.fetch = vi.fn(async () => ({
      ok: false,
      status: 500,
      statusText: ' Internal Server Error',
      json: async () => ({ error: 'boom' })
    }))
    const res = await StudioMutateClient.authorize('record_deposit', { transactionId: 't1', amount: 1 })
    expect(res.ok).toBe(false)
    expect(res.reason).toBe('server_rejected')
  })

  it('report still works for optional audit mode', async () => {
    globalThis.__SM_MUTATE_ENABLED = true
    globalThis.Cloud = {
      resolvedConfig: () => ({ url: 'https://abc.supabase.co' }),
      client: async () => ({
        auth: { getSession: async () => ({ data: { session: { access_token: 'tok' } } }) }
      })
    }
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ ok: true, result: { status: 'accepted' } })
    }))
    globalThis.fetch = fetchMock
    const res = await StudioMutateClient.report('record_deposit', { transactionId: 't1', amount: 100 })
    expect(res.ok).toBe(true)
    expect(fetchMock).toHaveBeenCalledOnce()
  })
})
