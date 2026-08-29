import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import vm from 'node:vm'

const source = fs.readFileSync('studio-m/js/dashboard.js', 'utf8')

function dashboardWith(data = {}, roles = ['studio_manager']) {
  const collections = {
    contracts: [], transactions: [], personnel: [], bookings: [], cheques: [],
    persProjects: [], expenses: [], customerRequests: [], banks: [], workflows: [],
    appointments: [], ...data
  }
  const context = {
    localStorage: { getItem: () => null, setItem: () => {} },
    DB: { get: name => collections[name] || [], set: () => {}, find: () => null, filter: () => [] },
    Utils: {
      parseJalaliToday: () => ({ jy: 1405, jm: 5 }),
      jalaliMonthName: month => `ماه ${month}`,
      daysUntil: date => date === '1405/04/01' ? -30 : 5,
      todayJalali: () => '1405/05/25'
    },
    SM: {
      fmt: String, esc: String, studio: () => ({}), user: () => ({ roles }),
      navigate: () => {}, isModuleDisabled: () => false,
      can: permission => permission === 'manage_finance' && roles.some(role => ['system_admin', 'studio_manager', 'accountant'].includes(role))
    },
    Access: { isSystemAdmin: () => false, isStudioManager: user => user.roles.includes('studio_manager') },
    SMUI: { badge: text => text, empty: () => '', moduleSearch: () => '' },
    window: {}
  }
  vm.runInNewContext(source, context)
  return context.window.SMDashboard
}

describe('STE100 executive dashboard', () => {
  it('calculates current and previous Jalali month totals without mixing years', () => {
    const dashboard = dashboardWith()
    const ctx = {
      tx: [
        { type: 'deposit', date: '1405/05/02', amount: 500 },
        { type: 'deposit', date: '1404/05/02', amount: 900 },
        { type: 'deposit', date: '1405/04/20', amount: 400 },
        { type: 'withdrawal', date: '1405/05/03', amount: 100 }
      ],
      contracts: [{ total: 1000, deposit: 300, paid: 200, eventDate: '1405/04/01' }]
    }
    const model = dashboard._financialModel(ctx)
    expect(model.monthIncome).toBe(500)
    expect(model.previousIncome).toBe(400)
    expect(model.monthExpense).toBe(100)
    expect(model.net).toBe(400)
    expect(model.overdue).toHaveLength(1)
    expect(model.health).toBeGreaterThanOrEqual(0)
    expect(model.health).toBeLessThanOrEqual(100)
  })

  it('keeps forecast explainable as actual collection plus contract remainder', () => {
    const dashboard = dashboardWith()
    const ctx = {
      tx: [{ type: 'deposit', date: '1405/05/02', amount: 200 }],
      contracts: [{ total: 1000, deposit: 200, paid: 100, eventDate: '1405/05/10' }]
    }
    const current = dashboard._forecastSeries(ctx).at(-1)
    expect(current.actual).toBe(200)
    expect(current.expected).toBe(900)
  })

  it('deduplicates expense records and reports an explicit other category', () => {
    const dashboard = dashboardWith()
    const record = { id: 'e1', date: '1405/05/02', title: 'چاپ آلبوم', amount: 300 }
    const result = dashboard._expenseCategories({ expenses: [record], monthWithdrawals: [record] })
    expect(result.total).toBe(300)
    expect(result.items.find(item => item.id === 'print').value).toBe(300)
    expect(result.items.some(item => item.id === 'other')).toBe(true)
  })

  it('aligns financial dashboard with the finance permission', () => {
    expect(dashboardWith({}, ['studio_manager'])._canViewFinance()).toBe(true)
    expect(dashboardWith({}, ['accountant'])._canViewFinance()).toBe(true)
    expect(dashboardWith({}, ['office_secretary'])._canViewFinance()).toBe(false)
    expect(dashboardWith({}, ['editor_clip'])._canViewFinance()).toBe(false)
  })
})
