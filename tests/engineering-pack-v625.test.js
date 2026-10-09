import { describe, it, expect, beforeEach, vi } from 'vitest'
import StudioFinance from '../js/studio-core-finance.js'
import EngContractAfish from '../js/eng-contract-afish.js'

describe('Engineering Pack v6.2.5 — StudioFinance', () => {
  it('parses amounts correctly with English and Persian digits and symbols', () => {
    expect(StudioFinance.parseAmount(15000000)).toBe(15000000)
    expect(StudioFinance.parseAmount('۱۵,۰۰۰,۰۰۰')).toBe(15000000)
    expect(StudioFinance.parseAmount('25,500,000 تومان')).toBe(25500000)
    expect(StudioFinance.parseAmount(null)).toBe(0)
    expect(StudioFinance.parseAmount('invalid')).toBe(0)
  })

  it('calculates contract financials accurately with debt and remaining aliases', () => {
    const contract = {
      total: 30000000,
      deposit: 10000000
    }
    const res = StudioFinance.forContract(contract)
    expect(res.total).toBe(30000000)
    expect(res.paid).toBe(10000000)
    expect(res.debt).toBe(20000000)
    expect(res.remaining).toBe(20000000)
    expect(res.isSettled).toBe(false)
    expect(res.pctPaid).toBe(33)
  })

  it('handles settlement and discounts properly', () => {
    const contract = {
      total: 20000000,
      discount: 2000000,
      paid: 18000000
    }
    const res = StudioFinance.forContract(contract)
    expect(res.total).toBe(18000000)
    expect(res.debt).toBe(0)
    expect(res.remaining).toBe(0)
    expect(res.isSettled).toBe(true)
    expect(res.pctPaid).toBe(100)
  })

  it('formats amounts in Toman and Rial in Persian numbers', () => {
    const toman = StudioFinance.formatToman(1000000)
    expect(toman).toContain('تومان')
    const rial = StudioFinance.formatRial(1000000)
    expect(rial).toContain('ریال')
  })
})

describe('Engineering Pack v6.2.5 — EngContractAfish', () => {
  beforeEach(() => {
    const dbData = {
      personnel: [
        { id: 'p1', name: 'رضا عکاس', phone: '09181112233', role: 'photographer' },
        { id: 'p2', name: 'سارا تدوین', phone: '09182223344', role: 'editor_clip' }
      ],
      persProjects: []
    }
    globalThis.DB = {
      get: (coll) => dbData[coll] || [],
      set: (coll, val) => { dbData[coll] = val },
      flush: vi.fn()
    }
  })

  it('ensures persProjects assignments are created from contract team array', () => {
    const contract = {
      id: 'c-101',
      couple: 'علی و مریم',
      date: '1405/08/15',
      team: [
        { personnelId: 'p1', roleId: 'photographer', name: 'رضا عکاس' }
      ]
    }

    const created = EngContractAfish.ensureAfishFromContract(contract)
    expect(created.length).toBe(1)
    expect(created[0].personnelName).toBe('رضا عکاس')
    expect(created[0].contractId).toBe('c-101')
    expect(created[0].status).toBe('invited')

    // Second call should not duplicate
    const createdSecond = EngContractAfish.ensureAfishFromContract(contract)
    expect(createdSecond.length).toBe(0)
  })
})
