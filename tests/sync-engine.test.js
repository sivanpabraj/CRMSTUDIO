import { describe, it, expect } from 'vitest'
import { compareRows, mergeCollection, parseTime } from '../js/sync/conflict.js'
import { isSyncEntity, stripSensitive, rowUpdatedAt, toRpcRow } from '../js/sync/entities.js'

describe('parseTime', () => {
  it('parses ISO strings', () => {
    expect(parseTime('2026-01-01T00:00:00.000Z')).toBeGreaterThan(0)
  })

  it('returns 0 for empty', () => {
    expect(parseTime('')).toBe(0)
  })
})

describe('compareRows', () => {
  it('prefers remote when newer', () => {
    const local = { updatedAtIso: '2026-01-01T00:00:00.000Z' }
    expect(compareRows(local, {}, '2026-06-01T00:00:00.000Z')).toBe('remote')
  })

  it('prefers local when newer', () => {
    const local = { updatedAtIso: '2026-06-01T00:00:00.000Z' }
    expect(compareRows(local, {}, '2026-01-01T00:00:00.000Z')).toBe('local')
  })
})

describe('mergeCollection', () => {
  it('applies a newer server revision regardless of timestamp', () => {
    const local = [{ id: '1', name: 'old', _serverRevision: 1, updatedAtIso: '2099-01-01T00:00:00.000Z' }]
    const remote = [{
      local_id: '1',
      payload: { id: '1', name: 'new' },
      revision: 2,
      updated_seq: 8,
      updated_at: '2026-01-01T00:00:00.000Z'
    }]
    const r = mergeCollection(local, remote)
    expect(r.applied).toBe(1)
    expect(r.items[0].name).toBe('new')
  })

  it('skips an older server revision', () => {
    const local = [{ id: '1', name: 'local', _serverRevision: 3, updatedAtIso: '2026-06-01T00:00:00.000Z' }]
    const remote = [{
      local_id: '1',
      payload: { id: '1', name: 'stale' },
      revision: 2,
      updated_seq: 8,
      updated_at: '2099-01-01T00:00:00.000Z'
    }]
    const r = mergeCollection(local, remote)
    expect(r.applied).toBe(0)
    expect(r.items[0].name).toBe('local')
  })
})

describe('entities registry', () => {
  it('includes contracts', () => {
    expect(isSyncEntity('contracts')).toBe(true)
  })

  it.each([
    'persProjects',
    'persContracts',
    'calendarReminders',
    'galleries',
    'customerCustody'
  ])('row-syncs operational collection %s', collection => {
    expect(isSyncEntity(collection)).toBe(true)
  })

  it('excludes users', () => {
    expect(isSyncEntity('users')).toBe(false)
  })

  it('strips password from users payload', () => {
    const out = stripSensitive('users', { id: '1', password: 'x', salt: 'y', name: 'a' })
    expect(out.password).toBeUndefined()
    expect(out.name).toBe('a')
  })

  it('builds rpc row', () => {
    const row = toRpcRow({ id: 'abc', total: 100, updatedAtIso: '2026-01-02T00:00:00.000Z' })
    expect(row.local_id).toBe('abc')
    expect(row.payload.total).toBe(100)
    expect(rowUpdatedAt({ updatedAtIso: '2026-01-02T00:00:00.000Z' })).toBe('2026-01-02T00:00:00.000Z')
  })
})
