/**
 * Read-only runtime projection for the authoritative typed ERP tables.
 *
 * The legacy IndexedDB collections remain available as an offline fallback, but
 * financial reporting and production summaries prefer this cache when a cloud
 * session is active. No typed ERP row is copied into the legacy database.
 */

const EMPTY_STATE = Object.freeze({
  status: 'idle',
  source: 'local',
  studioId: '',
  workOrders: [],
  assignments: [],
  productionEvents: [],
  paymentSchedules: [],
  financeSeries: [],
  error: '',
  updatedAt: ''
})

const toNumber = value => {
  const number = Number(value)
  return Number.isFinite(number) ? number : 0
}

export function irrToToman(value) {
  return Math.round(toNumber(value) / 10)
}

export function mapTypedWorkOrder(row = {}) {
  return {
    id: String(row.id || ''),
    contractId: String(row.contract_id || ''),
    title: String(row.title || ''),
    status: String(row.status || 'planned'),
    stage: String(row.status || 'planned'),
    dueAt: row.due_at || '',
    version: toNumber(row.version),
    updatedAt: row.updated_at || ''
  }
}

export function mapFinanceSeries(rows = []) {
  return [...rows]
    .filter(row => row?.month_start)
    .sort((a, b) => String(a.month_start).localeCompare(String(b.month_start)))
    .slice(-6)
    .map(row => ({
      monthStart: String(row.month_start),
      label: new Intl.DateTimeFormat('fa-IR', { month: 'short' }).format(new Date(`${row.month_start}T00:00:00Z`)),
      actual: irrToToman(row.actual_income_irr),
      expense: irrToToman(row.actual_expense_irr),
      net: irrToToman(row.actual_profit_irr),
      expected: irrToToman(row.weighted_forecast_irr)
    }))
}

const ErpRuntime = {
  _state: { ...EMPTY_STATE },
  _loading: null,
  _channel: null,
  _refreshTimer: null,
  _lifecycleBound: false,

  state() {
    return {
      ...this._state,
      workOrders: [...this._state.workOrders],
      assignments: [...this._state.assignments],
      productionEvents: [...this._state.productionEvents],
      paymentSchedules: [...this._state.paymentSchedules],
      financeSeries: [...this._state.financeSeries]
    }
  },

  hasTypedData() {
    return this._state.source === 'typed-erp' && this._state.status === 'ready'
  },

  latestFinanceMonth() {
    return this._state.financeSeries.at(-1) || null
  },

  _publish(patch) {
    this._state = { ...this._state, ...patch }
    window.dispatchEvent(new CustomEvent('sm-erp-runtime', { detail: this.state() }))
  },

  async _studioId() {
    let studioId = window.Cloud?.studioCloudConfig?.().studioId
    if (!studioId) studioId = await window.Cloud?._loadMemberStudioId?.()
    return String(studioId || '')
  },

  ensureLoaded() {
    if (this._state.status === 'ready' || this._state.status === 'disabled') return Promise.resolve(this.state())
    return this.refresh()
  },

  async refresh({ force = false } = {}) {
    if (this._loading && !force) return this._loading
    this._loading = this._refresh().finally(() => { this._loading = null })
    return this._loading
  },

  async _refresh() {
    if (!window.Cloud?.isEnabled?.()) {
      this._publish({ ...EMPTY_STATE, status: 'disabled' })
      return this.state()
    }
    if (navigator.onLine === false) {
      this._publish({ status: 'offline', error: '' })
      return this.state()
    }

    this._publish({ status: 'loading', error: '' })
    try {
      const [client, session, studioId] = await Promise.all([
        window.Cloud.client(),
        window.Cloud.session(),
        this._studioId()
      ])
      if (!client || !session || !studioId) throw new Error('نشست ابری ERP در دسترس نیست')

      const scoped = (table, columns) => client.from(table).select(columns).eq('studio_id', studioId)
      const [workOrders, assignments, productionEvents, paymentSchedules, finance] = await Promise.all([
        scoped('erp_work_orders', 'id,contract_id,title,status,due_at,version,updated_at'),
        scoped('erp_work_order_assignments', 'id,work_order_id,user_id,assignment_role,valid_from,valid_until'),
        scoped('erp_production_events', 'id,work_order_id,stage,state,note,actor_id,created_at').order('created_at', { ascending: false }).limit(500),
        scoped('erp_payment_schedules', 'id,contract_id,due_date,amount_irr,probability_percent,status,updated_at'),
        scoped('erp_finance_actual_vs_forecast', 'month_start,actual_income_irr,actual_expense_irr,actual_net_cashflow_irr,gross_forecast_irr,weighted_forecast_irr,actual_profit_irr,income_vs_forecast_variance_irr').order('month_start', { ascending: true }).limit(24)
      ])

      const failed = [workOrders, assignments, productionEvents, paymentSchedules, finance].find(result => result.error)
      if (failed?.error) throw failed.error
      this._publish({
        status: 'ready',
        source: 'typed-erp',
        studioId,
        workOrders: (workOrders.data || []).map(mapTypedWorkOrder),
        assignments: assignments.data || [],
        productionEvents: productionEvents.data || [],
        paymentSchedules: paymentSchedules.data || [],
        financeSeries: mapFinanceSeries(finance.data || []),
        error: '',
        updatedAt: new Date().toISOString()
      })
      await this._subscribe(client, studioId)
    } catch (error) {
      this._publish({ status: 'error', error: error?.message || 'دریافت داده ERP ناموفق بود' })
    }
    return this.state()
  },

  _scheduleRefresh() {
    clearTimeout(this._refreshTimer)
    this._refreshTimer = setTimeout(() => this.refresh({ force: true }), 350)
  },

  async _subscribe(client, studioId) {
    if (this._channel || !client?.channel) return
    const channel = client.channel(`sm-typed-erp:${studioId}`)
    for (const table of ['erp_work_orders', 'erp_work_order_assignments', 'erp_production_events', 'erp_payment_schedules']) {
      channel.on('postgres_changes', {
        event: '*', schema: 'public', table, filter: `studio_id=eq.${studioId}`
      }, () => this._scheduleRefresh())
    }
    this._channel = channel.subscribe()
  },

  install() {
    if (this._lifecycleBound) return
    this._lifecycleBound = true
    window.addEventListener('online', () => this.refresh({ force: true }))
    window.addEventListener('offline', () => this._publish({ status: 'offline', error: '' }))
    window.addEventListener('sm-auth-changed', () => this.refresh({ force: true }))
  }
}

if (typeof window !== 'undefined') {
  window.ErpRuntime = ErpRuntime
  ErpRuntime.install()
}

export default ErpRuntime
