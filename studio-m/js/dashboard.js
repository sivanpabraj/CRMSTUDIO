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
    const albums = DB.get('albums') || []

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
      deposits, withdrawals, monthDeposits, monthWithdrawals, monthDepositSum, monthWithdrawalSum, recentDeposits,
      persProjects, albums, customerRequests: requests
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

  _sameDay(date) {
    if (!date) return false
    const today = Utils.todayJalali()
    if (typeof Utils.normJalali === 'function') {
      return Utils.normJalali(date) === Utils.normJalali(today)
    }
    return String(date) === String(today)
  },

  _coupleName(item) {
    if (!item) return 'مراسم'
    const couple = String(item.couple || '').trim()
    if (couple) return couple
    return `${item.groom || ''} و ${item.bride || ''}`.replace(/^ و | و $/g, '').trim() || item.title || item.client || 'مراسم'
  },

  _timeSort(value) {
    const match = String(value || '').match(/(\d{1,2}):(\d{2})/)
    return match ? (Number(match[1]) * 60) + Number(match[2]) : 24 * 60
  },

  _greet() {
    const hour = new Date().getHours()
    if (hour < 5) return 'شب بخیر'
    if (hour < 12) return 'صبح بخیر'
    if (hour < 17) return 'ظهر بخیر'
    if (hour < 20) return 'عصر بخیر'
    return 'شب بخیر'
  },

  _staffIdsFor(item) {
    const ids = []
    if (item?.personnelId) ids.push(item.personnelId)
    if (item?.photographerId) ids.push(item.photographerId)
    if (item?.videographerId) ids.push(item.videographerId)
    if (item?.assignedTo) ids.push(item.assignedTo)
    ;(item?.team || []).forEach(member => {
      const id = typeof member === 'string' ? member : member?.personnelId
      if (id) ids.push(id)
    })
    return ids
  },

  _teamLabel(item, personnel, persProjects = []) {
    const names = []
    this._staffIdsFor(item).forEach(id => {
      const person = personnel.find(p => p.id === id)
      if (person?.name) names.push(person.name)
    })
    persProjects.filter(project => project.contractId && project.contractId === item.id).forEach(project => {
      if (project.personnelName) names.push(project.personnelName)
    })
    return [...new Set(names)].join('، ') || '—'
  },

  _opsModel(ctx) {
    const today = Utils.todayJalali()
    const monthKey = this._monthRef(0).key
    const contracts = ctx.contracts || []
    const bookings = ctx.bookings || []
    const personnel = (ctx.personnel || []).filter(person => person.status !== 'inactive')
    const persProjects = ctx.persProjects || []
    const albums = ctx.albums || []
    const cheques = ctx.cheques || []
    const todayEvents = []

    contracts.filter(contract => this._sameDay(contract.eventDate || contract.date) && contract.status !== 'cancelled').forEach(contract => {
      const done = contract.status === 'completed' || contract.status === 'delivered'
      todayEvents.push({
        kind: 'ceremony',
        id: contract.id,
        time: contract.eventTime || '—',
        sort: this._timeSort(contract.eventTime),
        title: this._coupleName(contract),
        venue: contract.venue || 'محل ثبت نشده',
        pkg: contract.package || 'مراسم',
        team: this._teamLabel(contract, personnel, persProjects),
        status: contract.status,
        statusLabel: done ? 'انجام‌شده' : (contract.status === 'active' ? 'فعال' : (contract.status || 'ثبت‌شده')),
        done,
        route: 'contracts'
      })
    })

    bookings.filter(booking => this._sameDay(booking.date) && booking.status !== 'cancelled').forEach(booking => {
      const done = booking.status === 'completed'
      todayEvents.push({
        kind: 'booking',
        id: booking.id,
        time: booking.time || '—',
        sort: this._timeSort(booking.time),
        title: booking.title || booking.client || 'نوبت',
        venue: booking.location || booking.client || 'مشاوره',
        pkg: 'نوبت',
        team: this._teamLabel(booking, personnel),
        status: booking.status,
        statusLabel: done ? 'انجام‌شده' : (booking.status === 'confirmed' ? 'تأیید شده' : 'زمان‌بندی شده'),
        done,
        route: 'bookings'
      })
    })

    todayEvents.sort((a, b) => a.sort - b.sort || String(a.title).localeCompare(String(b.title), 'fa'))

    const followups = []
    bookings.filter(booking => booking.status === 'scheduled' || booking.status === 'unconfirmed').forEach(booking => {
      followups.push({
        tone: 'warning',
        icon: 'fa-calendar-plus',
        title: booking.title || booking.client || 'نوبت تأییدنشده',
        meta: `${booking.date || today} ${booking.time || ''}`.trim(),
        route: 'bookings',
        priority: 1
      })
    })
    cheques.filter(cheque => {
      const days = Utils.daysUntil(cheque.dueDate)
      return cheque.status !== 'cleared' && cheque.status !== 'paid' && days !== null && days <= 0
    }).forEach(cheque => {
      followups.push({
        tone: 'danger',
        icon: 'fa-money-check',
        title: `چک ${cheque.number || ''}`.trim(),
        meta: cheque.dueDate || 'سررسید گذشته',
        route: 'accounting',
        priority: 0
      })
    })
    contracts.filter(contract => {
      const days = Utils.daysUntil(contract.deliveryDate)
      return contract.deliveryDate && contract.status !== 'cancelled' && contract.status !== 'delivered' && days !== null && days <= 0
    }).forEach(contract => {
      followups.push({
        tone: 'danger',
        icon: 'fa-box-open',
        title: `تحویل ${this._coupleName(contract)}`,
        meta: contract.deliveryDate,
        route: 'contracts',
        priority: 0
      })
    })
    albums.filter(album => ['selection', 'waiting_customer', 'in_review', 'design'].includes(album.status)).forEach(album => {
      followups.push({
        tone: 'info',
        icon: 'fa-book-open',
        title: album.title || album.couple || 'آلبوم در انتظار',
        meta: album.status === 'selection' ? 'در انتظار انتخاب مشتری' : 'در مسیر تولید',
        route: 'contracts',
        priority: 2
      })
    })
    if ((ctx.openInbox || 0) > 0) {
      followups.push({
        tone: 'info',
        icon: 'fa-inbox',
        title: `${Number(ctx.openInbox).toLocaleString('fa-IR')} درخواست باز مشتری`,
        meta: 'صندوق ورودی',
        route: 'inbox',
        priority: 2
      })
    }
    followups.sort((a, b) => a.priority - b.priority)

    const busyIds = new Set()
    persProjects.filter(project => this._sameDay(project.eventDate)).forEach(project => {
      if (project.personnelId) busyIds.add(project.personnelId)
    })
    todayEvents.forEach(event => {
      const source = event.kind === 'ceremony'
        ? contracts.find(contract => contract.id === event.id)
        : bookings.find(booking => booking.id === event.id)
      this._staffIdsFor(source || {}).forEach(id => busyIds.add(id))
    })

    const freeStaff = personnel.filter(person => !busyIds.has(person.id))
    const busyStaff = personnel.filter(person => busyIds.has(person.id))
    const performance = personnel.map(person => {
      const fromProjects = persProjects.filter(project => project.personnelId === person.id && String(project.eventDate || '').startsWith(monthKey)).length
      const fromContracts = contracts.filter(contract =>
        String(contract.eventDate || contract.date || '').startsWith(monthKey) &&
        contract.status !== 'cancelled' &&
        this._staffIdsFor(contract).includes(person.id)
      ).length
      return {
        id: person.id,
        name: person.name,
        role: person.role || 'همکار',
        sessions: fromProjects + fromContracts
      }
    }).sort((a, b) => b.sessions - a.sessions || String(a.name).localeCompare(String(b.name), 'fa'))

    return {
      today,
      todayEvents,
      completedCount: todayEvents.filter(event => event.done).length,
      unconfirmedCount: bookings.filter(booking => booking.status === 'scheduled' || booking.status === 'unconfirmed').length,
      followups: followups.slice(0, 8),
      followupCount: followups.length,
      freeStaff,
      busyStaff,
      performance,
      maxSessions: Math.max(1, ...performance.map(item => item.sessions))
    }
  },

  _opsStat(label, value, meta, icon, tone, route) {
    return `<button type="button" class="sm-ops-stat is-${tone}" onclick="SMDashboard.go('${route}')">
      <span class="sm-ops-stat-icon" aria-hidden="true"><i class="fas ${icon}"></i></span>
      <span class="sm-ops-stat-copy">
        <span class="sm-ops-stat-label">${SM.esc(label)}</span>
        <strong>${Number(value || 0).toLocaleString('fa-IR')}</strong>
        <small>${SM.esc(meta)}</small>
      </span>
    </button>`
  },

  _opsTodayDashboard(ctx, opts = {}) {
    const ops = this._opsModel(ctx)
    const user = typeof SM !== 'undefined' ? SM.user?.() : null
    const studio = typeof SM !== 'undefined' ? SM.studio?.() : null
    const greet = this._greet()
    const name = user?.name || 'همکار'
    const studioName = studio?.name || 'استودیو'
    const financeNote = opts.financeHidden
      ? `${SM.esc(ops.today)} · اطلاعات مالی فقط برای مدیر استودیو نمایش داده می‌شود`
      : `${SM.esc(ops.today)} · برنامه زنده استودیو`
    const schedule = ops.todayEvents.length
      ? `<div class="sm-ops-table-wrap"><table>
          <thead><tr><th>ساعت</th><th>مراسم / نوبت</th><th>محل</th><th>تیم</th><th>وضعیت</th></tr></thead>
          <tbody>${ops.todayEvents.map(event => `<tr>
            <td class="sm-ops-time">${SM.esc(event.time)}</td>
            <td><button type="button" class="sm-ops-linkish" onclick="SMDashboard.go('${event.route}')">${SM.esc(event.title)}</button><small>${SM.esc(event.pkg)}</small></td>
            <td>${SM.esc(event.venue)}</td>
            <td>${SM.esc(event.team)}</td>
            <td>${SMUI.badge(event.statusLabel, event.done ? 'success' : event.status === 'scheduled' ? 'warning' : 'info')}</td>
          </tr>`).join('')}</tbody>
        </table></div>`
      : SMUI.empty('fa-calendar', 'مراسم یا نوبتی برای امروز ثبت نشده')
    const followups = ops.followups.length
      ? `<div class="sm-ops-followups">${ops.followups.map(item => `<button type="button" class="sm-ops-follow is-${item.tone}" onclick="SMDashboard.go('${item.route}')">
          <i class="fas ${item.icon}"></i>
          <span><b>${SM.esc(item.title)}</b><small>${SM.esc(item.meta)}</small></span>
          <i class="fas fa-chevron-left sm-ops-chevron"></i>
        </button>`).join('')}</div>`
      : SMUI.empty('fa-circle-check', 'پیگیری فوری برای امروز نیست')
    const free = ops.freeStaff.length
      ? `<div class="sm-ops-chips">${ops.freeStaff.map(person => `<span class="sm-ops-chip"><i>${SM.esc((person.name || '؟').slice(0, 1))}</i><b>${SM.esc(person.name)}</b><small>${SM.esc(person.role || 'همکار')}</small></span>`).join('')}</div>`
      : SMUI.empty('fa-user-check', ops.busyStaff.length ? 'همه تیم امروز درگیر مراسم هستند' : 'پرسنل فعالی ثبت نشده')
    const perf = ops.performance.length
      ? `<div class="sm-ops-perf">${ops.performance.slice(0, 6).map(person => `<div class="sm-ops-perf-row">
          <span><b>${SM.esc(person.name)}</b><small>${SM.esc(person.role)}</small></span>
          <span class="sm-ops-perf-track"><i style="width:${Math.max(person.sessions ? 8 : 0, Math.round((person.sessions / ops.maxSessions) * 100))}%"></i></span>
          <strong>${person.sessions.toLocaleString('fa-IR')}</strong>
        </div>`).join('')}</div>`
      : SMUI.empty('fa-chart-simple', 'برای سنجش عملکرد، پرسنل و آفیش ثبت کنید')

    return `<div class="sm-ops-dashboard">
      <section class="sm-ops-hero">
        <div>
          <span class="sm-ops-eyebrow">عملیات امروز</span>
          <h2>${SM.esc(greet)}، ${SM.esc(name)}</h2>
          <p>امروز در استودیو ${SM.esc(studioName)} · ${financeNote}</p>
        </div>
        <div class="sm-ops-hero-actions">
          ${SMUI.moduleSearch('dashboard', 'جستجو در مراسم و مشتری...')}
          <button type="button" class="sm-btn sm-btn-primary sm-ops-cta" onclick="SMModules.bookings.add()"><i class="fas fa-plus"></i> افزودن نوبت</button>
        </div>
      </section>
      <div class="sm-ops-stats" role="list">
        ${this._opsStat('مراسم امروز', ops.todayEvents.length, 'قرارداد و نوبت همین روز', 'fa-heart', 'gold', 'calendar')}
        ${this._opsStat('انجام‌شده', ops.completedCount, 'تحویل یا اتمام امروز', 'fa-circle-check', 'green', 'contracts')}
        ${this._opsStat('نیازمند پیگیری', ops.followupCount, 'آلبوم، چک، تحویل و صندوق', 'fa-bell', 'orange', 'inbox')}
        ${this._opsStat('نوبت تأییدنشده', ops.unconfirmedCount, 'رزرو در انتظار تأیید', 'fa-calendar-plus', 'blue', 'bookings')}
      </div>
      <div class="sm-ops-grid sm-ops-grid--main">
        <section class="sm-ops-card">
          <div class="sm-ops-card-head">
            <div><span class="sm-ops-eyebrow">اولویت امروز</span><h3>پیگیری‌ها</h3></div>
            <button type="button" class="sm-exec-link" onclick="SMDashboard.go('inbox')">صندوق <i class="fas fa-arrow-left"></i></button>
          </div>
          ${followups}
        </section>
        <section class="sm-ops-card">
          <div class="sm-ops-card-head">
            <div><span class="sm-ops-eyebrow">زمان‌بندی</span><h3>برنامه امروز</h3></div>
            <button type="button" class="sm-exec-link" onclick="SMDashboard.go('calendar')">تقویم <i class="fas fa-arrow-left"></i></button>
          </div>
          ${schedule}
        </section>
      </div>
      <div class="sm-ops-grid sm-ops-grid--team">
        <section class="sm-ops-card">
          <div class="sm-ops-card-head">
            <div><span class="sm-ops-eyebrow">تیم</span><h3>ظرفیت آزاد</h3></div>
            <button type="button" class="sm-exec-link" onclick="SMDashboard.go('employees')">${ops.freeStaff.length.toLocaleString('fa-IR')} نفر آزاد <i class="fas fa-arrow-left"></i></button>
          </div>
          ${free}
        </section>
        <section class="sm-ops-card">
          <div class="sm-ops-card-head">
            <div><span class="sm-ops-eyebrow">ماه جاری</span><h3>عملکرد تیم</h3></div>
            <button type="button" class="sm-exec-link" onclick="SMDashboard.go('reports')">گزارش <i class="fas fa-arrow-left"></i></button>
          </div>
          ${perf}
        </section>
      </div>
    </div>`
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

  _kpiCard(label, value, meta, icon, color, route, trend = null, inverse = false) {
    return `<button type="button" class="sm-exec-kpi" style="--kpi-color:${color}" onclick="SMDashboard.go('${route}')">
      <span class="sm-exec-kpi-icon"><i class="fas ${icon}"></i></span>
      <span class="sm-exec-kpi-label">${SM.esc(label)}</span>
      <strong>${SM.fmt(value)}</strong>
      <span class="sm-exec-kpi-foot">${trend === null ? '' : this._trendBadge(trend, inverse)}<small>${SM.esc(meta)}</small></span>
    </button>`
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

  _assistantPanel(insights) {
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
    return this._opsTodayDashboard(ctx, { financeHidden: true })
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

    el.innerHTML = `
      ${this._opsTodayDashboard(ctx)}
      <div class="sm-exec-dashboard sm-exec-dashboard--after-ops">
        <div class="sm-exec-toolbar">
          <div><span class="sm-exec-eyebrow">نمای لحظه‌ای استودیو</span><h2>پیشخوان مدیریت</h2><p>${SM.esc(Utils.todayJalali())} · همه ارقام به تومان</p></div>
          <div class="sm-exec-toolbar-actions">
            <button type="button" class="sm-btn sm-btn-ghost" onclick="window.location.href='../contract.html'"><i class="fas fa-file-signature"></i> قرارداد جدید</button>
          </div>
        </div>
        <div class="sm-exec-kpis">
          ${this._kpiCard('وصول این ماه', finance.monthIncome, 'نسبت به ماه قبل', 'fa-wallet', '#34D399', 'accounting', finance.incomeTrend)}
          ${this._kpiCard('هزینه این ماه', finance.monthExpense, 'نسبت به ماه قبل', 'fa-receipt', '#F87171', 'expenses', finance.expenseTrend, true)}
          ${this._kpiCard('سود خالص ماه', finance.net, 'وصول منهای هزینه', 'fa-chart-line', '#C9A96E', 'reports')}
          ${this._kpiCard('مانده مشتریان', ctx.outstanding, `${finance.overdue.length.toLocaleString('fa-IR')} قرارداد معوق`, 'fa-hourglass-half', '#F59E0B', 'contracts')}
          ${this._kpiCard('موجودی حساب‌ها', finance.bankBalance, 'مجموع بانک و صندوق', 'fa-building-columns', '#60A5FA', 'accounting')}
          ${this._kpiCard('مراسم ۳۰ روز', closeEvents, `${activeContracts.toLocaleString('fa-IR')} قرارداد فعال`, 'fa-calendar-check', '#A78BFA', 'calendar')}
        </div>
        <div class="sm-exec-grid sm-exec-grid--finance">
          <section class="sm-exec-panel sm-exec-forecast"><div class="sm-exec-panel-head"><div><span class="sm-exec-eyebrow">شش ماه اخیر</span><h3>وصول واقعی و برآورد قراردادی</h3></div><span class="sm-exec-note">برآورد = وصول ثبت‌شده + مانده قرارداد همان ماه</span></div>${this._forecastChart(forecasts)}</section>
          ${this._healthPanel(finance)}
        </div>
        <div class="sm-exec-grid sm-exec-grid--middle">
          ${this._expensePanel(expenses)}
          ${this._assistantPanel(insights)}
          ${this._workflowPanel(stages)}
        </div>
        <div class="sm-exec-grid sm-exec-grid--bottom">
          ${this._eventsPanel(ctx)}
          ${this._transactionsPanel(ctx)}
        </div>
      </div>
      `
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
