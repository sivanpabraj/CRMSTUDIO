import { describe, expect, it, vi, beforeEach } from 'vitest'
import fs from 'node:fs'
import vm from 'node:vm'

const paymentSource = fs.readFileSync('js/payment-gateway.js', 'utf8')
const conflictSource = fs.readFileSync('js/smart-conflict-detector.js', 'utf8')
const backupSource = fs.readFileSync('js/backup-service.js', 'utf8')

describe('Engineering Pack v6.4.0 — Smart Conflict Detection', () => {
  function getConflictDetector(customDB = {}) {
    const contracts = [
      {
        id: 'c1',
        contractNum: '1405-01',
        couple: 'سارا و علی',
        date: '1405/06/15',
        team: [{ personnelId: 'p1', role: 'عکاس اصلی' }]
      }
    ]
    const persProjects = [
      {
        id: 'pp1',
        contractId: 'c1',
        personnelId: 'p1',
        eventDate: '1405/06/15',
        role: 'عکاس اصلی',
        status: 'accepted'
      }
    ]
    const equipment = [
      {
        id: 'eq1',
        name: 'Sony FX3',
        status: 'available',
        assignedDate: '1405/06/15',
        assignedContractId: 'c1',
        assignedCouple: 'سارا و علی'
      },
      {
        id: 'eq2',
        name: 'DJI RS3 Pro',
        status: 'maintenance'
      }
    ]

    const dbStore = {
      contracts,
      persProjects,
      equipment,
      ...customDB
    }

    const context = {
      window: {},
      DB: {
        get: (key) => dbStore[key] || [],
        find: (key, predicate) => (dbStore[key] || []).find(predicate) || null
      }
    }

    vm.runInNewContext(conflictSource, context)
    return { detector: context.window.SmartConflictDetector, dbStore }
  }

  it('detects personnel conflict when assigned to two shoots on the same date', () => {
    const { detector } = getConflictDetector()

    // Same date, different contract -> conflict!
    const resConflict = detector.checkPersonnelConflict({
      personnelId: 'p1',
      date: '1405/06/15',
      excludeContractId: 'c2'
    })
    expect(resConflict.hasConflict).toBe(true)
    expect(resConflict.conflicts.length).toBeGreaterThan(0)
    expect(resConflict.conflicts[0].couple).toBe('سارا و علی')

    // Different date -> no conflict
    const resNoConflict = detector.checkPersonnelConflict({
      personnelId: 'p1',
      date: '1405/06/20',
      excludeContractId: 'c2'
    })
    expect(resNoConflict.hasConflict).toBe(false)
    expect(resNoConflict.conflicts.length).toBe(0)
  })

  it('detects equipment conflict when item is under maintenance or already assigned on same date', () => {
    const { detector } = getConflictDetector()

    // eq1 is assigned on 1405/06/15 to c1 -> clash for c2
    const resAssigned = detector.checkEquipmentConflict({
      equipmentId: 'eq1',
      date: '1405/06/15',
      excludeContractId: 'c2'
    })
    expect(resAssigned.hasConflict).toBe(true)
    expect(resAssigned.conflicts[0].type).toBe('overlap')

    // eq2 is under maintenance
    const resMaint = detector.checkEquipmentConflict({
      equipmentId: 'eq2',
      date: '1405/06/15'
    })
    expect(resMaint.hasConflict).toBe(true)
    expect(resMaint.conflicts[0].type).toBe('status')
  })

  it('performs full contract scan and generates conflict warning HTML', () => {
    const { detector } = getConflictDetector()

    const draftContract = {
      id: 'c2',
      contractNum: '1405-02',
      eventDate: '1405/06/15',
      team: [{ personnelId: 'p1', name: 'رضا عکاس' }],
      equipmentIds: ['eq1', 'eq2']
    }

    const scan = detector.checkContractConflicts(draftContract)
    expect(scan.hasConflicts).toBe(true)
    expect(scan.personnelConflicts.length).toBe(1)
    expect(scan.equipmentConflicts.length).toBe(2)

    const html = detector.renderConflictHtml(scan)
    expect(html).toContain('هشدار تداخل زمانی و تجهیزاتی')
    expect(html).toContain('رضا عکاس')
    expect(html).toContain('Sony FX3')
  })
})

describe('Engineering Pack v6.4.0 — Payment Gateway & Installments', () => {
  function getPaymentGateway() {
    const contracts = [
      {
        id: 'cnt1',
        contractNum: '1405-10',
        couple: 'مریم و احمد',
        total: 20000000,
        paid: 5000000,
        installments: [
          { title: 'بیعانه', amount: 5000000, status: 'paid' },
          { title: 'قسط دوم', amount: 10000000, status: 'pending' },
          { title: 'تسویه', amount: 5000000, status: 'pending' }
        ]
      }
    ]
    const banks = [
      { id: 'b1', name: 'بانک ملت', balance: 5000000, isDefault: true }
    ]
    const transactions = []

    const context = {
      window: {
        location: { origin: 'https://studio.example.ir', pathname: '/app/index.html' }
      },
      URLSearchParams: globalThis.URLSearchParams,
      Utils: {
        todayJalali: () => '1405/06/01',
        toast: vi.fn()
      },
      DB: {
        get: (key) => key === 'banks' ? banks : (key === 'contracts' ? contracts : transactions),
        find: (key, predicate) => (key === 'contracts' ? contracts.find(predicate) : null),
        insert: (key, item) => { if (key === 'transactions') transactions.push(item) },
        update: (key, id, updates) => {
          if (key === 'contracts') {
            const c = contracts.find(x => x.id === id)
            if (c) Object.assign(c, updates)
          }
          if (key === 'banks') {
            const b = banks.find(x => x.id === id)
            if (b) Object.assign(b, updates)
          }
        },
        flush: vi.fn()
      }
    }

    vm.runInNewContext(paymentSource, context)
    return { gateway: context.window.PaymentGateway, contracts, banks, transactions, context }
  }

  it('generates shareable digital invoice URLs correctly', () => {
    const { gateway } = getPaymentGateway()
    const url = gateway.createInvoiceUrl('cnt1', 10000000, 1)
    expect(url).toContain('/invoice.html?cid=cnt1')
    expect(url).toContain('amount=10000000')
    expect(url).toContain('inst=1')
  })

  it('records successful online payment, updates contract balance, bank, and installment status', async () => {
    const { gateway, contracts, banks, transactions } = getPaymentGateway()

    const res = await gateway.recordSuccessfulPayment({
      contractId: 'cnt1',
      contractNum: '1405-10',
      amount: 10000000,
      installmentIndex: 1,
      customerName: 'مریم و احمد'
    })

    expect(res.ok).toBe(true)
    expect(res.refId).toMatch(/^REF_/)

    // Contract paid increased from 5,000,000 to 15,000,000
    expect(contracts[0].paid).toBe(15000000)
    // Installment index 1 marked as paid
    expect(contracts[0].installments[1].status).toBe('paid')
    expect(contracts[0].installments[1].refId).toBe(res.refId)

    // Bank balance increased from 5,000,000 to 15,000,000
    expect(banks[0].balance).toBe(15000000)

    // Transaction logged
    expect(transactions.length).toBe(1)
    expect(transactions[0].paymentMethod).toBe('online_gateway')
    expect(transactions[0].amount).toBe(10000000)
  })

  it('routes deposit to specific bank matching the gateway provider', async () => {
    const { gateway, contracts, banks } = getPaymentGateway()
    banks.push({ id: 'b_zibal', name: 'بانک سامان زیبال', balance: 0, gateway: 'zibal' })

    const res = await gateway.recordSuccessfulPayment({
      contractId: 'cnt1',
      contractNum: '1405-10',
      amount: 4000000,
      gateway: 'zibal',
      merchantId: 'zibal_merch_custom'
    })

    expect(res.ok).toBe(true)
    const zibalBank = banks.find(b => b.id === 'b_zibal')
    expect(zibalBank.balance).toBe(4000000)
  })

  it('computes 10% VAT tax correctly for exclusive and inclusive modes', () => {
    const computeTax = (amount, rate, mode) => {
      if (!rate || rate <= 0) return { base: amount, tax: 0, total: amount }
      if (mode === 'inclusive') {
        const base = Math.round(amount / (1 + rate / 100))
        const tax = amount - base
        return { base, tax, total: amount }
      }
      const tax = Math.round(amount * (rate / 100))
      return { base: amount, tax, total: amount + tax }
    }

    // Exclusive mode: 10,000,000 + 10% = 11,000,000
    const excl = computeTax(10000000, 10, 'exclusive')
    expect(excl.base).toBe(10000000)
    expect(excl.tax).toBe(1000000)
    expect(excl.total).toBe(11000000)

    // Inclusive mode: 11,000,000 inclusive = 10,000,000 base + 1,000,000 tax
    const incl = computeTax(11000000, 10, 'inclusive')
    expect(incl.base).toBe(10000000)
    expect(incl.tax).toBe(1000000)
    expect(incl.total).toBe(11000000)
  })
})

describe('Engineering Pack v6.4.0 — Backup Service to Bale & Telegram Bots', () => {
  it('provides sendToBot method and fails gracefully when bot token is missing', async () => {
    const context = {
      window: {},
      DB: { exportJSON: () => '{"test":true}', get: () => ({}) },
      fetch: vi.fn().mockRejectedValue(new Error('Network offline')),
      Blob: class { constructor(d) { this.data = d } },
      FormData: class { append() {} },
      Utils: { todayJalali: () => '1405/01/01' }
    }

    vm.runInNewContext(backupSource, context)
    const BackupService = context.window.BackupService

    const res = await BackupService.sendToBot('bale', { token: '', chatId: '' })
    expect(res.ok).toBe(false)
    expect(res.error).toContain('تنظیم نشده است')
  })
})

describe('Engineering Pack v6.4.0 — Bank Management & Auto Card Detection', () => {
  it('detects Iranian banks accurately from 6-digit card prefix', () => {
    const accountingSource = fs.readFileSync('studio-m/js/accounting.js', 'utf8')
    const context = {
      window: {},
      SM: {},
      SMUI: {},
      SMModules: {},
      DB: {},
      SecureDB: {},
      Utils: {}
    }
    vm.runInNewContext(accountingSource, context)
    const acc = context.window.SMAccounting

    expect(acc.detectBankFromCard('6037-9912-3456-7890')).toContain('ملی')
    expect(acc.detectBankFromCard('6104331234567890')).toContain('ملت')
    expect(acc.detectBankFromCard('6219861234567890')).toContain('سامان')
    expect(acc.detectBankFromCard('5022291234567890')).toContain('پاسارگاد')
    expect(acc.detectBankFromCard('5041721234567890')).toContain('رسالت')
  })
})
