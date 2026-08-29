import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

function membershipQuery(rows, error = null) {
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    is: vi.fn(() => query),
    lte: vi.fn(() => query),
    or: vi.fn(() => query),
    limit: vi.fn(async () => ({ data: rows, error }))
  }
  return query
}

describe('Cloud authoritative identity restoration', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.stubGlobal('window', { dispatchEvent: vi.fn() })
    vi.stubGlobal('Event', class Event { constructor(type) { this.type = type } })
    vi.stubGlobal('AppConfig', {
      DEFAULT_STUDIO_NAME: 'Studio M',
      DB_VERSION: 24,
      APP_VERSION: '1.1.0',
      allowsLocalIdentity: () => false
    })
    vi.stubGlobal('Utils', { normalizePhone: String, toast: vi.fn() })
    vi.stubGlobal('DB', { get: vi.fn(() => ({})) })
    vi.stubGlobal('SecureDB', { merge: vi.fn(async () => true) })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('validates the token with getUser and loads roles from the membership row', async () => {
    const principal = { id: 'user-1', roles: ['accountant'], cloudAuthoritative: true }
    const acceptCloudIdentity = vi.fn(() => principal)
    vi.stubGlobal('Auth', { acceptCloudIdentity, clearCloudIdentity: vi.fn() })
    const query = membershipQuery([{
      studio_id: 'studio-1',
      roles: ['accountant'],
      phone: '09121234567',
      display_name: 'حسابدار',
      status: 'active',
      valid_from: new Date(Date.now() - 60000).toISOString(),
      valid_until: null,
      revoked_at: null,
      session_version: 3
    }])
    const client = {
      auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'user-1', user_metadata: { roles: ['system_admin'] } } }, error: null })) },
      from: vi.fn(() => query)
    }
    const { default: Cloud } = await import('../js/cloud.js')
    vi.spyOn(Cloud, 'client').mockResolvedValue(client)
    vi.spyOn(Cloud, '_saveStudioLink').mockResolvedValue()

    const result = await Cloud.restoreAuthoritativeIdentity()

    expect(result).toMatchObject({ ok: true, identity: principal })
    expect(client.auth.getUser).toHaveBeenCalledOnce()
    expect(query.eq).toHaveBeenCalledWith('user_id', 'user-1')
    expect(query.eq).toHaveBeenCalledWith('status', 'active')
    expect(query.is).toHaveBeenCalledWith('revoked_at', null)
    expect(query.lte).toHaveBeenCalledWith('valid_from', expect.any(String))
    expect(acceptCloudIdentity).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'user-1' }),
      expect.objectContaining({ roles: ['accountant'], status: 'active' })
    )
  })

  it('ignores a browser-tampered Supabase endpoint and key in production', async () => {
    vi.stubGlobal('Auth', { acceptCloudIdentity: vi.fn(), clearCloudIdentity: vi.fn() })
    const { default: Cloud } = await import('../js/cloud.js')
    vi.spyOn(Cloud, 'envConfig').mockReturnValue({
      url: 'https://trusted-project.supabase.co',
      anonKey: 'sb_publishable_trusted'
    })
    vi.spyOn(Cloud, 'studioCloudConfig').mockReturnValue({
      enabled: true,
      url: 'https://attacker-project.supabase.co',
      anonKey: 'sb_publishable_attacker',
      studioId: 'selected-tenant'
    })

    expect(Cloud.resolvedConfig()).toEqual({
      enabled: true,
      url: 'https://trusted-project.supabase.co',
      anonKey: 'sb_publishable_trusted',
      studioId: 'selected-tenant'
    })
  })

  it('fails closed when build config is absent even if IndexedDB has attacker config', async () => {
    vi.stubGlobal('Auth', { acceptCloudIdentity: vi.fn(), clearCloudIdentity: vi.fn() })
    const { default: Cloud } = await import('../js/cloud.js')
    vi.spyOn(Cloud, 'envConfig').mockReturnValue({ url: '', anonKey: '' })
    vi.spyOn(Cloud, 'studioCloudConfig').mockReturnValue({
      enabled: true,
      url: 'https://attacker-project.supabase.co',
      anonKey: 'sb_publishable_attacker',
      studioId: 'forged-tenant'
    })

    expect(Cloud.isConfigured()).toBe(false)
    expect(await Cloud.restoreAuthoritativeIdentity()).toMatchObject({
      ok: false,
      code: 'cloud_required'
    })
  })

  it('clears browser principal when the server membership is absent', async () => {
    const clearCloudIdentity = vi.fn()
    vi.stubGlobal('Auth', { acceptCloudIdentity: vi.fn(), clearCloudIdentity })
    const client = {
      auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'user-2' } }, error: null })) },
      from: vi.fn(() => membershipQuery([]))
    }
    const { default: Cloud } = await import('../js/cloud.js')
    vi.spyOn(Cloud, 'client').mockResolvedValue(client)

    const result = await Cloud.restoreAuthoritativeIdentity()

    expect(result).toMatchObject({ ok: false, code: 'no_active_membership' })
    expect(clearCloudIdentity).toHaveBeenCalledOnce()
  })

  it('fails closed when multiple active tenants exist without an explicit selection', async () => {
    const clearCloudIdentity = vi.fn()
    vi.stubGlobal('Auth', { acceptCloudIdentity: vi.fn(), clearCloudIdentity })
    const row = studioId => ({
      studio_id: studioId, roles: ['studio_manager'], status: 'active',
      valid_from: new Date(Date.now() - 60000).toISOString(), valid_until: null,
      revoked_at: null, session_version: 1
    })
    const client = {
      auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'user-3' } }, error: null })) },
      from: vi.fn(() => membershipQuery([row('studio-1'), row('studio-2')]))
    }
    const { default: Cloud } = await import('../js/cloud.js')
    vi.spyOn(Cloud, 'client').mockResolvedValue(client)

    const result = await Cloud.restoreAuthoritativeIdentity()

    expect(result).toMatchObject({ ok: false, code: 'tenant_selection_required' })
    expect(result.studios).toEqual(['studio-1', 'studio-2'])
    expect(Auth.acceptCloudIdentity).not.toHaveBeenCalled()
  })

  it('accepts only an explicitly selected tenant for a multi-tenant account', async () => {
    vi.stubGlobal('DB', {
      get: vi.fn(name => name === 'studioInfo'
        ? { cloudEnabled: true, supabaseStudioId: 'studio-2' }
        : {})
    })
    const principal = { id: 'user-4', studioId: 'studio-2', roles: ['studio_manager'] }
    vi.stubGlobal('Auth', { acceptCloudIdentity: vi.fn(() => principal), clearCloudIdentity: vi.fn() })
    const query = membershipQuery([{
      studio_id: 'studio-2', roles: ['studio_manager'], status: 'active',
      valid_from: new Date(Date.now() - 60000).toISOString(), valid_until: null,
      revoked_at: null, session_version: 1
    }])
    const client = {
      auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'user-4' } }, error: null })) },
      from: vi.fn(() => query)
    }
    const { default: Cloud } = await import('../js/cloud.js')
    vi.spyOn(Cloud, 'client').mockResolvedValue(client)
    vi.spyOn(Cloud, '_saveStudioLink').mockResolvedValue()

    const result = await Cloud.restoreAuthoritativeIdentity()

    expect(result).toMatchObject({ ok: true, identity: principal })
    expect(query.eq).toHaveBeenCalledWith('studio_id', 'studio-2')
  })

  it('does not create a new tenant when OAuth requires tenant selection', async () => {
    vi.stubGlobal('Auth', { acceptCloudIdentity: vi.fn(), clearCloudIdentity: vi.fn() })
    const { default: Cloud } = await import('../js/cloud.js')
    vi.spyOn(Cloud, 'session').mockResolvedValue({ user: { id: 'user-5' } })
    vi.spyOn(Cloud, 'restoreAuthoritativeIdentity').mockResolvedValue({
      ok: false,
      code: 'tenant_selection_required',
      error: 'انتخاب استودیو لازم است'
    })
    const register = vi.spyOn(Cloud, '_registerStudio').mockResolvedValue({ ok: true, studioId: 'unexpected' })

    const result = await Cloud.completeOAuthReturn()

    expect(result).toMatchObject({ ok: false, code: 'tenant_selection_required' })
    expect(register).not.toHaveBeenCalled()
  })
})
