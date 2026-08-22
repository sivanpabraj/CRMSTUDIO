import { describe, expect, it } from 'vitest'
import { irrToToman, mapFinanceSeries, mapTypedWorkOrder } from '../js/erp-runtime.js'

describe('typed ERP runtime projection', () => {
  it('maps typed work orders into UI-safe field names', () => {
    expect(mapTypedWorkOrder({
      id: 'w1', contract_id: 'c1', title: 'ادیت کلیپ', status: 'editing', version: 3
    })).toMatchObject({ id: 'w1', contractId: 'c1', title: 'ادیت کلیپ', status: 'editing', version: 3 })
  })

  it('converts authoritative IRR reports to dashboard toman', () => {
    expect(irrToToman(12_345)).toBe(1_235)
    const rows = mapFinanceSeries([{
      month_start: '2026-08-01', actual_income_irr: 20_000,
      actual_expense_irr: 5_000, actual_profit_irr: 15_000,
      weighted_forecast_irr: 30_000
    }])
    expect(rows[0]).toMatchObject({ actual: 2000, expense: 500, net: 1500, expected: 3000 })
  })

  it('sorts and limits reports to the latest six months', () => {
    const input = Array.from({ length: 8 }, (_, index) => ({
      month_start: `2026-${String(index + 1).padStart(2, '0')}-01`,
      actual_income_irr: (index + 1) * 10
    })).reverse()
    const rows = mapFinanceSeries(input)
    expect(rows).toHaveLength(6)
    expect(rows[0].monthStart).toBe('2026-03-01')
    expect(rows[5].monthStart).toBe('2026-08-01')
  })
})
