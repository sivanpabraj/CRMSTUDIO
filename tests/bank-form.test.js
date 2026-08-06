import { describe, it, expect } from 'vitest'
import { bankSavePlan, bankMetadataPatch } from '../js/lib/bank-form.js'

describe('bankSavePlan', () => {
  it('update path never includes balance', () => {
    const plan = bankSavePlan(
      { id: 'b1', balance: 999 },
      { name: 'Main', bank: 'Melli', balance: '12345', account: '111', iban: 'IR1' }
    )
    expect(plan.mode).toBe('update')
    expect(plan.id).toBe('b1')
    expect(plan.patch.balance).toBeUndefined()
    expect(plan.patch.name).toBe('Main')
    expect(plan.patch.accountNumber).toBe('111')
  })

  it('insert path sets opening balance only', () => {
    const plan = bankSavePlan(null, { name: 'Cash', bank: 'X', balance: '500' })
    expect(plan.mode).toBe('insert')
    expect(plan.row.balance).toBe(500)
    expect(plan.row.name).toBe('Cash')
  })

  it('metadata patch normalizes account/iban aliases', () => {
    const p = bankMetadataPatch({ title: 'A', accountNumber: '9', shaba: 'IR9' })
    expect(p).toMatchObject({ name: 'A', account: '9', accountNumber: '9', iban: 'IR9', shaba: 'IR9' })
  })
})
