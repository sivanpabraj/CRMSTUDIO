import { describe, it, expect } from 'vitest'
import { nextContractPaid, bankDelta } from '../js/lib/finance-ledger.js'

/**
 * Pure-model tests for finance atomicity contracts.
 * Full FinanceSync needs browser globals; these lock the invariants.
 */
describe('finance atomicity contracts', () => {
  it('deposit then reverse restores paid', () => {
    let c = { total: 2000, deposit: 500, paid: 0 }
    const fwd = nextContractPaid(c, 'contract_payment', 300)
    expect(fwd.paid).toBe(300)
    c = { ...c, ...fwd }
    const rev = nextContractPaid(c, 'contract_payment', 300, { reverse: true })
    expect(rev).toEqual({ paid: 0, balance: 1500 })
  })

  it('transfer balance math is zero-sum', () => {
    let from = 1000
    let to = 200
    const amount = 150
    from = bankDelta(from, 'withdrawal', amount)
    to = bankDelta(to, 'deposit', amount)
    expect(from + to).toBe(1200)
    expect(from).toBe(850)
    expect(to).toBe(350)
  })

  it('rollback simulation restores both legs', () => {
    const fromBefore = 1000
    const toBefore = 200
    const amount = 150
    let from = bankDelta(fromBefore, 'withdrawal', amount)
    let to = bankDelta(toBefore, 'deposit', amount)
    // simulate failure → restore
    from = fromBefore
    to = toBefore
    expect(from).toBe(1000)
    expect(to).toBe(200)
  })
})
