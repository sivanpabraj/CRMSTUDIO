import { describe, expect, it, vi } from 'vitest'
import { webcrypto } from 'node:crypto'
import fs from 'node:fs'
import vm from 'node:vm'

const settingsSource = fs.readFileSync('studio-m/js/settings.js', 'utf8')
const dashboardSource = fs.readFileSync('studio-m/js/dashboard.js', 'utf8')

describe('Enterprise Settings & Onboarding Dashboard', () => {
  it('renders quick actions and onboarding card when 0 contracts', () => {
    const context = {
      window: {},
      document: {
        getElementById: vi.fn(),
        querySelector: vi.fn()
      },
      localStorage: {
        getItem: vi.fn(() => null),
        setItem: vi.fn()
      },
      SM: {
        studio: () => ({ dashboardWidgets: {} }),
        esc: (s) => String(s || ''),
        navigate: vi.fn()
      },
      Utils: {
        todayJalali: () => '1405/07/10',
        parseJalaliToday: () => ({ jy: 1405, jm: 7, jd: 10 }),
        daysUntil: () => 1
      },
      SMUI: {
        moduleSearch: () => ''
      },
      DB: {
        get: vi.fn(key => {
          if (key === 'contracts') return []
          if (key === 'transactions') return []
          if (key === 'personnel') return []
          return []
        })
      }
    }

    vm.runInNewContext(dashboardSource, context)
    const dashboard = context.window.SMDashboard
    expect(dashboard).toBeDefined()

    const quickBar = dashboard._quickActionBar()
    expect(quickBar).toContain('قرارداد جدید')
    expect(quickBar).toContain('ثبت تراکنش مالی')
    expect(quickBar).toContain('آفیش و تقویم')

    const onboardingEmpty = dashboard._onboardingCard(0)
    expect(onboardingEmpty).toContain('راهنمای راه‌اندازی سریع استودیو در ۴ گام')
    expect(onboardingEmpty).toContain('۱. اطلاعات استودیو و مهر')
    expect(onboardingEmpty).toContain('۴. ثبت اولین قرارداد')

    const onboardingWithContracts = dashboard._onboardingCard(3)
    expect(onboardingWithContracts).toBe('')
  })

  it('provides saveLegal, saveAutomation and saveSecurity in SMSettings', () => {
    const context = {
      window: {},
      document: {
        getElementById: vi.fn(id => {
          if (id === 'legal-cancel-30') return { value: '25' }
          if (id === 'legal-cancel-15') return { value: '60' }
          if (id === 'legal-archive-period') return { value: '۲ سال' }
          if (id === 'auto-anniversary') return { checked: true }
          if (id === 'sec-timeout') return { value: '60' }
          return null
        })
      },
      SM: {
        studio: () => ({}),
        toast: vi.fn(),
        navigate: vi.fn(),
        esc: s => String(s || '')
      },
      SMUI: {
        formField: () => '',
        badge: () => ''
      },
      SecureDB: {
        merge: vi.fn(async () => {})
      },
      SMModules: {}
    }

    vm.runInNewContext(settingsSource, context)
    const settings = context.window.SMSettings
    expect(settings).toBeDefined()
    expect(typeof settings.saveLegal).toBe('function')
    expect(typeof settings.saveAutomation).toBe('function')
    expect(typeof settings.saveSecurity).toBe('function')
    expect(typeof settings.uploadSignature).toBe('function')
    expect(typeof settings.killAllSessions).toBe('function')
  })

  it('allows invited personnel to log in using their 6-digit invite code in password field', async () => {
    const authSource = fs.readFileSync('js/auth.js', 'utf8')
    let updatedUser = null
    const dummyUser = {
      id: 'staff_1',
      name: 'سارینا',
      phone: '09184004893',
      password: 'random_hash_value',
      salt: 'somesalt',
      roles: ['office_secretary'],
      status: 'active',
      portalStatus: 'pending_verify',
      portalOtp: {
        code: '475319',
        sentAt: new Date().toISOString(),
        verified: false
      }
    }

    const context = {
      crypto: webcrypto,
      window: {},
      document: {},
      localStorage: { getItem: vi.fn(), setItem: vi.fn() },
      sessionStorage: { getItem: vi.fn(), setItem: vi.fn() },
      AppConfig: { LOCKOUT_THRESHOLD: 5, LOCKOUT_DURATION_MS: 60000 },
      Utils: {
        normalizePassword: s => String(s || ''),
        normalizePhone: s => String(s || '').replace(/\D/g, ''),
        verifyPassword: async () => false, // regular password fails
        isPbkdf2Password: () => true
      },
      SecureDB: {
        runInternalAsync: async fn => await fn()
      },
      DB: {
        get: vi.fn(() => ({})),
        find: vi.fn(() => dummyUser),
        update: vi.fn((coll, id, patch) => { updatedUser = { ...dummyUser, ...patch } }),
        log: vi.fn(),
        flush: vi.fn(async () => {})
      }
    }

    vm.runInNewContext(authSource, context)
    const Auth = context.window.Auth
    expect(Auth).toBeDefined()

    Auth.hashCredentials = async () => ({ password: 'new_hashed_otp', salt: 'newsalt' })

    const res = await Auth.login('09184004893', '475319')
    expect(res.ok).toBe(true)
    expect(updatedUser).not.toBeNull()
    expect(updatedUser.portalStatus).toBe('active')
    expect(updatedUser.mustChangePassword).toBe(true)
  })
})

