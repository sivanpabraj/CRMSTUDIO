import { describe, it, expect, vi, beforeAll } from 'vitest'

describe('Multi-Role Personnel & Passport Copy', () => {
  let mockUsers = []
  let mockPersonnel = []

  beforeAll(async () => {
    vi.stubGlobal('Utils', {
      normalizePhone: p => String(p || '').replace(/\D/g, ''),
      isValidPhone: p => /^0?9\d{9}$/.test(p),
      normalizePassword: p => String(p || '').trim(),
      generateOtp6: () => '123456',
      toast: vi.fn(),
      copy: vi.fn().mockResolvedValue(true),
      todayJalali: () => '1405/01/01'
    })

    vi.stubGlobal('Auth', {
      validatePassword: () => null,
      hashCredentials: async () => ({ password: 'hashed_pw', salt: 'salt_123' })
    })

    vi.stubGlobal('normalizeRoles', roles => Array.isArray(roles) ? roles : [roles])

    vi.stubGlobal('DB', {
      find: (col, fn) => (col === 'users' ? mockUsers.find(fn) : mockPersonnel.find(fn)),
      findPersonnelByPhone: phone => mockPersonnel.find(p => p.phone === phone),
      get: col => (col === 'users' ? mockUsers : mockPersonnel)
    })

    vi.stubGlobal('SecureDB', {
      insert: async (col, data) => {
        const item = { id: `${col}_${Date.now()}`, ...data }
        if (col === 'users') mockUsers.push(item)
        else mockPersonnel.push(item)
        return item
      },
      update: async (col, id, patch) => {
        const target = (col === 'users' ? mockUsers : mockPersonnel).find(x => x.id === id)
        if (target) Object.assign(target, patch)
        return target
      }
    })

    vi.stubGlobal('location', { origin: 'http://studiomandani.ir', pathname: '/app/' })
    vi.stubGlobal('window', globalThis)
  })

  it('merges new roles into existing user without duplicate phone error', async () => {
    await import('../js/portal-invite.js')
    const PortalInvite = globalThis.PortalInvite

    mockUsers = [
      { id: 'u_1', name: 'علی مدیر', phone: '09187756267', roles: ['studio_manager'], status: 'active' }
    ]
    mockPersonnel = []

    const res = await PortalInvite.createPortalUser({
      name: 'علی مدیر',
      phone: '09187756267',
      portalType: 'staff',
      roles: ['editor_clip', 'album_designer']
    })

    expect(res.ok).toBe(true)
    expect(res.merged).toBe(true)
    expect(res.user.roles).toContain('studio_manager')
    expect(res.user.roles).toContain('editor_clip')
    expect(res.user.roles).toContain('album_designer')
    expect(mockPersonnel.length).toBe(1)
    expect(mockPersonnel[0].roles).toContain('editor_clip')
  })
})
