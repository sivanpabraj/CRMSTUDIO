import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { webcrypto } from 'node:crypto'

describe('P0 session signature — reject unsigned', () => {
  const store = new Map()

  beforeEach(() => {
    store.clear()
    vi.stubGlobal('crypto', webcrypto)
    vi.stubGlobal('window', { Auth: undefined })
    vi.stubGlobal('AppConfig', {
      SESSION_KEY: 'talar_session',
      CSRF_KEY: 'talar_csrf',
      SESSION_TIMEOUT_MS: 8 * 60 * 60 * 1000,
      LOCKOUT_THRESHOLD: 8,
      LOCKOUT_DURATION_MS: 15 * 60 * 1000,
      OTP_LOGIN_PROOF_KEY: 'talar_otp_login_proof',
      isLocalDev: () => false
    })
    vi.stubGlobal('sessionStorage', {
      getItem: k => store.get(k) ?? null,
      setItem: (k, v) => { store.set(k, String(v)) },
      removeItem: k => { store.delete(k) }
    })
    vi.stubGlobal('Utils', { storage: { get: () => null, remove: vi.fn() } })
    vi.stubGlobal('DB', {
      find: (_c, fn) => (fn({ id: 'u1', status: 'active' }) ? { id: 'u1', name: 'U', status: 'active' } : null),
      get: () => ({}),
      log: vi.fn()
    })
    vi.stubGlobal('SecureDB', { runInternalAsync: async fn => fn() })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.resetModules()
  })

  it('SessionSign.verify rejects missing sig', async () => {
    await import('../js/session-sign.js')
    const SessionSign = globalThis.window.SessionSign
    expect(await SessionSign.verify({ userId: 'u1', expiresAt: Date.now() + 99999, csrf: 'x' })).toBe(false)
  })

  it('Auth.verifySessionSignature logs out unsigned session', async () => {
    await import('../js/session-sign.js')
    globalThis.SessionSign = globalThis.window.SessionSign
    await import('../js/auth.js')
    const Auth = globalThis.window.Auth
    Auth._sessionSet(Auth.SESSION_KEY, {
      userId: 'u1',
      loginAt: 1,
      expiresAt: Date.now() + 999999,
      csrf: 'tok'
      /* no sig */
    })
    const ok = await Auth.verifySessionSignature()
    expect(ok).toBe(false)
    expect(Auth.getSession()).toBe(null)
  })

  it('Auth.getUser returns null for unsigned session when SessionSign present', async () => {
    await import('../js/session-sign.js')
    globalThis.SessionSign = globalThis.window.SessionSign
    await import('../js/auth.js')
    const Auth = globalThis.window.Auth
    Auth._sessionSet(Auth.SESSION_KEY, {
      userId: 'u1',
      loginAt: 1,
      expiresAt: Date.now() + 999999,
      csrf: 'tok'
    })
    expect(Auth.getUser()).toBe(null)
  })
})
