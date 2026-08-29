import { afterEach, describe, expect, it, vi } from 'vitest'
import ErpRuntime, { irrToToman, mapContract, mapFinanceSeries, mapFinanceTransaction, mapTypedWorkOrder } from '../js/erp-runtime.js'

const ORIGINAL_REFRESH = ErpRuntime.refresh
const ORIGINAL_PRIVATE_REFRESH = ErpRuntime._refresh

describe('typed ERP runtime projection', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    ErpRuntime._channel = null
    ErpRuntime._loading = null
    ErpRuntime._lifecycleBound = false
    ErpRuntime.refresh = ORIGINAL_REFRESH
    ErpRuntime._refresh = ORIGINAL_PRIVATE_REFRESH
  })
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

  it('maps authoritative contracts and journal transactions', () => {
    expect(mapContract({ id: 'c', contract_num: '1', groom: 'A', payload: { paid: 2 }, total: '10' }))
      .toMatchObject({ id: 'c', contractNum: '1', groom: 'A', paid: 2, total: 10 })
    expect(mapFinanceTransaction({ id: 't', logical_id: 'l', revision: 2, operation: 'record_withdrawal', amount_irr: 120 }))
      .toMatchObject({ id: 't', logicalId: 'l', revision: 2, type: 'withdrawal', amount: 12 })
    expect(mapContract({})).toMatchObject({ id: '', status: 'active', total: 0 })
    expect(mapFinanceTransaction({})).toMatchObject({ id: '', type: '', amount: 0 })
    expect(mapTypedWorkOrder({})).toMatchObject({ id: '', status: 'planned', version: 0 })
    expect(mapFinanceSeries([{ nope: true }])).toEqual([])
    expect(irrToToman('bad')).toBe(0)
  })

  it('returns defensive state copies and detects readiness', () => {
    ErpRuntime._state = { ...ErpRuntime._state, source: 'typed-erp', status: 'ready', workOrders: [{ id: 'x' }] }
    const state = ErpRuntime.state()
    state.workOrders.push({ id: 'y' })
    expect(ErpRuntime.state().workOrders).toHaveLength(1)
    expect(ErpRuntime.hasTypedData()).toBe(true)
  })

  it('fails closed when cloud is disabled or browser is offline', async () => {
    vi.stubGlobal('window', { Cloud: { isEnabled: () => false }, dispatchEvent: vi.fn() })
    vi.stubGlobal('navigator', { onLine: true })
    vi.stubGlobal('CustomEvent', class { constructor(type, init) { this.type = type; this.detail = init.detail } })
    expect((await ErpRuntime._refresh()).status).toBe('disabled')
    window.Cloud.isEnabled = () => true
    navigator.onLine = false
    expect((await ErpRuntime._refresh()).status).toBe('offline')
  })

  it('loads every authoritative projection and subscribes to realtime', async () => {
    const rows = {
      erp_work_orders: [{ id: 'w', contract_id: 'c', title: 'Edit', status: 'editing', version: 1 }],
      erp_work_order_assignments: [{ id: 'a' }], erp_production_events: [{ id: 1 }],
      erp_payment_schedules: [{ id: 'p' }],
      erp_finance_actual_vs_forecast: [{ month_start: '2026-08-01', actual_income_irr: 10 }],
      contracts: [{ id: 'c', payload: {}, total: 1 }],
      finance_transactions: [{ id: 't', logical_id: 'l', amount_irr: 10, operation: 'record_deposit' }],
      finance_account_balances: [{ account_ref: 'asset:bank:b', balance_irr: 10 }],
      erp_bank_account_balances: [{ id: 'b', title: 'Main', balance_irr: 10, version: 1 }],
      erp_payroll_payments: [{ id: 'pay', personnel_user_id: 'u', period_month: '2026-08-01', net_irr: 10 }],
      erp_cheques: [{ id: 'ch', cheque_number: '1', direction: 'incoming', amount_irr: 10, status: 'cleared' }],
      erp_personnel_contracts: [{ id: 'pc' }], studio_ledger_heads: { version: 9 }
    }
    const from = vi.fn(table => {
      const result = { data: Array.isArray(rows[table]) ? rows[table] : [], error: null }
      const query = {
        select: vi.fn(() => query), eq: vi.fn(() => query), order: vi.fn(() => query),
        limit: vi.fn(() => query), maybeSingle: vi.fn(async () => ({ data: rows[table], error: null })),
        then: (resolve) => Promise.resolve(result).then(resolve)
      }
      return query
    })
    const channel = { on: vi.fn(() => channel), subscribe: vi.fn(() => ({ topic: 'x' })) }
    const client = { from, channel: vi.fn(() => channel) }
    vi.stubGlobal('window', {
      Cloud: {
        isEnabled: () => true, client: async () => client,
        session: async () => ({ access_token: 'x' }),
        studioCloudConfig: () => ({ studioId: 's' })
      }, dispatchEvent: vi.fn(), addEventListener: vi.fn()
    })
    vi.stubGlobal('navigator', { onLine: true })
    vi.stubGlobal('CustomEvent', class { constructor(type, init) { this.type = type; this.detail = init.detail } })
    const state = await ErpRuntime._refresh()
    expect(state).toMatchObject({ status: 'ready', source: 'typed-erp', ledgerVersion: 9 })
    expect(state.bankAccounts[0]).toMatchObject({ id: 'b', balance: 1 })
    expect(state.payrollPayments[0]).toMatchObject({ amount: 1, month: '2026-08' })
    expect(state.cheques[0]).toMatchObject({ status: 'passed', amount: 1 })
    expect(channel.on).toHaveBeenCalled()
    expect(ErpRuntime.latestFinanceMonth()).toBeTruthy()
  })

  it('publishes query errors and debounces realtime refresh', async () => {
    const bad = { select: () => bad, eq: () => bad, order: () => bad, limit: () => bad,
      maybeSingle: async () => ({ data: null, error: new Error('query failed') }),
      then: resolve => Promise.resolve({ data: [], error: new Error('query failed') }).then(resolve) }
    vi.stubGlobal('window', { Cloud: {
      isEnabled: () => true, client: async () => ({ from: () => bad }), session: async () => ({}),
      studioCloudConfig: () => ({ studioId: 's' })
    }, dispatchEvent: vi.fn(), addEventListener: vi.fn() })
    vi.stubGlobal('navigator', { onLine: true })
    vi.stubGlobal('CustomEvent', class {})
    expect((await ErpRuntime._refresh()).status).toBe('error')
    vi.useFakeTimers()
    ErpRuntime.refresh = vi.fn()
    ErpRuntime._scheduleRefresh(); ErpRuntime._scheduleRefresh()
    await vi.advanceTimersByTimeAsync(351)
    expect(ErpRuntime.refresh).toHaveBeenCalledTimes(1)
  })

  it('covers lifecycle, loading reuse, studio fallback and subscription guards', async () => {
    const listeners = {}
    vi.stubGlobal('window', {
      Cloud: { studioCloudConfig: () => ({ studioId: '' }), _loadMemberStudioId: async () => 'fallback' },
      addEventListener: vi.fn((name, fn) => { listeners[name] = fn }),
      dispatchEvent: vi.fn()
    })
    vi.stubGlobal('CustomEvent', class { constructor(_type, init) { this.detail = init.detail } })
    expect(await ErpRuntime._studioId()).toBe('fallback')
    ErpRuntime._state = { ...ErpRuntime._state, status: 'ready' }
    expect((await ErpRuntime.ensureLoaded()).status).toBe('ready')
    ErpRuntime._state = { ...ErpRuntime._state, status: 'idle' }
    ErpRuntime.refresh = vi.fn().mockResolvedValue({ status: 'ready' })
    await ErpRuntime.ensureLoaded()
    ErpRuntime.install(); ErpRuntime.install()
    expect(window.addEventListener).toHaveBeenCalledTimes(3)
    listeners.online(); listeners.offline(); listeners['sm-auth-changed']()
    expect(ErpRuntime.refresh).toHaveBeenCalled()
    ErpRuntime._channel = { existing: true }
    await ErpRuntime._subscribe({ channel: vi.fn() }, 's')
    ErpRuntime._channel = null
    await ErpRuntime._subscribe({}, 's')
    const pending = Promise.resolve({ x: 1 })
    ErpRuntime._loading = pending
    ErpRuntime.refresh = ORIGINAL_REFRESH
    expect(await ErpRuntime.refresh()).toEqual({ x: 1 })
    ErpRuntime._loading = pending
    ErpRuntime._refresh = vi.fn().mockResolvedValue({ forced: true })
    expect(await ErpRuntime.refresh({ force: true })).toEqual({ forced: true })
  })

  it('rejects incomplete cloud sessions and preserves a safe generic error', async () => {
    vi.stubGlobal('window', { Cloud: {
      isEnabled: () => true, client: async () => null, session: async () => null,
      studioCloudConfig: () => ({ studioId: '' }), _loadMemberStudioId: async () => ''
    }, dispatchEvent: vi.fn() })
    vi.stubGlobal('navigator', { onLine: true })
    vi.stubGlobal('CustomEvent', class {})
    expect((await ErpRuntime._refresh()).error).toContain('نشست ابری')
    window.Cloud.client = async () => { throw 'opaque' }
    expect((await ErpRuntime._refresh()).error).toBe('دریافت داده ERP ناموفق بود')
  })
})
