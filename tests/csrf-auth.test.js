import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { validateCsrfBound } from '../js/lib/csrf.js'

describe('CSRF session recovery', () => {
  const store = new Map()

  beforeEach(() => {
    store.clear()
    vi.stubGlobal('window', {})
    vi.stubGlobal('AppConfig', {
      SESSION_KEY: 'talar_session',
      CSRF_KEY: 'talar_csrf',
      SESSION_TIMEOUT_MS: 8 * 60 * 60 * 1000,
      LOCKOUT_THRESHOLD: 8,
      LOCKOUT_DURATION_MS: 15 * 60 * 1000,
      OTP_LOGIN_PROOF_KEY: 'talar_otp_login_proof'
    })
    vi.stubGlobal('sessionStorage', {
      getItem: k => store.get(k) ?? null,
      setItem: (k, v) => { store.set(k, v) },
      removeItem: k => { store.delete(k) }
    })
    vi.stubGlobal('Utils', { storage: { get: () => null, remove: vi.fn() } })
    vi.stubGlobal('DB', {
      find: (_c, fn) => fn({ id: 'u1', status: 'active' }) ? { id: 'u1', status: 'active' } : null,
      get: () => ({})
    })
    vi.stubGlobal('SessionSign', undefined)
    vi.stubGlobal('SecureDB', { runInternalAsync: async fn => fn() })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    delete globalThis.Auth
  })

  it('validateCsrfBound accepts matching user-bound token', () => {
    expect(validateCsrfBound('tok', { userId: 'u1', csrf: 'tok' }, 'u1')).toBe(true)
  })

  it('Auth.validateCsrf backfills session from sessionStorage token', async () => {
    await import('../js/auth.js')
    const Auth = globalThis.window.Auth

    Auth._sessionSet(Auth.SESSION_KEY, { userId: 'u1', loginAt: 1, expiresAt: Date.now() + 999999 })
    store.set('talar_csrf', 'stored-token')

    expect(Auth.validateCsrf('stored-token')).toBe(true)
    expect(Auth.getSession().csrf).toBe('stored-token')
  })
})
