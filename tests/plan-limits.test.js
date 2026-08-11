import { describe, it, expect } from 'vitest'
import {
  assertMoneyOpAllowed,
  assertBankCreateAllowed,
  resolvePlanTier,
  planLimitsFor
} from '../js/lib/plan-limits.js'

describe('PlanLimits', () => {
  it('resolves trial by default', () => {
    expect(resolvePlanTier({})).toBe('trial')
    expect(planLimitsFor({}).maxBanks).toBe(3)
  })

  it('blocks money ops over monthly quota', () => {
    const txs = Array.from({ length: 100 }, (_, i) => ({
      id: `t${i}`,
      periodMonth: '1404/04',
      date: '1404/04/01',
      amount: 1
    }))
    const res = assertMoneyOpAllowed({ planTier: 'trial' }, txs, '1404/04/15')
    expect(res.ok).toBe(false)
    expect(res.code).toBe('plan_quota')
  })

  it('allows money ops under quota', () => {
    const res = assertMoneyOpAllowed({ planTier: 'pro' }, [], '1404/04/15')
    expect(res.ok).toBe(true)
  })

  it('blocks excess banks on trial', () => {
    const banks = [{ id: '1' }, { id: '2' }, { id: '3' }]
    expect(assertBankCreateAllowed({ licenseTier: 'trial' }, banks).ok).toBe(false)
  })
})
