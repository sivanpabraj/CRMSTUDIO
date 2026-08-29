import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  sync: {
    _entityPending: false,
    scheduleEntityPush: vi.fn(),
    scheduleSnapshotPush: vi.fn(),
    flushEntityPush: vi.fn(async () => ({ ok: true })),
    pushAll: vi.fn(async () => ({ ok: true })),
    pullAll: vi.fn(async () => ({ ok: true, applied: 0, conflictCount: 0, skipped: false }))
  },
  realtime: {
    start: vi.fn(async () => ({ ok: true })),
    stop: vi.fn(),
    status: vi.fn(() => 'live')
  },
  sanitize: vi.fn(value => value),
  merge: vi.fn((remote, local) => ({ ...remote, localSecret: local.localSecret }))
}))

vi.mock('../js/sync/engine.js', () => ({ SyncEngine: mocks.sync }))
vi.mock('../js/sync/realtime.js', () => ({ RealtimeSync: mocks.realtime }))
vi.mock('../js/lib/snapshot-sanitize.js', () => ({
  sanitizeSnapshotForCloud: mocks.sanitize,
  mergeLocalSecretsAfterPull: mocks.merge
}))

function storage() {
  return {
    data: {},
    getItem(k) { return this.data[k] ?? null },
    setItem(k, v) { this.data[k] = String(v) },
    removeItem(k) { delete this.data[k] }
  }
}

function query(result = { data: [], error: null }) {
  const q = {}
  for (const name of ['select', 'eq', 'is', 'lte', 'or', 'gt', 'order', 'upsert', 'insert']) {
    q[name] = vi.fn(() => q)
  }
  q.limit = vi.fn(() => q)
  q.single = vi.fn(async () => result)
  q.maybeSingle = vi.fn(async () => result)
  q.then = (resolve, reject) => Promise.resolve(result).then(resolve, reject)
  return q
}

function clientFactory(overrides = {}) {
  const tables = overrides.tables || {}
  return {
    auth: {
      getSession: vi.fn(async () => ({ data: { session: { access_token: 'token', user: { id: 'u1' } } } })),
      getUser: vi.fn(async () => ({ data: { user: { id: 'u1', email: 'u@test.local' } }, error: null })),
      signInWithOtp: vi.fn(async () => ({ error: null })),
      verifyOtp: vi.fn(async () => ({ data: { session: { user: { id: 'u1' } }, user: { id: 'u1' } }, error: null })),
      signInWithOAuth: vi.fn(async () => ({ data: { url: 'https://oauth.test' }, error: null })),
      signUp: vi.fn(async () => ({ data: { session: null, user: { id: 'u1' } }, error: null })),
      signInWithPassword: vi.fn(async () => ({ data: { session: {}, user: { id: 'u1' } }, error: null })),
      updateUser: vi.fn(async () => ({ error: null })),
      signOut: vi.fn(async () => {})
    },
    rpc: vi.fn(async (_name) => ({ data: 'rpc-result', error: null })),
    from: vi.fn(name => tables[name] || query()),
    ...overrides
  }
}

describe('Cloud behavior coverage', () => {
  let Cloud
  let client
  let info

  beforeEach(async () => {
    vi.resetModules()
    vi.clearAllMocks()
    info = {
      cloudEnabled: true,
      supabaseUrl: 'https://local.supabase.co',
      supabaseAnonKey: 'publishable',
      supabaseStudioId: 'studio-1',
      cloudLastSyncAt: ''
    }
    vi.stubGlobal('window', { location: { origin: 'https://app.test' }, dispatchEvent: vi.fn() })
    vi.stubGlobal('location', window.location)
    vi.stubGlobal('Event', class Event { constructor(type) { this.type = type } })
    vi.stubGlobal('sessionStorage', storage())
    vi.stubGlobal('AppConfig', {
      DEFAULT_STUDIO_NAME: 'Studio M', DB_VERSION: 42, APP_VERSION: '1.1.0', MIN_PASSWORD_LENGTH: 8,
      allowsLocalIdentity: () => true
    })
    vi.stubGlobal('Utils', {
      normalizePhone: value => String(value || '').replace(/\D/g, ''),
      normalizePassword: value => String(value || ''), toast: vi.fn(), fmtNum: String
    })
    vi.stubGlobal('DB', {
      get: vi.fn(name => name === 'studioInfo' ? info : name === 'contracts' ? [] : {}),
      exportJSON: vi.fn(() => JSON.stringify({ _meta: { dbVersion: 42 }, localSecret: 'x' })),
      importJSON: vi.fn(async () => ({ ok: true })), flush: vi.fn(async () => {})
    })
    vi.stubGlobal('SecureDB', { merge: vi.fn(async () => true) })
    vi.stubGlobal('Auth', {
      acceptCloudIdentity: vi.fn((u, m) => ({ id: u.id, studioId: m.studio_id, phone: m.phone, roles: m.roles })),
      clearCloudIdentity: vi.fn(), getUser: vi.fn(() => ({ name: 'Local', phone: '0912' }))
    })
    vi.stubGlobal('FinanceOutbox', { flush: vi.fn(async () => {}) })
    client = clientFactory()
    ;({ default: Cloud } = await import('../js/cloud.js'))
    vi.spyOn(Cloud, 'client').mockResolvedValue(client)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('normalizes configuration, JWT roles, errors and phone identifiers', () => {
    expect(Cloud.normalizeUrl('supabase.com/dashboard/project/abc123/rest/v1/')).toBe('https://abc123.supabase.co')
    expect(Cloud.normalizeUrl('abc.supabase.co/')).toBe('https://abc.supabase.co')
    expect(Cloud.normalizeUrl('')).toBe('')
    const jwt = role => `x.${btoa(JSON.stringify({ role }))}.x`
    expect(Cloud.jwtRole(jwt('anon'))).toBe('anon')
    expect(Cloud.jwtRole('bad')).toBe('')
    expect(Cloud.validateAnonKey(jwt('service_role')).ok).toBe(false)
    expect(Cloud.validateAnonKey(jwt('authenticated')).ok).toBe(false)
    expect(Cloud.validateAnonKey(jwt('anon')).ok).toBe(true)
    expect(Cloud.validateAnonKey('publishable').ok).toBe(true)
    expect(Cloud.formatAuthError('requested path is invalid')).toContain('Site URL')
    expect(Cloud.formatAuthError('provider is not enabled')).toContain('Google')
    expect(Cloud.formatAuthError('email_address_invalid')).toContain('ایمیل')
    expect(Cloud.formatAuthError('invalid api key')).toContain('Anon Key')
    expect(Cloud.formatAuthError('other')).toBe('other')
    expect(Cloud.authRedirectUrl()).toContain('auth-callback.html')
    expect(Cloud.toE164Phone('09121234567')).toBe('+989121234567')
    expect(Cloud.toE164Phone('989121234567')).toBe('+989121234567')
    expect(Cloud.toE164Phone('9121234567')).toBe('+989121234567')
    expect(Cloud.toE164Phone('12')).toBe('')
    expect(Cloud.phoneToEmail('0912')).toBe('u0912@studiom.app')
    expect(Cloud.statusLabel().tone).toBe('success')
    expect(Cloud.syncModeLabel()).toContain('realtime')
    expect(Cloud.realtimeStatus()).toBe('live')
  })

  it('uses local config only in the explicit local identity build', () => {
    vi.spyOn(Cloud, 'envConfig').mockReturnValue({ url: 'https://env.supabase.co', anonKey: 'env' })
    expect(Cloud.resolvedConfig()).toMatchObject({ url: 'https://local.supabase.co', anonKey: 'publishable', enabled: true })
    expect(Cloud.isConfigured()).toBe(true)
    expect(Cloud.isEnabled()).toBe(true)
    info.cloudEnabled = false
    expect(Cloud.isEnabled()).toBe(false)
    expect(Cloud.statusLabel().tone).toBe('warning')
    info.supabaseUrl = ''
    info.supabaseAnonKey = ''
    vi.spyOn(Cloud, 'envConfig').mockReturnValue({ url: '', anonKey: '' })
    expect(Cloud.statusLabel().tone).toBe('muted')
  })

  it('handles session, OTP and OAuth success and failure behavior', async () => {
    expect((await Cloud.session()).user.id).toBe('u1')
    expect((await Cloud.sendPhoneOtp('bad')).ok).toBe(false)
    expect((await Cloud.sendPhoneOtp('09121234567')).ok).toBe(true)
    client.auth.signInWithOtp.mockResolvedValueOnce({ error: { message: 'send failed' } })
    expect((await Cloud.sendPhoneOtp('09121234567')).ok).toBe(false)
    expect((await Cloud.verifyPhoneOtp('0912', 'x')).ok).toBe(false)
    expect((await Cloud.verifyPhoneOtp('09121234567', '123456')).ok).toBe(true)
    client.auth.verifyOtp.mockResolvedValueOnce({ data: {}, error: { message: 'bad otp' } })
    expect((await Cloud.verifyPhoneOtp('09121234567', '123456')).ok).toBe(false)
    expect((await Cloud.signInWithOAuth('github')).ok).toBe(false)
    expect((await Cloud.signInWithOAuth('google')).url).toBe('https://oauth.test')
    client.auth.signInWithOAuth.mockResolvedValueOnce({ data: null, error: { message: 'oauth failed' } })
    expect((await Cloud.signInWithOAuth('apple')).ok).toBe(false)
    expect((await Cloud.signInWithGoogle()).provider).toBe('google')
    client.auth.signInWithOAuth.mockResolvedValueOnce({ data: null, error: { message: 'oauth failed' } })
    expect((await Cloud.signInWithGoogle()).ok).toBe(false)
  })

  it('claims contracts and sends/lists portal messages with server identity', async () => {
    expect((await Cloud.claimCustomerContracts()).contracts).toBe('rpc-result')
    client.rpc.mockResolvedValueOnce({ data: null, error: { message: 'denied' } })
    expect((await Cloud.claimCustomerContracts()).ok).toBe(false)

    const contractQ = query({ data: { id: 'c1', studio_id: 's1', local_id: 'l1' }, error: null })
    const messageQ = query({ data: { id: 'm1' }, error: null })
    client.from.mockImplementation(name => name === 'contracts' ? contractQ : messageQ)
    expect((await Cloud._portalContract('l1')).id).toBe('c1')
    expect((await Cloud._portalContract('', 'c1')).id).toBe('c1')
    expect((await Cloud.sendPortalMessage({ contractLocalId: 'l1', body: ' hi ', attachment: { name: 'a' } })).message.id).toBe('m1')
    expect((await Cloud.listPortalMessages({ contractLocalId: 'l1', since: '2026-01-01' })).ok).toBe(true)
    messageQ.single.mockResolvedValueOnce({ data: null, error: { message: 'insert failed' } })
    expect((await Cloud.sendPortalMessage({ contractLocalId: 'l1' })).ok).toBe(false)
  })

  it('covers signup, signin and password update server outcomes', async () => {
    expect((await Cloud.signUp({ phone: '09121234567', password: 'password', name: 'N', studioName: 'S' })).needsPhoneConfirm).toBe(true)
    expect(client.auth.signUp).toHaveBeenLastCalledWith(expect.objectContaining({
      phone: '+989121234567', password: 'password',
      options: { data: expect.objectContaining({ phone: '09121234567', studio_name: 'S' }) }
    }))
    client.auth.signUp.mockResolvedValueOnce({ data: {}, error: { message: 'email_address_invalid' } })
    expect((await Cloud.signUp({ email: 'x' })).ok).toBe(false)

    vi.spyOn(Cloud, 'restoreAuthoritativeIdentity').mockResolvedValue({ ok: true, identity: { id: 'u1' } })
    expect((await Cloud.signIn({ phone: '09121234567', password: 'password' })).ok).toBe(true)
    expect(FinanceOutbox.flush).toHaveBeenCalled()
    client.auth.signInWithPassword.mockResolvedValueOnce({ data: {}, error: { message: 'bad' } })
    expect((await Cloud.signIn({ email: 'x@y.test', password: 'bad' })).ok).toBe(false)
    expect((await Cloud.signIn({ phone: 'bad', password: 'bad' })).ok).toBe(false)

    expect((await Cloud.updateAuthPassword('short')).ok).toBe(false)
    expect((await Cloud.updateAuthPassword('long-enough')).ok).toBe(true)
    client.auth.updateUser.mockResolvedValueOnce({ error: { message: 'bad password' } })
    expect((await Cloud.updateAuthPassword('long-enough')).ok).toBe(false)
  })

  it('restores authoritative membership and rejects invalid server states', async () => {
    const active = {
      studio_id: 'studio-1', roles: ['manager'], phone: '0912', display_name: 'M', status: 'active',
      valid_from: new Date(Date.now() - 1000).toISOString(), valid_until: null, revoked_at: null, session_version: 1
    }
    const memberQ = query({ data: [active], error: null })
    client.from.mockReturnValue(memberQ)
    expect((await Cloud.restoreAuthoritativeIdentity()).ok).toBe(true)

    client.auth.getUser.mockResolvedValueOnce({ data: {}, error: { message: 'bad' } })
    expect((await Cloud.restoreAuthoritativeIdentity()).code).toBe('not_authenticated')
    memberQ.limit.mockResolvedValueOnce({ data: [], error: null })
    expect((await Cloud.restoreAuthoritativeIdentity()).code).toBe('no_active_membership')
    info.supabaseStudioId = ''
    memberQ.limit.mockResolvedValueOnce({ data: [{ ...active, studio_id: 'a' }, { ...active, studio_id: 'b' }], error: null })
    expect((await Cloud.restoreAuthoritativeIdentity()).code).toBe('tenant_selection_required')
    Auth.acceptCloudIdentity.mockReturnValueOnce(null)
    memberQ.limit.mockResolvedValueOnce({ data: [active], error: null })
    expect((await Cloud.restoreAuthoritativeIdentity()).code).toBe('invalid_membership')
  })

  it('handles studio registration, invitations and cloud settings', async () => {
    expect((await Cloud._registerStudio('S', '0912', 'N', 'join')).pendingApproval).toBe(true)
    expect((await Cloud._registerStudio('S', '0912', 'N', null)).studioId).toBe('rpc-result')
    client.rpc.mockResolvedValueOnce({ data: null, error: { message: 'bad' } })
    expect((await Cloud._registerStudio('S', '0912', 'N', 'join')).ok).toBe(false)
    expect((await Cloud.createStudioInvitation()).token).toBe('rpc-result')
    expect((await Cloud.reviewStudioJoin('r1', true)).studioId).toBe('rpc-result')
    expect((await Cloud.enableCloud({ url: 'abc.supabase.co', anonKey: 'publishable' })).ok).toBe(true)
    expect((await Cloud.disableCloud()).ok).toBe(true)
    expect(SecureDB.merge).toHaveBeenCalled()
  })

  it('pushes, pulls and restores snapshots and backup archives', async () => {
    expect((await Cloud.pushSnapshot()).ok).toBe(true)
    client.rpc.mockResolvedValueOnce({ data: null, error: { message: 'push failed' } })
    expect((await Cloud.pushSnapshot()).ok).toBe(false)

    vi.spyOn(Cloud, '_callBackupEdge').mockResolvedValue({ ok: true, backupId: 'b1', manifest: {} })
    expect((await Cloud.createBackupArchive('manual')).id).toBe('b1')
    Cloud._callBackupEdge.mockResolvedValueOnce({ ok: true, payload: { x: 1 }, manifest: {} })
    expect((await Cloud.restoreBackupArchive('b1')).ok).toBe(true)

    const snapshotQ = query({ data: { data: { remote: 1 }, updated_at: '2026-01-02' }, error: null })
    client.from.mockReturnValue(snapshotQ)
    Cloud._callBackupEdge.mockResolvedValueOnce({ ok: true, backups: [{ id: 'b1' }] })
    expect((await Cloud.listBackupArchives(999)).backups).toHaveLength(1)
    expect(Cloud._callBackupEdge).toHaveBeenLastCalledWith({ action: 'list', studioId: 'studio-1', limit: 100 })
    expect((await Cloud.pullSnapshot({ force: true })).ok).toBe(true)
    expect(DB.importJSON).toHaveBeenCalled()
  })

  it('calls the backup Edge function and handles HTTP and network failures', async () => {
    const config = { url: '', anonKey: '', studioId: 'studio-1' }
    vi.spyOn(Cloud, 'resolvedConfig').mockImplementation(() => config)
    expect((await Cloud._callBackupEdge({})).error).toBe('ورود ابری لازم است')
    config.url = 'https://local.supabase.co'
    expect((await Cloud._callBackupEdge({})).error).toBe('ورود ابری لازم است')
    config.anonKey = 'publishable'
    client.auth.getSession.mockResolvedValueOnce({ data: { session: null } })
    expect((await Cloud._callBackupEdge({})).error).toBe('ورود ابری لازم است')
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ ok: true }) })))
    expect((await Cloud._callBackupEdge({ action: 'create' })).ok).toBe(true)
    fetch.mockResolvedValueOnce({ ok: false, status: 403, json: async () => ({ error: 'denied' }) })
    expect((await Cloud._callBackupEdge({})).error).toBe('denied')
    fetch.mockRejectedValueOnce(new Error('offline'))
    expect((await Cloud._callBackupEdge({})).error).toBe('backup_network_failed')
  })

  it('rejects browser-authoritative contract sync and uses only ordered entity sync', async () => {
    DB.get.mockImplementation(name => name === 'studioInfo' ? info : name === 'contracts' ? [{ id: '1', groom: 'G', total: '10' }] : {})
    client.from.mockReturnValue(query({ data: null, error: null }))
    expect(await Cloud.syncContractsFromLocal()).toMatchObject({
      ok: false,
      skipped: true,
      code: 'server_authority_required'
    })
    expect((await Cloud.pushEntities()).ok).toBe(true)
    expect((await Cloud.pullEntities({ force: true })).ok).toBe(true)
    const pushSnapshot = vi.spyOn(Cloud, 'pushSnapshot')
    expect((await Cloud.pushAll()).ok).toBe(true)
    expect(pushSnapshot).not.toHaveBeenCalled()
    mocks.sync.pullAll.mockResolvedValueOnce({ ok: true, applied: 2 })
    expect((await Cloud.pullAll()).applied).toBe(2)
    mocks.sync.pullAll.mockResolvedValueOnce({ ok: true, applied: 0 })
    const pullSnapshot = vi.spyOn(Cloud, 'pullSnapshot')
    expect((await Cloud.pullAll()).ok).toBe(true)
    expect(pullSnapshot).not.toHaveBeenCalled()
    Cloud.schedulePush()
    expect(mocks.sync.scheduleEntityPush).toHaveBeenCalled()
    expect((await Cloud.flushPushNow()).ok).toBe(true)
    expect((await Cloud.ensureLiveSync()).ok).toBe(true)
  })

  it('completes OAuth, verifies/changes password and signs out', async () => {
    Cloud._authoritativeIdentity = { phone: '0912' }
    vi.spyOn(Cloud, 'signIn').mockResolvedValue({ ok: true })
    expect((await Cloud.verifyCurrentPassword('pw')).ok).toBe(true)
    expect((await Cloud.changePassword('pw', 'new-password')).ok).toBe(true)
    vi.spyOn(Cloud, 'restoreAuthoritativeIdentity').mockResolvedValue({ ok: true, identity: { studioId: 'studio-1' } })
    expect((await Cloud.completeOAuthReturn()).studioId).toBe('studio-1')
    await Cloud.signOut()
    expect(mocks.realtime.stop).toHaveBeenCalled()
    expect(Cloud._authoritativeIdentity).toBeNull()
  })

  it('covers disabled and throttled sync exits without mutating data', async () => {
    vi.spyOn(Cloud, 'isEnabled').mockReturnValue(false)
    expect((await Cloud.flushPushNow()).skipped).toBe(true)
    expect((await Cloud.ensureLiveSync()).skipped).toBe(true)
    expect((await Cloud._pushSnapshotDebounced()).skipped).toBe(true)
    expect((await Cloud.pushSnapshot()).skipped).toBe(true)
    expect((await Cloud.createBackupArchive()).skipped).toBe(true)
    expect((await Cloud.restoreBackupArchive('b')).ok).toBe(false)
    expect((await Cloud.listBackupArchives()).skipped).toBe(true)
    expect((await Cloud.pullSnapshot()).skipped).toBe(true)
    expect((await Cloud.syncContractsFromLocal()).skipped).toBe(true)
    expect(Cloud.syncModeLabel()).toBe('خاموش')
  })

  it('creates and caches a configured Supabase browser client', async () => {
    Cloud.client.mockRestore()
    vi.spyOn(Cloud, 'resolvedConfig').mockReturnValue({
      enabled: true, url: 'https://project.supabase.co', anonKey: 'sb_publishable_test', studioId: 's1'
    })
    const first = await Cloud.client()
    const second = await Cloud.client()
    expect(first).toBe(second)
    Cloud._client = null
    Cloud.resolvedConfig.mockReturnValueOnce({ enabled: false, url: '', anonKey: '', studioId: '' })
    expect(await Cloud.client()).toBeNull()
  })

  it('registers a studio during first OAuth return and persists the cloud switch', async () => {
    info.cloudEnabled = false
    vi.spyOn(Cloud, 'restoreAuthoritativeIdentity')
      .mockResolvedValueOnce({ ok: false, code: 'no_active_membership' })
      .mockResolvedValueOnce({ ok: true, identity: { studioId: 'new-studio' } })
    vi.spyOn(Cloud, '_registerStudio').mockResolvedValue({ ok: true, studioId: 'new-studio' })
    expect((await Cloud.completeOAuthReturn()).studioId).toBe('new-studio')
    expect(SecureDB.merge).toHaveBeenCalledWith('studioInfo', expect.objectContaining({ cloudEnabled: true }))
  })

  it('loads and stores local-demo membership links', async () => {
    info.supabaseStudioId = ''
    const memberQ = query({ data: { studio_id: 'member-studio' }, error: null })
    client.from.mockReturnValue(memberQ)
    expect(await Cloud._loadMemberStudioId()).toBe('member-studio')
    expect(SecureDB.merge).toHaveBeenCalledWith('studioInfo', expect.objectContaining({ supabaseStudioId: 'member-studio' }))
    await Cloud._saveStudioLink('')
  })

  it('completes studio registration and tenant lookup through server authority', async () => {
    vi.spyOn(Cloud, '_registerStudio').mockResolvedValue({ ok: true, studioId: 'server-studio' })
    vi.spyOn(Cloud, 'restoreAuthoritativeIdentity')
      .mockResolvedValueOnce({ ok: true, identity: { studioId: 'server-studio' } })
      .mockResolvedValueOnce({ ok: true, identity: { studioId: 'server-studio' } })
      .mockResolvedValueOnce({ ok: false, code: 'not_authenticated' })
    expect(await Cloud.registerCurrentStudio({ studioName: 'S', phone: '0912', name: 'N' }))
      .toMatchObject({ ok: true, identity: { studioId: 'server-studio' } })
    AppConfig.allowsLocalIdentity = () => false
    expect(await Cloud._loadMemberStudioId()).toBe('server-studio')
    expect(await Cloud._loadMemberStudioId()).toBeNull()
  })

  it('debounces snapshot pushes and throttles duplicate error notifications', async () => {
    Cloud._snapshotPending = true
    vi.spyOn(Cloud, 'pushSnapshot').mockResolvedValue({ ok: true })
    expect((await Cloud._pushSnapshotDebounced()).ok).toBe(true)
    expect(Cloud._snapshotPending).toBe(false)
    Cloud._notifyCloudError('first')
    Cloud._notifyCloudError('second')
    expect(Utils.toast).toHaveBeenCalledTimes(1)
  })

  it('bootstraps only from authoritative entity sync and never resurrects a snapshot', async () => {
    mocks.sync.pullAll.mockResolvedValueOnce({ ok: true, applied: 3, conflictCount: 0 })
    expect((await Cloud.bootstrap()).applied).toBe(3)

    mocks.sync.pullAll.mockResolvedValueOnce({ ok: false, applied: 0, conflictCount: 2, skipped: false, error: 'entity' })
    const pullSnapshot = vi.spyOn(Cloud, 'pullSnapshot')
    expect((await Cloud.bootstrap()).ok).toBe(false)
    expect(Utils.toast).toHaveBeenCalledWith(expect.stringContaining('تعارض'), 'warning')
    expect(pullSnapshot).not.toHaveBeenCalled()

    mocks.sync.pullAll.mockResolvedValueOnce({ ok: false, applied: 0, conflictCount: 0, skipped: false, error: 'entity' })
    const notify = vi.spyOn(Cloud, '_notifyCloudError').mockImplementation(() => {})
    expect((await Cloud.bootstrap()).ok).toBe(false)
    expect(notify).toHaveBeenCalledWith('entity')
    expect(pullSnapshot).not.toHaveBeenCalled()

    vi.spyOn(Cloud, 'isConfigured').mockReturnValueOnce(false)
    expect((await Cloud.bootstrap()).skipped).toBe(true)
  })

  it('fails closed across unauthenticated portal and missing cloud service paths', async () => {
    vi.spyOn(Cloud, 'session').mockResolvedValue(null)
    expect(await Cloud.claimCustomerContracts()).toMatchObject({ ok: false })
    expect(await Cloud.sendPortalMessage({})).toMatchObject({ ok: false })
    expect(await Cloud.listPortalMessages()).toMatchObject({ ok: false })
    expect(await Cloud.createBackupArchive()).toMatchObject({ ok: false })
    Cloud.session.mockRestore()
    vi.spyOn(Cloud, '_portalContract').mockResolvedValue(null)
    expect(await Cloud.sendPortalMessage({})).toMatchObject({ ok: false })
    vi.spyOn(Cloud, 'client').mockResolvedValue(null)
    expect(await Cloud.signInWithOAuth('google')).toMatchObject({ ok: false })
    expect(await Cloud.signUp({})).toMatchObject({ ok: false })
    expect(await Cloud.signIn({})).toMatchObject({ ok: false })
    expect(await Cloud.reviewStudioJoin('r', false)).toMatchObject({ ok: false })
    expect(await Cloud.updateAuthPassword('Strong!9')).toMatchObject({ ok: false })
  })

  it('covers signup with immediate session, registration approval and identity errors', async () => {
    client.auth.signUp.mockResolvedValue({ data: { session: { user: { id: 'u1' } }, user: { id: 'u1' } }, error: null })
    vi.spyOn(Cloud, '_registerStudio').mockResolvedValueOnce({ ok: true, pendingApproval: true })
    expect((await Cloud.signUp({ phone: '0912', password: 'x', name: 'N', studioName: 'S', joinCode: 'j' })).identity).toBeNull()
    Cloud._registerStudio.mockResolvedValueOnce({ ok: false, error: 'registration failed' })
    expect((await Cloud.signUp({ phone: '0912' })).ok).toBe(false)
    Cloud._registerStudio.mockResolvedValueOnce({ ok: true, pendingApproval: false })
    vi.spyOn(Cloud, 'restoreAuthoritativeIdentity').mockResolvedValueOnce({ ok: false, error: 'identity failed' })
    expect((await Cloud.signUp({ phone: '0912' })).ok).toBe(false)
    Cloud._registerStudio.mockResolvedValueOnce({ ok: true, pendingApproval: false })
    Cloud.restoreAuthoritativeIdentity.mockResolvedValueOnce({ ok: true, identity: { id: 'u1' } })
    expect((await Cloud.signUp({ phone: '0912' })).ok).toBe(true)
  })

  it('covers password, registration and invitation error results', async () => {
    Cloud._authoritativeIdentity = null
    expect(await Cloud.verifyCurrentPassword('x')).toMatchObject({ ok: false })
    Cloud._authoritativeIdentity = { phone: '0912' }
    vi.spyOn(Cloud, 'signIn').mockResolvedValueOnce({ ok: false })
    expect(await Cloud.verifyCurrentPassword('x')).toMatchObject({ ok: false })
    vi.spyOn(Cloud, 'verifyCurrentPassword').mockResolvedValueOnce({ ok: false, error: 'wrong' })
    expect(await Cloud.changePassword('x', 'y')).toMatchObject({ ok: false })
    Cloud.verifyCurrentPassword.mockResolvedValueOnce({ ok: true })
    client.auth.updateUser.mockResolvedValueOnce({ error: { message: 'change failed' } })
    expect(await Cloud.changePassword('x', 'y')).toMatchObject({ ok: false })
    vi.spyOn(Cloud, '_registerStudio').mockResolvedValueOnce({ ok: false })
    expect(await Cloud.registerCurrentStudio({})).toMatchObject({ ok: false })
    client.rpc.mockResolvedValueOnce({ error: { message: 'invite denied' } })
    expect(await Cloud.createStudioInvitation()).toMatchObject({ ok: false })
    client.rpc.mockResolvedValueOnce({ error: { message: 'review denied' } })
    expect(await Cloud.reviewStudioJoin('r', false)).toMatchObject({ ok: false })
  })

  it('covers snapshot, backup and contract error branches', async () => {
    const snapshotQ = query({ data: null, error: { message: 'read failed' } })
    client.from.mockReturnValue(snapshotQ)
    expect(await Cloud.pullSnapshot({ force: true })).toMatchObject({ ok: false, error: 'read failed' })
    snapshotQ.maybeSingle.mockResolvedValueOnce({ data: { data: null }, error: null })
    expect(await Cloud.pullSnapshot({ force: true })).toMatchObject({ ok: false })
    info.cloudLastSyncAt = '2026-02-01'
    Cloud._lastPullAt = 0
    snapshotQ.maybeSingle.mockResolvedValueOnce({ data: { data: {}, updated_at: '2026-01-01' }, error: null })
    expect(await Cloud.pullSnapshot()).toMatchObject({ ok: true, skipped: true })
    info.cloudLastSyncAt = ''
    DB.importJSON.mockResolvedValueOnce({ ok: false, error: 'import failed' })
    snapshotQ.maybeSingle.mockResolvedValueOnce({ data: { data: {}, updated_at: '2026-01-01' }, error: null })
    expect(await Cloud.pullSnapshot({ force: true })).toMatchObject({ ok: false })

    vi.spyOn(Cloud, '_callBackupEdge').mockResolvedValueOnce({ ok: false, error: 'backup failed' })
    expect(await Cloud.createBackupArchive()).toMatchObject({ ok: false })
    Cloud._callBackupEdge.mockResolvedValueOnce({ ok: false, error: 'restore failed' })
    expect(await Cloud.restoreBackupArchive('b')).toMatchObject({ ok: false })
    Cloud._callBackupEdge.mockResolvedValueOnce({ ok: true, payload: {} })
    DB.importJSON.mockResolvedValueOnce({ ok: false, error: 'import failed' })
    expect(await Cloud.restoreBackupArchive('b')).toMatchObject({ ok: false })

    expect(await Cloud.syncContractsFromLocal()).toMatchObject({
      ok: false,
      skipped: true,
      code: 'server_authority_required'
    })
  })

  it('covers missing global/configuration fallbacks without trusting browser state', async () => {
    delete AppConfig.allowsLocalIdentity
    AppConfig.isLocalDev = () => false
    vi.spyOn(Cloud, 'envConfig').mockReturnValue({ url: 'https://env.supabase.co', anonKey: 'env-key' })
    expect(Cloud.resolvedConfig()).toMatchObject({ url: 'https://env.supabase.co', enabled: true })
    vi.stubGlobal('Utils', undefined)
    expect(Cloud.phoneToEmail('09-12')).toBe('u0912@studiom.app')
    vi.stubGlobal('window', undefined)
    expect(Cloud.authRedirectUrl()).toBeUndefined()
    vi.stubGlobal('DB', undefined)
    expect(Cloud.studioCloudConfig()).toEqual({ enabled: false, url: '', anonKey: '', studioId: '' })
  })

  it('covers empty sessions, query errors and empty payload defaults', async () => {
    vi.spyOn(Cloud, 'client').mockResolvedValueOnce(null)
    expect(await Cloud.session()).toBeNull()
    const contractError = query({ data: null, error: { message: 'not found' } })
    client.from.mockReturnValue(contractError)
    expect(await Cloud._portalContract('x')).toBeNull()
    const messageError = query({ data: null, error: { message: 'read failed' } })
    client.from.mockReturnValue(messageError)
    expect(await Cloud.listPortalMessages()).toMatchObject({ ok: false })
    messageError.then = (resolve, reject) => Promise.resolve({ data: null, error: null }).then(resolve, reject)
    expect(await Cloud.listPortalMessages()).toMatchObject({ ok: true, messages: [] })
  })

  it('signs out rejected identities and tolerates best-effort outbox failure', async () => {
    vi.spyOn(Cloud, 'restoreAuthoritativeIdentity').mockResolvedValueOnce({ ok: false, code: 'denied' })
    expect(await Cloud.signIn({ phone: '09121234567', password: 'x' })).toMatchObject({ ok: false })
    expect(client.auth.signOut).toHaveBeenCalled()
    Cloud.restoreAuthoritativeIdentity.mockResolvedValueOnce({ ok: true, identity: { id: 'u1' } })
    FinanceOutbox.flush.mockRejectedValueOnce(new Error('outbox'))
    expect(await Cloud.signIn({ phone: '09121234567', password: 'x' })).toMatchObject({ ok: true })
  })

  it('covers OAuth registration failures and metadata display fallbacks', async () => {
    vi.spyOn(Cloud, 'session').mockResolvedValueOnce(null)
    expect(await Cloud.completeOAuthReturn()).toMatchObject({ skipped: true })
    Cloud.session.mockResolvedValue({ user: { id: 'u1', user_metadata: {}, email: '' } })
    vi.spyOn(Cloud, 'restoreAuthoritativeIdentity').mockResolvedValueOnce({ ok: false, code: 'no_active_membership' })
    vi.spyOn(Cloud, '_registerStudio').mockResolvedValueOnce({ ok: false, error: 'register failed' })
    expect(await Cloud.completeOAuthReturn()).toMatchObject({ ok: false })
    Cloud.restoreAuthoritativeIdentity
      .mockResolvedValueOnce({ ok: false, code: 'no_active_membership' })
      .mockResolvedValueOnce({ ok: false, code: 'invalid_membership' })
    Cloud._registerStudio.mockResolvedValueOnce({ ok: true, studioId: 's2' })
    expect(await Cloud.completeOAuthReturn()).toMatchObject({ ok: false, code: 'invalid_membership' })
  })

  it('covers missing tenant/session exits for every cloud persistence operation', async () => {
    info.supabaseStudioId = ''
    vi.spyOn(Cloud, '_loadMemberStudioId').mockResolvedValue(null)
    expect(await Cloud.pushSnapshot()).toMatchObject({ ok: false })
    expect(await Cloud.createBackupArchive()).toMatchObject({ ok: false })
    expect(await Cloud.restoreBackupArchive('b')).toMatchObject({ ok: false })
    expect(await Cloud.listBackupArchives()).toMatchObject({ ok: false })
    expect(await Cloud.pullSnapshot({ force: true })).toMatchObject({ ok: false })
    expect(await Cloud.syncContractsFromLocal()).toMatchObject({ ok: false })
    Cloud._loadMemberStudioId.mockRestore()
    vi.spyOn(Cloud, 'session').mockResolvedValue(null)
    expect(await Cloud.pushSnapshot()).toMatchObject({ ok: false })
    expect(await Cloud.pullSnapshot({ force: true })).toMatchObject({ ok: false })
    expect(await Cloud.syncContractsFromLocal()).toMatchObject({ ok: false })
    expect(await Cloud.ensureLiveSync()).toMatchObject({ ok: false })
  })

  it('covers settings validation, server membership and archive listing failures', async () => {
    vi.stubGlobal('SecureDB', undefined)
    expect(await Cloud.enableCloud({})).toMatchObject({ ok: false })
    vi.stubGlobal('SecureDB', { merge: vi.fn(async () => true) })
    const jwt = `x.${btoa(JSON.stringify({ role: 'service_role' }))}.x`
    expect(await Cloud.enableCloud({ anonKey: jwt })).toMatchObject({ ok: false })
    info.supabaseStudioId = ''
    expect(await Cloud.createStudioInvitation()).toMatchObject({ ok: false })
    const memberError = query({ data: null, error: { message: 'membership failed' } })
    client.from.mockReturnValue(memberError)
    expect(await Cloud._loadMemberStudioId()).toBeNull()
    info.supabaseStudioId = 's1'
    vi.spyOn(Cloud, '_callBackupEdge').mockResolvedValueOnce({ ok: false, error: 'archive failed' })
    expect(await Cloud.listBackupArchives()).toMatchObject({ ok: false, backups: [] })
  })

  it('covers production bootstrap identity failure and non-live sync label', async () => {
    delete AppConfig.allowsLocalIdentity
    AppConfig.isLocalDev = () => false
    vi.spyOn(Cloud, 'isConfigured').mockReturnValue(true)
    vi.spyOn(Cloud, 'restoreAuthoritativeIdentity').mockResolvedValueOnce({ ok: false, code: 'not_authenticated' })
    expect(await Cloud.bootstrap()).toMatchObject({ skipped: true, reason: 'not_authenticated' })
    mocks.realtime.status.mockReturnValueOnce('off')
    expect(Cloud.syncModeLabel()).toBe('authoritative delta')
  })

  it('covers remaining optional auth and payload defaults', async () => {
    expect(Cloud.jwtRole()).toBe('')
    expect(Cloud.jwtRole(`x.${btoa('{}')}.x`)).toBe('')
    expect(Cloud.jwtRole('x.@@@.x')).toBe('')
    expect(Cloud.formatAuthError()).toBe('')
    expect(Cloud.phoneToEmail('')).toBe('uuser@studiom.app')
    await Cloud.sendPhoneOtp('09121234567', { shouldCreateUser: false })
    expect(client.auth.signInWithOtp).toHaveBeenCalledWith(expect.objectContaining({ options: { shouldCreateUser: false } }))
    client.auth.verifyOtp.mockResolvedValueOnce({ data: null, error: null })
    expect(await Cloud.verifyPhoneOtp('09121234567', '123456')).toMatchObject({ ok: false })
    client.auth.signInWithOAuth.mockResolvedValueOnce({ data: {}, error: null })
    expect(await Cloud.signInWithOAuth('apple')).toMatchObject({ ok: true, url: '' })
    vi.spyOn(Cloud, '_portalContract').mockResolvedValue({ id: 'c', studio_id: 's', local_id: 'l' })
    client.from.mockReturnValue(query({ data: { id: 'm' }, error: null }))
    expect(await Cloud.sendPortalMessage({ requestType: '', senderKind: '', senderName: 'x'.repeat(200), body: 'x'.repeat(5000) })).toMatchObject({ ok: true })
    client.rpc.mockResolvedValueOnce({ data: 's', error: null })
    expect(await Cloud._registerStudio('', '', '', null)).toMatchObject({ ok: true })
  })

  it('fails client creation for a privileged JWT and handles absent studio info', async () => {
    DB.get.mockReturnValueOnce(null)
    expect(Cloud.studioCloudConfig()).toMatchObject({ enabled: false, studioId: '' })
    expect(Cloud.toE164Phone()).toBe('')
    Cloud.client.mockRestore()
    const serviceKey = `x.${btoa(JSON.stringify({ role: 'service_role' }))}.x`
    vi.spyOn(Cloud, 'resolvedConfig').mockReturnValue({ url: 'https://p.supabase.co', anonKey: serviceKey })
    await expect(Cloud.client()).rejects.toThrow('service_role')
  })
})
