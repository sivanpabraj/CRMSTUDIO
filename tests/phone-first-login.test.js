import { describe, it, expect, vi, beforeEach } from 'vitest'

describe('Phone-First Smart Login Flow', () => {
  let docElements = {}

  beforeEach(() => {
    const makeEl = (extra = {}) => ({
      addEventListener: vi.fn(),
      focus: vi.fn(),
      style: {},
      classList: { add: vi.fn(), remove: vi.fn() },
      innerHTML: '',
      value: '',
      ...extra
    })

    docElements = {
      'auth-login-view': makeEl(),
      'pfl-phone-input': makeEl({ value: '' }),
      'pfl-submit-btn': makeEl(),
      'pfl-password-input': makeEl({ value: '' }),
      'pfl-pw-submit': makeEl(),
      'pfl-invite-input': makeEl({ value: '' }),
      'pfl-invite-submit': makeEl(),
      'pfl-customer-pw': makeEl({ value: '' }),
      'pfl-cust-submit': makeEl()
    }

    const doc = {
      readyState: 'complete',
      body: makeEl(),
      getElementById: (id) => docElements[id] || null,
      createElement: (tag) => makeEl({ tag }),
      addEventListener: vi.fn()
    }

    globalThis.window = globalThis
    vi.stubGlobal('window', globalThis)
    vi.stubGlobal('document', doc)
    vi.stubGlobal('Utils', {
      normalizePhone: (p) => String(p || '').replace(/\D/g, '').replace(/^(\+?98|0098)/, '0').padStart(11, '0'),
      isValidPhone: (p) => /^09\d{9}$/.test(p),
      escapeHtml: (s) => String(s || ''),
      toast: vi.fn(),
      copyText: vi.fn()
    })
    vi.stubGlobal('Auth', {
      login: vi.fn().mockResolvedValue({ ok: true, url: 'studio-m/' }),
      loginWithInviteCode: vi.fn().mockResolvedValue({ ok: true, url: 'index.html?view=portal' }),
      getLandingUrl: vi.fn().mockReturnValue('studio-m/')
    })
    vi.stubGlobal('Portal', {
      setAuthTab: vi.fn()
    })
  })

  it('validates phone and renders error for invalid phone numbers', async () => {
    // Load phone-first-login
    await import('../js/phone-first-login.js')
    const pfl = globalThis.PhoneFirstLogin
    expect(pfl).toBeDefined()

    pfl.state.phone = '123'
    docElements['pfl-phone-input'].value = '123'
    await pfl.handlePhoneSubmit()

    expect(pfl.state.error).toContain('شماره موبایل واردشده نامعتبر است')
  })

  it('transitions to password step when phone is manager', async () => {
    await import('../js/phone-first-login.js')
    const pfl = globalThis.PhoneFirstLogin

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        ok: true,
        found: true,
        studioName: 'استودیو ماندنی',
        userKind: 'manager',
        roleTitle: 'مدیر استودیو',
        hasPassword: true
      })
    })

    docElements['pfl-phone-input'].value = '09181112233'
    await pfl.handlePhoneSubmit()

    expect(pfl.state.step).toBe('password')
    expect(pfl.state.lookup.studioName).toBe('استودیو ماندنی')
  })

  it('transitions to invite step when phone belongs to staff with invite code', async () => {
    await import('../js/phone-first-login.js')
    const pfl = globalThis.PhoneFirstLogin

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        ok: true,
        found: true,
        studioName: 'استودیو ماندنی',
        userKind: 'staff',
        roleTitle: 'تدوین‌گر',
        hasInviteCode: true,
        hasPassword: false
      })
    })

    docElements['pfl-phone-input'].value = '09184445566'
    await pfl.handlePhoneSubmit()

    expect(pfl.state.step).toBe('invite')
  })

  it('transitions to not_found step when phone is not recognized', async () => {
    await import('../js/phone-first-login.js')
    const pfl = globalThis.PhoneFirstLogin

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        ok: true,
        found: false
      })
    })

    docElements['pfl-phone-input'].value = '09189990000'
    await pfl.handlePhoneSubmit()

    expect(pfl.state.step).toBe('not_found')
  })
})
