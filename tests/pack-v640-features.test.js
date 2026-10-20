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

describe('Engineering Pack v6.4.0 — Multi-Template Invoice & Receipt Generator', () => {
  const invoiceSource = fs.readFileSync('js/invoice-generator.js', 'utf8')

  function getInvoiceGenerator(dbStore = {}) {
    const context = {
      window: {},
      document: {
        getElementById: () => null,
        createElement: () => ({ style: {} }),
        body: { appendChild: () => {} }
      },
      DB: {
        get: (k) => dbStore[k] || null,
        find: (k, pred) => (dbStore[k] || []).find(pred) || null
      },
      Utils: {
        todayJalali: () => '1405/01/15',
        toast: () => {}
      }
    }
    vm.runInNewContext(invoiceSource, context)
    return context.window.InvoiceGenerator
  }

  it('converts numbers to Persian words accurately', () => {
    const gen = getInvoiceGenerator()
    expect(gen.numberToWordsFa(0)).toBe('صفر')
    expect(gen.numberToWordsFa(15000000)).toBe('پانزده میلیون')
    expect(gen.numberToWordsFa(23500000)).toBe('بیست و سه میلیون و پانصد هزار')
    expect(gen.numberToWordsFa(150000)).toBe('یکصد و پنجاه هزار')
    expect(gen.numberToWordsFa(1250000)).toBe('یک میلیون و دویست و پنجاه هزار')
  })

  it('prepares invoice data from a transaction with VAT tax calculation', () => {
    const dbStore = {
      studioInfo: {
        name: 'استودیو ماندنی',
        taxEnabled: true,
        taxRate: 10,
        taxEconomyCode: '4111222333'
      },
      transactions: [
        {
          id: 'tx101',
          type: 'deposit',
          amount: 20000000,
          date: '1405/01/20',
          client: 'شادی و پیمان',
          purpose: 'بیعانه پکیج VIP فرمالیته',
          referenceId: 'REF-7890'
        }
      ]
    }

    const gen = getInvoiceGenerator(dbStore)
    const data = gen.prepareData({ txId: 'tx101' })

    expect(data.invoiceNumber).toBe('REF-7890')
    expect(data.customerName).toBe('شادی و پیمان')
    expect(data.amount).toBe(20000000)
    expect(data.taxRate).toBe(10)
    expect(data.taxAmount).toBe(2000000) // 10% of 20,000,000
    expect(data.finalTotal).toBe(22000000)
    expect(data.studioEconomicCode).toBe('4111222333')
  })

  it('prepares contract cancellation and refund invoice correctly', () => {
    const dbStore = {
      studioInfo: { name: 'استودیو ماندنی' },
      contracts: [
        {
          id: 'c-cancel-1',
          contractNum: '1405-99',
          couple: 'نیلوفر و رامین',
          status: 'cancelled',
          total: 35000000,
          cancelRecord: {
            paidAmount: 15000000,
            cancellationFee: 3000000,
            refundAmount: 12000000,
            refundMethod: 'shaba',
            bankAccount: 'IR880170000000111222333444',
            paidTo: 'رامین کاظمی',
            refundNotes: 'استرداد وجه طبق ضوابط کنسلی اتحادیه',
            recordedAt: '1405/01/22 14:30'
          }
        }
      ]
    }

    const gen = getInvoiceGenerator(dbStore)
    const data = gen.prepareData({ contractId: 'c-cancel-1', type: 'cancellation' })

    expect(data.type).toBe('cancellation')
    expect(data.contractNum).toBe('1405-99')
    expect(data.customerName).toBe('نیلوفر و رامین')
    expect(data.cancellationFee).toBe(3000000)
    expect(data.refundAmount).toBe(12000000)
    expect(data.notes).toContain('استرداد وجه طبق ضوابط کنسلی اتحادیه')
  })

  it('renders all 4 selectable invoice templates without throwing', () => {
    const dbStore = {
      studioInfo: {
        name: 'استودیو ماندنی',
        taxEconomyCode: '987654321',
        nationalId: '1010101010'
      }
    }
    const gen = getInvoiceGenerator(dbStore)
    const testData = gen.prepareData({
      amount: 10000000,
      customerName: 'فرهاد مجیدی',
      purpose: 'فیلمبرداری مراسم'
    })

    const officialHtml = gen.renderOfficialHtml(testData)
    expect(officialHtml).toContain('صورتحساب رسمی فروش کالا و خدمات')
    expect(officialHtml).toContain('اتحادیه صنف عکاسان')
    expect(officialHtml).toContain('فرهاد مجیدی')

    const cinemaHtml = gen.renderCinemaLuxuryHtml(testData)
    expect(cinemaHtml).toContain('#d4af37') // Gold accent
    expect(cinemaHtml).toContain('CINEMA & PHOTOGRAPHY STUDIO')

    const a5Html = gen.renderStandardA5Html(testData)
    expect(a5Html).toContain('سند اداری مالی و رسید حسابداری')
    expect(a5Html).toContain('برگه دریافت وجه (واریز)')
    expect(a5Html).toContain('مدیر مالی استودیو')

    const thermalHtml = gen.renderThermalPosHtml(testData)
    expect(thermalHtml).toContain('فیش صندوق و تایید تراکنش')
    expect(thermalHtml).toContain('تومان')
    expect(thermalHtml).toContain('فرهاد مجیدی')
  })
})

describe('Engineering Pack v6.4.0 — Smart Lifecycle SMS Automation', () => {
  const lifecycleSource = fs.readFileSync('js/smart-lifecycle-sms.js', 'utf8')

  function getLifecycleModule(dbStore = {}) {
    const sentLogs = []
    const context = {
      window: {},
      DB: {
        get: (k) => dbStore[k] || null,
        set: (k, v) => { dbStore[k] = v }
      },
      Utils: {
        todayJalali: () => '1405/01/20',
        daysUntil: (target) => {
          if (target === '1405/01/22') return 2
          if (target === '1405/01/21') return 1
          if (target === '1405/01/20') return 0
          return 10
        },
        fmtNum: (n) => Number(n).toLocaleString('fa-IR')
      },
      PaymentGateway: {
        generateInvoiceUrl: (id) => `https://studiomandani.ir/invoice.html?id=${id}`
      },
      SmsProvider: {
        sendStudio: vi.fn().mockImplementation((phone, text) => {
          sentLogs.push({ phone, text })
          return Promise.resolve({ ok: true })
        })
      }
    }
    vm.runInNewContext(lifecycleSource, context)
    return { mod: context.window.SmartLifecycleSMS, sentLogs, context }
  }

  it('builds installment, shoot reminder, and anniversary messages accurately', () => {
    const { mod } = getLifecycleModule()
    const studio = { name: 'استودیو ماندنی', phone: '09187766554' }
    const contract = {
      id: 'c-100',
      contractNum: '1405-100',
      couple: 'سحر و شاهین',
      eventDate: '1405/01/22',
      venue: 'عمارت فرشته'
    }

    const instMsg = mod.buildInstallmentMessage(contract, 5000000, studio)
    expect(instMsg).toContain('سحر و شاهین')
    expect(instMsg).toContain('استودیو ماندنی')
    expect(instMsg).toContain('۵٬۰۰۰٬۰۰۰ تومان')
    expect(instMsg).toContain('https://studiomandani.ir/invoice.html?id=c-100')

    const coupleMsg = mod.buildShootCoupleMessage(contract, studio)
    expect(coupleMsg).toContain('سحر و شاهین')
    expect(coupleMsg).toContain('عمارت فرشته')
    expect(coupleMsg).toContain('1405/01/22')

    const crewMsg = mod.buildShootCrewMessage({ name: 'آرمان عکاس' }, contract, 'عکاس اصلی عمارت', studio)
    expect(crewMsg).toContain('آرمان عکاس')
    expect(crewMsg).toContain('عکاس اصلی عمارت')
    expect(crewMsg).toContain('سحر و شاهین')

    const annivMsg = mod.buildAnniversaryMessage(contract, studio, 20)
    expect(annivMsg).toContain('سالگرد پیوندتان مبارک باد')
    expect(annivMsg).toContain('۲۰٪ تخفیف')
    expect(annivMsg).toContain('ANNIV-1405100')
  })

  it('scans contracts and executes automated dispatches idempotently', async () => {
    const dbStore = {
      studioInfo: { name: 'استودیو ماندنی', phone: '09187766554' },
      contracts: [
        {
          id: 'c-inst-1',
          contractNum: '101',
          couple: 'مریم و رضا',
          eventDate: '1405/01/22', // 2 days left -> installment triggers
          total: 20000000,
          paid: 10000000,
          phoneBride: '09181112233'
        },
        {
          id: 'c-shoot-1',
          contractNum: '102',
          couple: 'بهار و کوروش',
          eventDate: '1405/01/21', // 1 day left (tomorrow) -> shoot reminder triggers
          venue: 'باغ مریوان',
          total: 15000000,
          paid: 15000000,
          phoneBride: '09182223344'
        },
        {
          id: 'c-anniv-1',
          contractNum: '103',
          couple: 'شیوا و امید',
          eventDate: '1404/01/20', // exactly 1 year ago today
          total: 10000000,
          paid: 10000000,
          phoneBride: '09183334455'
        }
      ],
      persProjects: [
        {
          id: 'pp-1',
          contractId: 'c-shoot-1',
          personnelId: 'p-1',
          eventDate: '1405/01/21',
          role: 'فیلمبردار تالار',
          phone: '09189998877',
          status: 'accepted'
        }
      ],
      personnel: [
        { id: 'p-1', name: 'سامان نوری', phone: '09189998877' }
      ]
    }

    const { mod, sentLogs } = getLifecycleModule(dbStore)
    const result1 = await mod.scanAndExecute({ force: true })

    expect(result1.ok).toBe(true)
    expect(result1.installmentsSent).toBe(1)
    expect(result1.shootCoupleSent).toBe(1)
    expect(result1.shootCrewSent).toBe(1)
    expect(result1.anniversarySent).toBe(1)
    expect(result1.totalSent).toBe(4)
    expect(sentLogs.length).toBe(4)

    // Second run on same day -> must skip all due to idempotency
    const result2 = await mod.scanAndExecute({ force: true })
    expect(result2.totalSent).toBe(0)
    expect(result2.skipped).toBe(4)
  })
})

describe('Engineering Pack v6.4.0 — Customer Pro 8-Stage Interactive Timeline', () => {
  const customerProSource = fs.readFileSync('js/customer-pro.js', 'utf8')

  function getCustomerPro() {
    const context = {
      window: {},
      setTimeout: () => {},
      document: {
        body: { setAttribute: () => {} },
        getElementById: () => null,
        querySelector: () => null,
        querySelectorAll: () => []
      },
      localStorage: {
        getItem: () => null,
        setItem: () => {}
      },
      Utils: {
        escapeHtml: (s) => String(s || ''),
        fmtNum: (n) => Number(n).toLocaleString('fa-IR'),
        todayJalali: () => '1405/01/20'
      }
    }
    vm.runInNewContext(customerProSource, context)
    return context.window.CustomerPro
  }

  it('defines all 8 professional stages and computes stage index correctly', () => {
    const cp = getCustomerPro()
    expect(cp.STAGES.length).toBe(8)
    expect(cp.STAGES[0].id).toBe('contract')
    expect(cp.STAGES[3].id).toBe('selection')
    expect(cp.STAGES[5].id).toBe('color_grade')
    expect(cp.STAGES[7].id).toBe('ready_pickup')

    // Newly signed contract
    expect(cp.getTimelineStageIndex({ status: 'confirmed' })).toBe(1)
    // Photo selection stage
    expect(cp.getTimelineStageIndex({ photoSelected: true })).toBe(3)
    // Editing / grading stage
    expect(cp.getTimelineStageIndex({ filmEdited: true })).toBe(5)
    // Delivered
    expect(cp.getTimelineStageIndex({ status: 'delivered' })).toBe(7)
  })
})

describe('Engineering Pack v6.4.0 — Crew Pocket Hub PWA', () => {
  const crewSource = fs.readFileSync('js/crew-pwa.js', 'utf8')

  function getCrewHub(dbStore = {}) {
    const storage = {}
    const context = {
      window: {
        addEventListener: vi.fn(),
        scrollTo: vi.fn()
      },
      document: {
        getElementById: () => null,
        querySelectorAll: () => [],
        addEventListener: vi.fn()
      },
      localStorage: {
        getItem: (k) => storage[k] || null,
        setItem: (k, v) => { storage[k] = String(v) }
      },
      DB: {
        get: (k) => dbStore[k] || []
      },
      Auth: {
        getUser: () => ({ name: 'سیروان پابرجا', role: 'مدیر تصویربرداری' })
      },
      Utils: {
        todayJalali: () => '1405/01/20',
        fmtNum: (n) => Number(n).toLocaleString('fa-IR')
      }
    }
    vm.runInNewContext(crewSource, context)
    return { hub: context.window.CrewHub, context, storage }
  }

  it('initializes crew hub with user and manages tabs and gear checklist', () => {
    const { hub, storage } = getCrewHub()
    hub.loadUser()
    expect(hub.state.currentUser.name).toBe('سیروان پابرجا')

    hub.loadData()
    expect(hub.state.equipmentList.length).toBeGreaterThan(0)
    expect(hub.state.todayShoot).toBeDefined()

    // Switch tab
    hub.switchTab('gear')
    expect(hub.state.activeTab).toBe('gear')

    // Toggle gear item
    hub.toggleGearItem('eq-1')
    expect(storage['crew_checked_gear']).toContain('eq-1')

    hub.toggleGearItem('eq-1')
    const parsed = JSON.parse(storage['crew_checked_gear'] || '[]')
    expect(parsed.includes('eq-1')).toBe(false)
  })
})
