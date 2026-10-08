import { describe, it, expect, vi, beforeEach } from 'vitest'

describe('Customer Pro Suite & Contract-Bound AI', () => {
  let docElements = {}
  let localStorageStore = {}

  beforeEach(async () => {
    localStorageStore = {}
    const makeEl = (extra = {}) => ({
      addEventListener: vi.fn(),
      focus: vi.fn(),
      style: {},
      classList: {
        add: vi.fn(),
        remove: vi.fn(),
        contains: vi.fn(() => false)
      },
      innerHTML: '',
      value: '',
      prepend: vi.fn(),
      appendChild: vi.fn(),
      remove: vi.fn(),
      getAttribute: vi.fn(() => ''),
      setAttribute: vi.fn(),
      ...extra
    })

    docElements = {
      'customer-app': makeEl(),
      'customer-pro-ai-input': makeEl({ value: '' }),
      'customer-pro-chat-log': makeEl()
    }

    const doc = {
      readyState: 'complete',
      body: makeEl({
        setAttribute: vi.fn((k, v) => { doc.body[k] = v })
      }),
      getElementById: (id) => docElements[id] || null,
      querySelector: (sel) => {
        if (sel === '.portal-header-actions') return makeEl()
        if (sel === '.customer-welcome') return makeEl({ after: vi.fn() })
        return null
      },
      querySelectorAll: () => [],
      createElement: () => makeEl(),
      addEventListener: vi.fn()
    }

    globalThis.window = globalThis
    vi.stubGlobal('window', globalThis)
    vi.stubGlobal('document', doc)
    vi.stubGlobal('localStorage', {
      getItem: (k) => localStorageStore[k] || null,
      setItem: (k, v) => { localStorageStore[k] = String(v) }
    })
    vi.stubGlobal('Utils', {
      toast: vi.fn(),
      escapeHtml: (s) => String(s || ''),
      fmtNum: (n) => String(n || 0)
    })
    vi.stubGlobal('DB', {
      find: vi.fn(() => ({
        id: 'c_101',
        contractNum: '101',
        couple: 'مریم و علی',
        bride: 'مریم رضایی',
        groom: 'علی محمدی',
        eventDate: '۱۴۰۳/۰۸/۲۵',
        venue: 'تالار قصر طلایی',
        total: 25000000,
        paid: 15000000,
        status: 'active',
        customerSignature: 'signed'
      })),
      filter: vi.fn(() => []),
      get: vi.fn(() => null)
    })
    vi.stubGlobal('PortalShared', {
      getContractStage: () => 2,
      CUSTOMER_PIPELINE: {
        2: { label: 'انتخاب و تدوین عکس‌ها' }
      }
    })
    vi.stubGlobal('CustomerPortal', {
      state: {
        contract: { id: 'c_101' }
      },
      renderDashboard: vi.fn()
    })

    await import('../js/customer-pro.js')
  })

  it('toggles customer portal dark and light themes', () => {
    const cpro = globalThis.CustomerPro
    expect(cpro).toBeDefined()

    cpro.setTheme('light')
    expect(cpro.state.theme).toBe('light')
    expect(localStorageStore['customer_theme']).toBe('light')

    cpro.toggleTheme()
    expect(cpro.state.theme).toBe('dark')
    expect(localStorageStore['customer_theme']).toBe('dark')
  })

  it('strictly rejects off-topic queries with guardrail response', async () => {
    const cpro = globalThis.CustomerPro

    const replyPolitics = await cpro.generateContractAnswer('نظرت در مورد سیاست چیست؟')
    expect(replyPolitics).toContain('تنها درباره جزئیات، مراحل کاری، تاریخ‌ها و امور مالی پروژه')

    const replyMedical = await cpro.generateContractAnswer('قرص سردرد چی بخورم برای بیماری؟')
    expect(replyMedical).toContain('تنها درباره جزئیات، مراحل کاری، تاریخ‌ها و امور مالی پروژه')

    const replyCode = await cpro.generateContractAnswer('برای من یک کد برنامه‌نویسی پایتون بنویس')
    expect(replyCode).toContain('تنها درباره جزئیات، مراحل کاری، تاریخ‌ها و امور مالی پروژه')
  })

  it('answers contract-specific questions accurately', async () => {
    const cpro = globalThis.CustomerPro

    // 1. Balance
    const replyBalance = await cpro.generateContractAnswer('مانده حساب من چقدر است؟')
    expect(replyBalance).toContain('مانده حساب شما 10000000 تومان')

    // 2. Event Date & Venue
    const replyDate = await cpro.generateContractAnswer('تاریخ مراسم ما کی هست و کجاست؟')
    expect(replyDate).toContain('۱۴۰۳/۰۸/۲۵')
    expect(replyDate).toContain('تالار قصر طلایی')

    // 3. Stage & Status
    const replyStage = await cpro.generateContractAnswer('وضعیت کار ما چیه و در چه مرحله‌ای قرار دارد؟')
    expect(replyStage).toContain('انتخاب و تدوین عکس‌ها')

    // 4. Next Action
    const replyNext = await cpro.generateContractAnswer('اقدام بعدی ما چیه؟')
    expect(replyNext).toContain('عکس‌خانه')
  })
})
