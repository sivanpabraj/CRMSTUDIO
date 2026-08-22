import { afterEach, describe, expect, it, vi } from 'vitest'
import { StudioMutateClient } from '../js/lib/studio-mutate-client.js'

const saved = {}

function configure({ online = true } = {}) {
  for (const key of ['window', 'DB', 'Cloud', 'fetch']) saved[key] = globalThis[key]
  saved.navigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator')
  saved.location = Object.getOwnPropertyDescriptor(globalThis, 'location')
  globalThis.window = globalThis
  globalThis.DB = { get: () => ({ cloudEnabled: true, supabaseStudioId: '21000000-0000-4000-8000-000000000001', ledgerVersion: 4, mutateRequiredWhenOnline: false }) }
  globalThis.Cloud = {
    resolvedConfig: () => ({ url: 'https://example.supabase.co' }),
    client: async () => ({ auth: { getSession: async () => ({ data: { session: { access_token: 'token' } } }) } })
  }
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { onLine: online } })
  Object.defineProperty(globalThis, 'location', { configurable: true, value: { hostname: 'crm.example.ir' } })
}

afterEach(() => {
  for (const key of ['window', 'DB', 'Cloud', 'fetch']) {
    if (saved[key] === undefined) delete globalThis[key]
    else globalThis[key] = saved[key]
  }
  if (saved.navigator) Object.defineProperty(globalThis, 'navigator', saved.navigator)
  else delete globalThis.navigator
  if (saved.location) Object.defineProperty(globalThis, 'location', saved.location)
  else delete globalThis.location
  delete globalThis.__SM_MUTATE_REQUIRED
  vi.restoreAllMocks()
})

describe('authoritative finance boundary', () => {
  it('sends one idempotent command with the expected authoritative ledger version', async () => {
    configure()
    globalThis.fetch = vi.fn(async () => ({ ok: true, json: async () => ({ ok: true, result: { ledgerVersion: 5 } }) }))
    const result = await StudioMutateClient.authorize('record_deposit', {
      transactionId: 'logical-1', bankId: 'bank-1', amount: 100
    }, { idempotencyKey: 'record_deposit:logical-1' })
    expect(result.ok).toBe(true)
    expect(globalThis.fetch).toHaveBeenCalledOnce()
    expect(JSON.parse(globalThis.fetch.mock.calls[0][1].body)).toMatchObject({
      idempotencyKey: 'record_deposit:logical-1', expectedVersion: 4
    })
  })

  it('does not authorize a local money commit while the authoritative server is offline', async () => {
    configure({ online: false })
    const res = await StudioMutateClient.authorize('record_deposit', {
      transactionId: 'security-test', amount: 100
    })
    expect(res).toMatchObject({ ok: false, retryable: true, reason: 'offline_blocked' })
    expect(res).not.toHaveProperty('queueOutbox')
  })

  it('ignores a local production kill-switch', () => {
    configure()
    globalThis.__SM_MUTATE_REQUIRED = false
    expect(StudioMutateClient.requiredWhenOnline()).toBe(true)
  })
})
