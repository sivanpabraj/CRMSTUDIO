/**
 * Glass StatsCard helpers — shared KPI rendering for role dashboards
 * Vanilla JS (no React). Use with glass-upgrade.css
 */
const GlassStats = {
  /**
   * @param {Array<{label:string, value:string|number, icon?:string, color?:string, delta?:string, deltaDown?:boolean, route?:string}>} items
   */
  row(items) {
    if (!items || !items.length) return ''
    const esc = (s) => (typeof SM !== 'undefined' && SM.esc ? SM.esc(String(s)) : String(s ?? ''))
    return `<div class="glass-stats-row">${items.map((it) => {
      const color = it.color || 'var(--glass-gold)'
      const click = it.route
        ? `role="button" tabindex="0" onclick="typeof SMDashboard!=='undefined'?SMDashboard.go('${esc(it.route)}'):(typeof SM!=='undefined'&&SM.navigate('${esc(it.route)}'))"`
        : ''
      const delta = it.delta
        ? `<span class="glass-stat__delta${it.deltaDown ? ' is-down' : ''}"><i class="fas fa-arrow-${it.deltaDown ? 'down' : 'up'}"></i> ${esc(it.delta)}</span>`
        : ''
      return `<div class="glass-stat glass-card glass-card--lift" style="--stat-color:${color}" ${click}>
        <div class="glass-stat__label">
          ${it.icon ? `<span class="glass-stat__icon"><i class="fas ${esc(it.icon)}"></i></span>` : ''}
          <span>${esc(it.label)}</span>
        </div>
        <div class="glass-stat__value">${esc(it.value)}</div>
        ${delta}
      </div>`
    }).join('')}</div>`
  },

  /** Manager executive KPIs from live DB */
  managerKpis() {
    const contracts = (typeof DB !== 'undefined' && DB.get('contracts')) || []
    const tx = (typeof DB !== 'undefined' && DB.get('transactions')) || []
    const personnel = ((typeof DB !== 'undefined' && DB.get('personnel')) || []).filter((p) => p.status === 'active')
    const income = tx.filter((t) => t.type === 'deposit').reduce((s, t) => s + (t.amount || 0), 0)
    const expense = tx.filter((t) => t.type === 'withdrawal').reduce((s, t) => s + (t.amount || 0), 0)
    const outstanding = contracts.reduce((s, c) => s + Math.max(0, (c.total || 0) - (c.deposit || 0) - (c.paid || 0)), 0)
    const upcoming = contracts.filter((c) => {
      const d = typeof Utils !== 'undefined' ? Utils.daysUntil(c.eventDate || c.date) : null
      return d !== null && d >= 0 && d <= 7
    }).length
    const fmt = (n) => (typeof SM !== 'undefined' && SM.fmt ? SM.fmt(n) : Number(n).toLocaleString('fa-IR'))
    return this.row([
      { label: 'قراردادها', value: fmt(contracts.length), icon: 'fa-file-signature', color: '#0071E3', route: 'contracts' },
      { label: 'مراسم ۷ روز', value: fmt(upcoming), icon: 'fa-heart', color: '#E68619', route: 'calendar' },
      { label: 'درآمد', value: fmt(income), icon: 'fa-arrow-trend-up', color: '#34C759', route: 'accounting' },
      { label: 'مانده مشتری', value: fmt(outstanding), icon: 'fa-clock', color: '#FF9500', route: 'contracts' },
      { label: 'پرسنل فعال', value: fmt(personnel.length), icon: 'fa-users', color: '#009688', route: 'employees' },
      { label: 'خالص', value: fmt(income - expense), icon: 'fa-scale-balanced', color: '#C9A96E', route: 'accounting' }
    ])
  },

  /** Staff / personnel portal KPIs */
  staffKpis(userId, phone) {
    const projects = ((typeof DB !== 'undefined' && DB.get('persProjects')) || []).filter((p) => {
      if (userId && (p.personnelId === userId || p.userId === userId)) return true
      if (phone && p.personnelPhone && String(p.personnelPhone).includes(String(phone).slice(-10))) return true
      return false
    })
    const active = projects.filter((p) => p.status === 'active' || p.accepted).length
    const dueSoon = projects.filter((p) => {
      const d = typeof Utils !== 'undefined' ? Utils.daysUntil(p.deadline || p.eventDate) : null
      return d !== null && d >= 0 && d <= 5
    }).length
    const earned = projects.reduce((s, p) => s + (p.amount || 0), 0)
    const paid = projects.reduce((s, p) => s + (p.paid || 0), 0)
    const fmt = (n) => (typeof SM !== 'undefined' && SM.fmt ? SM.fmt(n) : Number(n).toLocaleString('fa-IR'))
    return this.row([
      { label: 'پروژه فعال', value: fmt(active), icon: 'fa-briefcase', color: '#0071E3' },
      { label: 'ددلاین نزدیک', value: fmt(dueSoon), icon: 'fa-hourglass-half', color: '#FF9500' },
      { label: 'دستمزد کل', value: fmt(earned), icon: 'fa-coins', color: '#C9A96E' },
      { label: 'پرداخت‌شده', value: fmt(paid), icon: 'fa-check', color: '#34C759' }
    ])
  },

  /** Customer portal KPIs for one contract */
  customerKpis(contract) {
    if (!contract) return ''
    const total = contract.total || contract.totalAmount || 0
    const deposit = contract.deposit || 0
    const paidExtra = contract.paid || 0
    const remaining = Math.max(0, total - deposit - paidExtra)
    const days = typeof Utils !== 'undefined' ? Utils.daysUntil(contract.eventDate || contract.date) : null
    const fmt = (n) => (typeof SM !== 'undefined' && SM.fmt ? SM.fmt(n) : Number(n).toLocaleString('fa-IR'))
    const dayLabel = days === null ? '—' : days === 0 ? 'امروز' : days < 0 ? `${Math.abs(days)} روز قبل` : `${days} روز`
    return this.row([
      { label: 'مبلغ کل', value: fmt(total), icon: 'fa-file-invoice', color: '#C9A96E' },
      { label: 'پرداخت‌شده', value: fmt(deposit + paidExtra), icon: 'fa-check-circle', color: '#34C759' },
      { label: 'مانده', value: fmt(remaining), icon: 'fa-wallet', color: remaining ? '#FF9500' : '#34C759' },
      { label: 'تا مراسم', value: dayLabel, icon: 'fa-calendar', color: '#0071E3' }
    ])
  }
}

window.GlassStats = GlassStats
