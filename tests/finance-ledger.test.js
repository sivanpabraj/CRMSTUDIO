import { describe, it, expect } from 'vitest'
import {
  chequeType,
  chequeNumber,
  chequeParty,
  normalizeCheque,
  normalizeBank,
  bankDelta,
  nextContractPaid,
  previewPassCheque
} from '../js/lib/finance-ledger.js'

describe('cheque schema normalize', () => {
  it('reads Pro fields (type/number/client)', () => {
    const c = normalizeCheque({ type: 'outgoing', number: '123', client: 'علی', amount: 10, status: 'pending' })
    expect(chequeType(c)).toBe('outgoing')
    expect(chequeNumber(c)).toBe('123')
    expect(chequeParty(c)).toBe('علی')
    expect(c.direction).toBe('outgoing')
    expect(c.chequeNumber).toBe('123')
    expect(c.party).toBe('علی')
  })

  it('reads legacy fields (direction/chequeNumber/party)', () => {
    const c = normalizeCheque({ direction: 'incoming', chequeNumber: '99', party: 'مریم', amount: 5 })
    expect(chequeType(c)).toBe('incoming')
    expect(chequeNumber(c)).toBe('99')
    expect(chequeParty(c)).toBe('مریم')
    expect(c.type).toBe('incoming')
    expect(c.number).toBe('99')
    expect(c.client).toBe('مریم')
  })
})

describe('bank schema normalize', () => {
  it('maps accountNumber/shaba to account/iban', () => {
    const b = normalizeBank({ name: 'صندوق', accountNumber: '111', shaba: 'IR22', balance: '500' })
    expect(b.account).toBe('111')
    expect(b.iban).toBe('IR22')
    expect(b.accountNumber).toBe('111')
    expect(b.shaba).toBe('IR22')
    expect(b.balance).toBe(500)
  })
})

describe('bankDelta', () => {
  it('adds on deposit and subtracts on withdrawal', () => {
    expect(bankDelta(1000, 'deposit', 200)).toBe(1200)
    expect(bankDelta(1000, 'withdrawal', 200)).toBe(800)
  })
})

describe('nextContractPaid', () => {
  it('updates paid/balance for installments only', () => {
    const next = nextContractPaid({ total: 1000, deposit: 200, paid: 100 }, 'contract_payment', 150)
    expect(next).toEqual({ paid: 250, balance: 550 })
  })

  it('ignores initial deposit category', () => {
    expect(nextContractPaid({ total: 1000, deposit: 200, paid: 0 }, 'contract_deposit', 200)).toBeNull()
  })

  it('reverses installment without going negative', () => {
    const next = nextContractPaid({ total: 1000, deposit: 0, paid: 50 }, 'contract_payment', 80, { reverse: true })
    expect(next).toEqual({ paid: 0, balance: 1000 })
  })
})

describe('previewPassCheque', () => {
  it('passes incoming cheque and increases balance', () => {
    const r = previewPassCheque(
      { type: 'incoming', number: '1', amount: 300, status: 'pending', bankId: 'b1' },
      { id: 'b1', balance: 1000 }
    )
    expect(r.ok).toBe(true)
    expect(r.txType).toBe('deposit')
    expect(r.newBalance).toBe(1300)
  })

  it('rejects outgoing without enough balance', () => {
    const r = previewPassCheque(
      { direction: 'outgoing', chequeNumber: '2', amount: 900, status: 'pending' },
      { balance: 100 }
    )
    expect(r.ok).toBe(false)
  })

  it('rejects already passed', () => {
    const r = previewPassCheque({ type: 'incoming', amount: 10, status: 'passed' }, { balance: 10 })
    expect(r.ok).toBe(false)
  })
})
