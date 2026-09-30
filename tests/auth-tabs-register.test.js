import { describe, it, expect, vi, beforeEach } from 'vitest'

describe('Auth Tabs & Studio Registration', () => {
  let docElements = {}

  beforeEach(() => {
    const makeEl = (extra = {}) => ({
      addEventListener: vi.fn(),
      focus: vi.fn(),
      style: {},
      classList: { add: vi.fn(), remove: vi.fn() },
      ...extra
    })

    docElements = {
      'auth-login-view': makeEl({ style: { display: 'block' } }),
      'auth-register-view': makeEl({ style: { display: 'none' } }),
      'tab-btn-login': makeEl({ className: 'auth-method-tab auth-method-tab--active' }),
      'tab-btn-register': makeEl({ className: 'auth-method-tab' }),
      'auth-card-wrap': makeEl(),
      'auth-sub-text': makeEl({ textContent: '' }),
      'login-identifier': makeEl({ value: '' }),
      'login-password': makeEl({ value: '' }),
      'reg-studio-name': makeEl({ value: 'استودیو پرواز' }),
      'reg-manager-name': makeEl({ value: 'مدیر تستی' }),
      'reg-phone': makeEl({ value: '09129998877' }),
      'reg-email': makeEl({ value: 'test@studio.com' }),
      'reg-password': makeEl({ value: 'Aa1234' }),
      'reg-password-confirm': makeEl({ value: 'Aa1234' }),
      'reg-error': makeEl({ textContent: '', style: { display: 'none' } }),
      'reg-btn': makeEl({ disabled: false, innerHTML: '' })
    }

    const doc = {
      readyState: 'complete',
      body: makeEl(),
      title: '',
      getElementById: (id) => docElements[id] || null,
      querySelector: (sel) => {
        if (sel === '.auth-unified-wrap') return docElements['auth-card-wrap']
        if (sel === '.auth-sub') return docElements['auth-sub-text']
        return null
      },
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
    vi.stubGlobal('history', {
      replaceState: vi.fn()
    })
    vi.stubGlobal('URL', globalThis.URL)
    vi.stubGlobal('Utils', {
      normalizePhone: (p) => String(p || '').replace(/\D/g, ''),
      normalizeEmail: (e) => String(e || '').trim().toLowerCase(),
      normalizePassword: (p) => String(p || ''),
      isValidPhone: (p) => /^09\d{9}$/.test(p),
      isValidEmail: (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e),
      hasPersianLetters: (s) => /[\u0600-\u06FF]/.test(s),
      escapeHtml: (s) => s,
      todayJalali: () => '1403/07/01',
      applyStudioTitle: vi.fn(),
      toast: vi.fn()
    })
    vi.stubGlobal('AppConfig', {
      MIN_PASSWORD_LENGTH: 6
    })
    vi.stubGlobal('DB', {
      ready: Promise.resolve(),
      get: () => [],
      find: () => null,
      insert: vi.fn(),
      update: vi.fn(),
      flush: vi.fn(),
      syncPersonnelFromUser: vi.fn()
    })
    vi.stubGlobal('UnifiedLogin', {
      getPending: () => null,
      resolvePhone: vi.fn()
    })
  })

  it('validates minimum password length of 6 characters', async () => {
    await import('../js/auth.js')
    const Auth = window.Auth

    const shortPwErr = Auth.validatePassword('12345')
    expect(shortPwErr).toContain('حداقل 6')

    const validPwErr = Auth.validatePassword('123456')
    expect(validPwErr).toBeFalsy()
  })

  it('switches auth tabs smoothly without page navigation', async () => {
    await import('../js/app.js')
    const Portal = window.Portal
    Portal.state.step = 'login'

    // Switch to register tab
    Portal.setAuthTab('register')
    expect(Portal.state.authTab).toBe('register')
    expect(docElements['auth-login-view'].style.display).toBe('none')
    expect(docElements['auth-register-view'].style.display).toBe('block')
    expect(docElements['tab-btn-register'].className).toContain('auth-method-tab--active')
    expect(docElements['auth-card-wrap'].classList.add).toHaveBeenCalledWith('auth-unified-wrap--wide')

    // Switch back to login tab
    Portal.setAuthTab('login')
    expect(Portal.state.authTab).toBe('login')
    expect(docElements['auth-register-view'].style.display).toBe('none')
    expect(docElements['auth-login-view'].style.display).toBe('block')
    expect(docElements['tab-btn-login'].className).toContain('auth-method-tab--active')
    expect(docElements['auth-card-wrap'].classList.remove).toHaveBeenCalledWith('auth-unified-wrap--wide')
  })
})
