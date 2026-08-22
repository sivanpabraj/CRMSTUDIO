import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FinanceOutbox } from '../js/lib/finance-outbox.js'

describe('FinanceOutbox failure and reconciliation behavior', () => {
  const original = {}
  let data

  beforeEach(() => {
    for (const name of ['DB', 'SecureDB', 'StudioMutateClient', 'FinanceSync', 'SMObservability', 'Utils']) {
      original[name] = globalThis[name]
    }
    original.navigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator')
    data = { financeOutbox: [], transactions: [], studioInfo: {} }
    globalThis.DB = {
      get: vi.fn(name => data[name] || []),
      insert: vi.fn((name, row) => { (data[name] ||= []).push(row); return row }),
      find: vi.fn((name, predicate) => (data[name] || []).find(predicate)),
      findActive: vi.fn((name, predicate) => (data[name] || []).find(row => !row._deleted && predicate(row))),
      flush: vi.fn(async () => {})
    }
    globalThis.SecureDB = {
      insert: vi.fn(async (name, row) => globalThis.DB.insert(name, row)),
      update: vi.fn(async (name, id, patch) => {
        const row = (data[name] || []).find(item => item.id === id)
        if (row) Object.assign(row, patch)
      }),
      merge: vi.fn(async (name, value) => { data[name] = value })
    }
    globalThis.FinanceSync = { reconcileAccepted: vi.fn(async () => {}) }
    globalThis.SMObservability = { captureEvent: vi.fn(), captureError: vi.fn() }
    globalThis.Utils = { toast: vi.fn() }
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: { onLine: true }
    })
    FinanceOutbox._volatile.clear()
    FinanceOutbox._flushing = false
  })

  afterEach(() => {
    for (const name of ['DB', 'SecureDB', 'StudioMutateClient', 'FinanceSync', 'SMObservability', 'Utils']) {
      if (original[name] === undefined) delete globalThis[name]
      else globalThis[name] = original[name]
    }
    if (original.navigator) Object.defineProperty(globalThis, 'navigator', original.navigator)
    else delete globalThis.navigator
    FinanceOutbox._volatile.clear()
    FinanceOutbox._flushing = false
    vi.restoreAllMocks()
  })

  it('rejects malformed entries and deduplicates already-applied receipts', async () => {
    expect(await FinanceOutbox.enqueue({ op: '', idempotencyKey: '' }))
      .toEqual({ ok: false, error: 'invalid outbox entry' })

    data.financeOutbox.push({ id: 'done', idempotencyKey: 'same', status: 'synced' })
    expect(await FinanceOutbox.enqueue({ op: 'post', idempotencyKey: 'same' }))
      .toEqual({ ok: true, deduped: true, id: 'done' })
    expect(globalThis.SecureDB.insert).not.toHaveBeenCalled()
  })

  it('upgrades an existing receipt to projection_pending without duplicating it', async () => {
    data.financeOutbox.push({ id: 'one', idempotencyKey: 'same', status: 'pending', payload: {} })
    const result = await FinanceOutbox.enqueue({
      op: 'post', idempotencyKey: 'same', payload: { amount: 4 },
      status: 'projection_pending', serverResult: { version: 2 }
    })
    expect(result.deduped).toBe(true)
    expect(data.financeOutbox).toHaveLength(1)
    expect(data.financeOutbox[0]).toMatchObject({ status: 'projection_pending', payload: { amount: 4 } })
  })

  it('uses the legacy DB adapter when SecureDB is unavailable and emits an event', async () => {
    delete globalThis.SecureDB
    const result = await FinanceOutbox.enqueue({ op: 'post', idempotencyKey: 'legacy' })
    expect(result.ok).toBe(true)
    expect(globalThis.DB.insert).toHaveBeenCalledOnce()
    expect(globalThis.SMObservability.captureEvent).toHaveBeenCalledWith(
      'finance_outbox_enqueue', { op: 'post', idempotencyKey: 'legacy' }
    )
  })

  it('moves a successfully persisted accepted receipt out of volatile memory', async () => {
    const result = await FinanceOutbox.recordAccepted({
      op: 'post', idempotencyKey: 'accepted-durable', payload: { amount: 2 }
    })
    expect(result.ok).toBe(true)
    expect(FinanceOutbox._volatile.has('accepted-durable')).toBe(false)
    expect(data.financeOutbox[0]).toMatchObject({ status: 'projection_pending' })
  })

  it('does not expose deleted/durable duplicate rows as pending', () => {
    data.financeOutbox.push(
      { id: 'a', idempotencyKey: 'a', status: 'pending' },
      { id: 'b', idempotencyKey: 'b', status: 'failed' },
      { id: 'c', idempotencyKey: 'c', status: 'pending', _deleted: true }
    )
    FinanceOutbox._volatile.set('a', { id: 'volatile:a', idempotencyKey: 'a', status: 'projection_pending' })
    FinanceOutbox._volatile.set('d', { id: 'volatile:d', idempotencyKey: 'd', status: 'projection_pending' })
    expect(FinanceOutbox.pending().map(row => row.id)).toEqual(['a', 'volatile:d'])
  })

  it('marks both outgoing and incoming transaction projections', async () => {
    data.transactions.push({ id: 'out' }, { id: 'in' })
    await FinanceOutbox.markTxMutateStatus({ transactionId: 'out', inTransactionId: 'in' }, 'synced')
    expect(globalThis.SecureDB.update).toHaveBeenCalledWith('transactions', 'out', { mutateStatus: 'synced' })
    expect(globalThis.SecureDB.update).toHaveBeenCalledWith('transactions', 'in', { mutateStatus: 'synced' })

    await FinanceOutbox.markTxMutateStatus({}, 'failed')
    delete globalThis.SecureDB
    await expect(FinanceOutbox.markTxMutateStatus({ transactionId: 'out' }, 'failed')).resolves.toBeUndefined()
  })

  it('supports the fallback transaction finder and contains best-effort projection errors', async () => {
    data.transactions.push({ id: 'fallback' })
    delete globalThis.DB.findActive
    await FinanceOutbox.markTxMutateStatus({ outTransactionId: 'fallback' }, 'synced')
    expect(globalThis.DB.find).toHaveBeenCalled()
    expect(globalThis.SecureDB.update).toHaveBeenCalledWith(
      'transactions', 'fallback', { mutateStatus: 'synced' }
    )
    globalThis.SecureDB.update.mockRejectedValueOnce(new Error('local projection failed'))
    await expect(FinanceOutbox.markTxMutateStatus({ outTransactionId: 'fallback' }, 'failed'))
      .resolves.toBeUndefined()
  })

  it('fails closed when the mutation client is absent and skips only explicit non-cloud/offline states', async () => {
    delete globalThis.StudioMutateClient
    expect(await FinanceOutbox.flush()).toEqual({ ok: false, error: 'mutate client missing' })

    globalThis.StudioMutateClient = {
      authorize: vi.fn(), requiredWhenOnline: () => false, enabled: () => false
    }
    expect(await FinanceOutbox.flush()).toMatchObject({ skipped: true, reason: 'not_required' })
    globalThis.StudioMutateClient.requiredWhenOnline = () => true
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { onLine: false } })
    expect(await FinanceOutbox.flush()).toMatchObject({ skipped: true, reason: 'offline' })

    FinanceOutbox._flushing = true
    expect(await FinanceOutbox.flush()).toMatchObject({ skipped: true, reason: 'busy' })
  })

  it('defers accepted commands until a projection reconciler exists', async () => {
    await FinanceOutbox.enqueue({ op: 'post', idempotencyKey: 'accepted' })
    globalThis.StudioMutateClient = {
      authorize: vi.fn(async () => ({ ok: true })), requiredWhenOnline: () => true
    }
    delete globalThis.FinanceSync
    const result = await FinanceOutbox.flush()
    expect(result).toMatchObject({ synced: 0, deferred: 1 })
    expect(data.financeOutbox[0]).toMatchObject({ status: 'projection_pending', lastError: 'reconciler_missing' })
  })

  it('preserves an accepted receipt when projection reconciliation throws', async () => {
    await FinanceOutbox.enqueue({ op: 'post', idempotencyKey: 'projection-error' })
    globalThis.StudioMutateClient = {
      authorize: vi.fn(async () => ({ ok: true })), requiredWhenOnline: () => true
    }
    globalThis.FinanceSync.reconcileAccepted.mockRejectedValueOnce(new Error('projection unavailable'))
    const result = await FinanceOutbox.flush()
    expect(result.deferred).toBe(1)
    expect(data.financeOutbox[0]).toMatchObject({ status: 'projection_pending', lastError: 'projection unavailable' })
  })

  it.each([
    [{ retryable: true, error: 'retry' }, 'retry'],
    [{ queueable: true, reason: 'network' }, 'network'],
    [{ status: 401, error: 'session' }, 'session'],
    [{ status: 429, error: 'quota' }, 'quota']
  ])('keeps retryable authorization failures pending (%o)', async (failure, expectedError) => {
    await FinanceOutbox.enqueue({ op: 'post', idempotencyKey: expectedError })
    globalThis.StudioMutateClient = {
      authorize: vi.fn(async () => ({ ok: false, ...failure })), requiredWhenOnline: () => true
    }
    const result = await FinanceOutbox.flush()
    expect(result.deferred).toBe(1)
    expect(data.financeOutbox[0]).toMatchObject({ status: 'pending', lastError: expectedError })
  })

  it('marks permanent rejection, updates transaction projection, and captures the failure', async () => {
    data.transactions.push({ id: 'tx' })
    await FinanceOutbox.enqueue({ op: 'post', idempotencyKey: 'denied', payload: { transactionId: 'tx' } })
    globalThis.StudioMutateClient = {
      authorize: vi.fn(async () => ({ ok: false, error: 'policy_denied' })), requiredWhenOnline: () => true
    }
    const result = await FinanceOutbox.flush()
    expect(result).toMatchObject({ failed: 1, deferred: 0 })
    expect(data.financeOutbox[0]).toMatchObject({ status: 'failed', lastError: 'policy_denied' })
    expect(globalThis.SMObservability.captureError).toHaveBeenCalledOnce()
  })

  it('applies server ledger version and reports successful reconciliation', async () => {
    data.studioInfo = { id: 'studio' }
    await FinanceOutbox.enqueue({ op: 'post', idempotencyKey: 'versioned' })
    globalThis.StudioMutateClient = {
      authorize: vi.fn(async () => ({ ok: true, result: { ledgerVersion: 8 } })), requiredWhenOnline: () => true
    }
    const result = await FinanceOutbox.flush()
    expect(result.synced).toBe(1)
    expect(globalThis.SecureDB.merge).toHaveBeenCalledWith('studioInfo', { id: 'studio', ledgerVersion: 8 })
    expect(globalThis.Utils.toast).toHaveBeenCalledOnce()
    expect(FinanceOutbox._flushing).toBe(false)
  })

  it('always releases the flush lock when authorization throws', async () => {
    await FinanceOutbox.enqueue({ op: 'post', idempotencyKey: 'throws' })
    globalThis.StudioMutateClient = {
      authorize: vi.fn(async () => { throw new Error('transport') }), requiredWhenOnline: () => true
    }
    await expect(FinanceOutbox.flush()).rejects.toThrow('transport')
    expect(FinanceOutbox._flushing).toBe(false)
  })

  it('binds online and periodic retries once and isolates background rejection', async () => {
    vi.useFakeTimers()
    const listeners = {}
    const priorWindow = globalThis.window
    globalThis.window = {
      addEventListener: vi.fn((name, callback) => { listeners[name] = callback })
    }
    FinanceOutbox._bound = false
    const flush = vi.spyOn(FinanceOutbox, 'flush').mockRejectedValue(new Error('background transport'))
    vi.spyOn(FinanceOutbox, 'pending').mockReturnValue([{ id: 'pending' }])

    FinanceOutbox.bindAutoFlush()
    FinanceOutbox.bindAutoFlush()
    listeners.online()
    await vi.advanceTimersByTimeAsync(45_000)

    expect(globalThis.window.addEventListener).toHaveBeenCalledOnce()
    expect(flush).toHaveBeenCalledTimes(2)
    if (priorWindow === undefined) delete globalThis.window
    else globalThis.window = priorWindow
  })
})
