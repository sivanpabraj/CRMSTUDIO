/* Studio M — ویجت‌های داشبورد (قابل تنظیم) */

const SMDashboard = {
  _layoutEdit: localStorage.getItem('sm_dash_edit') === '1',

  toggleLayoutEdit() {
    this._layoutEdit = !this._layoutEdit
    localStorage.setItem('sm_dash_edit', this._layoutEdit ? '1' : '0')
    SM.navigate('dashboard')
  },

  WIDGETS: {
    stats: {
      id: 'stats', title: 'خلاصه اعداد', icon: 'fa-gauge-high', color: '#0071E3', route: 'dashboard',
      desc: 'قرارداد، درآمد، هزینه، مانده، پرسنل'
    },
    calendar: {
      id: 'calendar', title: 'تقویم', icon: 'fa-calendar-days', color: '#0071E3', route: 'calendar',
      desc: 'ماه جاری و رویدادها'
    },
    events: {
      id: 'events', title: 'مراسم‌های پیش‌رو', icon: 'fa-heart', color: '#E68619', route: 'calendar',
      desc: 'کارت‌های عروسی نزدیک'
    },
    contracts: {
      id: 'contracts', title: 'قراردادها', icon: 'fa-file-signature', color: '#0071E3', route: 'contracts',
      desc: 'آخرین قراردادها و تعداد'
    },
    income: {
      id: 'income', title: 'درآمد ماهانه', icon: 'fa-chart-column', color: '#34C759', route: 'accounting',
      desc: 'نمودار درآمد'
    },
    personnel: {
      id: 'personnel', title: 'پرسنل', icon: 'fa-users', color: '#009688', route: 'employees',
      desc: 'تیم فعال و هزینه همکاران'
    },
    alerts: {
      id: 'alerts', title: 'یادآور مالی', icon: 'fa-bell', color: '#FF9500', route: 'accounting',
      desc: 'چک، مانده مشتری، هزینه‌ها'
    },
    bookings: {
      id: 'bookings', title: 'رزرو و مشاوره', icon: 'fa-calendar-check', color: '#5856D6', route: 'bookings',
      desc: 'نوبت‌های پیش‌رو'
    },
    inbox: {
      id: 'inbox', title: 'صندوق مشتری', icon: 'fa-inbox', color: '#00A3BF', route: 'inbox',
      desc: 'درخواست‌های جدید'
    },
    cheques: {
      id: 'cheques', title: 'چک‌ها', icon: 'fa-money-check', color: '#FF3B30', route: 'accounting',
      desc: 'سررسید نزدیک'
    }
  },

  defaultOrder() {
    return ['contracts', 'stats', 'income', 'events', 'personnel', 'alerts', 'bookings', 'inbox', 'calendar']
  },

  getConfig() {
    const cfg = (typeof SM !== 'undefined' ? SM.studio().dashboardWidgets : null) || {}
    const order = Array.isArray(cfg.order) && cfg.order.length ? cfg.order : this.defaultOrder()
    const enabled = Array.isArray(cfg.enabled) && cfg.enabled.length ? cfg.enabled : this.defaultOrder()
    const allIds = [...new Set([...order, ...Object.keys(this.WIDGETS)])]
    return {
      order: allIds.filter(id => this.WIDGETS[id]),
      enabled: enabled.filter(id => this.WIDGETS[id])
    }
  },

  isEnabled(id) {
    return this.getConfig().enabled.includes(id)
  },

  saveConfig(enabled, order) {
    const prev = SM.studio()
    DB.set('studioInfo', {
      ...prev,
      dashboardWidgets: {
        enabled: enabled.filter(id => this.WIDGETS[id]),
        order: order.filter(id => this.WIDGETS[id])
      }
    })
  },

  _ctx() {
    const contracts = DB.get('contracts') || []
    const tx = DB.get('transactions') || []
    const personnel = (DB.get('personnel') || []).filter(p => p.status === 'active')
    const bookings = DB.get('bookings') || []
    const cheques = DB.get('cheques') || []
    const persProjects = DB.get('persProjects') || []
    const expenses = DB.get('expenses') || []
    const requests = DB.get('customerRequests') || []

    const income = tx.filter(t => t.type === 'deposit').reduce((s, t) => s + (t.amount || 0), 0)
    const expense = tx.filter(t => t.type === 'withdrawal').reduce((s, t) => s + (t.amount || 0), 0)
    const outstanding = contracts.reduce((s, c) => s + Math.max(0, (c.total || 0) - (c.deposit || 0) - (c.paid || 0)), 0)
    const personnelCost = persProjects.reduce((s, p) => s + (p.amount || 0), 0)
    const publishCost = expenses.filter(e => /تدوین|چاپ|آلبوم|publish|edit/i.test((e.title || '') + (e.category || '')))
      .reduce((s, e) => s + (e.amount || 0), 0)

    const events = contracts
      .filter(c => c.eventDate || c.date)
      .map(c => ({
        ...c,
        eventDate: c.eventDate || c.date,
        couple: c.couple || `${c.groom || ''} و ${c.bride || ''}`.replace(/^ و | و $/g, '').trim(),
        days: Utils.daysUntil(c.eventDate || c.date)
      }))
      .filter(c => c.days !== null && c.days >= -3)
      .sort((a, b) => a.days - b.days)

    const monthData = this._monthlyRevenue(tx)
    const chequeAlerts = cheques
      .map(c => ({ ...c, days: Utils.daysUntil(c.dueDate) }))
      .filter(c => c.days !== null && c.days >= 0 && c.days <= 7)
      .sort((a, b) => a.days - b.days)

    const upcomingBookings = bookings
      .filter(b => b.status !== 'cancelled')
      .filter(b => {
        const d = Utils.daysUntil(b.date)
        return d !== null && d >= -1 && d <= 14
      })
      .sort((a, b) => String(a.date).localeCompare(String(b.date)))
      .slice(0, 5)

    const openInbox = requests.filter(r => r.status !== 'closed' && r.status !== 'done').length

    const deposits = tx.filter(t => t.type === 'deposit')
    const withdrawals = tx.filter(t => t.type === 'withdrawal')
    const t = Utils.parseJalaliToday()
    const monthKey = `/${String(t.jm).padStart(2, '0')}/`
    const monthDeposits = deposits.filter(d => String(d.date || '').includes(monthKey))
    const monthWithdrawals = withdrawals.filter(d => String(d.date || '').includes(monthKey))
    const monthDepositSum = monthDeposits.reduce((s, d) => s + (d.amount || 0), 0)
    const monthWithdrawalSum = monthWithdrawals.reduce((s, d) => s + (d.amount || 0), 0)
    const recentDeposits = deposits.slice(-3).reverse()

    return {
      contracts, tx, personnel, bookings, cheques, expenses, income, expense, outstanding,
      personnelCost, publishCost, events, monthData, chequeAlerts, upcomingBookings, openInbox,
      deposits, withdrawals, monthDeposits, monthWithdrawals, monthDepositSum, monthWithdrawalSum, recentDeposits
    }
  },

  _monthlyRevenue(tx) {
    const months = ['فر', 'ارد', 'خر', 'تیر', 'مر', 'شه', 'مهر', 'آبان', 'آذر', 'دی', 'به', 'اس']
    return months.map((label, i) => {
      const m = String(i + 1).padStart(2, '0')
      const val = tx.filter(t => t.type === 'deposit' && String(t.date || '').includes(`/${m}/`)).reduce((s, t) => s + (t.amount || 0), 0)
      return { label, value: val }
    })
  },

  _daysLabel(days) {
    if (days === 0) return 'امروز'
    if (days < 0) return `${Math.abs(days)} روز گذشته`
    if (days === 1) return 'فردا'
    return `${days} روز مانده`
  },

  _eventsOnDate(jy, jm) {
    const map = {}
    const add = date => {
      const key = Utils.normJalali(date)
      if (!key) return
      const p = Utils.parseJalali(key)
      if (p && p.jy === jy && p.jm === jm) map[key] = (map[key] || 0) + 1
    }
    ;(DB.get('contracts') || []).forEach(c => {
      if (c.status !== 'cancelled' && (c.eventDate || c.date)) add(c.eventDate || c.date)
    })
    ;(DB.get('bookings') || []).forEach(b => { if (b.date) add(b.date) })
    ;(DB.get('appointments') || []).forEach(a => { if (a.date) add(a.date) })
    return map
  },

  _miniCalendar() {
    const t = Utils.parseJalaliToday()
    const jy = t.jy
    const jm = t.jm
    const today = Utils.todayJalali()
    const days = Utils.jalaliMonthDays(jy, jm)
    const start = Utils.jalaliMonthStartWeekday(jy, jm)
    const eventMap = this._eventsOnDate(jy, jm)
    const wds = Utils.jalaliWeekdaysShort()

    let html = wds.map(w => `<span class="sm-mini-cal-wd">${w}</span>`).join('')
    for (let i = 0; i < start; i++) html += '<span class="sm-mini-cal-day sm-mini-cal-empty"></span>'
    for (let d = 1; d <= days; d++) {
      const date = Utils.formatJalali(jy, jm, d)
      const isToday = date === today
      const hasEv = eventMap[date] > 0
      const past = Utils.daysUntil(date) < 0 && !isToday
      html += `<span class="sm-mini-cal-day${isToday ? ' sm-mini-cal-today' : ''}${hasEv ? ' sm-mini-cal-event' : ''}${past ? ' sm-mini-cal-past' : ''}" title="${hasEv ? eventMap[date] + ' رویداد' : ''}">${d}</span>`
    }

    const monthLabel = `${Utils.jalaliMonthName(jm)} ${jy.toLocaleString('fa-IR')}`
    const eventCount = Object.values(eventMap).reduce((a, b) => a + b, 0)

    return `
      <div class="sm-mini-cal sm-mini-cal--compact">
        <div class="sm-mini-cal-head">
          <span>${monthLabel}</span>
          ${eventCount ? `<span class="sm-mini-cal-badge">${eventCount} رویداد</span>` : ''}
        </div>
        <div class="sm-mini-cal-grid">${html}</div>
      </div>`
  },

  _incomePanel(ctx) {
    const monthName = Utils.jalaliMonthName(Utils.parseJalaliToday().jm)
    return `
      <div class="sm-finance-dash">
        <div class="sm-finance-dash-cells">
          <div class="sm-finance-dash-cell is-in">
            <i class="fas fa-arrow-down"></i>
            <div>
              <span>واریزها</span>
              <strong>${SM.fmt(ctx.income)}</strong>
              <small>${ctx.deposits.length} تراکنش · ${monthName}: ${SM.fmt(ctx.monthDepositSum)}</small>
            </div>
          </div>
          <div class="sm-finance-dash-cell is-out">
            <i class="fas fa-arrow-up"></i>
            <div>
              <span>برداشت / هزینه</span>
              <strong>${SM.fmt(ctx.expense)}</strong>
              <small>${ctx.withdrawals.length} تراکنش · ${monthName}: ${SM.fmt(ctx.monthWithdrawalSum)}</small>
            </div>
          </div>
          <div class="sm-finance-dash-cell is-net">
            <i class="fas fa-scale-balanced"></i>
            <div>
              <span>خالص</span>
              <strong>${SM.fmt(ctx.income - ctx.expense)}</strong>
              <small>مانده مشتری: ${SM.fmt(ctx.outstanding)}</small>
            </div>
          </div>
        </div>
        <div class="sm-finance-dash-links">
          <button type="button" class="sm-finance-link" onclick="event.stopPropagation();SMDashboard.go('accounting')"><i class="fas fa-calculator"></i> حسابداری</button>
          <button type="button" class="sm-finance-link" onclick="event.stopPropagation();SMDashboard.go('invoices')"><i class="fas fa-file-invoice"></i> فاکتور</button>
          <button type="button" class="sm-finance-link" onclick="event.stopPropagation();SMDashboard.go('expenses')"><i class="fas fa-receipt"></i> هزینه</button>
        </div>
        ${ctx.recentDeposits.length ? `
          <div class="sm-finance-recent">
            <div class="sm-finance-recent-title">آخرین واریزها</div>
            ${ctx.recentDeposits.map(d => `
              <div class="sm-w-row"><span>${SM.esc(d.title || d.note || 'واریز')}</span><strong>${SM.fmt(d.amount || 0)}</strong></div>`).join('')}
          </div>` : ''}
        <div class="sm-finance-chart">${SMUI.revenueChart(ctx.monthData)}</div>
      </div>`
  },

  _shell(meta, body, wide) {
    const off = meta.route && SM.isModuleDisabled(meta.route)
    return `<div class="sm-dash-widget sm-dash-widget--click${wide ? ' sm-dash-widget--wide' : ''}${off ? ' sm-dash-widget--off' : ''}"
      style="--w-color:${meta.color}" role="button" tabindex="0"
      onclick="SMDashboard.go('${meta.route}')" onkeydown="if(event.key==='Enter')SMDashboard.go('${meta.route}')">
      <div class="sm-dash-widget-head">
        <span class="sm-dash-widget-title"><i class="fas ${meta.icon}"></i> ${SM.esc(meta.title)}</span>
        <span class="sm-dash-widget-go"><i class="fas fa-arrow-left"></i></span>
      </div>
      <div class="sm-dash-widget-body">${off ? '<div class="sm-w-muted">این بخش موقتاً غیرفعال است.</div>' : body}</div>
    </div>`
  },

  go(route) {
    if (route && !SM.isModuleDisabled(route)) SM.navigate(route)
  },

  _renderWidget(id, ctx, dashQ) {
    const meta = this.WIDGETS[id]
    if (!meta) return ''

    if (id === 'stats') {
      return SMUI.statCards([
        { label: 'قراردادها', value: SM.fmt(ctx.contracts.length), icon: 'fa-file-signature', color: '#0071E3', route: 'contracts' },
        { label: 'درآمد', value: SM.fmt(ctx.income), icon: 'fa-arrow-trend-up', color: '#34C759', route: 'accounting' },
        { label: 'هزینه', value: SM.fmt(ctx.expense), icon: 'fa-arrow-trend-down', color: '#FF3B30', route: 'expenses' },
        { label: 'مانده', value: SM.fmt(ctx.outstanding), icon: 'fa-clock', color: '#FF9500', route: 'contracts' },
        { label: 'پرسنل', value: SM.fmt(ctx.personnel.length), icon: 'fa-users', color: '#009688', route: 'employees' }
      ])
    }

    if (id === 'calendar') {
      return `<div class="sm-dash-cal-bottom">${this._shell(meta, this._miniCalendar())}</div>`
    }

    if (id === 'events') {
      const list = dashQ ? ctx.events.filter(c =>
        [c.couple, c.groom, c.bride, c.contractNum, c.venue].join(' ').toLowerCase().includes(dashQ)
      ) : ctx.events.slice(0, 8)
      const body = list.length
        ? `<div class="sm-event-scroll sm-event-scroll--in-widget">${list.map((c, i) => this._eventCard(c, i)).join('')}</div>`
        : SMUI.empty('fa-calendar-days', dashQ ? 'مراسمی یافت نشد' : 'مراسمی ثبت نشده')
      return `<div class="sm-dash-section sm-dash-section--widget" style="--w-color:${meta.color}">
        <div class="sm-dash-section-head">
          <h3><i class="fas ${meta.icon}"></i> ${meta.title}</h3>
        </div>
        ${body}
      </div>`
    }

    if (id === 'contracts') {
      const recent = ctx.contracts.slice(-4).reverse()
      const body = `
        <div class="sm-w-stat">${SM.fmt(ctx.contracts.length)} <span>قرارداد</span></div>
        ${recent.map(c => `
          <div class="sm-w-row">
            <span>${SM.esc(c.couple || c.groom || '—')}</span>
            <span class="sm-w-muted">${SM.esc(c.eventDate || c.date || '—')}</span>
          </div>`).join('') || '<div class="sm-w-muted">هنوز قراردادی نیست</div>'}`
      return this._shell(meta, body)
    }

    if (id === 'income') {
      return this._shell(meta, this._incomePanel(ctx), true)
    }

    if (id === 'personnel') {
      const body = `
        <div class="sm-w-stat">${SM.fmt(ctx.personnel.length)} <span>نفر فعال</span></div>
        <div class="sm-w-row sm-w-highlight"><span>هزینه همکاران</span><strong>${SM.fmt(ctx.personnelCost)}</strong></div>
        ${ctx.personnel.slice(0, 4).map(p => `
          <div class="sm-w-row"><span>${SM.esc(p.name)}</span><span class="sm-w-muted">${SM.esc(p.role || '—')}</span></div>`).join('')}`
      return this._shell(meta, body)
    }

    if (id === 'alerts') {
      const body = `
        <div class="sm-alert-list sm-alert-list--compact">
          <div class="sm-alert-item sm-alert-cost"><i class="fas fa-users"></i><div><strong>هزینه پرسنل</strong><span>${SM.fmt(ctx.personnelCost)}</span></div></div>
          <div class="sm-alert-item sm-alert-cost"><i class="fas fa-clapperboard"></i><div><strong>تدوین / چاپ</strong><span>${SM.fmt(ctx.publishCost)}</span></div></div>
          ${ctx.chequeAlerts.slice(0, 2).map(c => `
            <div class="sm-alert-item${c.days <= 2 ? ' sm-alert-urgent' : ''}"><i class="fas fa-money-check"></i>
              <div><strong>چک ${SM.esc(c.number || '')}</strong><span>${SMDashboard._daysLabel(c.days)}</span></div></div>`).join('')}
        </div>`
      return this._shell(meta, body)
    }

    if (id === 'bookings') {
      const body = ctx.upcomingBookings.length
        ? ctx.upcomingBookings.map(b => `
          <div class="sm-w-row">
            <span>${SM.esc(b.title || b.client || '—')}</span>
            <span class="sm-w-muted">${SM.esc(b.date)} ${SM.esc(b.time || '')}</span>
          </div>`).join('')
        : '<div class="sm-w-muted">رزرو پیش‌رو نیست</div>'
      return this._shell(meta, body)
    }

    if (id === 'inbox') {
      const body = `
        <div class="sm-w-stat">${SM.fmt(ctx.openInbox)} <span>درخواست باز</span></div>
        <p class="sm-w-muted" style="margin:0;font-size:.78rem">پیام‌های مشتری و پیگیری‌ها</p>`
      return this._shell(meta, body)
    }

    if (id === 'cheques') {
      const body = ctx.chequeAlerts.length
        ? ctx.chequeAlerts.map(c => `
          <div class="sm-w-row"><span>چک ${SM.esc(c.number || '—')}</span><strong>${SM.fmt(c.amount || 0)}</strong></div>`).join('')
        : '<div class="sm-w-muted">سررسید نزدیک نیست</div>'
      return this._shell(meta, body)
    }

    return ''
  },

  _eventCard(c, i) {
    const colors = ['#0071E3', '#009688', '#E68619', '#34C759', '#5856D6']
    const color = colors[i % colors.length]
    const days = c.days
    const badgeType = days <= 0 ? 'danger' : days <= 7 ? 'warning' : 'success'
    const groom = c.groom || '—'
    const bride = c.bride || c.couple?.split(' و ')[0] || '—'
    return `<div class="sm-event-card" style="--ev-color:${color}" onclick="event.stopPropagation();SMDashboard.go('contracts')">
      <div class="sm-event-body">
        <div class="sm-event-names">
          <span class="sm-couple-name">${SM.esc(bride)}</span>
          <span class="sm-couple-sep">و</span>
          <span class="sm-couple-name sm-couple-name-sub">${SM.esc(groom)}</span>
        </div>
        <div class="sm-event-meta"><span><i class="fas fa-calendar"></i> ${SM.esc(c.eventDate)}</span></div>
        ${SMUI.badge(SMDashboard._daysLabel(days), badgeType)}
      </div>
    </div>`
  },

  _number(value) {
    const n = Number(value)
    return Number.isFinite(n) ? n : 0
  },

  _sum(list, field = 'amount') {
    return list.reduce((total, item) => total + this._number(item?.[field]), 0)
  },

  _monthRef(offset = 0) {
    const today = Utils.parseJalaliToday()
    let year = today.jy
    let month = today.jm + offset
    while (month < 1) { month += 12; year -= 1 }
    while (month > 12) { month -= 12; year += 1 }
    return { year, month, key: `${year}/${String(month).padStart(2, '0')}/`, label: Utils.jalaliMonthName(month) }
  },

  _monthAmount(items, type, offset = 0) {
    const ref = this._monthRef(offset)
    return this._sum(items.filter(item => (!type || item.type === type) && String(item.date || '').startsWith(ref.key)))
  },

  _percentChange(current, previous) {
    if (!previous) return current > 0 ? 100 : 0
    return Math.round(((current - previous) / Math.abs(previous)) * 100)
  },

  _financialModel(ctx) {
    const monthIncome = this._monthAmount(ctx.tx, 'deposit', 0)
    const previousIncome = this._monthAmount(ctx.tx, 'deposit', -1)
    const monthExpense = this._monthAmount(ctx.tx, 'withdrawal', 0)
    const previousExpense = this._monthAmount(ctx.tx, 'withdrawal', -1)
    const bankBalance = this._sum(DB.get('banks') || [], 'balance')
    const net = monthIncome - monthExpense
    const billableContracts = ctx.contracts.filter(contract => contract.status !== 'cancelled')
    const collectionRate = billableContracts.length
      ? Math.round((billableContracts.reduce((sum, contract) => {
        const total = this._number(contract.total)
        if (!total) return sum
        return sum + Math.min(total, this._number(contract.deposit) + this._number(contract.paid))
      }, 0) / Math.max(1, this._sum(billableContracts, 'total'))) * 100)
      : 0
    const liquidity = monthExpense > 0 ? Math.min(100, Math.round((bankBalance / monthExpense) * 50)) : (bankBalance > 0 ? 100 : 0)
    const profitability = monthIncome > 0 ? Math.max(0, Math.min(100, Math.round((net / monthIncome) * 100))) : 0
    const overdue = ctx.contracts.filter(contract => {
      const due = this._number(contract.total) - this._number(contract.deposit) - this._number(contract.paid)
      const days = Utils.daysUntil(contract.eventDate || contract.date)
      return due > 0 && days !== null && days < 0
    })
    const debtScore = Math.max(0, 100 - Math.min(100, overdue.length * 20))
    const health = Math.round((collectionRate * 0.35) + (liquidity * 0.25) + (profitability * 0.25) + (debtScore * 0.15))
    return {
      monthIncome, previousIncome, monthExpense, previousExpense, bankBalance, net,
      collectionRate, liquidity, profitability, debtScore, health, overdue,
      incomeTrend: this._percentChange(monthIncome, previousIncome),
      expenseTrend: this._percentChange(monthExpense, previousExpense)
    }
  },

  _forecastSeries(ctx) {
    return [-5, -4, -3, -2, -1, 0].map(offset => {
      const ref = this._monthRef(offset)
      const actual = this._monthAmount(ctx.tx, 'deposit', offset)
      const expected = ctx.contracts
        .filter(contract => String(contract.eventDate || contract.date || '').startsWith(ref.key))
        .reduce((sum, contract) => sum + Math.max(0,
          this._number(contract.total) - this._number(contract.deposit) - this._number(contract.paid)), 0)
      return { ...ref, actual, expected: actual + expected }
    })
  },

  _expenseCategories(ctx) {
    const monthKey = this._monthRef(0).key
    const categories = [
      { id: 'staff', label: 'حقوق و پرسنل', icon: 'fa-users', pattern: /حقوق|پرسنل|دستمزد|salary|staff/i, color: '#C9A96E' },
      { id: 'print', label: 'چاپ و آلبوم', icon: 'fa-book-open', pattern: /چاپ|آلبوم|print|album/i, color: '#A78BFA' },
      { id: 'gear', label: 'تجهیزات', icon: 'fa-camera', pattern: /تجهیز|دوربین|لنز|باتری|gear|camera/i, color: '#60A5FA' },
      { id: 'marketing', label: 'تبلیغات', icon: 'fa-bullhorn', pattern: /تبلیغ|بازاریابی|مارکت|instagram|marketing/i, color: '#34D399' },
      { id: 'transport', label: 'رفت‌وآمد و لوکیشن', icon: 'fa-car', pattern: /رفت|حمل|لوکیشن|بنزین|travel|transport|location/i, color: '#FB923C' }
    ]
    const expenseRows = ctx.expenses.filter(item => !item.date || String(item.date).startsWith(monthKey))
    const unmatchedWithdrawals = ctx.monthWithdrawals.filter(transaction => !expenseRows.some(expense => {
      const sameDay = String(expense.date || '') === String(transaction.date || '')
      const sameAmount = this._number(expense.amount) === this._number(transaction.amount)
      const text = `${transaction.title || ''} ${transaction.desc || ''} ${transaction.note || ''}`
      return sameDay && sameAmount && expense.title && text.includes(expense.title)
    }))
    const source = [...expenseRows, ...unmatchedWithdrawals].map(item => ({ ...item, _amount: this._number(item.amount) }))
    const unique = [...new Map(source.map(item => [item.id || `${item.date}-${item.title}-${item._amount}`, item])).values()]
    let assigned = 0
    const result = categories.map(category => {
      const value = unique.filter(item => category.pattern.test(`${item.title || ''} ${item.category || ''} ${item.note || ''}`))
        .reduce((sum, item) => sum + item._amount, 0)
      assigned += value
      return { ...category, value }
    })
    const total = unique.reduce((sum, item) => sum + item._amount, 0)
    result.push({ id: 'other', label: 'سایر', icon: 'fa-ellipsis', color: '#94A3B8', value: Math.max(0, total - assigned) })
    return { total, items: result.sort((a, b) => b.value - a.value) }
  },

  _workflowSummary() {
    const stages = [
      { id: 'ingest', label: 'دریافت فایل', color: '#60A5FA' },
      { id: 'cull', label: 'انتخاب اولیه', color: '#A78BFA' },
      { id: 'edit', label: 'تدوین و ادیت', color: '#F59E0B' },
      { id: 'review', label: 'بازبینی', color: '#F472B6' },
      { id: 'delivery', label: 'تحویل', color: '#34D399' }
    ]
    const workflows = DB.get('workflows') || []
    return stages.map(stage => ({
      ...stage,
      count: workflows.filter(item => (item.stage || item.currentStage || '').toLowerCase().includes(stage.id)).length
    }))
  },

  _insights(ctx, finance) {
    const insights = []
    if (finance.incomeTrend > 0) insights.push({ type: 'success', icon: 'fa-arrow-trend-up', text: `وصول این ماه نسبت به ماه قبل ${Math.abs(finance.incomeTrend).toLocaleString('fa-IR')}٪ رشد کرده است.` })
    if (finance.incomeTrend < 0) insights.push({ type: 'danger', icon: 'fa-arrow-trend-down', text: `وصول این ماه نسبت به ماه قبل ${Math.abs(finance.incomeTrend).toLocaleString('fa-IR')}٪ کاهش دارد.` })
    if (finance.expenseTrend > 15) insights.push({ type: 'warning', icon: 'fa-flag', text: `هزینه‌های این ماه ${finance.expenseTrend.toLocaleString('fa-IR')}٪ بیشتر از ماه قبل است؛ ریز هزینه‌ها بررسی شود.` })
    if (finance.overdue.length) insights.push({ type: 'danger', icon: 'fa-clock', text: `${finance.overdue.length.toLocaleString('fa-IR')} قرارداد پس از تاریخ مراسم هنوز مانده‌حساب دارد.` })
    if (ctx.chequeAlerts.length) insights.push({ type: 'warning', icon: 'fa-money-check', text: `${ctx.chequeAlerts.length.toLocaleString('fa-IR')} چک در هفت روز آینده سررسید می‌شود.` })
    const closeEvents = ctx.events.filter(event => event.days >= 0 && event.days <= 7)
    if (closeEvents.length) insights.push({ type: 'info', icon: 'fa-calendar-check', text: `${closeEvents.length.toLocaleString('fa-IR')} مراسم در هفت روز آینده نیازمند تأیید تیم و تجهیزات است.` })
    if (!insights.length) insights.push({ type: 'muted', icon: 'fa-circle-check', text: 'هشدار فوری بر اساس داده‌های ثبت‌شده وجود ندارد.' })
    return insights.slice(0, 5)
  },

  _trendBadge(value, inverse = false) {
    const positive = inverse ? value <= 0 : value >= 0
    return `<span class="sm-exec-trend ${positive ? 'is-positive' : 'is-negative'}"><i class="fas fa-arrow-${value >= 0 ? 'up' : 'down'}"></i>${Math.abs(value).toLocaleString('fa-IR')}٪</span>`
  },

  _kpiCard(label, value, meta, icon, color, route, trend = null, inverse = false, kpiId = '') {
    const id = kpiId || label
    return `<div class="sm-exec-kpi" data-kpi-id="${id}" draggable="true" style="--kpi-color:${color}" onclick="SMDashboard.go('${route}')" role="button" tabindex="0">
      <div class="sm-exec-kpi-top">
        <span class="sm-exec-kpi-icon"><i class="fas ${icon}"></i></span>
        <span class="sm-kpi-drag-handle" title="برای جابجایی بکشید (درگ و دراپ)" onclick="event.stopPropagation()"><i class="fas fa-grip-vertical"></i></span>
      </div>
      <span class="sm-exec-kpi-label">${SM.esc(label)}</span>
      <strong>${SM.fmt(value)}</strong>
      <span class="sm-exec-kpi-foot">${trend === null ? '' : this._trendBadge(trend, inverse)}<small>${SM.esc(meta)}</small></span>
    </div>`
  },

  _forecastChart(series) {
    const max = Math.max(1, ...series.flatMap(item => [item.actual, item.expected]))
    const points = values => values.map((value, index) => `${index * 20},${92 - ((value / max) * 76)}`).join(' ')
    const actualPoints = points(series.map(item => item.actual))
    const forecastPoints = points(series.map(item => item.expected))
    return `<div class="sm-exec-chart" role="img" aria-label="مقایسه وصول واقعی و برآورد قراردادی شش ماه اخیر">
      <div class="sm-exec-chart-legend"><span><i class="is-actual"></i>وصول واقعی</span><span><i class="is-forecast"></i>برآورد قراردادی</span></div>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        <defs><linearGradient id="smActualFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#C9A96E" stop-opacity=".38"/><stop offset="1" stop-color="#C9A96E" stop-opacity="0"/></linearGradient></defs>
        <g class="sm-exec-grid"><line x1="0" y1="16" x2="100" y2="16"/><line x1="0" y1="54" x2="100" y2="54"/><line x1="0" y1="92" x2="100" y2="92"/></g>
        <polygon points="0,92 ${actualPoints} 100,92" fill="url(#smActualFill)"/>
        <polyline class="sm-exec-line is-forecast" points="${forecastPoints}"/>
        <polyline class="sm-exec-line is-actual" points="${actualPoints}"/>
      </svg>
      <div class="sm-exec-chart-labels">${series.map(item => `<span><b>${SM.esc(item.label)}</b><small>${SM.fmt(item.actual)}</small></span>`).join('')}</div>
    </div>`
  },

  _healthPanel(finance) {
    const status = finance.health >= 75 ? 'عالی' : finance.health >= 55 ? 'قابل قبول' : finance.health >= 35 ? 'نیازمند توجه' : 'پرریسک'
    return `<section class="sm-exec-panel sm-exec-health">
      <div class="sm-exec-panel-head"><div><span class="sm-exec-eyebrow">کنترل مالی</span><h3>سلامت مالی</h3></div>${SMUI.badge(status, finance.health >= 55 ? 'success' : 'warning')}</div>
      <div class="sm-health-ring" style="--health:${finance.health}" aria-label="امتیاز سلامت مالی ${finance.health} از ۱۰۰"><strong>${finance.health.toLocaleString('fa-IR')}</strong><small>از ۱۰۰</small></div>
      <div class="sm-health-legend">
        <span><i style="--ring-color:#34D399"></i><b>${finance.collectionRate.toLocaleString('fa-IR')}٪</b><small>وصول</small></span>
        <span><i style="--ring-color:#60A5FA"></i><b>${finance.liquidity.toLocaleString('fa-IR')}٪</b><small>نقدینگی</small></span>
        <span><i style="--ring-color:#A78BFA"></i><b>${finance.profitability.toLocaleString('fa-IR')}٪</b><small>سودآوری</small></span>
        <span><i style="--ring-color:#F59E0B"></i><b>${finance.debtScore.toLocaleString('fa-IR')}٪</b><small>بدهی</small></span>
      </div>
      <p class="sm-exec-formula">فرمول: وصول ۳۵٪ + نقدینگی ۲۵٪ + سودآوری ۲۵٪ + بدهی ۱۵٪</p>
    </section>`
  },

  _expensePanel(expenses) {
    const max = Math.max(1, ...expenses.items.map(item => item.value))
    return `<section class="sm-exec-panel sm-exec-expenses">
      <div class="sm-exec-panel-head"><div><span class="sm-exec-eyebrow">ماه جاری</span><h3>ترکیب هزینه‌ها</h3></div><button type="button" class="sm-exec-link" onclick="SMDashboard.go('expenses')">مشاهده کامل <i class="fas fa-arrow-left"></i></button></div>
      <div class="sm-expense-list">${expenses.items.map(item => `<div class="sm-expense-row">
        <span class="sm-expense-label"><i class="fas ${item.icon}" style="--expense-color:${item.color}"></i>${SM.esc(item.label)}</span>
        <span class="sm-expense-track"><i style="width:${Math.round((item.value / max) * 100)}%;--expense-color:${item.color}"></i></span>
        <strong>${expenses.total ? Math.round((item.value / expenses.total) * 100).toLocaleString('fa-IR') : '۰'}٪</strong>
      </div>`).join('')}</div>
    </section>`
  },

  _assistantPanel(insights, ctx) {
    if (typeof AICopilot !== 'undefined' && typeof AICopilot.renderDashboardCard === 'function' && ctx) {
      return AICopilot.renderDashboardCard('manager', ctx)
    }
    return `<section class="sm-exec-panel sm-exec-assistant">
      <div class="sm-exec-panel-head"><div><span class="sm-exec-eyebrow">بر پایه داده ثبت‌شده</span><h3><i class="fas fa-robot"></i> دستیار تصمیم‌گیری</h3></div></div>
      <div class="sm-insight-list">${insights.map(item => `<div class="sm-insight is-${item.type}"><i class="fas ${item.icon}"></i><span>${SM.esc(item.text)}</span></div>`).join('')}</div>
    </section>`
  },

  _workflowPanel(stages) {
    const max = Math.max(1, ...stages.map(stage => stage.count))
    return `<section class="sm-exec-panel sm-exec-workflow">
      <div class="sm-exec-panel-head"><div><span class="sm-exec-eyebrow">عملیات استودیو</span><h3>گردش تولید</h3></div><button type="button" class="sm-exec-link" onclick="SMDashboard.go('workflow')">باز کردن برد <i class="fas fa-arrow-left"></i></button></div>
      <div class="sm-workflow-bars">${stages.map(stage => `<div class="sm-workflow-row"><span>${SM.esc(stage.label)}</span><div><i style="width:${Math.max(4, (stage.count / max) * 100)}%;--stage-color:${stage.color}"></i></div><strong>${stage.count.toLocaleString('fa-IR')}</strong></div>`).join('')}</div>
    </section>`
  },

  _eventsPanel(ctx) {
    const events = ctx.events.filter(item => item.days >= 0).slice(0, 5)
    return `<section class="sm-exec-panel sm-exec-events"><div class="sm-exec-panel-head"><div><span class="sm-exec-eyebrow">برنامه نزدیک</span><h3>مراسم‌های پیش‌رو</h3></div><button type="button" class="sm-exec-link" onclick="SMDashboard.go('calendar')">تقویم <i class="fas fa-arrow-left"></i></button></div>
      <div class="sm-exec-event-list">${events.length ? events.map(event => `<button type="button" onclick="SMDashboard.go('contracts')"><span class="sm-exec-event-date"><strong>${event.days.toLocaleString('fa-IR')}</strong><small>${event.days === 0 ? 'امروز' : 'روز مانده'}</small></span><span><b>${SM.esc(event.couple || 'مراسم')}</b><small>${SM.esc(event.eventDate || '—')} · ${SM.esc(event.venue || 'محل ثبت نشده')}</small></span><i class="fas fa-chevron-left"></i></button>`).join('') : SMUI.empty('fa-calendar', 'مراسم پیش‌رو ثبت نشده')}</div>
    </section>`
  },

  _transactionsPanel(ctx) {
    const rows = ctx.tx.slice(-7).reverse()
    return `<section class="sm-exec-panel sm-exec-transactions"><div class="sm-exec-panel-head"><div><span class="sm-exec-eyebrow">آخرین ثبت‌ها</span><h3>گردش مالی اخیر</h3></div><button type="button" class="sm-exec-link" onclick="SMDashboard.go('accounting')">حسابداری <i class="fas fa-arrow-left"></i></button></div>
      ${rows.length ? `<div class="sm-exec-table-wrap"><table><thead><tr><th>عنوان</th><th>تاریخ</th><th>مبلغ</th><th>وضعیت</th></tr></thead><tbody>${rows.map(row => `<tr><td>${SM.esc(row.title || row.note || 'تراکنش')}</td><td>${SM.esc(row.date || '—')}</td><td class="${row.type === 'deposit' ? 'is-income' : 'is-expense'}">${row.type === 'deposit' ? '+' : '−'} ${SM.fmt(row.amount || 0)}</td><td>${SMUI.badge(row.status === 'pending' ? 'در انتظار' : 'ثبت‌شده', row.status === 'pending' ? 'warning' : 'success')}</td></tr>`).join('')}</tbody></table></div>` : SMUI.empty('fa-receipt', 'تراکنشی ثبت نشده')}</section>`
  },

  _canViewFinance() {
    const user = typeof SM !== 'undefined' ? SM.user?.() : null
    return !!(user && typeof Access !== 'undefined' && (Access.isSystemAdmin(user) || Access.isStudioManager(user)))
  },

  _operationalDashboard(ctx) {
    const stages = this._workflowSummary()
    const closeEvents = ctx.events.filter(event => event.days >= 0 && event.days <= 30).length
    const copilotHtml = typeof AICopilot !== 'undefined' && typeof AICopilot.renderDashboardCard === 'function'
      ? AICopilot.renderDashboardCard('coordinator', ctx)
      : ''
    return `<div class="sm-exec-dashboard sm-exec-dashboard--operations">
      <div class="sm-exec-toolbar"><div><span class="sm-exec-eyebrow">نمای عملیاتی مجاز</span><h2>پیشخوان کارها</h2><p>${SM.esc(Utils.todayJalali())} · اطلاعات مالی فقط برای مدیر استودیو نمایش داده می‌شود</p></div>
        <div class="sm-exec-toolbar-actions">${SMUI.moduleSearch('dashboard', 'جستجو در مراسم و مشتری...')}</div></div>
      <div class="sm-exec-kpis sm-exec-kpis--operations">
        ${this._kpiCard('مراسم ۳۰ روز آینده', closeEvents, 'برنامه کاری نزدیک', 'fa-calendar-check', '#A78BFA', 'calendar')}
        ${this._kpiCard('درخواست‌های باز', ctx.openInbox, 'پیام و پیگیری مشتری', 'fa-inbox', '#60A5FA', 'inbox')}
        ${this._kpiCard('رزروهای نزدیک', ctx.upcomingBookings.length, 'چهارده روز آینده', 'fa-calendar-plus', '#34D399', 'bookings')}
        ${this._kpiCard('پروژه‌های تولید', stages.reduce((sum, stage) => sum + stage.count, 0), 'ادیت، بازبینی و تحویل', 'fa-clapperboard', '#F59E0B', 'workflow')}
      </div>
      ${copilotHtml ? `<div style="margin: 18px 0;">${copilotHtml}</div>` : ''}
      <div class="sm-exec-grid sm-exec-grid--bottom">${this._eventsPanel(ctx)}${this._workflowPanel(stages)}</div>
    </div>`
  },

  SECTIONS: {
    kpis: { id: 'kpis', title: 'کارت‌های شاخص‌های کلیدی عملکرد (KPI)', icon: 'fa-chart-pie' },
    finance: { id: 'finance', title: 'پیش‌بینی وصول و رینگ سلامت مالی', icon: 'fa-wallet' },
    expenses: { id: 'expenses', title: 'ترکیب و دسته‌بندی هزینه‌ها', icon: 'fa-receipt' },
    assistant: { id: 'assistant', title: 'دستیار تصمیم‌گیری و هوش داده', icon: 'fa-robot' },
    workflow: { id: 'workflow', title: 'مراحل گردش تولید و تدوین', icon: 'fa-clapperboard' },
    events: { id: 'events', title: 'مراسم‌های پیش‌رو', icon: 'fa-calendar-check' },
    transactions: { id: 'transactions', title: 'گردش مالی و تراکنش‌های اخیر', icon: 'fa-clock-rotate-left' }
  },

  defaultSectionOrder() {
    return ['kpis', 'finance', 'expenses', 'assistant', 'workflow', 'events', 'transactions']
  },

  defaultKpiOrder() {
    return ['monthIncome', 'monthExpense', 'net', 'outstanding', 'bankBalance', 'closeEvents']
  },

  getKpiOrder() {
    const studio = typeof SM !== 'undefined' && SM.studio ? SM.studio() : {}
    const cfg = studio?.dashboardLayout || {}
    const def = this.defaultKpiOrder()
    let order = Array.isArray(cfg.kpiOrder) && cfg.kpiOrder.length ? cfg.kpiOrder : null
    if (!order && typeof localStorage !== 'undefined') {
      try {
        const local = JSON.parse(localStorage.getItem('sm_kpi_order') || 'null')
        if (Array.isArray(local) && local.length) order = local
      } catch { /* */ }
    }
    if (!order) order = def
    return [...new Set([...order, ...def])]
  },

  async saveKpiOrder(order) {
    if (typeof localStorage !== 'undefined') {
      try { localStorage.setItem('sm_kpi_order', JSON.stringify(order)) } catch { /* */ }
    }
    const cfg = this.getLayoutConfig()
    await this.saveLayoutConfig(cfg.order, cfg.hidden, order)
  },

  isSectionCollapsed(sectionId) {
    const studio = typeof SM !== 'undefined' && SM.studio ? SM.studio() : {}
    const cfg = studio?.dashboardLayout || {}
    let collapsed = Array.isArray(cfg.collapsed) ? cfg.collapsed : null
    if (!collapsed && typeof localStorage !== 'undefined') {
      try {
        const local = JSON.parse(localStorage.getItem('sm_dash_collapsed') || '[]')
        if (Array.isArray(local)) collapsed = local
      } catch { /* */ }
    }
    return Array.isArray(collapsed) ? collapsed.includes(sectionId) : false
  },

  async toggleCollapse(sectionId) {
    const studio = typeof SM !== 'undefined' && SM.studio ? SM.studio() : {}
    const cfg = studio?.dashboardLayout || {}
    let collapsed = Array.isArray(cfg.collapsed) ? [...cfg.collapsed] : []
    if (collapsed.includes(sectionId)) {
      collapsed = collapsed.filter(id => id !== sectionId)
    } else {
      collapsed.push(sectionId)
    }
    const layout = this.getLayoutConfig()
    await this.saveLayoutConfig(layout.order, layout.hidden, null, collapsed)
    if (typeof document !== 'undefined') {
      const secEl = document.querySelector(`[data-section-id="${sectionId}"]`)
      if (secEl) {
        secEl.classList.toggle('is-collapsed')
        const btn = secEl.querySelector('.sm-dash-section-collapse-btn')
        if (btn) {
          const isNowCollapsed = secEl.classList.contains('is-collapsed')
          btn.innerHTML = `<i class="fas fa-chevron-${isNowCollapsed ? 'down' : 'up'}"></i>`
          btn.title = isNowCollapsed ? 'باز کردن' : 'بستن'
        }
      }
    }
  },

  getLayoutConfig() {
    const studio = typeof SM !== 'undefined' && SM.studio ? SM.studio() : {}
    const cfg = studio?.dashboardLayout || {}
    const defaultOrder = this.defaultSectionOrder()
    let order = Array.isArray(cfg.order) && cfg.order.length ? cfg.order : null
    if (!order && typeof localStorage !== 'undefined') {
      try {
        const local = JSON.parse(localStorage.getItem('sm_dash_order') || 'null')
        if (Array.isArray(local) && local.length) order = local
      } catch { /* */ }
    }
    if (!order) order = defaultOrder

    let hidden = Array.isArray(cfg.hidden) ? cfg.hidden : null
    if (!hidden && typeof localStorage !== 'undefined') {
      try {
        const localH = JSON.parse(localStorage.getItem('sm_dash_hidden') || 'null')
        if (Array.isArray(localH)) hidden = localH
      } catch { /* */ }
    }
    if (!hidden) hidden = []

    const all = [...new Set([...order, ...defaultOrder])].filter(id => this.SECTIONS[id])
    return { order: all, hidden: hidden.filter(id => this.SECTIONS[id]) }
  },

  async saveLayoutConfig(order, hidden, kpiOrder = null, collapsed = null) {
    const prev = typeof SM !== 'undefined' && SM.studio ? SM.studio() : {}
    const prevLayout = prev?.dashboardLayout || {}
    const newKpiOrder = kpiOrder || prevLayout.kpiOrder || this.getKpiOrder()
    const newCollapsed = collapsed || prevLayout.collapsed || []
    const layoutData = { order, hidden, kpiOrder: newKpiOrder, collapsed: newCollapsed }
    if (prev) {
      prev.dashboardLayout = layoutData
    }
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem('sm_dash_order', JSON.stringify(order))
        localStorage.setItem('sm_dash_hidden', JSON.stringify(hidden))
        localStorage.setItem('sm_kpi_order', JSON.stringify(newKpiOrder))
        if (collapsed) localStorage.setItem('sm_dash_collapsed', JSON.stringify(newCollapsed))
      } catch { /* */ }
    }
    if (typeof SecureDB !== 'undefined' && SecureDB.merge) {
      await SecureDB.merge('studioInfo', {
        ...prev,
        dashboardLayout: layoutData
      })
    } else if (typeof DB !== 'undefined' && DB.set) {
      await DB.set('studioInfo', {
        ...prev,
        dashboardLayout: layoutData
      })
    }
    await DB?.flush?.()
  },

  async moveSection(sectionId, direction) {
    const cfg = this.getLayoutConfig()
    const idx = cfg.order.indexOf(sectionId)
    if (idx === -1) return
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1
    if (targetIdx < 0 || targetIdx >= cfg.order.length) return
    const item = cfg.order.splice(idx, 1)[0]
    cfg.order.splice(targetIdx, 0, item)
    await this.saveLayoutConfig(cfg.order, cfg.hidden)
    SM.toast?.(`بخش «${this.SECTIONS[sectionId]?.title || ''}» منتقل شد`, 'success')
    SM.navigate('dashboard')
  },

  async toggleSectionVisibility(sectionId) {
    const cfg = this.getLayoutConfig()
    let hidden = [...cfg.hidden]
    if (hidden.includes(sectionId)) {
      hidden = hidden.filter(id => id !== sectionId)
      SM.toast?.(`بخش «${this.SECTIONS[sectionId]?.title || ''}» نمایان شد`, 'success')
    } else {
      hidden.push(sectionId)
      SM.toast?.(`بخش «${this.SECTIONS[sectionId]?.title || ''}» مخفی شد`, 'info')
    }
    await this.saveLayoutConfig(cfg.order, hidden)
    SM.navigate('dashboard')
  },

  async resetLayoutConfig() {
    await this.saveLayoutConfig(this.defaultSectionOrder(), [], this.defaultKpiOrder(), [])
    try {
      localStorage.removeItem('sm_dash_order')
      localStorage.removeItem('sm_dash_hidden')
      localStorage.removeItem('sm_kpi_order')
      localStorage.removeItem('sm_dash_collapsed')
    } catch { /* */ }
    SM.toast?.('چیدمان پیشخوان به حالت پیش‌فرض بازگشت', 'info')
    SM.navigate('dashboard')
  },

  _renderSectionContent(id, ctx, finance, expenses, forecasts, stages, insights, activeContracts, closeEvents) {
    switch (id) {
      case 'kpis': {
        const kpiMap = {
          monthIncome: this._kpiCard('وصول این ماه', finance.monthIncome, 'نسبت به ماه قبل', 'fa-wallet', '#34D399', 'accounting', finance.incomeTrend, false, 'monthIncome'),
          monthExpense: this._kpiCard('هزینه این ماه', finance.monthExpense, 'نسبت به ماه قبل', 'fa-receipt', '#F87171', 'expenses', finance.expenseTrend, true, 'monthExpense'),
          net: this._kpiCard('سود خالص ماه', finance.net, 'وصول منهای هزینه', 'fa-chart-line', '#C9A96E', 'reports', null, false, 'net'),
          outstanding: this._kpiCard('مانده مشتریان', ctx.outstanding, `${finance.overdue.length.toLocaleString('fa-IR')} قرارداد معوق`, 'fa-hourglass-half', '#F59E0B', 'contracts', null, false, 'outstanding'),
          bankBalance: this._kpiCard('موجودی حساب‌ها', finance.bankBalance, 'مجموع بانک و صندوق', 'fa-building-columns', '#60A5FA', 'accounting', null, false, 'bankBalance'),
          closeEvents: this._kpiCard('مراسم ۳۰ روز', closeEvents, `${activeContracts.toLocaleString('fa-IR')} قرارداد فعال`, 'fa-calendar-check', '#A78BFA', 'calendar', null, false, 'closeEvents')
        }
        const kpiOrder = this.getKpiOrder()
        const cardsHtml = kpiOrder.map(kId => kpiMap[kId] || '').filter(Boolean).join('')
        return `<div class="sm-exec-kpis" id="sm-exec-kpis-container">${cardsHtml}</div>`
      }
      case 'finance':
        return `<div class="sm-exec-grid sm-exec-grid--finance">
          <section class="sm-exec-panel sm-exec-forecast"><div class="sm-exec-panel-head"><div><span class="sm-exec-eyebrow">شش ماه اخیر</span><h3>وصول واقعی و برآورد قراردادی</h3></div><span class="sm-exec-note">برآورد = وصول ثبت‌شده + مانده قرارداد همان ماه</span></div>${this._forecastChart(forecasts)}</section>
          ${this._healthPanel(finance)}
        </div>`
      case 'expenses':
        return `<div class="sm-exec-grid sm-exec-grid--full">${this._expensePanel(expenses)}</div>`
      case 'assistant':
        return `<div class="sm-exec-grid sm-exec-grid--full">${this._assistantPanel(insights, ctx)}</div>`
      case 'workflow':
        return `<div class="sm-exec-grid sm-exec-grid--full">${this._workflowPanel(stages)}</div>`
      case 'events':
        return `<div class="sm-exec-grid sm-exec-grid--full">${this._eventsPanel(ctx)}</div>`
      case 'transactions':
        return `<div class="sm-exec-grid sm-exec-grid--full">${this._transactionsPanel(ctx)}</div>`
      default:
        return ''
    }
  },

  _quickActionBar() {
    return `
      <div class="sm-quick-actions-bar">
        <button type="button" class="sm-btn sm-btn-sm sm-btn-primary" onclick="window.location.href='../contract.html'"><i class="fas fa-plus-circle"></i> قرارداد جدید</button>
        <button type="button" class="sm-btn sm-btn-sm sm-btn-ghost" onclick="SM.navigate('accounting')"><i class="fas fa-cash-register"></i> ثبت تراکنش مالی</button>
        <button type="button" class="sm-btn sm-btn-sm sm-btn-ghost" onclick="SM.navigate('calendar')"><i class="fas fa-calendar-plus"></i> آفیش و تقویم</button>
        <button type="button" class="sm-btn sm-btn-sm sm-btn-ghost" onclick="SM.navigate('employees')"><i class="fas fa-user-plus"></i> افزودن پرسنل</button>
        <button type="button" class="sm-btn sm-btn-sm sm-btn-ghost" onclick="SM.navigate('settings')"><i class="fas fa-gear"></i> ضوابط و تنظیمات</button>
        <button type="button" class="sm-btn sm-btn-sm ${this._layoutEdit ? 'sm-btn-warning' : 'sm-btn-ghost'}" onclick="SMDashboard.toggleLayoutEdit()"><i class="fas fa-grip"></i> ${this._layoutEdit ? 'اتمام چیدمان' : 'شخصی‌سازی پیشخوان'}</button>
      </div>`
  },

  _onboardingCard(activeContracts) {
    if (activeContracts > 0) return ''
    return `
      <div class="sm-onboarding-card" style="background:linear-gradient(135deg, rgba(201,169,110,0.12), rgba(0,113,227,0.08));border:1px solid rgba(201,169,110,0.3);border-radius:16px;padding:20px;margin-bottom:24px;position:relative">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:16px;flex-wrap:wrap">
          <div>
            <span class="sm-badge sm-badge-primary" style="margin-bottom:8px"><i class="fas fa-sparkles"></i> خوش‌آمدید به نرم‌افزار جامع مدیریت استودیو</span>
            <h3 style="margin:4px 0 8px;font-size:1.15rem;font-weight:700">راهنمای راه‌اندازی سریع استودیو در ۴ گام</h3>
            <p style="font-size:.85rem;color:var(--sm-text-muted);margin:0;max-width:680px;line-height:1.7">
              سیستم شما کاملاً آماده و ایزوله است. برای شروع چرخه هوشمند مدیریت مراسم‌ها، ۴ مرحله زیر را به ترتیب انجام دهید:
            </p>
          </div>
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(200px, 1fr));gap:12px;margin-top:16px">
          <div style="background:var(--sm-bg-card, rgba(255,255,255,0.03));padding:12px 14px;border-radius:12px;border:1px solid var(--sm-border)">
            <strong style="display:block;margin-bottom:4px;font-size:.88rem">۱. اطلاعات استودیو و مهر</strong>
            <p style="font-size:.78rem;color:var(--sm-text-muted);margin:0 0 10px">نام آتلیه، لوگو و امضای دیجیتال</p>
            <button type="button" class="sm-btn sm-btn-xs sm-btn-ghost" onclick="SM.navigate('settings')">تنظیم مشخصات <i class="fas fa-arrow-left"></i></button>
          </div>
          <div style="background:var(--sm-bg-card, rgba(255,255,255,0.03));padding:12px 14px;border-radius:12px;border:1px solid var(--sm-border)">
            <strong style="display:block;margin-bottom:4px;font-size:.88rem">۲. حساب و صندوق مالی</strong>
            <p style="font-size:.78rem;color:var(--sm-text-muted);margin:0 0 10px">تعریف کارت‌خوان و حساب بانکی</p>
            <button type="button" class="sm-btn sm-btn-xs sm-btn-ghost" onclick="SM.navigate('accounting')">مدیریت حساب‌ها <i class="fas fa-arrow-left"></i></button>
          </div>
          <div style="background:var(--sm-bg-card, rgba(255,255,255,0.03));padding:12px 14px;border-radius:12px;border:1px solid var(--sm-border)">
            <strong style="display:block;margin-bottom:4px;font-size:.88rem">۳. عکاسان و تدوین‌گران</strong>
            <p style="font-size:.78rem;color:var(--sm-text-muted);margin:0 0 10px">ثبت پرسنل جهت آفیش و دستمزد</p>
            <button type="button" class="sm-btn sm-btn-xs sm-btn-ghost" onclick="SM.navigate('employees')">افزودن تیم <i class="fas fa-arrow-left"></i></button>
          </div>
          <div style="background:var(--sm-bg-card, rgba(255,255,255,0.03));padding:12px 14px;border-radius:12px;border:1px solid var(--sm-border)">
            <strong style="display:block;margin-bottom:4px;font-size:.88rem">۴. ثبت اولین قرارداد</strong>
            <p style="font-size:.78rem;color:var(--sm-text-muted);margin:0 0 10px">ثبت مراسم عروسی، عقد یا کودک</p>
            <button type="button" class="sm-btn sm-btn-xs sm-btn-primary" onclick="window.location.href='../contract.html'">ثبت قرارداد <i class="fas fa-arrow-left"></i></button>
          </div>
        </div>
      </div>`
  },

  render(el) {
    const ctx = this._ctx()
    if (!this._canViewFinance()) {
      el.innerHTML = this._operationalDashboard(ctx)
      return
    }
    const finance = this._financialModel(ctx)
    const expenses = this._expenseCategories(ctx)
    const forecasts = this._forecastSeries(ctx)
    const stages = this._workflowSummary()
    const insights = this._insights(ctx, finance)
    const activeContracts = ctx.contracts.filter(contract => contract.status !== 'cancelled').length
    const closeEvents = ctx.events.filter(event => event.days >= 0 && event.days <= 30).length

    const cfg = this.getLayoutConfig()
    const visibleSections = cfg.order.filter(id => this._layoutEdit || !cfg.hidden.includes(id))

    const sectionsHtml = visibleSections.map((id, index) => {
      const meta = this.SECTIONS[id] || { title: id, icon: 'fa-cubes' }
      const isHidden = cfg.hidden.includes(id)
      const isCollapsed = this.isSectionCollapsed(id)
      const isFirst = index === 0
      const isLast = index === visibleSections.length - 1
      const content = this._renderSectionContent(id, ctx, finance, expenses, forecasts, stages, insights, activeContracts, closeEvents)

      return `
        <div class="sm-dash-section ${isHidden ? 'is-hidden' : ''} ${isCollapsed ? 'is-collapsed' : ''}" data-section-id="${id}" draggable="true">
          <div class="sm-dash-section-bar">
            <div class="sm-dash-section-info">
              <span class="sm-dash-section-drag-handle" title="جابجایی بخش با کشیدن (درگ و دراپ)"><i class="fas fa-grip-vertical"></i></span>
              <div class="sm-dash-section-title-wrap">
                <span class="sm-dash-section-title-icon"><i class="fas ${meta.icon}"></i></span>
                <span>${SM.esc(meta.title)}</span>
              </div>
              ${isHidden ? '<span class="sm-badge sm-badge-muted">مخفی‌شده</span>' : ''}
            </div>
            <div class="sm-dash-section-actions">
              <button type="button" class="sm-dash-section-btn sm-dash-section-collapse-btn" onclick="SMDashboard.toggleCollapse('${id}')" title="${isCollapsed ? 'باز کردن بخش' : 'بستن بخش'}">
                <i class="fas fa-chevron-${isCollapsed ? 'down' : 'up'}"></i>
              </button>
              <button type="button" class="sm-dash-section-btn" onclick="SMDashboard.moveSection('${id}', 'up')" ${isFirst ? 'disabled' : ''} title="انتقال به بالا"><i class="fas fa-arrow-up"></i> <span>بالا</span></button>
              <button type="button" class="sm-dash-section-btn" onclick="SMDashboard.moveSection('${id}', 'down')" ${isLast ? 'disabled' : ''} title="انتقال به پایین"><i class="fas fa-arrow-down"></i> <span>پایین</span></button>
              <button type="button" class="sm-dash-section-btn ${isHidden ? 'sm-btn-primary' : ''}" onclick="SMDashboard.toggleSectionVisibility('${id}')" title="${isHidden ? 'نمایش مجدد' : 'مخفی کردن'}">
                <i class="fas ${isHidden ? 'fa-eye' : 'fa-eye-slash'}"></i> <span>${isHidden ? 'نمایش' : 'مخفی'}</span>
              </button>
            </div>
          </div>
          <div class="sm-dash-section-body">
            ${content}
          </div>
        </div>`
    }).join('')

    el.innerHTML = `
      <div class="sm-exec-dashboard">
        <div class="sm-exec-toolbar">
          <div>
            <span class="sm-exec-eyebrow">نمای لحظه‌ای استودیو</span>
            <h2>پیشخوان مدیریت</h2>
            <p>${SM.esc(Utils.todayJalali())} · همه ارقام به تومان · قابلیت جابجایی ابزارها با کشیدن و رها کردن</p>
          </div>
          <div class="sm-exec-toolbar-actions">
            ${SMUI.moduleSearch('dashboard', 'جستجو در مراسم و مشتری...')}
            ${this._layoutEdit ? `
            <button type="button" class="sm-btn sm-btn-ghost sm-btn-xs" onclick="SMDashboard.resetLayoutConfig()" title="بازگرداندن چیدمان پیشخوان به حالت اولیه">
              <i class="fas fa-rotate-left"></i> بازنشانی پیش‌فرض
            </button>` : ''}
            <button type="button" id="btn-toggle-dash-customizer" class="sm-btn ${this._layoutEdit ? 'sm-btn-warning' : 'sm-btn-ghost'}" onclick="SMDashboard.toggleLayoutEdit()">
              <i class="fas ${this._layoutEdit ? 'fa-check' : 'fa-sliders'}"></i> ${this._layoutEdit ? 'اتمام چیدمان' : 'شخصی‌سازی پیشخوان'}
            </button>
            <button type="button" class="sm-btn sm-btn-primary" onclick="window.location.href='../contract.html'"><i class="fas fa-plus"></i> قرارداد جدید</button>
          </div>
        </div>
        ${this._quickActionBar()}
        ${this._onboardingCard(activeContracts)}
        <div class="sm-dash-sections-container" id="sm-dash-sections-container">
          ${sectionsHtml}
        </div>
      </div>`

    const kpiBox = el.querySelector('#sm-exec-kpis-container')
    if (kpiBox) {
      this._bindKpiSortable(kpiBox)
    }

    const secBox = el.querySelector('#sm-dash-sections-container')
    if (secBox) {
      this._bindSectionSortable(secBox)
    }
  },

  _bindKpiSortable(container) {
    if (!container) return
    let dragId = null

    container.querySelectorAll('.sm-exec-kpi').forEach(card => {
      card.addEventListener('dragstart', e => {
        dragId = card.dataset.kpiId
        card.classList.add('is-dragging')
        e.dataTransfer.effectAllowed = 'move'
        e.dataTransfer.setData('text/plain', dragId)
      })
      card.addEventListener('dragend', () => {
        card.classList.remove('is-dragging')
        dragId = null
        container.querySelectorAll('.sm-exec-kpi').forEach(c => c.classList.remove('is-drag-over'))
      })
      card.addEventListener('dragover', e => {
        if (!dragId) return
        e.preventDefault()
        const over = card
        if (over.dataset.kpiId === dragId) return
        over.classList.add('is-drag-over')
        const dragging = container.querySelector(`[data-kpi-id="${dragId}"]`)
        if (!dragging) return
        const rect = over.getBoundingClientRect()
        const before = e.clientX < rect.left + rect.width / 2
        if (before) container.insertBefore(dragging, over)
        else container.insertBefore(dragging, over.nextSibling)
      })
      card.addEventListener('dragleave', () => card.classList.remove('is-drag-over'))
      card.addEventListener('drop', async e => {
        e.preventDefault()
        card.classList.remove('is-drag-over')
        const newOrder = [...container.querySelectorAll('.sm-exec-kpi')].map(c => c.dataset.kpiId).filter(Boolean)
        await this.saveKpiOrder(newOrder)
        SM.toast?.('ترتیب کارت‌های شاخص ذخیره شد', 'success')
      })
    })

    this._attachTouchReorder(container, '.sm-exec-kpi', '.sm-kpi-drag-handle', async (newOrder) => {
      await this.saveKpiOrder(newOrder)
      SM.toast?.('ترتیب کارت‌های شاخص ذخیره شد', 'success')
    })
  },

  _bindSectionSortable(container) {
    if (!container) return
    let dragId = null

    container.querySelectorAll('.sm-dash-section').forEach(section => {
      section.addEventListener('dragstart', e => {
        dragId = section.dataset.sectionId
        section.classList.add('is-dragging')
        e.dataTransfer.effectAllowed = 'move'
        e.dataTransfer.setData('text/plain', dragId)
      })
      section.addEventListener('dragend', () => {
        section.classList.remove('is-dragging')
        dragId = null
        container.querySelectorAll('.sm-dash-section').forEach(s => s.classList.remove('is-drag-over'))
      })
      section.addEventListener('dragover', e => {
        if (!dragId) return
        e.preventDefault()
        const over = section
        if (over.dataset.sectionId === dragId) return
        over.classList.add('is-drag-over')
        const dragging = container.querySelector(`[data-section-id="${dragId}"]`)
        if (!dragging) return
        const rect = over.getBoundingClientRect()
        const before = e.clientY < rect.top + rect.height / 2
        if (before) container.insertBefore(dragging, over)
        else container.insertBefore(dragging, over.nextSibling)
      })
      section.addEventListener('dragleave', () => section.classList.remove('is-drag-over'))
      section.addEventListener('drop', async e => {
        e.preventDefault()
        section.classList.remove('is-drag-over')
        const newOrder = [...container.querySelectorAll('.sm-dash-section')].map(s => s.dataset.sectionId).filter(Boolean)
        const cfg = this.getLayoutConfig()
        const merged = [...newOrder, ...cfg.order.filter(id => !newOrder.includes(id))]
        await this.saveLayoutConfig(merged, cfg.hidden)
        SM.toast?.('چیدمان جدید با موفقیت ذخیره شد', 'success')
      })
    })

    this._attachTouchReorder(container, '.sm-dash-section', '.sm-dash-section-drag-handle', async (newOrder) => {
      const cfg = this.getLayoutConfig()
      const merged = [...newOrder, ...cfg.order.filter(id => !newOrder.includes(id))]
      await this.saveLayoutConfig(merged, cfg.hidden)
      SM.toast?.('چیدمان جدید با موفقیت ذخیره شد', 'success')
    })
  },

  _attachTouchReorder(container, itemSelector, handleSelector, onReorder) {
    if (!container || typeof window === 'undefined') return
    let activeItem = null
    let ghost = null
    let initialY = 0
    let initialX = 0

    const onPointerDown = (e) => {
      const handle = e.target.closest(handleSelector)
      if (!handle) return
      const item = handle.closest(itemSelector)
      if (!item) return

      activeItem = item
      initialY = e.clientY
      initialX = e.clientX

      try {
        ghost = item.cloneNode(true)
        ghost.className = 'sm-touch-drag-ghost'
        const rect = item.getBoundingClientRect()
        ghost.style.width = `${rect.width}px`
        ghost.style.height = `${rect.height}px`
        ghost.style.top = `${rect.top}px`
        ghost.style.left = `${rect.left}px`
        document.body.appendChild(ghost)
      } catch { ghost = null }

      item.classList.add('is-dragging')
      handle.setPointerCapture?.(e.pointerId)
      e.preventDefault()
    }

    const onPointerMove = (e) => {
      if (!activeItem) return
      e.preventDefault()
      if (ghost) {
        const dy = e.clientY - initialY
        const dx = e.clientX - initialX
        ghost.style.transform = `translate(${dx}px, ${dy}px) scale(0.97) rotate(-1deg)`
        ghost.style.display = 'none'
      }

      const elemBelow = document.elementFromPoint(e.clientX, e.clientY)
      if (ghost) ghost.style.display = ''
      if (!elemBelow) return

      const targetItem = elemBelow.closest(itemSelector)
      if (targetItem && targetItem !== activeItem && targetItem.parentElement === container) {
        const rect = targetItem.getBoundingClientRect()
        const isHorizontal = container.classList.contains('sm-exec-kpis')
        const before = isHorizontal ? (e.clientX < rect.left + rect.width / 2) : (e.clientY < rect.top + rect.height / 2)
        if (before) container.insertBefore(activeItem, targetItem)
        else container.insertBefore(activeItem, targetItem.nextSibling)
      }
    }

    const onPointerUp = async () => {
      if (!activeItem) return
      if (ghost) {
        ghost.remove()
        ghost = null
      }
      activeItem.classList.remove('is-dragging')
      activeItem = null

      try {
        const newOrder = [...container.querySelectorAll(itemSelector)].map(el => el.dataset.kpiId || el.dataset.sectionId).filter(Boolean)
        if (typeof onReorder === 'function') {
          await onReorder(newOrder)
        }
      } catch (err) {
        console.warn('Reorder callback error:', err)
      }
    }

    container.querySelectorAll(handleSelector).forEach(handle => {
      handle.addEventListener('pointerdown', onPointerDown)
      handle.addEventListener('pointermove', onPointerMove)
      handle.addEventListener('pointerup', onPointerUp)
      handle.addEventListener('pointercancel', onPointerUp)
    })
  },

  _block(id, inner) {
    const meta = this.WIDGETS[id] || {}
    return `<div class="sm-dash-block" data-widget-id="${id}" style="--w-color:${meta.color || '#0071E3'}" draggable="${this._layoutEdit ? 'true' : 'false'}">
      <button type="button" class="sm-dash-drag" tabindex="-1" aria-hidden="true"><i class="fas fa-grip-vertical"></i></button>
      <div class="sm-dash-block-inner">${inner}</div>
    </div>`
  },

  _bindSortable(root) {
    if (!root) return
    let dragId = null

    root.querySelectorAll('.sm-dash-block').forEach(block => {
      block.addEventListener('dragstart', e => {
        if (!this._layoutEdit) { e.preventDefault(); return }
        dragId = block.dataset.widgetId
        block.classList.add('is-dragging')
        e.dataTransfer.effectAllowed = 'move'
        e.dataTransfer.setData('text/plain', dragId)
      })
      block.addEventListener('dragend', () => {
        block.classList.remove('is-dragging')
        dragId = null
        root.querySelectorAll('.sm-dash-block').forEach(b => b.classList.remove('is-drag-over'))
      })
      block.addEventListener('dragover', e => {
        if (!this._layoutEdit || !dragId) return
        e.preventDefault()
        const over = block
        if (over.dataset.widgetId === dragId) return
        over.classList.add('is-drag-over')
        const dragging = root.querySelector(`[data-widget-id="${dragId}"]`)
        if (!dragging) return
        const rect = over.getBoundingClientRect()
        const before = e.clientY < rect.top + rect.height / 2
        if (before) root.insertBefore(dragging, over)
        else root.insertBefore(dragging, over.nextSibling)
      })
      block.addEventListener('dragleave', () => block.classList.remove('is-drag-over'))
      block.addEventListener('drop', e => {
        e.preventDefault()
        block.classList.remove('is-drag-over')
        this._saveOrderFromDom(root)
      })
    })
  },

  _saveOrderFromDom(root) {
    const order = [...root.querySelectorAll('.sm-dash-block')].map(b => b.dataset.widgetId).filter(Boolean)
    if (!order.length) return
    const cfg = this.getConfig()
    const merged = [...order, ...cfg.order.filter(id => !order.includes(id))]
    this.saveConfig(cfg.enabled, merged)
    SM.toast('چیدمان ویجت‌ها ذخیره شد', 'success')
  }
}

window.SMDashboard = SMDashboard
