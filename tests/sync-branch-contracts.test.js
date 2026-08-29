import { describe, expect, it, vi } from 'vitest'
import {
  mutationKey, nextSequenceCursor, normalizeDelta, reconcilePush, toAuthoritativeCommand
} from '../js/sync/protocol.js'
import {
  activeRows, isSyncEntity, isTombstoneEntity, rowUpdatedAt, stripSensitive, toRpcRow, toSyncRow
} from '../js/sync/entities.js'
import { compareRows, detectConflict, mergeCollection, parseTime, stripMeta } from '../js/sync/conflict.js'
import {
  conflictCount, conflictKey, listConflicts, removeConflict, resolveConflict, upsertConflict
} from '../js/sync/conflict-store.js'

describe('sync protocol branch contracts', () => {
  it('generates a deterministic bootstrap key and normalizes missing numeric metadata', () => {
    expect(mutationKey('contracts', { id: 'a', _syncRev: 0 })).toBe('contracts:a:bootstrap:1')
    expect(normalizeDelta({ payload: null, revision: null, updated_seq: null })).toMatchObject({
      payload: { _serverRevision: 0, _serverSeq: 0 }
    })
  })

  it('reconciles both mutation and bootstrap commands while preserving unrelated rows', () => {
    const rows = [
      { id: 'mutated', _syncMutationId: 'm1' },
      { id: 'bootstrap' },
      { id: 'missing-result' },
      { id: 'missing-command' }
    ]
    const commands = [
      { local_id: 'mutated', idempotency_key: 'm1' },
      { local_id: 'bootstrap', idempotency_key: 'contracts:bootstrap:bootstrap:1' },
      { local_id: 'missing-result', idempotency_key: 'm3' }
    ]
    const results = [
      { local_id: 'mutated', revision: '2', updated_seq: '3' },
      { local_id: 'bootstrap', revision: '4', updated_seq: '5' },
      { local_id: 'missing-command', revision: 6, updated_seq: 7 }
    ]
    const reconciled = reconcilePush(rows, commands, results)
    expect(reconciled[0]).toMatchObject({ _serverRevision: 2, _serverSeq: 3 })
    expect(reconciled[0]).not.toHaveProperty('_syncMutationId')
    expect(reconciled[1]).toMatchObject({ _serverRevision: 4, _serverSeq: 5 })
    expect(reconciled[2]).toBe(rows[2])
    expect(reconciled[3]).toBe(rows[3])
  })

  it('uses the supplied cursor when a page is empty and safe defaults for malformed last row', () => {
    const fallback = { seq: 8, id: 'last' }
    expect(nextSequenceCursor([], fallback)).toBe(fallback)
    expect(nextSequenceCursor([{ id: 0, updated_seq: null }])).toEqual({ seq: 0, id: '0' })
  })

  it('encodes revision fallbacks and removes client-only metadata from commands', () => {
    const command = toAuthoritativeCommand('contracts', {
      id: 3, title: 'x', _serverRevision: 'bad', _serverSeq: 9, _syncMutationId: 'stable'
    })
    expect(command).toMatchObject({ local_id: '3', expected_revision: 0, op: 'upsert' })
    expect(command.payload).not.toHaveProperty('_serverSeq')
    expect(command.payload).not.toHaveProperty('_syncMutationId')
  })
})

describe('sync entity registry branch contracts', () => {
  it('handles null rows and registry exclusions', () => {
    expect(activeRows(null)).toEqual([])
    expect(activeRows([null, { id: 'deleted', _deleted: true }, { id: 'active' }])).toEqual([{ id: 'active' }])
    expect(isSyncEntity('users')).toBe(false)
    expect(isSyncEntity('unknown')).toBe(false)
    expect(isTombstoneEntity('contracts')).toBe(false)
  })

  it('strips each sensitive and server-only payload class without mutating input', () => {
    expect(stripSensitive('contracts', null)).toBeNull()
    const user = { password: 'p', salt: 's', name: 'n', _serverRevision: 1, _serverSeq: 2, _syncMutationId: 'm' }
    expect(stripSensitive('users', user)).toEqual({ name: 'n' })
    expect(user.password).toBe('p')
    expect(stripSensitive('fileAssets', { id: 'f', data: 'blob' })).toEqual({ id: 'f' })
  })

  it('selects each supported timestamp representation', () => {
    expect(rowUpdatedAt(null)).toBe('')
    expect(rowUpdatedAt({ updatedAtIso: 'iso', updated_at: 'db', updatedAt: 'legacy' })).toBe('iso')
    expect(rowUpdatedAt({ updated_at: 'db', updatedAt: 'legacy' })).toBe('db')
    expect(rowUpdatedAt({ updatedAt: 'legacy' })).toBe('legacy')
    expect(rowUpdatedAt({})).toBe('')
  })

  it('builds server and RPC rows with numeric defaults and explicit timestamps', () => {
    expect(toSyncRow('s', 'contracts', { id: 4, _syncRev: 'bad', updated_at: 'db-time' }))
      .toMatchObject({ studio_id: 's', local_id: '4', revision: 1, updated_at: 'db-time' })
    expect(toRpcRow({ id: 4, _syncRev: '2', updatedAt: 'legacy' }))
      .toMatchObject({ local_id: '4', revision: 2, updated_at: 'legacy' })
  })
})

describe('conflict merge branch contracts', () => {
  it('normalizes invalid/equal timestamps and metadata-free payloads', () => {
    expect(parseTime('not-a-date')).toBe(0)
    expect(stripMeta(null)).toBeNull()
    expect(stripMeta({ id: 1, _syncRev: 2, updatedAtIso: 'x' })).toEqual({ id: 1 })
    expect(compareRows({}, {}, '')).toBe('equal')
  })

  it('detects only divergent concurrently edited server revisions', () => {
    const dirty = { id: 'a', value: 1, _syncMutationId: 'm', _serverRevision: 1 }
    expect(detectConflict(null, { payload: {} })).toBe(false)
    expect(detectConflict(dirty, null)).toBe(false)
    expect(detectConflict(dirty, { payload: { id: 'a', value: 1 }, revision: 2 })).toBe(false)
    expect(detectConflict({ id: 'a', value: 1 }, { payload: { id: 'a', value: 2 }, revision: 2 })).toBe(false)
    expect(detectConflict(dirty, { payload: { id: 'a', value: 2 }, revision: 2 })).toBe(true)
    expect(detectConflict({ ...dirty, _serverRevision: 2 }, { payload: { id: 'a', value: 2 }, revision: 2 })).toBe(false)
  })

  it('skips malformed rows, calls conflict hooks, applies tombstones, and rejects stale revisions', () => {
    const onConflict = vi.fn()
    const local = [
      { id: 'conflict', value: 'local', _syncMutationId: 'm', _serverRevision: 1 },
      { id: 'stale', value: 'new', _serverRevision: 4 },
      { id: 'deleted', value: 'old', _serverRevision: 1 }
    ]
    const remote = [
      { local_id: '', payload: {} },
      { local_id: 'conflict', payload: { id: 'conflict', value: 'remote' }, revision: 2 },
      { local_id: 'stale', payload: { id: 'stale', value: 'old' }, revision: 3 },
      { local_id: 'deleted', payload: { id: 'deleted', _deleted: true }, revision: 2, updated_seq: 9, updated_at: '2026-01-01T00:00:00Z' },
      { payload: { id: 'new', value: 'added' }, revision: null, updated_seq: null }
    ]
    const result = mergeCollection(local, remote, { onConflict })
    expect(onConflict).toHaveBeenCalledOnce()
    expect(result).toMatchObject({ applied: 2, skipped: 2 })
    expect(result.items.find(row => row.id === 'deleted')).toMatchObject({
      _deleted: true, deletedAtIso: '2026-01-01T00:00:00Z', _serverSeq: 9
    })
    expect(result.items.find(row => row.id === 'new')).toMatchObject({ _serverRevision: 0, _serverSeq: 0 })
  })
})

describe('conflict store branch contracts', () => {
  it('lists safely, inserts and replaces by stable key, then removes and counts', () => {
    expect(listConflicts(null)).toEqual([])
    expect(listConflicts({ syncConflicts: {} })).toEqual([])
    expect(conflictKey('contracts', 'a')).toBe('contracts:a')
    const info = { syncConflicts: [] }
    upsertConflict(info, { entityType: 'contracts', localId: 1, local: {}, remote: {}, remoteRevision: null })
    expect(conflictCount(info)).toBe(1)
    upsertConflict(info, {
      id: 'custom', entityType: 'contracts', localId: 1, local: { value: 1 }, remote: { value: 2 },
      remoteRevision: 3, detectedAt: 'known'
    })
    expect(info.syncConflicts).toHaveLength(1)
    expect(info.syncConflicts[0]).toMatchObject({ id: 'custom', remoteRevision: 3, detectedAt: 'known' })
    expect(removeConflict(info, 'contracts', 1)).toEqual([])
  })

  it('resolves null, remote, and local choices with safe revision defaults', () => {
    expect(resolveConflict(null, 'local')).toBeNull()
    const entry = { localId: 'a', local: {}, remote: {}, remoteRevision: null, remoteUpdatedAt: 'remote-time' }
    expect(resolveConflict(entry, 'remote')).toMatchObject({ id: 'a', updatedAtIso: 'remote-time', _syncRev: 1 })
    expect(resolveConflict(entry, 'local')).toMatchObject({ id: 'a', _syncRev: 1 })
  })
})
