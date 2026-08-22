import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { FinanceOutbox } from '../js/lib/finance-outbox.js'

describe('FinanceOutbox', () => {
  const prev = {}

  beforeEach(() => {
    const data = { financeOutbox: [], transactions: [], studioInfo: {} }
    prev.DB = globalThis.DB
    prev.SecureDB = globalThis.SecureDB
    prev.StudioMutateClient = globalThis.StudioMutateClient
    prev.SMObservability = globalThis.SMObservability
    prev.FinanceSync = globalThis.FinanceSync
    prev.navigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator')
    if (!globalThis.navigator) {
      Object.defineProperty(globalThis, 'navigator', { configurable: true, value: {} })
    }
    globalThis.DB = {
      get: (c) => data[c] || [],
      insert: (c, row) => { data[c] = data[c] || []; data[c].push(row); return row },
      findActive: (c, pred) => (data[c] || []).find(x => !x._deleted && pred(x)),
      flush: async () => {}
    }
    globalThis.SecureDB = {
      insert: async (c, row) => globalThis.DB.insert(c, row),
      update: async (c, id, patch) => {
        const rows = data[c] || []
        const i = rows.findIndex(r => r.id === id)
        if (i >= 0) rows[i] = { ...rows[i], ...patch }
      },
      merge: async (c, next) => { data[c] = next }
    }
    globalThis.SMObservability = { captureEvent() {}, captureError() {} }
    globalThis.FinanceSync = { reconcileAccepted: vi.fn(async () => ({ ok: true })) }
    Object.defineProperty(globalThis.navigator, 'onLine', { configurable: true, get: () => true })
  })

  afterEach(() => {
    globalThis.DB = prev.DB
    globalThis.SecureDB = prev.SecureDB
    globalThis.StudioMutateClient = prev.StudioMutateClient
    globalThis.SMObservability = prev.SMObservability
    globalThis.FinanceSync = prev.FinanceSync
    if (prev.navigatorDescriptor) {
      Object.defineProperty(globalThis, 'navigator', prev.navigatorDescriptor)
    } else {
      delete globalThis.navigator
    }
    vi.restoreAllMocks()
  })

  it('enqueues idempotently', async () => {
    const a = await FinanceOutbox.enqueue({
      op: 'record_deposit',
      idempotencyKey: 'record_deposit:t1',
      payload: { transactionId: 't1', amount: 1 }
    })
    const b = await FinanceOutbox.enqueue({
      op: 'record_deposit',
      idempotencyKey: 'record_deposit:t1',
      payload: { transactionId: 't1', amount: 1 }
    })
    expect(a.ok).toBe(true)
    expect(b.deduped).toBe(true)
    expect(FinanceOutbox.pending()).toHaveLength(1)
  })

  it('flush marks synced on authorize ok', async () => {
    await FinanceOutbox.enqueue({
      op: 'record_deposit',
      idempotencyKey: 'record_deposit:t2',
      payload: { transactionId: 't2', amount: 5 }
    })
    globalThis.StudioMutateClient = {
      requiredWhenOnline: () => true,
      enabled: () => false,
      authorize: async () => ({ ok: true, result: { status: 'accepted', ledgerVersion: 3 } })
    }
    const res = await FinanceOutbox.flush()
    expect(res.synced).toBe(1)
    expect(FinanceOutbox.pending()).toHaveLength(0)
    expect(globalThis.FinanceSync.reconcileAccepted).toHaveBeenCalledOnce()
  })

  it('retains an accepted receipt when local persistence fails and reconciles it on retry', async () => {
    globalThis.SecureDB.insert = vi.fn(async () => { throw new Error('QuotaExceededError') })
    const receipt = await FinanceOutbox.recordAccepted({
      op: 'record_deposit',
      idempotencyKey: 'record_deposit:stable-retry',
      payload: { transactionId: 'stable-retry', bankId: 'b1', amount: 5 },
      serverResult: { ledgerVersion: 9, balances: [{ account_ref: 'asset:bank:b1', balance_irr: 50 }] }
    })
    expect(receipt.volatile).toBe(true)
    expect(FinanceOutbox.pending()).toHaveLength(1)

    globalThis.StudioMutateClient = {
      requiredWhenOnline: () => true,
      enabled: () => false,
      authorize: vi.fn(async (_op, _payload, options) => ({
        ok: true,
        deduped: true,
        result: { ledgerVersion: 9, balances: [{ account_ref: 'asset:bank:b1', balance_irr: 50 }] },
        echoedKey: options.idempotencyKey
      }))
    }
    const res = await FinanceOutbox.flush()
    expect(res.synced).toBe(1)
    expect(globalThis.StudioMutateClient.authorize.mock.calls[0][2].idempotencyKey)
      .toBe('record_deposit:stable-retry')
    expect(globalThis.FinanceSync.reconcileAccepted).toHaveBeenCalledOnce()
    expect(FinanceOutbox.pending()).toHaveLength(0)
  })

  it('flush keeps pending on queueable failure', async () => {
    await FinanceOutbox.enqueue({
      op: 'record_deposit',
      idempotencyKey: 'record_deposit:t3',
      payload: { transactionId: 't3', amount: 5 }
    })
    globalThis.StudioMutateClient = {
      requiredWhenOnline: () => true,
      enabled: () => false,
      authorize: async () => ({ ok: false, queueable: true, reason: 'no_cloud_session' })
    }
    const res = await FinanceOutbox.flush()
    expect(res.deferred).toBe(1)
    expect(FinanceOutbox.pending()).toHaveLength(1)
  })
})
