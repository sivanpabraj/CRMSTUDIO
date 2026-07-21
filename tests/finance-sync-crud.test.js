/**
 * In-memory harness for FinanceSync CRUD (update/delete).
 * Loads finance-sync.js against stubbed DB/SecureDB/Utils globals.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { bankDelta, nextContractPaid } from '../js/lib/finance-ledger.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

function createMemoryDb() {
  const data = {
    banks: [],
    transactions: [],
    invoices: [],
    contracts: [],
    personnel: []
  }
  let seq = 1
  const id = () => `id_${seq++}`

  const DB = {
    get(col) { return data[col] || [] },
    set(col, rows) { data[col] = rows },
    find(col, pred) { return (data[col] || []).find(pred) },
    findActive(col, pred) { return (data[col] || []).find(x => !x._deleted && pred(x)) },
    active(col) { return (data[col] || []).filter(x => !x._deleted) },
    filter(col, pred) { return (data[col] || []).filter(pred) },
    insert(col, row) {
      const item = { id: id(), ...row }
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
      // Mimic soft-delete for finance entities
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

function loadFinanceSync(globals) {
  const src = fs.readFileSync(path.join(__dirname, '../js/finance-sync.js'), 'utf8')
  const window = globals
  // eslint-disable-next-line no-new-func
  const fn = new Function('window', 'DB', 'SecureDB', 'Utils', 'SMObservability', `${src}; return window.FinanceSync;`)
  return fn(window, globals.DB, globals.SecureDB, globals.Utils, globals.SMObservability)
}

describe('FinanceSync update/delete integration', () => {
  let g
  let FinanceSync
  const prev = {}

  beforeEach(() => {
    g = createMemoryDb()
    g.SMObservability = { captureError() {} }
    g.window = g
    for (const k of ['DB', 'SecureDB', 'Utils', 'SMObservability', 'FinanceSync']) {
      prev[k] = globalThis[k]
    }
    Object.assign(globalThis, {
      DB: g.DB,
      SecureDB: g.SecureDB,
      Utils: g.Utils,
      SMObservability: g.SMObservability,
      window: globalThis
    })
    FinanceSync = loadFinanceSync({
      DB: g.DB,
      SecureDB: g.SecureDB,
      Utils: g.Utils,
      SMObservability: g.SMObservability
    })
    globalThis.FinanceSync = FinanceSync
  })

  afterEach(() => {
    for (const [k, v] of Object.entries(prev)) {
      if (v === undefined) delete globalThis[k]
      else globalThis[k] = v
    }
  })

  it('updateTransaction changes amount and bank balance atomically', async () => {
    const bank = g.DB.insert('banks', { name: 'Melli', balance: 1000 })
    const dep = await FinanceSync.recordDeposit({
      amount: 200,
      bankId: bank.id,
      purposeCategory: 'other_income',
      syncInvoice: false
    })
    expect(dep.ok).toBe(true)
    expect(g.DB.find('banks', b => b.id === bank.id).balance).toBe(1200)

    const upd = await FinanceSync.updateTransaction(dep.transactionId, {
      amount: 350,
      bankId: bank.id,
      type: 'deposit',
      purposeCategory: 'other_income'
    }, { syncInvoice: false, allowOverdraft: true })
    expect(upd.ok).toBe(true)
    expect(g.DB.find('banks', b => b.id === bank.id).balance).toBe(1350)
    expect(g.DB.find('transactions', t => t.id === dep.transactionId).amount).toBe(350)
  })

  it('updateTransaction across banks moves balance', async () => {
    const a = g.DB.insert('banks', { name: 'A', balance: 500 })
    const b = g.DB.insert('banks', { name: 'B', balance: 100 })
    const dep = await FinanceSync.recordDeposit({
      amount: 150,
      bankId: a.id,
      purposeCategory: 'other_income',
      syncInvoice: false
    })
    expect(g.DB.find('banks', x => x.id === a.id).balance).toBe(650)

    const upd = await FinanceSync.updateTransaction(dep.transactionId, {
      amount: 150,
      bankId: b.id,
      type: 'deposit',
      purposeCategory: 'other_income'
    }, { syncInvoice: false })
    expect(upd.ok).toBe(true)
    expect(g.DB.find('banks', x => x.id === a.id).balance).toBe(500)
    expect(g.DB.find('banks', x => x.id === b.id).balance).toBe(250)
  })

  it('deleteTransaction reverses bank and contract paid', async () => {
    const bank = g.DB.insert('banks', { name: 'Melli', balance: 0 })
    const contract = g.DB.insert('contracts', {
      total: 2000, deposit: 500, paid: 0, balance: 1500, couple: 'A و B'
    })
    const dep = await FinanceSync.recordDeposit({
      amount: 300,
      bankId: bank.id,
      contractId: contract.id,
      purposeCategory: 'contract_payment',
      syncInvoice: true
    })
    expect(dep.ok).toBe(true)
    expect(g.DB.find('banks', b => b.id === bank.id).balance).toBe(300)
    expect(g.DB.find('contracts', c => c.id === contract.id).paid).toBe(300)

    const del = await FinanceSync.deleteTransaction(dep.transactionId)
    expect(del.ok).toBe(true)
    expect(g.DB.find('transactions', t => t.id === dep.transactionId)._deleted).toBe(true)
    expect(g.DB.find('banks', b => b.id === bank.id).balance).toBe(0)
    expect(g.DB.find('contracts', c => c.id === contract.id).paid).toBe(0)
    if (dep.invoiceId) {
      expect(g.DB.find('invoices', i => i.id === dep.invoiceId)._deleted).toBe(true)
    }
  })

  it('rejects update/delete of transfer legs', async () => {
    const a = g.DB.insert('banks', { name: 'A', balance: 1000 })
    const b = g.DB.insert('banks', { name: 'B', balance: 0 })
    const xfer = await FinanceSync.transferBetweenBanks({
      amount: 100,
      fromBankId: a.id,
      toBankId: b.id
    })
    expect(xfer.ok).toBe(true)
    const upd = await FinanceSync.updateTransaction(xfer.outTransactionId, { amount: 50 })
    expect(upd.ok).toBe(false)
    const del = await FinanceSync.deleteTransaction(xfer.inTransactionId)
    expect(del.ok).toBe(false)
  })

  it('pure helpers still match update/delete math', () => {
    expect(bankDelta(1000, 'withdrawal', 200)).toBe(800)
    expect(bankDelta(800, 'deposit', 350)).toBe(1150)
    const rev = nextContractPaid({ total: 2000, deposit: 500, paid: 300 }, 'contract_payment', 300, { reverse: true })
    expect(rev.paid).toBe(0)
  })
})
