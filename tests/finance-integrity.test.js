import { describe, it, expect } from 'vitest'
import { bankDelta, previewPassCheque, normalizeBank } from '../js/lib/finance-ledger.js'
import { activeRows, stripSensitive, isTombstoneEntity } from '../js/sync/entities.js'
import { mergeCollection } from '../js/sync/conflict.js'

describe('bank queue semantics (pure)', () => {
  it('serial balance math stays consistent', () => {
    let bal = 1000
    bal = bankDelta(bal, 'deposit', 200)
    bal = bankDelta(bal, 'withdrawal', 50)
    bal = bankDelta(bal, 'withdrawal', 100)
    expect(bal).toBe(1050)
  })
})

describe('tombstone sync', () => {
  it('keeps _deleted in sync payload', () => {
    const row = stripSensitive('transactions', { id: 't1', amount: 10, _deleted: true })
    expect(row._deleted).toBe(true)
  })

  it('marks finance collections as tombstone entities', () => {
    expect(isTombstoneEntity('transactions')).toBe(true)
    expect(isTombstoneEntity('salaryPayments')).toBe(true)
    expect(isTombstoneEntity('users')).toBe(false)
  })

  it('activeRows filters soft-deleted', () => {
    expect(activeRows([{ id: 1 }, { id: 2, _deleted: true }])).toHaveLength(1)
  })

  it('mergeCollection applies remote tombstone', () => {
    const local = [{ id: 'a', amount: 5, updatedAtIso: '2020-01-01T00:00:00.000Z' }]
    const remote = [{
      local_id: 'a',
      updated_at: '2026-01-01T00:00:00.000Z',
      revision: 2,
      payload: { id: 'a', amount: 5, _deleted: true, deletedAtIso: '2026-01-01T00:00:00.000Z' }
    }]
    const merged = mergeCollection(local, remote)
    expect(merged.applied).toBe(1)
    expect(merged.items[0]._deleted).toBe(true)
  })
})

describe('cheque pass preview with Pro schema', () => {
  it('accepts type/number fields', () => {
    const r = previewPassCheque(
      { type: 'incoming', number: '88', amount: 400, status: 'pending' },
      normalizeBank({ balance: 100 })
    )
    expect(r.ok).toBe(true)
    expect(r.newBalance).toBe(500)
  })
})
