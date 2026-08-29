import { describe, expect, it } from 'vitest'
import {
  nextSequenceCursor,
  normalizeDelta,
  reconcilePush,
  toAuthoritativeCommand,
} from '../js/sync/protocol.js'
import { mergeCollection } from '../js/sync/conflict.js'

describe('authoritative sync protocol', () => {
  it('sends optimistic revision and a stable idempotency key, never client ordering time', () => {
    const item = { id: 'b1', title: 'new', _serverRevision: 4, _syncMutationId: 'mutation-0001', updatedAtIso: '2099-01-01T00:00:00Z' }
    const command = toAuthoritativeCommand('bookings', item)
    expect(command).toMatchObject({ local_id: 'b1', expected_revision: 4, idempotency_key: 'mutation-0001', op: 'upsert' })
    expect(command).not.toHaveProperty('updated_at')
    expect(command.payload).not.toHaveProperty('_serverRevision')
  })

  it('represents delete as a durable tombstone command', () => {
    const command = toAuthoritativeCommand('bookings', { id: 'b1', _deleted: true, _serverRevision: 2, _syncMutationId: 'delete-00001' })
    expect(command).toEqual({ local_id: 'b1', idempotency_key: 'delete-00001', op: 'delete', expected_revision: 2 })
  })

  it('does not clear a newer local mutation after an older request completes', () => {
    const current = [{ id: 'b1', title: 'newer', _syncMutationId: 'mutation-0002', _serverRevision: 1 }]
    const submitted = [{ local_id: 'b1', idempotency_key: 'mutation-0001' }]
    const result = [{ local_id: 'b1', revision: 2, updated_seq: 8 }]
    expect(reconcilePush(current, submitted, result)).toEqual(current)
  })

  it('advances keyset cursor by server sequence and id', () => {
    const rows = [{ id: 'a', updated_seq: 10 }, { id: 'b', updated_seq: 11 }]
    expect(nextSequenceCursor(rows)).toEqual({ seq: 11, id: 'b' })
  })

  it('server revision wins even when the client clock is in the future', () => {
    const local = [{ id: 'b1', title: 'old', updatedAtIso: '2099-01-01T00:00:00Z', _serverRevision: 1 }]
    const row = normalizeDelta({ id: 'remote-row', local_id: 'b1', payload: { id: 'b1', title: 'server' }, revision: 2, updated_seq: 9, updated_at: '2026-01-01T00:00:00Z' })
    expect(mergeCollection(local, [row]).items[0]).toMatchObject({ title: 'server', _serverRevision: 2, _serverSeq: 9 })
  })
})
