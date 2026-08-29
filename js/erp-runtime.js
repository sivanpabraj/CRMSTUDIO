/**
 * Read-only runtime projection for the authoritative typed ERP tables.
 *
 * Server-authoritative aggregates never fall back to IndexedDB in production.
 * No typed ERP row is copied into the legacy database.
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
  contracts: [],
  financeTransactions: [],
  bankBalances: [],
  bankAccounts: [],
  payrollPayments: [],
  cheques: [],
  personnelContracts: [],
  attendanceEntries: [],
  ledgerVersion: 0,
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

export function mapContract(row = {}) {
  return {
    ...(row.payload || {}),
    id: String(row.id || ''),
    contractNum: String(row.contract_num || ''),
    groom: String(row.groom || ''),
    bride: String(row.bride || ''),
    groomPhone: String(row.groom_phone || ''),
    bridePhone: String(row.bride_phone || ''),
    eventDate: String(row.event_date || ''),
    eventStartsAt: row.event_starts_at || '',
    eventEndsAt: row.event_ends_at || '',
    total: toNumber(row.total),
    status: String(row.status || 'active'),
    lifecycleVersion: toNumber(row.lifecycle_version),
    updatedAt: row.updated_at || ''
  }
}

export function mapFinanceTransaction(row = {}) {
  const payload = row.payload || {}
  const operationType = row.operation === 'record_withdrawal' ? 'withdrawal'
    : row.operation === 'record_deposit' ? 'deposit'
      : row.operation === 'update_transaction' ? String(payload.type || '')
        : row.operation === 'transfer_banks' ? 'transfer' : ''
  return {
    ...payload,
    id: String(row.id || ''),
    logicalId: String(row.logical_id || ''),
    revision: toNumber(row.revision),
    amountIrr: toNumber(row.amount_irr),
    amount: irrToToman(row.amount_irr),
    type: operationType,
    bankId: String(row.bank_id || ''),
    toBankId: String(row.to_bank_id || ''),
    state: String(row.state || ''),
    createdAt: row.created_at || ''
  }
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
      , contracts: [...this._state.contracts]
      , financeTransactions: [...this._state.financeTransactions]
      , bankBalances: [...this._state.bankBalances]
      , bankAccounts: [...this._state.bankAccounts]
      , payrollPayments: [...this._state.payrollPayments]
      , cheques: [...this._state.cheques]
      , personnelContracts: [...this._state.personnelContracts]
      , attendanceEntries: [...this._state.attendanceEntries]
    }
  },

  hasTypedData() {
    return this._state.source === 'typed-erp' && this._state.status === 'ready'
  },

  requiresAuthority() {
    if (typeof SecureDB !== 'undefined' && typeof SecureDB._productionBrowser === 'function') {
      return SecureDB._productionBrowser()
    }
    try {
      const local = ['localhost', '127.0.0.1'].includes(String(location?.hostname || ''))
      return !local || globalThis.__SM_BUILD_FLAGS__?.localDemo !== true
    } catch { return true }
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
      const [workOrders, assignments, productionEvents, paymentSchedules, finance,
        contracts, financeTransactions, bankBalances, bankAccounts, payrollPayments, cheques, personnelContracts, attendanceEntries, ledgerHead] = await Promise.all([
        scoped('erp_work_orders', 'id,contract_id,title,status,due_at,version,updated_at'),
        scoped('erp_work_order_assignments', 'id,work_order_id,user_id,assignment_role,valid_from,valid_until,scheduled_start_at,scheduled_end_at,assignment_status,version'),
        scoped('erp_production_events', 'id,work_order_id,stage,state,note,actor_id,created_at').order('created_at', { ascending: false }).limit(500),
        scoped('erp_payment_schedules', 'id,contract_id,due_date,amount_irr,probability_percent,status,updated_at'),
        scoped('erp_finance_actual_vs_forecast', 'month_start,actual_income_irr,actual_expense_irr,actual_net_cashflow_irr,gross_forecast_irr,weighted_forecast_irr,actual_profit_irr,income_vs_forecast_variance_irr').order('month_start', { ascending: true }).limit(24),
        scoped('contracts', 'id,contract_num,groom,bride,groom_phone,bride_phone,event_date,event_starts_at,event_ends_at,status,total,payload,lifecycle_version,updated_at').order('updated_at', { ascending: false }).limit(1000),
        scoped('erp_finance_active_transactions', 'id,logical_id,revision,operation,amount_irr,bank_id,to_bank_id,state,payload,created_at').order('created_at', { ascending: false }).limit(2000),
        scoped('finance_account_balances', 'account_ref,balance_irr'),
        scoped('erp_bank_account_balances', 'id,title,bank_name,holder_name,card_last4,account_number_masked,iban_masked,status,version,balance_irr,updated_at'),
        scoped('erp_payroll_payments', 'id,personnel_user_id,period_month,gross_irr,deductions_irr,net_irr,bank_id,finance_transaction_id,status,version,created_at').order('period_month', { ascending: false }).limit(1000),
        scoped('erp_cheques', 'id,cheque_number,direction,party,amount_irr,bank_id,due_date,status,finance_transaction_id,version,created_at').order('due_date', { ascending: true }).limit(1000),
        scoped('erp_personnel_contracts', 'id,personnel_user_id,starts_on,ends_on,compensation,terms,status,version,accepted_at,created_at').order('created_at', { ascending: false }).limit(1000),
        scoped('erp_attendance_entries', 'id,personnel_user_id,check_in_at,check_out_at,source,note,version,created_at').order('check_in_at', { ascending: false }).limit(2000),
        scoped('studio_ledger_heads', 'version').maybeSingle()
      ])

      const failed = [workOrders, assignments, productionEvents, paymentSchedules, finance,
        contracts, financeTransactions, bankBalances, bankAccounts, payrollPayments, cheques, personnelContracts, attendanceEntries, ledgerHead].find(result => result.error)
      if (failed?.error) throw failed.error
      this._publish({
        status: 'ready',
        source: 'typed-erp',
        studioId,
        workOrders: (workOrders.data || []).map(mapTypedWorkOrder),
        assignments: (assignments.data || []).map(row => ({
          ...row, workOrderId: row.work_order_id, userId: row.user_id,
          role: row.assignment_role, startsAt: row.scheduled_start_at || row.valid_from,
          endsAt: row.scheduled_end_at || row.valid_until, status: row.assignment_status,
          version: toNumber(row.version)
        })),
        productionEvents: productionEvents.data || [],
        paymentSchedules: paymentSchedules.data || [],
        financeSeries: mapFinanceSeries(finance.data || []),
        contracts: (contracts.data || []).map(mapContract),
        financeTransactions: (financeTransactions.data || []).map(mapFinanceTransaction),
        bankBalances: bankBalances.data || [],
        bankAccounts: (bankAccounts.data || []).map(row => ({
          id: row.id, name: row.title, bank: row.bank_name, holder: row.holder_name,
          card: row.card_last4 ? `**** **** **** ${row.card_last4}` : '',
          account: row.account_number_masked, iban: row.iban_masked,
          balance: irrToToman(row.balance_irr), status: row.status, version: toNumber(row.version)
        })),
        payrollPayments: (payrollPayments.data || []).map(row => ({
          ...row, personId: row.personnel_user_id, month: row.period_month?.slice(0, 7) || '',
          amount: irrToToman(row.net_irr), bankId: row.bank_id, transactionId: row.finance_transaction_id
        })),
        cheques: (cheques.data || []).map(row => ({
          ...row, number: row.cheque_number, chequeNumber: row.cheque_number,
          type: row.direction, amount: irrToToman(row.amount_irr), bankId: row.bank_id,
          dueDate: row.due_date, transactionId: row.finance_transaction_id,
          status: row.status === 'cleared' ? 'passed' : row.status
        })),
        personnelContracts: personnelContracts.data || [],
        attendanceEntries: (attendanceEntries.data || []).map(row => ({
          ...row, personnelUserId: row.personnel_user_id, checkInAt: row.check_in_at,
          checkOutAt: row.check_out_at, version: toNumber(row.version),
          status: row.check_out_at ? 'completed' : 'present'
        })),
        ledgerVersion: toNumber(ledgerHead.data?.version),
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
    for (const table of ['contracts', 'finance_transactions', 'erp_work_orders', 'erp_work_order_assignments',
      'erp_production_events', 'erp_payment_schedules', 'erp_bank_accounts', 'erp_payroll_payments', 'erp_cheques', 'erp_personnel_contracts', 'erp_attendance_entries']) {
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
