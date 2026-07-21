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
    const rows = (name) => (typeof DB.active === 'function'
      ? DB.active(name)
      : (DB.get(name) || []).filter(i => i && !i._deleted))
    const contracts = rows('contracts')
    const tx = rows('transactions')
    const personnel = rows('personnel').filter(p => p.status === 'active')
    const bookings = rows('bookings')
    const cheques = rows('cheques')
    const persProjects = rows('persProjects')
    const expenses = rows('expenses')
    const requests = rows('customerRequests')

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
    const rows = (name) => (typeof DB.active === 'function'
      ? DB.active(name)
      : (DB.get(name) || []).filter(i => i && !i._deleted))
    rows('contracts').forEach(c => {
      if (c.status !== 'cancelled' && (c.eventDate || c.date)) add(c.eventDate || c.date)
    })
    rows('bookings').forEach(b => { if (b.date) add(b.date) })
    rows('appointments').forEach(a => { if (a.date) add(a.date) })
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
          <button type="button" class="sm-finance-link" ${SMEvents.attrs('SMDashboard.go', ["accounting"])} data-sm-stop="1"><i class="fas fa-calculator"></i> حسابداری</button>
          <button type="button" class="sm-finance-link" ${SMEvents.attrs('SMDashboard.go', ["invoices"])} data-sm-stop="1"><i class="fas fa-file-invoice"></i> فاکتور</button>
          <button type="button" class="sm-finance-link" ${SMEvents.attrs('SMDashboard.go', ["expenses"])} data-sm-stop="1"><i class="fas fa-receipt"></i> هزینه</button>
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
      ${typeof SMEvents !== 'undefined' ? SMEvents.elAttrs('SMDashboard.go', [meta.route]) : ''}>
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
    return `<div class="sm-event-card" style="--ev-color:${color}" ${SMEvents.attrs('SMDashboard.go', ["contracts"])} data-sm-stop="1">
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

  render(el) {
    const ctx = this._ctx()
    const cfg = this.getConfig()
    const dashQ = SM.getModuleSearch('dashboard')
    const edit = this._layoutEdit
    const blocks = []

    cfg.order.forEach(id => {
      if (!cfg.enabled.includes(id)) return
      const html = this._renderWidget(id, ctx, dashQ)
      if (html) blocks.push(this._block(id, html))
    })

    el.innerHTML = `
      ${SMUI.moduleSearch('dashboard', 'جستجو در داشبورد — مراسم، مشتری...')}
      <div class="sm-dash-layout-bar">
        <button type="button" class="sm-btn sm-btn-sm ${edit ? 'sm-btn-primary' : 'sm-btn-ghost'}" ${SMEvents.attrs('SMDashboard.toggleLayoutEdit')}>
          <i class="fas fa-arrows-up-down-left-right"></i> ${edit ? 'اتمام چیدمان' : 'جابه‌جایی ویجت‌ها'}
        </button>
        ${edit ? '<span class="sm-dash-layout-hint"><i class="fas fa-grip-vertical"></i> بکشید و رها کنید</span>' : ''}
        <button type="button" class="sm-btn sm-btn-sm sm-btn-ghost" ${SMEvents.attrs('SM.openSettingsTab', ['widgets'])} title="تنظیم ویجت‌ها">
          <i class="fas fa-sliders"></i>
        </button>
      </div>
      <div class="sm-dash-sortable${edit ? ' sm-dash--edit' : ''}" id="sm-dash-sortable">${blocks.join('')}</div>`

    this._bindSortable(el.querySelector('#sm-dash-sortable'))
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
