import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SyncEngine } from '../js/sync/engine.js'
import { RealtimeSync } from '../js/sync/realtime.js'

describe('authoritative sync runtime behavior', () => {
  const original = {}
  let data
  let cloud

  beforeEach(() => {
    for (const name of ['DB', 'SecureDB', 'Utils', 'window', 'document']) original[name] = globalThis[name]
    data = { studioInfo: {}, contracts: [] }
    globalThis.DB = {
      get: vi.fn(name => data[name] || []),
      set: vi.fn(async (name, rows) => { data[name] = rows }),
      flush: vi.fn(async () => {})
    }
    globalThis.SecureDB = {
      merge: vi.fn(async (name, value) => { data[name] = value }),
      systemSet: vi.fn(async (name, rows) => { data[name] = rows })
    }
    globalThis.Utils = { toast: vi.fn() }
    cloud = {
      isEnabled: vi.fn(() => true),
      session: vi.fn(async () => ({ user: { id: 'user' } })),
      studioCloudConfig: vi.fn(() => ({ studioId: 'studio' })),
      _loadMemberStudioId: vi.fn(async () => 'loaded-studio'),
      client: vi.fn(async () => ({ rpc: vi.fn(async () => ({ data: [], error: null })) })),
      syncContractsFromLocal: vi.fn(async () => ({ ok: true }))
    }
    SyncEngine._entityPending = false
    SyncEngine._lastEntityPullAt = 0
    SyncEngine._entityPushTimer = null
    SyncEngine._snapshotTimer = null
    RealtimeSync._cloud = null
    RealtimeSync._channel = null
    RealtimeSync._pullTimer = null
    RealtimeSync._status = 'off'
    RealtimeSync._boundLifecycle = false
  })

  afterEach(() => {
    clearTimeout(SyncEngine._entityPushTimer)
    clearTimeout(SyncEngine._snapshotTimer)
    clearTimeout(RealtimeSync._pullTimer)
    for (const name of ['DB', 'SecureDB', 'Utils', 'window', 'document']) {
      if (original[name] === undefined) delete globalThis[name]
      else globalThis[name] = original[name]
    }
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('does not schedule or flush entity changes while cloud sync is disabled', async () => {
    const disabled = { isEnabled: () => false }
    expect(SyncEngine.scheduleEntityPush(disabled)).toBeUndefined()
    expect(await SyncEngine.flushEntityPush(disabled)).toEqual({ ok: false, skipped: true })
    expect(SyncEngine.scheduleSnapshotPush(disabled)).toBeUndefined()
  })

  it('debounces an entity push and reports a rejected batch to cloud UI', async () => {
    vi.useFakeTimers()
    const push = vi.spyOn(SyncEngine, 'pushAll').mockResolvedValue({ ok: false, error: 'server rejected' })
    cloud._notifyCloudError = vi.fn()
    SyncEngine.scheduleEntityPush(cloud)
    SyncEngine.scheduleEntityPush(cloud)
    await vi.runAllTimersAsync()
    expect(push).toHaveBeenCalledOnce()
    expect(cloud._notifyCloudError).toHaveBeenCalledWith('server rejected')
  })

  it('reports thrown push failures and executes delayed snapshot persistence', async () => {
    vi.useFakeTimers()
    vi.spyOn(SyncEngine, 'pushAll').mockRejectedValue(new Error('transport failed'))
    cloud._notifyCloudError = vi.fn()
    cloud._pushSnapshotDebounced = vi.fn(async () => {})
    SyncEngine.scheduleEntityPush(cloud)
    SyncEngine.scheduleSnapshotPush(cloud)
    await vi.runAllTimersAsync()
    expect(cloud._notifyCloudError).toHaveBeenCalledWith('transport failed')
    expect(cloud._snapshotPending).toBe(true)
    expect(cloud._pushSnapshotDebounced).toHaveBeenCalledOnce()
  })

  it('flushes only an actually pending entity batch', async () => {
    expect(await SyncEngine.flushEntityPush(cloud)).toMatchObject({ skipped: true, reason: 'nothing_pending' })
    SyncEngine._entityPending = true
    const push = vi.spyOn(SyncEngine, 'pushAll').mockResolvedValue({ ok: true, count: 2 })
    expect(await SyncEngine.flushEntityPush(cloud)).toEqual({ ok: true, count: 2 })
    expect(push).toHaveBeenCalledOnce()
  })

  it('persists timestamp and sequence cursors and conflicts through the secure adapter', async () => {
    data.studioInfo = { id: 'studio' }
    await SyncEngine._saveCursors({ contracts: 'now' }, { extra: true })
    expect(data.studioInfo).toMatchObject({ syncCursors: { contracts: 'now' }, extra: true })
    await SyncEngine._saveSequenceCursors({ contracts: { seq: 2, id: 'x' } })
    expect(data.studioInfo.syncSequenceCursors.contracts.seq).toBe(2)
    await SyncEngine._saveConflicts([{ id: 'conflict' }])
    expect(data.studioInfo.syncConflicts).toEqual([{ id: 'conflict' }])

    delete globalThis.SecureDB
    await expect(SyncEngine._saveCursors({})).resolves.toBeUndefined()
    await expect(SyncEngine._saveSequenceCursors({})).resolves.toBeUndefined()
    await expect(SyncEngine._saveConflicts([])).resolves.toBeUndefined()
  })

  it('selects dirty, tombstoned, unversioned, invalid-time, and newer rows for upload', () => {
    data.contracts = [
      { id: 'dirty', _syncMutationId: 'm', updatedAtIso: '2020-01-01T00:00:00Z' },
      { id: 'new', _serverRevision: 1, updatedAtIso: '2027-01-01T00:00:00Z' },
      { id: 'invalid', _serverRevision: 1, updatedAtIso: 'not-a-date' },
      { id: 'old', _serverRevision: 1, updatedAtIso: '2020-01-01T00:00:00Z' },
      { name: 'missing-id' }
    ]
    expect(SyncEngine._rowsSince('contracts', '2026-01-01T00:00:00Z').map(row => row.id))
      .toEqual(['dirty', 'new', 'invalid'])
  })

  it('resolves selected studio first and falls back to server membership selection', async () => {
    expect(await SyncEngine._resolveStudioId(cloud)).toBe('studio')
    cloud.studioCloudConfig.mockReturnValue({})
    expect(await SyncEngine._resolveStudioId(cloud)).toBe('loaded-studio')
    cloud._loadMemberStudioId.mockResolvedValue(null)
    expect(await SyncEngine._resolveStudioId(cloud)).toBeNull()
  })

  it('rejects entity upload without a client and returns an empty batch without RPC', async () => {
    cloud.client.mockResolvedValue(null)
    expect(await SyncEngine.pushEntityType(cloud, 'contracts', 'studio')).toEqual({ ok: false, error: 'no client' })

    cloud.client.mockResolvedValue({ rpc: vi.fn() })
    expect(await SyncEngine.pushEntityType(cloud, 'contracts', 'studio'))
      .toEqual({ ok: true, count: 0, entityType: 'contracts' })
  })

  it('uploads an authoritative command, strips sensitive fields, and reconciles server revision', async () => {
    data.fileAssets = [{ id: 'asset', name: 'preview', data: 'must-not-cross-boundary' }]
    const rpc = vi.fn(async (_name, params) => ({
      data: { results: [{ local_id: params.p_commands[0].local_id, revision: 3, updated_seq: 4 }] },
      error: null
    }))
    cloud.client.mockResolvedValue({ rpc })
    const result = await SyncEngine.pushEntityType(cloud, 'fileAssets', 'studio')
    expect(result).toMatchObject({ ok: true, count: 1 })
    expect(rpc.mock.calls[0][1].p_commands[0].payload.data).toBeUndefined()
    expect(globalThis.SecureDB.systemSet).toHaveBeenCalled()
    expect(globalThis.DB.flush).toHaveBeenCalled()
  })

  it('returns the server error and does not overwrite local rows', async () => {
    data.contracts = [{ id: 'contract', amount: 7 }]
    cloud.client.mockResolvedValue({ rpc: vi.fn(async () => ({ data: null, error: { message: 'rls denied' } })) })
    expect(await SyncEngine.pushEntityType(cloud, 'contracts', 'studio'))
      .toEqual({ ok: false, error: 'rls denied', entityType: 'contracts' })
    expect(globalThis.SecureDB.systemSet).not.toHaveBeenCalled()
  })

  it('uses the DB adapter only when systemSet is unavailable', async () => {
    data.contracts = [{ id: 'contract', amount: 7 }]
    delete globalThis.SecureDB.systemSet
    cloud.client.mockResolvedValue({ rpc: vi.fn(async (_name, params) => ({
      data: { results: [{ local_id: params.p_commands[0].local_id, revision: 1 }] }, error: null
    })) })
    await SyncEngine.pushEntityType(cloud, 'contracts', 'studio')
    expect(globalThis.DB.set).toHaveBeenCalled()
  })

  it('pushAll fails closed for missing session or tenant and preserves retry intent on partial error', async () => {
    SyncEngine._entityPending = true
    cloud.session.mockResolvedValue(null)
    expect((await SyncEngine.pushAll(cloud)).error).toContain('Supabase')

    SyncEngine._entityPending = true
    cloud.session.mockResolvedValue({ user: {} })
    cloud.studioCloudConfig.mockReturnValue({})
    cloud._loadMemberStudioId.mockResolvedValue(null)
    expect((await SyncEngine.pushAll(cloud)).error).toContain('استودیوی')

    SyncEngine._entityPending = true
    cloud.studioCloudConfig.mockReturnValue({ studioId: 'studio' })
    const entityPush = vi.spyOn(SyncEngine, 'pushEntityType')
      .mockResolvedValueOnce({ ok: false, error: 'denied' })
      .mockResolvedValue({ ok: true, count: 1 })
    const result = await SyncEngine.pushAll(cloud)
    expect(result.ok).toBe(false)
    expect(result.error).toContain('denied')
    expect(result.partial).toBeGreaterThan(0)
    expect(SyncEngine._entityPending).toBe(true)
    expect(entityPush).toHaveBeenCalled()
  })

  it('pullAll enforces enablement, throttle, session, tenant, and client boundaries', async () => {
    cloud.isEnabled.mockReturnValue(false)
    expect(await SyncEngine.pullAll(cloud)).toMatchObject({ skipped: true })
    cloud.isEnabled.mockReturnValue(true)
    SyncEngine._lastEntityPullAt = Date.now()
    expect(await SyncEngine.pullAll(cloud)).toMatchObject({ skipped: true })

    SyncEngine._lastEntityPullAt = 0
    cloud.session.mockResolvedValue(null)
    expect((await SyncEngine.pullAll(cloud, { force: true })).error).toContain('Supabase')
    cloud.session.mockResolvedValue({ user: {} })
    cloud.studioCloudConfig.mockReturnValue({})
    cloud._loadMemberStudioId.mockResolvedValue(null)
    expect((await SyncEngine.pullAll(cloud, { force: true })).error).toContain('استودیوی')
    cloud.studioCloudConfig.mockReturnValue({ studioId: 'studio' })
    cloud.client.mockResolvedValue(null)
    expect(await SyncEngine.pullAll(cloud, { force: true })).toMatchObject({ ok: false, error: 'no client' })
  })

  it('pulls a server delta, applies it, and persists the authoritative sequence cursor', async () => {
    const rpc = vi.fn(async (_name, params) => params.p_entity_type === 'bookings'
      ? { data: [{ local_id: 'remote', payload: { id: 'remote', amount: 9 }, revision: 1, updated_seq: 4, updated_at: '2026-01-01T00:00:00Z' }], error: null }
      : { data: [], error: null })
    cloud.client.mockResolvedValue({ rpc })
    const result = await SyncEngine.pullAll(cloud, { force: true })
    expect(result.ok).toBe(true)
    expect(result.applied).toBe(1)
    expect(data.bookings[0]).toMatchObject({ id: 'remote', amount: 9, _serverRevision: 1 })
    expect(data.studioInfo.syncSequenceCursors.bookings.seq).toBe(4)
  })

  it('returns pull RPC errors without persisting a cursor', async () => {
    cloud.client.mockResolvedValue({ rpc: vi.fn(async () => ({ data: null, error: { message: 'database unavailable' } })) })
    expect(await SyncEngine.pullAll(cloud, { force: true })).toEqual({ ok: false, error: 'database unavailable' })
    expect(globalThis.SecureDB.merge).not.toHaveBeenCalled()
  })
})

describe('realtime sync behavior', () => {
  const original = {}

  beforeEach(() => {
    original.window = globalThis.window
    original.document = globalThis.document
    original.Utils = globalThis.Utils
    globalThis.window = { addEventListener: vi.fn(), dispatchEvent: vi.fn() }
    globalThis.document = { addEventListener: vi.fn(), visibilityState: 'visible' }
    globalThis.Utils = { toast: vi.fn() }
    RealtimeSync._channel = null
    RealtimeSync._cloud = null
    RealtimeSync._pullTimer = null
    RealtimeSync._status = 'off'
    RealtimeSync._boundLifecycle = false
  })

  afterEach(() => {
    clearTimeout(RealtimeSync._pullTimer)
    for (const name of ['window', 'document', 'Utils']) {
      if (original[name] === undefined) delete globalThis[name]
      else globalThis[name] = original[name]
    }
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('fails closed before subscribing when cloud, session, tenant, or client is absent', async () => {
    expect(await RealtimeSync.start({ isEnabled: () => false })).toMatchObject({ skipped: true })
    const base = { isEnabled: () => true, session: async () => null }
    expect(await RealtimeSync.start(base)).toMatchObject({ error: 'no session' })
    base.session = async () => ({ user: {} })
    base.studioCloudConfig = () => ({})
    base._loadMemberStudioId = async () => null
    expect(await RealtimeSync.start(base)).toMatchObject({ error: 'no studio' })
    base.studioCloudConfig = () => ({ studioId: 'studio' })
    base.client = async () => null
    expect(await RealtimeSync.start(base)).toMatchObject({ error: 'no client' })
  })

  it('subscribes to tenant-scoped channels and updates live status', async () => {
    const callbacks = []
    const channel = {
      on: vi.fn((_event, _filter, callback) => { callbacks.push(callback); return channel }),
      subscribe: vi.fn(callback => callback('SUBSCRIBED')),
      unsubscribe: vi.fn()
    }
    const cloud = {
      isEnabled: () => true,
      session: async () => ({ user: {} }),
      studioCloudConfig: () => ({ studioId: 'studio' }),
      client: async () => ({ channel: vi.fn(() => channel) })
    }
    vi.spyOn(RealtimeSync, '_schedulePull').mockImplementation(() => {})
    expect(await RealtimeSync.start(cloud)).toEqual({ ok: true })
    expect(channel.on).toHaveBeenCalledTimes(2)
    expect(RealtimeSync.status()).toBe('live')
    expect(globalThis.window.dispatchEvent).toHaveBeenCalled()
    callbacks[0]()
    expect(RealtimeSync._schedulePull).toHaveBeenCalledWith('entities')
    RealtimeSync.stop()
    expect(channel.unsubscribe).toHaveBeenCalled()
    expect(RealtimeSync.status()).toBe('off')
  })

  it('debounces pulls and emits conflict, applied, and DOM events', async () => {
    vi.useFakeTimers()
    const pull = vi.spyOn(SyncEngine, 'pullAll')
      .mockResolvedValueOnce({ ok: true, conflicts: [{ id: 'c' }], applied: 0 })
      .mockResolvedValueOnce({ ok: true, conflicts: [], applied: 2 })
    RealtimeSync._cloud = { isEnabled: () => true }
    RealtimeSync._schedulePull('change')
    await vi.runAllTimersAsync()
    expect(globalThis.Utils.toast).toHaveBeenCalledWith(expect.stringContaining('تعارض'), 'warning')
    RealtimeSync._schedulePull('subscribed')
    await vi.runAllTimersAsync()
    expect(globalThis.Utils.toast).toHaveBeenCalledWith(expect.stringContaining('2'), 'info')
    expect(globalThis.window.dispatchEvent).toHaveBeenCalledTimes(2)
    expect(pull).toHaveBeenCalledTimes(2)
  })

  it('binds lifecycle listeners once and tolerates unsubscribe failures', () => {
    RealtimeSync._bindLifecycle()
    RealtimeSync._bindLifecycle()
    expect(globalThis.window.addEventListener).toHaveBeenCalledOnce()
    expect(globalThis.document.addEventListener).toHaveBeenCalledOnce()
    RealtimeSync._channel = { unsubscribe: vi.fn(() => { throw new Error('closed') }) }
    expect(() => RealtimeSync.stop()).not.toThrow()
    expect(RealtimeSync._channel).toBeNull()
  })
})
