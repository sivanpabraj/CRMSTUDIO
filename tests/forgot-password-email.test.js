import { describe, it, expect, vi, beforeEach } from 'vitest'

describe('Forgot Password via Email Flow', () => {
  let docElements = {}

  beforeEach(() => {
    const makeEl = (extra = {}) => ({
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      focus: vi.fn(),
      remove: vi.fn(),
      style: {},
      classList: { add: vi.fn(), remove: vi.fn() },
      disabled: false,
      value: '',
      textContent: '',
      innerHTML: '',
      ...extra
    })

    docElements = {
      'login-identifier': makeEl({ value: 'manager@mandani.ir' }),
      'login-password': makeEl({ value: '' }),
      'forgot-email-inp': makeEl({ value: 'manager@mandani.ir' }),
      'forgot-email-otp': makeEl({ value: '654321' }),
      'forgot-email-newpw': makeEl({ value: 'NewPass1234' }),
      'forgot-email-newpw-confirm': makeEl({ value: 'NewPass1234' }),
      'forgot-email-step1': makeEl({ style: { display: 'block' } }),
      'forgot-email-step2': makeEl({ style: { display: 'none' } }),
      'forgot-email-masked': makeEl({ textContent: '' }),
      'forgot-email-err1': makeEl({ style: { display: 'none' }, textContent: '' }),
      'forgot-email-err2': makeEl({ style: { display: 'none' }, textContent: '' }),
      'forgot-email-send-btn': makeEl({ disabled: false }),
      'forgot-email-reset-btn': makeEl({ disabled: false }),
      'forgot-email-resend-btn': makeEl({ disabled: true }),
      'forgot-resend-timer': makeEl({ textContent: '60' }),
      'forgot-tab-email': makeEl({ className: 'portal-btn portal-btn-sm portal-btn-primary' }),
      'forgot-tab-mgr': makeEl({ className: 'portal-btn portal-btn-sm portal-btn-ghost' }),
      'forgot-tab-staff': makeEl({ className: 'portal-btn portal-btn-sm portal-btn-ghost' }),
      'forgot-tab-cust': makeEl({ className: 'portal-btn portal-btn-sm portal-btn-ghost' }),
      'forgot-content-email': makeEl({ style: { display: 'block' } }),
      'forgot-content-mgr': makeEl({ style: { display: 'none' } }),
      'forgot-content-staff': makeEl({ style: { display: 'none' } }),
      'forgot-content-cust': makeEl({ style: { display: 'none' } }),
      'reset-error': makeEl({ style: { display: 'none' }, textContent: '' }),
      'reset-phone': makeEl({ value: '09121234567' }),
      'reset-joincode': makeEl({ value: 'R543WD' }),
      'reset-new-pw': makeEl({ value: 'SecPass123' }),
      'reset-submit-btn': makeEl({ disabled: false })
    }

    const doc = {
      readyState: 'complete',
      body: {
        appendChild: vi.fn(),
        classList: { add: vi.fn(), remove: vi.fn() }
      },
      createElement: (tag) => {
        const el = makeEl({ tagName: tag.toUpperCase() })
        return el
      },
      getElementById: (id) => docElements[id] || null,
      querySelector: () => null,
      querySelectorAll: () => [],
      addEventListener: vi.fn()
    }

    globalThis.window = globalThis
    vi.stubGlobal('window', globalThis)
    vi.stubGlobal('document', doc)
    vi.stubGlobal('location', {
      href: 'http://localhost/index.html',
      pathname: '/index.html',
      search: '',
      hash: ''
    })
    vi.stubGlobal('history', { replaceState: vi.fn() })
    vi.stubGlobal('URL', globalThis.URL)
    vi.stubGlobal('Utils', {
      normalizePhone: (p) => String(p || '').replace(/\D/g, ''),
      normalizeEmail: (e) => String(e || '').trim().toLowerCase(),
      normalizePassword: (p) => String(p || ''),
      isValidPhone: (p) => /^09\d{9}$/.test(p),
      isValidEmail: (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e),
      escapeHtml: (s) => String(s || ''),
      toast: vi.fn()
    })
    vi.stubGlobal('AudioNotifier', {
      playPing: vi.fn(),
      playContract: vi.fn()
    })
    vi.stubGlobal('DB', {
      ready: Promise.resolve(),
      get: () => [],
      find: () => null,
      insert: vi.fn(),
      update: vi.fn(),
      flush: vi.fn()
    })
    vi.stubGlobal('UnifiedLogin', {
      getPending: () => null,
      resolvePhone: vi.fn()
    })
  })

  it('renders modal with email tab active and pre-populates email from login-identifier', async () => {
    await import('../js/app.js')
    const Portal = window.Portal

    Portal.showForgotPassword()
    expect(document.body.appendChild).toHaveBeenCalled()
  })

  it('switches between forgot-password tabs', async () => {
    await import('../js/app.js')
    const Portal = window.Portal

    Portal.setForgotTab('mgr')
    expect(docElements['forgot-content-email'].style.display).toBe('none')
    expect(docElements['forgot-content-mgr'].style.display).toBe('block')
    expect(docElements['forgot-tab-mgr'].className).toContain('portal-btn-primary')

    Portal.setForgotTab('email')
    expect(docElements['forgot-content-email'].style.display).toBe('block')
    expect(docElements['forgot-content-mgr'].style.display).toBe('none')
    expect(docElements['forgot-tab-email'].className).toContain('portal-btn-primary')
  })

  it('sendForgotPasswordEmail calls server API and switches to OTP step upon success', async () => {
    await import('../js/app.js')
    const Portal = window.Portal

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        ok: true,
        message: 'کد ۶ رقمی ارسال شد',
        maskedEmail: 'm***r@mandani.ir'
      })
    })
    vi.stubGlobal('fetch', fetchMock)

    await Portal.sendForgotPasswordEmail()

    expect(fetchMock).toHaveBeenCalledWith('/api/auth/forgot-password/email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'manager@mandani.ir' })
    })

    expect(docElements['forgot-email-step1'].style.display).toBe('none')
    expect(docElements['forgot-email-step2'].style.display).toBe('block')
    expect(docElements['forgot-email-masked'].textContent).toBe('m***r@mandani.ir')
    expect(AudioNotifier.playPing).toHaveBeenCalled()
    expect(Utils.toast).toHaveBeenCalledWith('کد ۶ رقمی ارسال شد', 'success', 5000)
  })

  it('submitResetPasswordEmail validates input, calls reset-password endpoint, and fills login fields', async () => {
    await import('../js/app.js')
    const Portal = window.Portal

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        ok: true,
        message: 'رمز عبور با موفقیت به‌روزرسانی شد'
      })
    })
    vi.stubGlobal('fetch', fetchMock)

    await Portal.submitResetPasswordEmail()

    expect(fetchMock).toHaveBeenCalledWith('/api/auth/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'manager@mandani.ir',
        otpCode: '654321',
        newPassword: 'NewPass1234'
      })
    })

    expect(Utils.toast).toHaveBeenCalledWith('رمز عبور با موفقیت به‌روزرسانی شد', 'success', 5000)
    expect(AudioNotifier.playContract).toHaveBeenCalled()
    expect(docElements['login-identifier'].value).toBe('manager@mandani.ir')
    expect(docElements['login-password'].value).toBe('NewPass1234')
  })
})
