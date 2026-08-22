/**
 * In-memory harness for FinanceSync CRUD (update/delete).
 * Loads finance-sync.js against stubbed DB/SecureDB/Utils globals.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { bankDelta, nextContractPaid } from '../js/lib/finance-ledger.js'

function createMemoryDb() {
  const data = {
    banks: [],
    transactions: [],
    invoices: [],
    contracts: [],
    personnel: [],
    studioInfo: {}
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
    },
    async merge(col, patch) {
      data[col] = { ...(data[col] || {}), ...patch }
      return data[col]
    }
  }

  const Utils = {
    todayJalali: () => '1404/04/01',
    escapeHtml: (s) => String(s ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
  }

  return { data, DB, SecureDB, Utils }
}

describe('FinanceSync update/delete integration', () => {
  let g
  let FinanceSync
  const prev = {}

  beforeEach(async () => {
    vi.resetModules()
    const StudioMutateClient = {
      requiredWhenOnline: () => false,
      enabled: () => false,
      authorize: async () => ({ skipped: true, reason: 'not_required' })
    }
    g = createMemoryDb()
    g.SMObservability = { captureError() {} }
    g.window = g
    for (const k of ['DB', 'SecureDB', 'Utils', 'SMObservability', 'StudioMutateClient', 'FinanceSync', 'FinanceOutbox', 'PlanLimits', 'document', 'location', 'window']) {
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
    const module = await import('../js/finance-sync.js')
    FinanceSync = module.default
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
    expect(dep.ok, dep.error).toBe(true)
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

  it('rejects invalid update and delete targets', async () => {
    expect(await FinanceSync.updateTransaction('missing', {})).toMatchObject({ ok: false })
    expect(await FinanceSync.deleteTransaction('missing')).toMatchObject({ ok: false })
    const bank = g.DB.insert('banks', { name: 'A', balance: 10 })
    const tx = g.DB.insert('transactions', { type: 'deposit', amount: 5, bankId: bank.id })
    expect(await FinanceSync.updateTransaction(tx.id, { amount: 0 })).toMatchObject({ ok: false })
    expect(await FinanceSync.updateTransaction(tx.id, { bankId: '' })).toMatchObject({ ok: false })
    expect(await FinanceSync.updateTransaction(tx.id, { bankId: 'missing' })).toMatchObject({ ok: false })
  })

  it('rolls back an update that would overdraw the bank', async () => {
    const bank = g.DB.insert('banks', { name: 'A', balance: 100 })
    const withdrawal = await FinanceSync.recordWithdrawal({
      amount: 20, bankId: bank.id, purposeCategory: 'other', syncInvoice: false
    })
    expect(withdrawal.ok).toBe(true)
    const result = await FinanceSync.updateTransaction(withdrawal.transactionId, {
      type: 'withdrawal', amount: 200
    }, { syncInvoice: false })
    expect(result.ok).toBe(false)
    expect(g.DB.find('banks', b => b.id === bank.id).balance).toBe(80)
    expect(g.DB.find('transactions', t => t.id === withdrawal.transactionId).amount).toBe(20)
  })

  it('restores deleted transaction and invoice when reversal fails', async () => {
    const bank = g.DB.insert('banks', { name: 'A', balance: 0 })
    const deposit = await FinanceSync.recordDeposit({ amount: 50, bankId: bank.id, syncInvoice: true })
    const originalUpdate = g.SecureDB.update
    let failed = false
    g.SecureDB.update = vi.fn(async (col, id, patch) => {
      if (!failed && col === 'banks') {
        failed = true
        throw new Error('bank-reversal-failed')
      }
      return originalUpdate(col, id, patch)
    })
    const result = await FinanceSync.deleteTransaction(deposit.transactionId)
    expect(result.ok).toBe(false)
    expect(g.DB.find('transactions', t => t.id === deposit.transactionId)._deleted).toBe(false)
    expect(g.DB.find('invoices', i => i.id === deposit.invoiceId)._deleted).toBe(false)
    expect(g.DB.find('banks', b => b.id === bank.id).balance).toBe(50)
  })

  it('pure helpers still match update/delete math', () => {
    expect(bankDelta(1000, 'withdrawal', 200)).toBe(800)
    expect(bankDelta(800, 'deposit', 350)).toBe(1150)
    const rev = nextContractPaid({ total: 2000, deposit: 500, paid: 300 }, 'contract_payment', 300, { reverse: true })
    expect(rev.paid).toBe(0)
  })

  it('normalizes bank aliases and renders stable labels', () => {
    const bank = g.DB.insert('banks', {
      name: 'عملیاتی', bank: 'ملت', accountNumber: '123', shaba: 'IR01',
      card: '9999', holder: 'Studio', balance: '450'
    })
    expect(FinanceSync.normalizeBankFields(null)).toBeNull()
    expect(FinanceSync.normalizeBankFields(bank)).toMatchObject({
      account: '123', accountNumber: '123', iban: 'IR01', shaba: 'IR01', balance: 450
    })
    expect(FinanceSync.bankInfo('missing')).toMatchObject({ name: '—', id: '' })
    expect(FinanceSync.bankLabel(bank.id)).toContain('عملیاتی')
  })

  it('maps all supported invoice categories', () => {
    expect(FinanceSync.mapInvoiceType({ type: 'deposit', purposeCategory: 'contract_deposit' })).toBe('customer_deposit')
    expect(FinanceSync.mapInvoiceType({ type: 'deposit', purposeCategory: 'contract_payment' })).toBe('customer_payment')
    expect(FinanceSync.mapInvoiceType({ type: 'deposit', purposeCategory: 'other_income' })).toBe('other')
    expect(FinanceSync.mapInvoiceType({ type: 'withdrawal', purposeCategory: 'personnel' })).toBe('personnel')
    expect(FinanceSync.mapInvoiceType({ type: 'withdrawal', purposeCategory: 'utility' })).toBe('utility_electric')
    expect(FinanceSync.mapInvoiceType({ type: 'withdrawal', purposeCategory: 'cancellation_refund' })).toBe('transfer')
    expect(FinanceSync.mapInvoiceType({ type: 'withdrawal', purposeCategory: 'equipment' })).toBe('expense')
  })

  it('creates and updates an invoice projection from a transaction', async () => {
    const bank = g.DB.insert('banks', { name: 'A', bank: 'Melli', balance: 0 })
    const person = g.DB.insert('personnel', { name: 'Worker' })
    const payload = {
      type: 'withdrawal', amount: 120, date: '1404/04/01', bankId: bank.id,
      personnelId: person.id, purposeCategory: 'personnel', purpose: 'Salary'
    }
    const invoiceId = await FinanceSync.createInvoiceFromTx(payload, 'tx-1')
    expect(g.DB.find('invoices', i => i.id === invoiceId)).toMatchObject({
      client: 'Worker', type: 'personnel', direction: 'out', transactionId: 'tx-1'
    })
    await FinanceSync.createInvoiceFromTx({ ...payload, amount: 200 }, 'tx-1', invoiceId)
    expect(g.DB.find('invoices', i => i.id === invoiceId).amount).toBe(200)
  })

  it('rejects invalid withdrawals and records a valid withdrawal', async () => {
    const bank = g.DB.insert('banks', { name: 'A', balance: 100 })
    expect(await FinanceSync.recordWithdrawal({ amount: 0, bankId: bank.id })).toMatchObject({ ok: false })
    expect(await FinanceSync.recordWithdrawal({ amount: 10 })).toMatchObject({ ok: false })
    expect(await FinanceSync.recordWithdrawal({ amount: 101, bankId: bank.id })).toMatchObject({ ok: false })
    expect(await FinanceSync.recordWithdrawal({ amount: 10, bankId: 'missing' })).toMatchObject({ ok: false })
    const result = await FinanceSync.recordWithdrawal({
      amount: 40, bankId: bank.id, purposeCategory: 'utility', syncInvoice: true
    })
    expect(result.ok).toBe(true)
    expect(g.DB.find('banks', b => b.id === bank.id).balance).toBe(60)
    expect(g.DB.find('transactions', t => t.id === result.transactionId).invoiceId).toBeTruthy()
  })

  it('rolls back a withdrawal when invoice persistence fails', async () => {
    const bank = g.DB.insert('banks', { name: 'A', balance: 100 })
    const originalInsert = g.SecureDB.insert
    g.SecureDB.insert = vi.fn(async (col, row) => {
      if (col === 'invoices') throw new Error('invoice-write-failed')
      return originalInsert(col, row)
    })
    const result = await FinanceSync.recordWithdrawal({ amount: 40, bankId: bank.id })
    expect(result.ok).toBe(false)
    expect(g.DB.find('banks', b => b.id === bank.id).balance).toBe(100)
    expect(g.DB.active('transactions')).toHaveLength(0)
  })

  it('validates transfer inputs and insufficient balance', async () => {
    const a = g.DB.insert('banks', { name: 'A', balance: 10 })
    const b = g.DB.insert('banks', { name: 'B', balance: 0 })
    expect(await FinanceSync.transferBetweenBanks({ amount: 0, fromBankId: a.id, toBankId: b.id })).toMatchObject({ ok: false })
    expect(await FinanceSync.transferBetweenBanks({ amount: 1, fromBankId: a.id })).toMatchObject({ ok: false })
    expect(await FinanceSync.transferBetweenBanks({ amount: 1, fromBankId: a.id, toBankId: a.id })).toMatchObject({ ok: false })
    expect(await FinanceSync.transferBetweenBanks({ amount: 11, fromBankId: a.id, toBankId: b.id })).toMatchObject({ ok: false })
    expect(await FinanceSync.transferBetweenBanks({ amount: 1, fromBankId: 'missing', toBankId: b.id })).toMatchObject({ ok: false })
  })

  it('rolls back transfer rows when the destination balance update fails', async () => {
    const a = g.DB.insert('banks', { name: 'A', balance: 100 })
    const b = g.DB.insert('banks', { name: 'B', balance: 0 })
    const originalUpdate = g.SecureDB.update
    g.SecureDB.update = vi.fn(async (col, id, patch) => {
      if (col === 'banks' && id === b.id) throw new Error('destination-write-failed')
      return originalUpdate(col, id, patch)
    })
    const result = await FinanceSync.transferBetweenBanks({ amount: 25, fromBankId: a.id, toBankId: b.id })
    expect(result.ok).toBe(false)
    expect(g.DB.find('banks', x => x.id === a.id).balance).toBe(100)
    expect(g.DB.active('transactions')).toHaveLength(0)
  })

  it('supports contract payment projections and prevents duplicate initial deposit', async () => {
    const bank = g.DB.insert('banks', { name: 'A', balance: 0 })
    const contract = g.DB.insert('contracts', {
      bride: 'A', groom: 'B', total: 1000, deposit: 100, paid: 0, balance: 900
    })
    expect(FinanceSync.couple(null)).toBe('—')
    expect(FinanceSync.couple(contract)).toBe('A و B')
    const initial = await FinanceSync.recordContractInitialDeposit(contract, bank.id)
    expect(initial.ok).toBe(true)
    expect((await FinanceSync.recordContractInitialDeposit(contract, bank.id)).skipped).toBe(true)
    const payment = await FinanceSync.recordContractPayment({ contractId: contract.id, bankId: bank.id, amount: 50 })
    expect(payment.ok).toBe(true)
    expect(FinanceSync.contractPayments(contract.id)).toHaveLength(2)
    expect(FinanceSync.contractInvoices(contract.id)).toHaveLength(2)
    expect(FinanceSync.hasSyncedDeposit(contract.id)).toBe(true)
    expect(FinanceSync.recordContractPayment({ contractId: 'missing', bankId: bank.id, amount: 1 })).toMatchObject({ ok: false })
  })

  it('reconciles only valid authoritative bank balances', async () => {
    const bank = g.DB.insert('banks', { name: 'A', balance: 1 })
    const tx = g.DB.insert('transactions', { type: 'deposit', amount: 1, bankId: bank.id })
    await FinanceSync.reconcileAccepted({ payload: { transactionId: tx.id } }, {
      ledgerVersion: 3,
      transactionId: 'server-1',
      balances: [{ account_ref: `asset:bank:${bank.id}`, balance_irr: 2500 }]
    })
    expect(g.DB.find('banks', b => b.id === bank.id).balance).toBe(250)
    expect(g.DB.find('transactions', t => t.id === tx.id)).toMatchObject({ mutateStatus: 'synced', serverLedgerVersion: 3 })
    expect(g.data.studioInfo.ledgerVersion).toBe(3)
    await expect(FinanceSync.reconcileAccepted({}, null)).rejects.toThrow('authoritative_finance_projection_missing')
    await expect(FinanceSync.reconcileAccepted({}, {
      balances: [{ account_ref: `asset:bank:${bank.id}`, balance_irr: 12 }]
    })).rejects.toThrow('invalid_authoritative_bank_balance')
  })

  it('renders escaped bank options and previews without inline event handlers', () => {
    const bank = g.DB.insert('banks', { name: '<Main>', bank: 'Melli', account: '12', balance: 0 })
    const elements = { select: { innerHTML: '' }, preview: { innerHTML: '' } }
    globalThis.document = { getElementById: vi.fn(id => elements[id] || null) }
    FinanceSync.populateBankSelect('select', bank.id)
    expect(elements.select.innerHTML).toContain('selected')
    expect(elements.select.innerHTML).toContain('&lt;Main&gt;')
    FinanceSync.renderBankPreview(bank.id, 'preview')
    expect(elements.preview.innerHTML).toContain('&lt;Main&gt;')
    FinanceSync.renderBankPreview('', 'preview')
    expect(elements.preview.innerHTML).toBe('')
    expect(() => FinanceSync.populateBankSelect('missing')).not.toThrow()
  })
})
