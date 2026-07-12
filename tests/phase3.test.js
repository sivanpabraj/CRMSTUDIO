import { describe, it, expect } from 'vitest'
import { validateCsrfBound, csrfForUser, generateCsrfToken } from '../js/lib/csrf.js'
import { detectConflict, mergeCollection } from '../js/sync/conflict.js'
import {
  upsertConflict,
  removeConflict,
  resolveConflict,
  conflictCount
} from '../js/sync/conflict-store.js'

describe('validateCsrfBound', () => {
  it('accepts matching token and userId', () => {
    const session = { userId: 'u1', csrf: 'abc123' }
    expect(validateCsrfBound('abc123', session, 'u1')).toBe(true)
  })

  it('rejects wrong user', () => {
    const session = { userId: 'u1', csrf: 'abc123' }
    expect(validateCsrfBound('abc123', session, 'u2')).toBe(false)
  })

  it('rejects wrong token', () => {
    const session = { userId: 'u1', csrf: 'abc123' }
    expect(validateCsrfBound('wrong', session, 'u1')).toBe(false)
  })
})

describe('csrfForUser', () => {
  it('binds userId to token', () => {
    const r = csrfForUser('u1', 'tok')
    expect(r.userId).toBe('u1')
    expect(r.token).toBe('tok')
  })

  it('generates token when missing', () => {
    const r = csrfForUser('u1')
    expect(r.token.length).toBeGreaterThan(8)
  })
})

describe('generateCsrfToken', () => {
  it('returns hex string', () => {
    expect(generateCsrfToken()).toMatch(/^[0-9a-f]+$/)
  })
})

describe('detectConflict', () => {
  it('detects equal timestamp different payload', () => {
    const local = { id: '1', total: 100, updatedAtIso: '2026-06-01T12:00:00.000Z', _syncRev: 2 }
    const remote = {
      local_id: '1',
      payload: { id: '1', total: 200 },
      updated_at: '2026-06-01T12:00:00.000Z',
      revision: 3
    }
    expect(detectConflict(local, remote)).toBe(true)
  })

  it('detects concurrent edits within 2 minutes', () => {
    const local = { id: '1', total: 100, updatedAtIso: '2026-06-01T12:00:30.000Z', _syncRev: 5 }
    const remote = {
      local_id: '1',
      payload: { id: '1', total: 200 },
      updated_at: '2026-06-01T12:01:00.000Z',
      revision: 6
    }
    expect(detectConflict(local, remote)).toBe(true)
  })
})

describe('mergeCollection conflicts', () => {
  it('queues conflict instead of overwriting', () => {
    const local = [{ id: '1', total: 100, updatedAtIso: '2026-06-01T12:00:00.000Z', _syncRev: 2 }]
    const remote = [{
      local_id: '1',
      payload: { id: '1', total: 200 },
      updated_at: '2026-06-01T12:00:00.000Z',
      revision: 3
    }]
    const r = mergeCollection(local, remote)
    expect(r.conflicts.length).toBe(1)
    expect(r.applied).toBe(0)
    expect(r.items[0].total).toBe(100)
  })
})

describe('conflict-store', () => {
  it('upserts and removes conflicts', () => {
    let info = {}
    info = { syncConflicts: upsertConflict(info, { entityType: 'contracts', localId: '1', local: { a: 1 }, remote: { a: 2 } }) }
    expect(conflictCount(info)).toBe(1)
    info = { syncConflicts: removeConflict(info, 'contracts', '1') }
    expect(conflictCount(info)).toBe(0)
  })

  it('resolveConflict picks side', () => {
    const entry = {
      localId: '1',
      local: { total: 100 },
      remote: { total: 200 },
      remoteUpdatedAt: '2026-06-01T00:00:00.000Z',
      remoteRevision: 2
    }
    expect(resolveConflict(entry, 'remote').total).toBe(200)
    expect(resolveConflict(entry, 'local').total).toBe(100)
  })
})
