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
    for (const k of ['DB', 'SecureDB', 'Utils', 'SMObservability', 'StudioMutateClient', 'FinanceSync', 'FinanceOutbox', 'PlanLimits', 'document', 'location', 'window', 'ErpRuntime']) {
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
    expect(FinanceSync.mapInvoiceType({ type: 'withdrawal', purposeCategory: 'print' })).toBe('expense')
    expect(FinanceSync.mapInvoiceType({ type: 'withdrawal', purposeCategory: 'unknown' })).toBe('expense')
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

  it('uses typed server projections for contract and bank reads', () => {
    const state = {
      contracts: [{ id: 'server-contract', bride: 'Server', groom: 'Couple' }],
      financeTransactions: [
        { id: 'server-deposit', contractId: 'server-contract', type: 'deposit', state: 'posted', purposeCategory: 'contract_deposit' },
        { id: 'ignored', contractId: 'server-contract', type: 'withdrawal', state: 'posted', purposeCategory: 'contract_deposit' }
      ],
      bankAccounts: [{ id: 'server-bank', name: 'Server Bank', balance: 900 }]
    }
    globalThis.ErpRuntime = { hasTypedData: () => true, state: () => state }

    expect(FinanceSync.recordContractPayment({ contractId: 'missing', amount: 1 })).toMatchObject({ ok: false })
    expect(FinanceSync.contractPayments('server-contract')).toEqual([state.financeTransactions[0]])
    expect(FinanceSync.contractInvoices('server-contract')).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'server-deposit', transactionId: 'server-deposit', status: 'paid', direction: 'in' })
    ]))
    expect(FinanceSync.hasSyncedDeposit('server-contract')).toBe(true)
    expect(FinanceSync.bankInfo('server-bank')).toMatchObject({ id: 'server-bank', name: 'Server Bank' })
    expect(FinanceSync.bankInfo('missing')).toMatchObject({ id: '', name: '—' })
    expect(FinanceSync._findActiveTx('server-deposit')).toEqual(state.financeTransactions[0])
    expect(FinanceSync.couple({ couple: 'Canonical Couple' })).toBe('Canonical Couple')
    expect(FinanceSync.couple({ bride: 'Only Bride' })).toBe('Only Bride')
    expect(FinanceSync.couple({ groom: 'Only Groom' })).toBe('Only Groom')
  })

  it('handles empty typed projections without falling back to local finance state', () => {
    globalThis.ErpRuntime = {
      hasTypedData: () => true,
      state: () => ({ contracts: [], financeTransactions: [], bankAccounts: [] })
    }
    g.DB.insert('transactions', {
      contractId: 'local-contract', type: 'deposit', state: 'posted', purposeCategory: 'contract_deposit'
    })

    expect(FinanceSync.contractPayments('local-contract')).toEqual([])
    expect(FinanceSync.hasSyncedDeposit('local-contract')).toBe(false)
    expect(FinanceSync._findActiveTx('missing')).toBeUndefined()
  })

  it('fails closed while production authority projections are not ready', () => {
    globalThis.ErpRuntime = {
      hasTypedData: () => false,
      requiresAuthority: () => true,
      state: () => ({ contracts: [], financeTransactions: [], bankAccounts: [] })
    }
    const bank = g.DB.insert('banks', { name: 'Forged Local', balance: 999 })
    const contract = g.DB.insert('contracts', { bride: 'Forged', groom: 'Local' })
    g.DB.insert('transactions', { contractId: contract.id, type: 'deposit', purposeCategory: 'contract_deposit' })

    expect(FinanceSync._requiresTypedAuthority()).toBe(true)
    expect(FinanceSync.bankInfo(bank.id)).toMatchObject({ id: '', name: '—' })
    expect(FinanceSync._findActiveTx('anything')).toBeUndefined()
    expect(FinanceSync.recordContractPayment({ contractId: contract.id, amount: 1 })).toMatchObject({ ok: false })
    expect(FinanceSync.contractPayments(contract.id)).toEqual([])
    expect(FinanceSync.contractInvoices(contract.id)).toEqual([])
    expect(FinanceSync.hasSyncedDeposit(contract.id)).toBe(false)
    const select = { innerHTML: '' }
    globalThis.document = { getElementById: () => select }
    FinanceSync.populateBankSelect('banks')
    expect(select.innerHTML).toContain('ابتدا')
  })

  it('derives authority mode from production host and explicit demo flags', () => {
    delete globalThis.ErpRuntime
    globalThis.location = { hostname: 'erp.example.ir' }
    expect(FinanceSync._requiresTypedAuthority()).toBe(true)
    globalThis.location = { hostname: 'localhost' }
    globalThis.__SM_BUILD_FLAGS__ = { localDemo: true }
    expect(FinanceSync._requiresTypedAuthority()).toBe(false)
    delete globalThis.__SM_BUILD_FLAGS__
    expect(FinanceSync._requiresTypedAuthority()).toBe(true)
  })

  it('evaluates the plan gate safely when optional local projections are absent', async () => {
    const savedDb = globalThis.DB
    const savedUtils = globalThis.Utils
    globalThis.PlanLimits = {
      assertMoneyOpAllowed: vi.fn(() => ({ ok: true }))
    }
    delete globalThis.DB
    delete globalThis.Utils
    try {
      await expect(FinanceSync._beforeMoneyCommit('record_deposit', {}, 'quota-test'))
        .resolves.toMatchObject({ ok: true, developmentLocalOnly: true })
      expect(globalThis.PlanLimits.assertMoneyOpAllowed).toHaveBeenCalledWith({}, [], '')
    } finally {
      globalThis.DB = savedDb
      globalThis.Utils = savedUtils
    }
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

  it.each([0, -1, -500, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1])(
    'rejects unsafe amount %s before every money mutation', async (amount) => {
      const bank = g.DB.insert('banks', { name: 'A', balance: 1000 })
      const tx = g.DB.insert('transactions', { type: 'deposit', amount: 100, bankId: bank.id })
      const before = JSON.stringify(g.data)
      expect((await FinanceSync.recordDeposit({ amount, bankId: bank.id })).ok).toBe(false)
      expect((await FinanceSync.recordWithdrawal({ amount, bankId: bank.id })).ok).toBe(false)
      expect((await FinanceSync.transferBetweenBanks({ amount, fromBankId: bank.id, toBankId: 'b2' })).ok).toBe(false)
      expect((await FinanceSync.updateTransaction(tx.id, { amount })).ok).toBe(false)
      expect(JSON.stringify(g.data)).toBe(before)
    }
  )

  it('rejects negative/non-integer initial deposits while zero remains an explicit no-op', () => {
    expect(FinanceSync.recordContractInitialDeposit({ id: 'c', deposit: 0 }, 'b')).toEqual({ ok: true, skipped: true })
    expect(FinanceSync.recordContractInitialDeposit({ id: 'c', deposit: -1 }, 'b')).toMatchObject({ ok: false })
    expect(FinanceSync.recordContractInitialDeposit({ id: 'c', deposit: 1.25 }, 'b')).toMatchObject({ ok: false })
  })

  it('covers bank queue, contract paid guards and fallback lookup without corrupting balances', async () => {
    const bank = g.DB.insert('banks', { name: 'A', balance: 100 })
    const contract = g.DB.insert('contracts', { total: 1000, deposit: 100, paid: 50, balance: 850 })
    await FinanceSync.applyBankDelta('', 'deposit', 10)
    await FinanceSync.applyBankDelta(bank.id, 'deposit', -10)
    await FinanceSync.applyBankDelta('missing', 'deposit', 10)
    await FinanceSync.applyBankDelta(bank.id, 'withdrawal', 20)
    expect(g.DB.find('banks', b => b.id === bank.id).balance).toBe(80)
    await FinanceSync.applyContractPaid(contract.id, 'other_income', 10)
    await FinanceSync.applyContractPaid('missing', 'contract_payment', 10)
    await FinanceSync.applyContractPaid(contract.id, 'contract_payment', 25)
    await FinanceSync.reverseContractPaid(contract.id, 'contract_payment', 1000)
    expect(g.DB.find('contracts', c => c.id === contract.id)).toMatchObject({ paid: 0, balance: 900 })

    g.DB.findActive = undefined
    expect(FinanceSync._findActiveTx('missing')).toBeUndefined()
    await FinanceSync.applyBankDelta(bank.id, 'deposit', 20)
    expect(g.DB.find('banks', b => b.id === bank.id).balance).toBe(100)
  })

  it('exercises authoritative gate outcomes without granting a failed request', async () => {
    const originalClient = globalThis.StudioMutateClient
    globalThis.PlanLimits = { assertMoneyOpAllowed: vi.fn(() => ({ ok: false, error: 'quota' })) }
    expect(await FinanceSync._beforeMoneyCommit('op', {}, 'k')).toMatchObject({ ok: false, reason: 'plan_quota' })
    delete globalThis.PlanLimits

    Object.assign(originalClient, {
      requiredWhenOnline: () => false,
      enabled: () => true,
      report: vi.fn()
    })
    globalThis.location = { hostname: 'localhost' }
    const deferred = await FinanceSync._beforeMoneyCommit('op', {}, 'k')
    expect(deferred, JSON.stringify(deferred)).toMatchObject({ ok: true, deferReport: true })
    await FinanceSync._afterMoneyCommit('op', { transactionId: 'none' }, deferred)
    expect(originalClient.report).toHaveBeenCalledOnce()

    Object.assign(originalClient, {
      requiredWhenOnline: () => true,
      enabled: () => true,
      authorize: vi.fn()
        .mockResolvedValueOnce({ ok: false, retryable: true, error: 'offline' })
        .mockResolvedValueOnce({ ok: false, queueable: true })
        .mockResolvedValueOnce({ ok: false, error: 'denied' })
        .mockResolvedValueOnce({ ok: false, skipped: true, reason: 'not_required' })
        .mockRejectedValueOnce(new Error('gateway exploded'))
    })
    expect(await FinanceSync._beforeMoneyCommit('op', {}, 'a')).toMatchObject({ ok: false, error: 'offline' })
    expect(await FinanceSync._beforeMoneyCommit('op', {}, 'b')).toMatchObject({ ok: false })
    expect(await FinanceSync._beforeMoneyCommit('op', {}, 'c')).toMatchObject({ ok: false, error: 'denied' })
    expect(await FinanceSync._beforeMoneyCommit('op', {}, 'd')).toEqual({ ok: true })
    expect(await FinanceSync._beforeMoneyCommit('op', {}, 'e')).toMatchObject({ ok: false, error: 'gateway exploded' })
  })

  it('records authorized receipts, ledger version and applied status', async () => {
    const tx = g.DB.insert('transactions', { type: 'deposit', amount: 10, bankId: '' })
    Object.assign(globalThis.StudioMutateClient, {
      requiredWhenOnline: () => true,
      enabled: () => true,
      authorize: vi.fn(async () => ({ ok: true, result: { ledgerVersion: 4 } }))
    })
    globalThis.FinanceOutbox = {
      recordAccepted: vi.fn(async row => ({ id: 'receipt', ...row })),
      markApplied: vi.fn(async () => {})
    }
    const gate = await FinanceSync._beforeMoneyCommit('op', { transactionId: tx.id }, 'idem')
    expect(gate).toMatchObject({ ok: true, authorized: true, idempotencyKey: 'idem' })
    expect(g.data.studioInfo.ledgerVersion).toBe(4)
    await FinanceSync._afterMoneyCommit('op', { transactionId: tx.id }, gate)
    expect(g.DB.find('transactions', t => t.id === tx.id).mutateStatus).toBe('synced')
    expect(globalThis.FinanceOutbox.markApplied).toHaveBeenCalledWith('idem')
  })

  it('fails closed when the mutate client loses authorize and persists queued statuses when explicitly requested', async () => {
    const client = globalThis.StudioMutateClient
    client.authorize = undefined
    expect(await FinanceSync._beforeMoneyCommit('op', {}, 'missing')).toMatchObject({
      ok: false, reason: 'mutate_client_missing'
    })
    const out = g.DB.insert('transactions', { type: 'withdrawal', amount: 1 })
    const incoming = g.DB.insert('transactions', { type: 'deposit', amount: 1 })
    globalThis.FinanceOutbox = { enqueue: vi.fn(async () => ({ ok: true })) }
    await FinanceSync._afterMoneyCommit('fallback', {
      outTransactionId: out.id, inTransactionId: incoming.id
    }, { queueOutbox: true, op: 'transfer', idempotencyKey: 'key', payload: { stable: true } })
    expect(globalThis.FinanceOutbox.enqueue).toHaveBeenCalledWith({
      op: 'transfer', idempotencyKey: 'key', payload: { stable: true }
    })
    expect(g.DB.find('transactions', t => t.id === out.id).mutateStatus).toBe('pending')
    expect(g.DB.find('transactions', t => t.id === incoming.id).mutateStatus).toBe('pending')
    globalThis.FinanceOutbox.enqueue.mockRejectedValueOnce(new Error('outbox unavailable'))
    await expect(FinanceSync._afterMoneyCommit('op', {}, { queueOutbox: true })).resolves.toBeUndefined()
  })

  it('executes update, delete and transfer through the legacy lookup fallback', async () => {
    const a = g.DB.insert('banks', { name: 'A', balance: 1000 })
    const b = g.DB.insert('banks', { name: 'B', balance: 100 })
    const contract = g.DB.insert('contracts', { total: 2000, deposit: 100, paid: 0, balance: 1900 })
    const dep = await FinanceSync.recordDeposit({
      amount: 100, bankId: a.id, contractId: contract.id,
      purposeCategory: 'contract_payment', syncInvoice: true
    })
    g.DB.findActive = undefined
    const updated = await FinanceSync.updateTransaction(dep.transactionId, {
      amount: 150, bankId: b.id, type: 'deposit', contractId: contract.id,
      purposeCategory: 'contract_payment'
    })
    expect(updated.ok).toBe(true)
    expect(g.DB.find('banks', x => x.id === a.id).balance).toBe(1000)
    expect(g.DB.find('banks', x => x.id === b.id).balance).toBe(250)
    expect((await FinanceSync.deleteTransaction(dep.transactionId)).ok).toBe(true)
    const transfer = await FinanceSync.transferBetweenBanks({
      amount: 50, fromBankId: a.id, toBankId: b.id,
      pairId: 'pair', outTransactionId: 'out', inTransactionId: 'in', date: '1405/01/01'
    })
    expect(transfer).toMatchObject({ ok: true, pairId: 'pair' })
  })

  it('restores both banks, contracts, transaction and invoice after a late update failure', async () => {
    const a = g.DB.insert('banks', { name: 'A', balance: 100 })
    const b = g.DB.insert('banks', { name: 'B', balance: 200 })
    const oldContract = g.DB.insert('contracts', { total: 1000, deposit: 100, paid: 100, balance: 800 })
    const newContract = g.DB.insert('contracts', { total: 2000, deposit: 200, paid: 50, balance: 1750 })
    const invoice = g.DB.insert('invoices', { number: 'F-1', amount: 100, _deleted: false })
    const tx = g.DB.insert('transactions', {
      type: 'deposit', amount: 100, bankId: a.id, contractId: oldContract.id,
      purposeCategory: 'contract_payment', invoiceId: invoice.id
    })
    g.DB.flush = vi.fn(async () => { throw new Error('late flush failure') })
    const result = await FinanceSync.updateTransaction(tx.id, {
      amount: 150, bankId: b.id, type: 'deposit', contractId: newContract.id,
      purposeCategory: 'contract_payment'
    })
    expect(result.ok).toBe(false)
    expect(g.DB.find('banks', x => x.id === a.id).balance).toBe(100)
    expect(g.DB.find('banks', x => x.id === b.id).balance).toBe(200)
    expect(g.DB.find('contracts', x => x.id === oldContract.id)).toMatchObject({ paid: 100, balance: 800 })
    expect(g.DB.find('contracts', x => x.id === newContract.id)).toMatchObject({ paid: 50, balance: 1750 })
    expect(g.DB.find('transactions', x => x.id === tx.id)).toMatchObject({ amount: 100, bankId: a.id })
    expect(g.DB.find('invoices', x => x.id === invoice.id)).toMatchObject({ number: 'F-1', amount: 100 })
  })

  it('covers invoice numbering fallback, random id fallback and reconciliation filters', async () => {
    g.DB.active = undefined
    g.DB.insert('invoices', { number: 'old', _deleted: false })
    g.DB.insert('invoices', { number: 'deleted', _deleted: true })
    expect(FinanceSync.genInvoiceNumber()).toBe('F-14040401-002')
    const originalCrypto = globalThis.crypto
    Object.defineProperty(globalThis, 'crypto', { value: {}, configurable: true })
    expect(FinanceSync._newLocalId('manual')).toMatch(/^manual_/)
    Object.defineProperty(globalThis, 'crypto', { value: originalCrypto, configurable: true })
    const bank = g.DB.insert('banks', { name: 'A', balance: 0 })
    g.DB.findActive = undefined
    await FinanceSync.reconcileAccepted({}, {
      balances: [
        { account_ref: 'liability:customer', balance_irr: 10 },
        { account_ref: 'asset:bank:missing', balance_irr: 100 },
        { account_ref: `asset:bank:${bank.id}`, balance_irr: 500 }
      ]
    })
    expect(g.DB.find('banks', x => x.id === bank.id).balance).toBe(50)
  })

  it('preserves every explicit finance field instead of replacing it with defaults', async () => {
    const a = g.DB.insert('banks', {
      name: 'Primary', bank: 'Melli', account: '11', card: '22', iban: 'IR33', holder: 'Owner', balance: 1000
    })
    const b = g.DB.insert('banks', { name: 'Secondary', balance: 0 })
    const deposit = await FinanceSync.recordDeposit({
      transactionId: 'dep-full', amount: 100, bankId: a.id, date: '1405/02/03', periodMonth: '1405/02',
      sourceType: 'partner', contractId: '', client: 'Client', purposeCategory: 'rent', purpose: 'Rent',
      paymentMethod: 'cash', transactionRef: 'ref-d', accountOrCard: 'cashbox', notes: 'note-d', syncInvoice: false
    })
    expect(deposit.ok).toBe(true)
    expect(g.DB.find('transactions', x => x.id === deposit.transactionId)).toMatchObject({
      date: '1405/02/03', periodMonth: '1405/02', sourceType: 'partner', client: 'Client',
      purpose: 'Rent', paymentMethod: 'cash', transactionRef: 'ref-d', accountOrCard: 'cashbox', notes: 'note-d'
    })
    const withdrawal = await FinanceSync.recordWithdrawal({
      transactionId: 'wd-full', amount: 1200, bankId: a.id, allowOverdraft: true,
      date: '1405/02/04', periodMonth: '1405/02', sourceType: 'vendor', contractId: 'c', personnelId: 'p',
      client: 'Vendor', purposeCategory: 'equipment', purpose: 'Gear', paymentMethod: 'card',
      transactionRef: 'ref-w', accountOrCard: '22', notes: 'note-w', desc: 'description',
      expenseId: 'expense', salaryPaymentId: 'salary', syncInvoice: false
    })
    expect(withdrawal.ok).toBe(true)
    expect(g.DB.find('transactions', x => x.id === withdrawal.transactionId)).toMatchObject({
      contractId: 'c', personnelId: 'p', expenseId: 'expense', salaryPaymentId: 'salary', desc: 'description'
    })
    const transfer = await FinanceSync.transferBetweenBanks({
      amount: 10, fromBankId: b.id, toBankId: a.id, pairId: 'full-pair',
      outTransactionId: 'full-out', inTransactionId: 'full-in', allowOverdraft: true,
      date: '1405/02/05', periodMonth: '1405/02', purpose: 'Move', paymentMethod: 'cash',
      transactionRef: 'ref-t', notes: 'note-t'
    })
    expect(transfer.ok).toBe(false)
  })

  it('covers sparse and complete invoice, person, contract and bank projections', async () => {
    expect(FinanceSync.couple({ couple: 'Exact' })).toBe('Exact')
    expect(FinanceSync.couple({ bride: 'Bride' })).toBe('Bride')
    expect(FinanceSync.couple({ groom: 'Groom' })).toBe('Groom')
    expect(FinanceSync.couple({})).toBe('—')
    expect(FinanceSync.normalizeBankFields({ account: 'a', iban: 'i' })).toMatchObject({ accountNumber: 'a', shaba: 'i' })
    const bank = g.DB.insert('banks', { bank: 'Melli', card: '123', balance: 0 })
    const contract = g.DB.insert('contracts', { bride: 'B', groom: 'G' })
    const sparseId = await FinanceSync.createInvoiceFromTx({
      type: 'deposit', amount: 10, date: '1405/01/01', bankId: bank.id,
      contractId: contract.id, purposeCategory: 'other_income'
    }, 'sparse')
    expect(g.DB.find('invoices', i => i.id === sparseId)).toMatchObject({ client: 'B و G', direction: 'in' })
    const missingExisting = await FinanceSync.createInvoiceFromTx({
      type: 'withdrawal', amount: 5, date: '1405/01/02', bankId: '',
      purposeCategory: 'print', client: 'Explicit', accountOrCard: 'manual', notes: 'memo'
    }, 'other', 'missing-invoice')
    expect(missingExisting).toBe('missing-invoice')
    expect(FinanceSync.mapInvoiceType({ type: 'withdrawal', purposeCategory: 'print' })).toBe('expense')
    expect(FinanceSync.mapInvoiceType({ type: 'withdrawal', purposeCategory: 'unknown' })).toBe('expense')

    const elements = { rich: { innerHTML: '' }, plain: { innerHTML: '' } }
    globalThis.document = { getElementById: id => elements[id] || null }
    FinanceSync.renderBankPreview(bank.id, 'rich')
    expect(elements.rich.innerHTML).toContain('کارت')
    FinanceSync.renderBankPreview('missing', 'plain')
    expect(elements.plain.innerHTML).toContain('—')
  })

  it('restores initial-deposit contract metadata after a late persistence failure', async () => {
    const bank = g.DB.insert('banks', { name: 'A', balance: 0 })
    const contract = g.DB.insert('contracts', {
      total: 1000, deposit: 100, paid: 0, balance: 900,
      depositBankId: 'previous-bank', depositTransactionId: 'previous-tx',
      depositInvoiceId: 'previous-invoice', depositRecordedAt: 'previous-date'
    })
    g.DB.flush = vi.fn(async () => { throw new Error('late failure') })
    const result = await FinanceSync.recordDeposit({
      transactionId: 'initial', amount: 100, bankId: bank.id, contractId: contract.id,
      purposeCategory: 'contract_deposit', syncInvoice: true
    })
    expect(result.ok).toBe(false)
    expect(g.DB.find('contracts', c => c.id === contract.id)).toMatchObject({
      depositBankId: 'previous-bank', depositTransactionId: 'previous-tx',
      depositInvoiceId: 'previous-invoice', depositRecordedAt: 'previous-date'
    })
  })

  it('executes collection fallback predicates with active and deleted rows', () => {
    g.DB.active = undefined
    g.DB.insert('transactions', { contractId: 'c', type: 'deposit', purposeCategory: 'contract_deposit', _deleted: false })
    g.DB.insert('transactions', { contractId: 'c', type: 'deposit', purposeCategory: 'contract_deposit', _deleted: true })
    g.DB.insert('invoices', { contractId: 'c', _deleted: false })
    g.DB.insert('invoices', { contractId: 'c', _deleted: true })
    g.DB.insert('banks', { name: 'Visible', _deleted: false })
    g.DB.insert('banks', { name: 'Hidden', _deleted: true })
    expect(FinanceSync.recordContractInitialDeposit({ id: 'c', deposit: 10 }, '')).toMatchObject({ ok: false })
    expect(FinanceSync.recordContractInitialDeposit({ id: 'c', deposit: 10 }, 'bank')).toMatchObject({ skipped: true })
    expect(FinanceSync.contractInvoices('c')).toHaveLength(1)
    expect(FinanceSync.hasSyncedDeposit('c')).toBe(true)
    const select = { innerHTML: '' }
    globalThis.document = { getElementById: () => select }
    FinanceSync.populateBankSelect('select')
    expect(select.innerHTML).toContain('Visible')
    expect(select.innerHTML).not.toContain('Hidden')
  })

  it('updates every editable transaction field and exercises explicit patch branches', async () => {
    const bank = g.DB.insert('banks', { name: 'A', balance: 100 })
    const tx = g.DB.insert('transactions', {
      type: 'deposit', amount: 10, date: 'old', bankId: bank.id, sourceType: 'old',
      purposeCategory: 'other_income', invoiceId: '', expenseId: '', salaryPaymentId: '', chequeId: ''
    })
    const result = await FinanceSync.updateTransaction(tx.id, {
      amount: 20, type: 'deposit', date: '1405/03/01', periodMonth: '1405/03', bankId: bank.id,
      sourceType: 'partner', contractId: '', personnelId: 'person', client: 'client',
      purposeCategory: 'rent', purpose: 'purpose', paymentMethod: 'cash', transactionRef: 'ref',
      accountOrCard: 'account', notes: 'notes', desc: 'desc'
    }, { syncInvoice: false, clientMutationId: 'fixed' })
    expect(result.ok).toBe(true)
    expect(g.DB.find('transactions', x => x.id === tx.id)).toMatchObject({
      amount: 20, date: '1405/03/01', periodMonth: '1405/03', sourceType: 'partner',
      personnelId: 'person', client: 'client', purpose: 'purpose', desc: 'desc'
    })
  })

  it('denies every operation before local mutation when the authoritative gate rejects it', async () => {
    const a = g.DB.insert('banks', { name: 'A', balance: 100 })
    const b = g.DB.insert('banks', { name: 'B', balance: 0 })
    const tx = g.DB.insert('transactions', { type: 'deposit', amount: 10, bankId: a.id })
    Object.assign(globalThis.StudioMutateClient, {
      requiredWhenOnline: () => true,
      enabled: () => true,
      authorize: vi.fn(async () => ({ ok: false, error: 'denied', reason: 'policy' }))
    })
    expect((await FinanceSync.updateTransaction(tx.id, { amount: 20 })).ok).toBe(false)
    expect((await FinanceSync.deleteTransaction(tx.id)).ok).toBe(false)
    expect((await FinanceSync.transferBetweenBanks({ amount: 10, fromBankId: a.id, toBankId: b.id })).ok).toBe(false)
    expect((await FinanceSync.recordDeposit({ amount: 10, bankId: a.id })).ok).toBe(false)
    expect((await FinanceSync.recordWithdrawal({ amount: 10, bankId: a.id })).ok).toBe(false)
    expect(g.DB.find('banks', x => x.id === a.id).balance).toBe(100)
    expect(g.DB.find('transactions', x => x.id === tx.id)._deleted).not.toBe(true)
  })

  it('covers non-critical reporting, quota pass and reconciliation defaults', async () => {
    const client = globalThis.StudioMutateClient
    Object.assign(client, {
      requiredWhenOnline: () => false,
      enabled: () => false,
      report: vi.fn(() => { throw new Error('telemetry failure') })
    })
    expect(() => FinanceSync._reportMutate('op', {})).not.toThrow()
    globalThis.PlanLimits = { assertMoneyOpAllowed: vi.fn(() => ({ ok: true })) }
    expect(await FinanceSync._beforeMoneyCommit('op', {}, 'quota-pass')).toMatchObject({
      ok: true, developmentLocalOnly: true
    })
    delete globalThis.PlanLimits

    const tx = g.DB.insert('transactions', { type: 'deposit', amount: 1 })
    globalThis.FinanceOutbox = { enqueue: vi.fn(async () => ({ ok: true })) }
    await FinanceSync._afterMoneyCommit('op', { transactionId: tx.id }, {
      queueOutbox: true, idempotencyKey: 'only-out'
    })
    expect(g.DB.find('transactions', x => x.id === tx.id).mutateStatus).toBe('pending')
    await FinanceSync._afterMoneyCommit('op', {}, { authorized: true })

    await FinanceSync.reconcileAccepted({ payload: { transactionId: 'missing' } }, {
      balances: [], ledgerVersion: null
    })
    expect(FinanceSync._serverAcceptedFailure({}, {}, 'fallback')).toMatchObject({
      ok: false, error: 'fallback', serverAccepted: false, needsReconciliation: false, idempotencyKey: ''
    })
  })

  it('validates missing bank ids before invoking the authority service', async () => {
    expect(await FinanceSync.recordDeposit({ amount: 10 })).toMatchObject({ ok: false })
    expect(await FinanceSync.recordWithdrawal({ amount: 10 })).toMatchObject({ ok: false })
  })

  it('covers empty-value safety fallbacks without manufacturing financial data', async () => {
    const originalBankInfo = FinanceSync.bankInfo
    FinanceSync.bankInfo = () => ({ name: '', bank: '', account: '', card: '' })
    expect(FinanceSync.bankLabel('empty')).toBe('—')
    FinanceSync.bankInfo = originalBankInfo

    const contract = g.DB.insert('contracts', { total: 0, deposit: 0, paid: 5, balance: 0 })
    await FinanceSync.reverseContractPaid(contract.id, 'contract_payment', 5)
    expect(g.DB.find('contracts', c => c.id === contract.id)).toMatchObject({ paid: 0, balance: 0 })

    const client = globalThis.StudioMutateClient
    Object.assign(client, {
      requiredWhenOnline: () => true,
      enabled: () => true,
      authorize: vi.fn(async () => ({ ok: false }))
    })
    expect(await FinanceSync._beforeMoneyCommit('op', {}, 'defaults')).toMatchObject({
      ok: false, error: 'تأیید سرور برای تراکنش مالی ناموفق بود', reason: 'mutate_failed'
    })
    client.authorize = vi.fn(async () => { throw {} })
    expect(await FinanceSync._beforeMoneyCommit('op', {}, 'throw-default')).toMatchObject({
      ok: false, error: 'خطای دروازه مالی سرور'
    })

    await FinanceSync.reconcileAccepted({}, { balances: [{}] })
    expect(FinanceSync._serverAcceptedFailure(null, null, 'fallback')).toMatchObject({ error: 'fallback' })
  })

  it('covers authority and projection fallback values with explicit assertions', async () => {
    const client = globalThis.StudioMutateClient
    client.report = undefined
    expect(() => FinanceSync._reportMutate('noop', {})).not.toThrow()

    globalThis.FinanceOutbox = { recordAccepted: vi.fn(async row => row) }
    Object.assign(client, {
      requiredWhenOnline: () => true,
      enabled: () => true,
      authorize: vi.fn(async () => ({ ok: true }))
    })
    const gate = await FinanceSync._beforeMoneyCommit('accepted-empty', {}, 'empty-result')
    expect(gate).toMatchObject({ ok: true, authorized: true })
    expect(globalThis.FinanceOutbox.recordAccepted).toHaveBeenCalledWith(expect.objectContaining({ serverResult: null }))

    const tx = g.DB.insert('transactions', { type: 'deposit', amount: 1 })
    await FinanceSync.reconcileAccepted({ payload: { transactionId: tx.id } }, { balances: [] })
    expect(g.DB.find('transactions', row => row.id === tx.id)).toMatchObject({
      serverLedgerVersion: null, serverTransactionId: ''
    })
    expect(FinanceSync._serverAcceptedFailure({ authorized: true, idempotencyKey: 'k' }, null, 'fallback')).toMatchObject({
      serverAccepted: true, needsReconciliation: true, idempotencyKey: 'k'
    })

    const originalGet = g.DB.get
    g.DB.active = undefined
    g.DB.get = col => col === 'invoices' ? undefined : originalGet(col)
    expect(FinanceSync.genInvoiceNumber()).toBe('F-14040401-001')
  })

  it('rolls back deposit contract metadata, paid amount, invoice, transaction and bank', async () => {
    const bank = g.DB.insert('banks', { name: 'A', balance: 10 })
    const contract = g.DB.insert('contracts', {
      total: 1000, deposit: 0, paid: 50, balance: 950,
      depositBankId: 'old', depositTransactionId: 'oldtx', depositInvoiceId: 'oldinv', depositRecordedAt: 'old'
    })
    g.DB.flush = vi.fn(async () => { throw new Error('flush failed') })
    const result = await FinanceSync.recordDeposit({
      transactionId: 'stable', amount: 100, bankId: bank.id, contractId: contract.id,
      purposeCategory: 'contract_payment', syncInvoice: true
    })
    expect(result.ok).toBe(false)
    expect(g.DB.find('banks', b => b.id === bank.id).balance).toBe(10)
    expect(g.DB.find('contracts', c => c.id === contract.id)).toMatchObject({ paid: 50, balance: 950 })
    expect(g.DB.find('transactions', t => t.id === 'stable')._deleted).toBe(true)
  })

  it('rolls back a withdrawal after transaction, bank and invoice were written', async () => {
    const bank = g.DB.insert('banks', { name: 'A', balance: 500 })
    g.DB.flush = vi.fn(async () => { throw new Error('flush failed') })
    const result = await FinanceSync.recordWithdrawal({
      transactionId: 'wd', amount: 100, bankId: bank.id, syncInvoice: true
    })
    expect(result.ok).toBe(false)
    expect(g.DB.find('banks', b => b.id === bank.id).balance).toBe(500)
    expect(g.DB.find('transactions', t => t.id === 'wd')._deleted).toBe(true)
    expect(g.DB.active('invoices')).toHaveLength(0)
  })

  it('uses fallback collections and empty UI states', () => {
    const bank = g.DB.insert('banks', { name: '', bank: '', balance: 0 })
    g.DB.findActive = undefined
    g.DB.active = undefined
    g.DB.insert('transactions', { contractId: 'c', type: 'deposit', purposeCategory: 'contract_deposit', _deleted: false })
    g.DB.insert('transactions', { contractId: 'c', type: 'withdrawal', _deleted: false })
    g.DB.insert('invoices', { contractId: 'c', _deleted: false })
    g.DB.insert('invoices', { contractId: 'c', _deleted: true })
    expect(FinanceSync.bankLabel(bank.id)).toBe('حساب')
    expect(FinanceSync.contractPayments('c')).toHaveLength(1)
    expect(FinanceSync.contractInvoices('c')).toHaveLength(1)
    expect(FinanceSync.hasSyncedDeposit('c')).toBe(true)
    const empty = { innerHTML: '' }
    globalThis.document = { getElementById: () => empty }
    g.DB.set('banks', [])
    FinanceSync.populateBankSelect('x')
    expect(empty.innerHTML).toContain('ابتدا')
    expect(() => FinanceSync.renderBankPreview('b', 'missing')).not.toThrow()
  })
})
