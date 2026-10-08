import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest'

describe('Personnel Invite Code Login Flow', () => {
  let mockUsers = []
  let mockPersonnel = []

  beforeAll(async () => {
    vi.stubGlobal('Utils', {
      normalizePhone: p => String(p || '').replace(/\D/g, ''),
      isValidPhone: p => /^0?9\d{9}$/.test(p),
      normalizePassword: p => String(p || '').trim(),
      generateOtp6: () => '654321',
      toast: vi.fn(),
      copy: vi.fn().mockResolvedValue(true),
      storage: { set: vi.fn(), get: vi.fn() }
    })

    vi.stubGlobal('DB', {
      find: (col, fn) => (col === 'users' ? mockUsers.find(fn) : mockPersonnel.find(fn)),
      get: col => (col === 'users' ? mockUsers : mockPersonnel),
      set: vi.fn((col, val) => {
        if (col === 'users') mockUsers = val
        else mockPersonnel = val
      }),
      update: vi.fn((col, id, patch) => {
        const target = (col === 'users' ? mockUsers : mockPersonnel).find(x => x.id === id)
        if (target) Object.assign(target, patch)
        return target
      }),
      insert: vi.fn((col, data) => {
        const item = { id: `${col}_${Date.now()}`, ...data }
        if (col === 'users') mockUsers.push(item)
        else mockPersonnel.push(item)
        return item
      }),
      importJSON: vi.fn().mockResolvedValue(true),
      log: vi.fn()
    })

    vi.stubGlobal('Auth', {
      _sessionSetSigned: vi.fn().mockResolvedValue(true),
      _regenerateCsrf: () => 'csrf_123',
      _clearAttempts: vi.fn(),
      _setForcePwFlag: vi.fn(),
      _isLocked: () => 0,
      SESSION_KEY: 'test_session',
      CSRF_KEY: 'test_csrf',
      SESSION_TIMEOUT_MS: 3600000
    })

    vi.stubGlobal('ServerSync', {
      setStudioId: vi.fn()
    })

    vi.stubGlobal('location', { origin: 'http://localhost:3000', pathname: '/app/' })
    vi.stubGlobal('sessionStorage', {
      setItem: vi.fn(),
      getItem: vi.fn(),
      removeItem: vi.fn()
    })
    vi.stubGlobal('localStorage', {
      setItem: vi.fn(),
      getItem: vi.fn(),
      removeItem: vi.fn()
    })
    vi.stubGlobal('window', globalThis)

    // Import auth-login-enhance module to patch Auth
    await import('../js/auth-login-enhance.js')
  })

  beforeEach(() => {
    mockUsers = []
    mockPersonnel = []
    vi.clearAllMocks()
  })

  it('authenticates personnel via server response when local DB is empty', async () => {
    // Stub global fetch to simulate /api/auth/login responding with matched user and tenant data
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        ok: true,
        user: {
          id: 'user_123',
          name: 'سارا عکاس',
          phone: '09181234567',
          roles: ['photographer'],
          inviteCode: '889900'
        },
        tenantKey: 'studio_test',
        studioInfo: { id: 'studio_test', name: 'استودیو تست' },
        mustChangePassword: true,
        fullData: {
          users: [{ id: 'user_123', name: 'سارا عکاس', phone: '09181234567' }]
        }
      })
    })

    const Auth = globalThis.Auth
    expect(Auth).toBeDefined()
    expect(typeof Auth.loginWithInviteCode).toBe('function')

    const result = await Auth.loginWithInviteCode('09181234567', '889900')

    expect(result.ok).toBe(true)
    expect(result.user.name).toBe('سارا عکاس')
    expect(result.mustChangePassword).toBe(true)
    expect(globalThis.DB.importJSON).toHaveBeenCalled()
    expect(globalThis.localStorage.setItem).toHaveBeenCalledWith('crm_studio_id', 'studio_test')
    expect(Auth._setForcePwFlag).toHaveBeenCalledWith(true)
  })
})
