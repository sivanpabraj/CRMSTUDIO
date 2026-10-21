import { describe, expect, it, vi, beforeEach } from 'vitest'
import fs from 'node:fs'
import vm from 'node:vm'

const onlineBookingSource = fs.readFileSync('js/online-booking.js', 'utf8')
const goldenHourSource = fs.readFileSync('js/golden-hour-weather.js', 'utf8')
const documentSealSource = fs.readFileSync('js/document-seal-qr.js', 'utf8')

describe('Online Booking Engine & Jalali Calendar (OnlineBooking)', () => {
  function createBookingContext(customStore = {}) {
    const store = {
      bookings: [],
      contracts: [],
      leads: [],
      studioInfo: { name: 'استودیو فیلم و عکس ماندنی', phone: '09181234567' },
      ...customStore
    }

    const makeCtx2d = () => ({
      beginPath: () => {},
      arc: () => {},
      stroke: () => {},
      fill: () => {},
      fillText: () => {},
      strokeText: () => {},
      measureText: (text) => ({ width: (text || '').length * 8 }),
      save: () => {},
      restore: () => {},
      translate: () => {},
      rotate: () => {},
      fillRect: () => {},
      clearRect: () => {},
      moveTo: () => {},
      lineTo: () => {},
      closePath: () => {},
      setLineDash: () => {}
    })

    const makeCanvas = () => ({
      width: 0,
      height: 0,
      getContext: () => makeCtx2d(),
      toDataURL: (mime) => `data:${mime || 'image/png'};base64,MOCK_DATA`
    })

    const context = {
      window: {
        location: { origin: 'http://localhost' }
      },
      document: {
        createElement: (tag) => tag === 'canvas' ? makeCanvas() : {}
      },
      console,
      Date,
      Math,
      parseInt,
      Number,
      String,
      Array,
      Object,
      encodeURIComponent,
      Utils: {
        todayJalali: () => '1405/04/15',
        isValidPhone: (p) => /^09\d{9}$/.test(p.trim()),
        normalizePhone: (p) => p.trim()
      },
      DB: {
        get: (key) => store[key] || [],
        insert: (key, item) => {
          if (!store[key]) store[key] = []
          store[key].push(item)
          return item
        },
        log: vi.fn()
      },
      SecureDB: {
        insert: async (key, item) => {
          if (!store[key]) store[key] = []
          store[key].push(item)
          return item
        }
      }
    }
    context.window = context
    context.window.document = context.document

    vm.createContext(context)
    vm.runInContext(goldenHourSource, context)
    vm.runInContext(documentSealSource, context)
    vm.runInContext(onlineBookingSource, context)

    return { context, store }
  }

  it('provides all 5 specialized branches with base pricing and packages', () => {
    const { context } = createBookingContext()
    const ob = context.OnlineBooking

    expect(ob.BRANCHES).toBeDefined()
    expect(ob.BRANCHES.wedding).toBeDefined()
    expect(ob.BRANCHES.newborn_kids).toBeDefined()
    expect(ob.BRANCHES.maternity).toBeDefined()
    expect(ob.BRANCHES.modeling).toBeDefined()
    expect(ob.BRANCHES.commercial).toBeDefined()

    expect(ob.BRANCHES.wedding.depositRate).toBe(0.20)
    expect(ob.BRANCHES.newborn_kids.depositRate).toBe(0.25)
    expect(ob.BRANCHES.commercial.packages.length).toBeGreaterThanOrEqual(2)
  })

  it('accurately checks month availability against confirmed bookings and contracts', () => {
    const { context } = createBookingContext({
      bookings: [
        { id: 'b1', date: '1405/04/10', status: 'confirmed' },
        { id: 'b2', date: '1405/04/10', status: 'confirmed' },
        { id: 'b3', date: '1405/04/20', status: 'cancelled' } // should be ignored
      ],
      contracts: [
        { id: 'c1', eventDate: '1405/04/15', status: 'active' }
      ]
    })
    const ob = context.OnlineBooking

    const busyMap = ob.checkMonthAvailability(1405, 4)
    expect(busyMap['1405/04/10']).toBe(2)
    expect(busyMap['1405/04/15']).toBe(2)
    expect(busyMap['1405/04/20']).toBeUndefined()
  })

  it('calculates dynamic time slots and integrates Golden Hour calculation', () => {
    const { context } = createBookingContext()
    const ob = context.OnlineBooking

    const slots = ob.getTimeSlotsForDate('1405/04/15', 'مریوان')
    expect(slots.length).toBe(3)

    const goldenSlot = slots.find(s => s.isGolden)
    expect(goldenSlot).toBeDefined()
    expect(goldenSlot.badge).toContain('ساعت طلایی نور')
    expect(goldenSlot.range).toContain('الی')
  })

  it('calculates package pricing and deposit amount accurately', () => {
    const { context } = createBookingContext()
    const ob = context.OnlineBooking

    const pricing = ob.calculatePricing('wedding', 'pkg_wed_standard', ['add_drone'])
    expect(pricing.branch.id).toBe('wedding')
    expect(pricing.package.id).toBe('pkg_wed_standard')
    expect(pricing.addons.length).toBe(1)
    expect(pricing.addons[0].id).toBe('add_drone')

    // 15,000,000 + 3,500,000 = 18,500,000
    expect(pricing.totalPrice).toBe(18500000)
    // 20% deposit = 3,700,000
    expect(pricing.depositAmount).toBe(3700000)
    expect(pricing.remainingAmount).toBe(14800000)
  })

  it('rejects booking submission when client name or phone is invalid', async () => {
    const { context } = createBookingContext()
    const ob = context.OnlineBooking

    const res1 = await ob.submitBooking({ clientName: '', clientPhone: '09181112233', date: '1405/04/15' })
    expect(res1.ok).toBe(false)
    expect(res1.error).toContain('نام')

    const res2 = await ob.submitBooking({ clientName: 'سارا', clientPhone: '123', date: '1405/04/15' })
    expect(res2.ok).toBe(false)
    expect(res2.error).toContain('شماره موبایل')
  })

  it('successfully creates booking and auto-inserts lead on valid submission', async () => {
    const { context, store } = createBookingContext()
    const ob = context.OnlineBooking

    const res = await ob.submitBooking({
      branchId: 'newborn_kids',
      packageId: 'pkg_kid_standard',
      addonIds: ['add_cake'],
      date: '1405/04/22',
      slotId: 'golden_hour',
      clientName: 'نیما رستمی',
      clientPhone: '09189998877',
      city: 'سنندج',
      notes: 'تم فیل کوچولو'
    })

    expect(res.ok).toBe(true)
    expect(res.booking.code).toMatch(/^BK-/)
    expect(res.booking.client).toBe('نیما رستمی')
    expect(res.booking.phone).toBe('09189998877')

    // Check saved in store
    expect(store.bookings.length).toBe(1)
    expect(store.bookings[0].code).toBe(res.booking.code)

    // Check auto lead creation
    expect(store.leads.length).toBe(1)
    expect(store.leads[0].name).toBe('نیما رستمی')
  })

  it('renders booking card containing QR code, gelatin seal, and studio details', () => {
    const { context } = createBookingContext()
    const ob = context.OnlineBooking

    const mockBooking = {
      code: 'BK-1405-7788',
      client: 'فرزاد کاظمی',
      phone: '09185554433',
      branchTitle: 'عروسی و فرمالیته',
      packageName: 'پکیج VIP لوکس',
      date: '1405/05/18',
      time: '۱۷:۰۰ الی ۱۸:۰۰',
      deposit: 5000000,
      remaining: 20000000
    }

    const html = ob.renderBookingCard(mockBooking, { name: 'استودیو ماندنی مریوان' })
    expect(html).toContain('BK-1405-7788')
    expect(html).toContain('فرزاد کاظمی')
    expect(html).toContain('استودیو ماندنی مریوان')
    expect(html).toContain('کارت رسمی رزرواسیون استودیو')
  })
})

describe('ERP Financial BI & Analytics (SMAccounting._biReportsView)', () => {
  it('correctly aggregates gross revenue, expenses, net profit, and branch distribution', () => {
    const tx = [
      { id: 't1', type: 'deposit', amount: 30000000, date: '1405/01/10' },
      { id: 't2', type: 'deposit', amount: 20000000, date: '1405/02/15' },
      { id: 't3', type: 'withdrawal', amount: 15000000, date: '1405/01/20' }
    ]
    const contracts = [
      { id: 'c1', type: 'wedding', totalPrice: 28000000, paidAmount: 28000000 },
      { id: 'c2', type: 'newborn_kids', totalPrice: 5000000, paidAmount: 2000000 },
      { id: 'c3', type: 'commercial', title: 'تیزر صنعتی کارخانه', totalPrice: 15000000, paidAmount: 5000000 }
    ]

    const deposits = tx.filter(t => t.type === 'deposit').reduce((s, t) => s + t.amount, 0)
    const withdrawals = tx.filter(t => t.type === 'withdrawal').reduce((s, t) => s + t.amount, 0)
    const netProfit = deposits - withdrawals
    const profitMargin = Math.round((netProfit / deposits) * 100)

    expect(deposits).toBe(50000000)
    expect(withdrawals).toBe(15000000)
    expect(netProfit).toBe(35000000)
    expect(profitMargin).toBe(70)

    // Receivables: (5,000,000 - 2,000,000) + (15,000,000 - 5,000,000) = 13,000,000
    const receivables = contracts.reduce((s, c) => s + (c.totalPrice - c.paidAmount), 0)
    expect(receivables).toBe(13000000)
  })
})
