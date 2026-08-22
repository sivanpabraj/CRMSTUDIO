/**
 * FinanceSync fail-closed when mutateRequiredWhenOnline.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { StudioMutateClient } from '../js/lib/studio-mutate-client.js'

function createMemoryDb() {
  const data = {
    banks: [{ id: 'b1', name: 'Main', balance: 1_000_000, _deleted: false }],
    transactions: [],
    invoices: [],
    contracts: [],
    personnel: [],
    studioInfo: {
      cloudEnabled: true,
      supabaseUrl: 'https://abc.supabase.co',
      supabaseStudioId: 'studio_1',
      mutateRequiredWhenOnline: true
    }
  }
  let seq = 1
  const id = () => `id_${seq++}`

  const DB = {
    get(col) {
      if (col === 'studioInfo') return data.studioInfo
      return data[col] || []
    },
    set(col, rows) { data[col] = rows },
    find(col, pred) { return (data[col] || []).find(pred) },
    findActive(col, pred) { return (data[col] || []).find(x => !x._deleted && pred(x)) },
    active(col) { return (data[col] || []).filter(x => !x._deleted) },
    filter(col, pred) { return (data[col] || []).filter(pred) },
    insert(col, row) {
      const item = { ...row, id: row.id || id() }
      data[col] = data[col] || []
      data[col].push(item)
      return item
    },
    update(col, rowId, patch) {
      const rows = data[col] || []
      const i = rows.findIndex(x => x.id === rowId)
      if (i < 0) return false
      rows[i] = { ...rows[i], ...patch }
      return true
    },
    delete(col, rowId) {
      data[col] = (data[col] || []).filter(x => x.id !== rowId)
      return true
    },
    log() {},
    flush: async () => {}
  }

  const SecureDB = {
    async insert(col, row) { return DB.insert(col, row) },
    async update(col, rowId, patch) { DB.update(col, rowId, patch); return true },
    async delete(col, rowId) {
      if (['transactions', 'invoices', 'banks', 'contracts'].includes(col)) {
        return DB.update(col, rowId, { _deleted: true, deletedAtIso: new Date().toISOString() })
      }
      return DB.delete(col, rowId)
    }
  }

  const Utils = {
    todayJalali: () => '1404/04/01',
    escapeHtml: (s) => String(s ?? '')
  }

  return { data, DB, SecureDB, Utils }
}

describe('FinanceSync mutateRequiredWhenOnline', () => {
  let g
  let FinanceSync
  const prev = {}

  beforeEach(async () => {
    vi.resetModules()
    g = createMemoryDb()
    g.SMObservability = { captureError() {}, captureEvent() {} }
    g.StudioMutateClient = StudioMutateClient
    g.window = g
    for (const k of ['DB', 'SecureDB', 'Utils', 'SMObservability', 'StudioMutateClient', 'FinanceSync', 'Cloud', 'fetch', 'window']) {
      prev[k] = globalThis[k]
    }
    Object.assign(globalThis, {
      DB: g.DB,
      SecureDB: g.SecureDB,
      Utils: g.Utils,
      SMObservability: g.SMObservability,
      StudioMutateClient,
      window: globalThis
    })
    globalThis.__SM_MUTATE_REQUIRED = true
    globalThis.__SM_MUTATE_URL = 'https://abc.supabase.co/functions/v1/studio-mutate'
    globalThis.Cloud = {
      resolvedConfig: () => ({ url: 'https://abc.supabase.co' }),
      client: async () => ({
        auth: { getSession: async () => ({ data: { session: { access_token: 'tok' } } }) }
      })
    }
    const module = await import('../js/finance-sync.js')
    FinanceSync = module.default
  })

  afterEach(() => {
    for (const [k, v] of Object.entries(prev)) {
      if (v === undefined) delete globalThis[k]
      else globalThis[k] = v
    }
    delete globalThis.__SM_MUTATE_REQUIRED
    delete globalThis.__SM_MUTATE_URL
    vi.restoreAllMocks()
  })

  it('does not commit local deposit when mutate returns 500', async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: false,
      status: 500,
      statusText: 'err',
      json: async () => ({ error: 'server down' })
    }))
    const beforeBal = g.data.banks[0].balance
    const res = await FinanceSync.recordDeposit({
      amount: 50000,
      bankId: 'b1',
      purposeCategory: 'other_income',
      syncInvoice: false
    })
    expect(res.ok).toBe(false)
    expect(g.data.transactions.filter(t => !t._deleted)).toHaveLength(0)
    expect(g.data.banks[0].balance).toBe(beforeBal)
  })

  it('commits local deposit after mutate accepts', async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ ok: true, result: { status: 'accepted', ledgerId: 'L1' } })
    }))
    const res = await FinanceSync.recordDeposit({
      amount: 50000,
      bankId: 'b1',
      purposeCategory: 'other_income',
      syncInvoice: false,
      transactionId: 'tx_fixed_1'
    })
    expect(res.ok).toBe(true)
    expect(res.transactionId).toBe('tx_fixed_1')
    expect(g.data.banks[0].balance).toBe(1_050_000)
    const body = JSON.parse(globalThis.fetch.mock.calls[0][1].body)
    expect(body.idempotencyKey).toBe('record_deposit:tx_fixed_1')
  })

  it('reports server acceptance and retains reconciliation when local persist fails', async () => {
    const accepted = {
      status: 'accepted', ledgerVersion: 7, transactionId: 'server-tx',
      balances: [{ account_ref: 'asset:bank:b1', balance_irr: 10_500_000 }]
    }
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ ok: true, result: accepted })
    }))
    const receipts = []
    globalThis.FinanceOutbox = {
      recordAccepted: vi.fn(async (row) => { receipts.push(row); return { ok: true } }),
      markApplied: vi.fn(async () => {})
    }
    g.SecureDB.insert = vi.fn(async () => { throw new Error('QuotaExceededError') })
    const res = await FinanceSync.recordDeposit({
      amount: 50000,
      bankId: 'b1',
      purposeCategory: 'other_income',
      syncInvoice: false,
      transactionId: 'stable-local-id'
    })
    expect(res).toMatchObject({
      ok: false,
      serverAccepted: true,
      needsReconciliation: true,
      idempotencyKey: 'record_deposit:stable-local-id'
    })
    expect(receipts).toHaveLength(1)
    expect(g.data.banks[0].balance).toBe(1_000_000)
  })

  it('blocks local financial commits without an authenticated cloud session', async () => {
    globalThis.Cloud = {
      resolvedConfig: () => ({ url: 'https://abc.supabase.co' }),
      client: async () => ({ auth: { getSession: async () => ({ data: { session: null } }) } })
    }
    const enqueued = []
    globalThis.FinanceOutbox = {
      enqueue: async (row) => {
        enqueued.push(row)
        return { ok: true }
      }
    }
    const res = await FinanceSync.recordDeposit({
      amount: 1000,
      bankId: 'b1',
      purposeCategory: 'other_income',
      syncInvoice: false,
      transactionId: 'tx_queued_1'
    })
    expect(res.ok).toBe(false)
    expect(g.data.transactions.some(t => t.id === 'tx_queued_1')).toBe(false)
    expect(g.data.banks[0].balance).toBe(1_000_000)
    expect(enqueued).toHaveLength(0)
  })
})
