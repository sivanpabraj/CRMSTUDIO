import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

/**
 * Google OAuth helpers — Cloud.signInWithGoogle / stashOAuthConfig
 * Loaded as ESM; stubs globals used by cloud.js imports.
 */
describe('Cloud Google OAuth helpers', () => {
  beforeEach(() => {
    vi.resetModules()
    globalThis.sessionStorage = {
      store: {},
      getItem(k) { return this.store[k] ?? null },
      setItem(k, v) { this.store[k] = String(v) },
      removeItem(k) { delete this.store[k] }
    }
    globalThis.window = globalThis
    globalThis.location = { origin: 'http://localhost:5173', href: '' }
    globalThis.Event = class Event { constructor(type) { this.type = type } }
    globalThis.window.dispatchEvent = () => true
    globalThis.AppConfig = { DEFAULT_STUDIO_NAME: 'Studio M', DB_VERSION: 22, APP_VERSION: '6.0.0' }
    globalThis.Utils = { normalizePhone: (p) => String(p || '').replace(/\D/g, ''), toast() {} }
    globalThis.DB = { get: () => ({ cloudEnabled: true, supabaseUrl: 'https://abc.supabase.co', supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.x', supabaseStudioId: '' }) }
    globalThis.SecureDB = { merge: vi.fn(async () => true) }
    globalThis.Auth = { getUser: () => ({ id: '1', name: 'Test', phone: '09120000000' }) }
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('stashOAuthConfig writes url/key for auth-callback', async () => {
    const { default: Cloud } = await import('../js/cloud.js')
    // Force resolved config path
    Cloud._client = null
    Cloud.stashOAuthConfig({ intent: 'signin' })
    expect(sessionStorage.getItem('sm_cloud_url')).toContain('supabase.co')
    expect(sessionStorage.getItem('sm_cloud_key')).toBeTruthy()
    expect(sessionStorage.getItem('sm_oauth_intent')).toBe('signin')
  })

  it('signInWithGoogle calls supabase OAuth with google provider', async () => {
    const signInWithOAuth = vi.fn(async () => ({ data: { url: 'https://accounts.google.com/o' }, error: null }))
    const { default: Cloud } = await import('../js/cloud.js')
    Cloud._client = {
      auth: {
        signInWithOAuth,
        getSession: async () => ({ data: { session: null } })
      }
    }
    // Bypass createClient by faking resolved + client
    vi.spyOn(Cloud, 'client').mockResolvedValue(Cloud._client)
    vi.spyOn(Cloud, 'isConfigured').mockReturnValue(true)
    vi.spyOn(Cloud, 'resolvedConfig').mockReturnValue({
      enabled: true,
      url: 'https://abc.supabase.co',
      anonKey: 'anon'
    })

    const r = await Cloud.signInWithGoogle()
    expect(r.ok).toBe(true)
    expect(signInWithOAuth).toHaveBeenCalledOnce()
    const arg = signInWithOAuth.mock.calls[0][0]
    expect(arg.provider).toBe('google')
    expect(arg.options.redirectTo).toContain('auth-callback.html')
  })
})
