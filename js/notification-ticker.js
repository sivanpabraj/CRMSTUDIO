/* ══════════════════════════════════════════════
   یادآور لبه‌ای — هر ۲–۳ دقیقه یک اعلان
   Studio M · پرسنل · مشتری · ادمین
   ══════════════════════════════════════════════ */

const NotificationTicker = {
  INTERVAL_MIN: 120000,
  INTERVAL_MAX: 180000,
  DISPLAY_MS: 5500,
  FIRST_DELAY: 8000,

  _timer: null,
  _queue: [],
  _index: 0,
  _lastKey: '',
  _context: 'studio',
  _opts: {},
  _activeEl: null,

  init(context, opts = {}) {
    this.stop()
    this._context = context || 'studio'
    this._opts = opts
    this._index = 0
    this._lastKey = ''
    this._ensureStack()
    this._refreshQueue()
    setTimeout(() => this._showNext(), this.FIRST_DELAY)
    this._scheduleNext()
  },

  stop() {
    if (this._timer) clearTimeout(this._timer)
    this._timer = null
    this._dismissActive()
  },

  _ensureStack() {
    if (document.getElementById('notify-ticker-stack')) return
    const el = document.createElement('div')
    el.id = 'notify-ticker-stack'
    el.className = 'notify-ticker-stack'
    el.setAttribute('aria-live', 'polite')
    document.body.appendChild(el)
  },

  _scheduleNext() {
    const delay = this.INTERVAL_MIN + Math.random() * (this.INTERVAL_MAX - this.INTERVAL_MIN)
    this._timer = setTimeout(() => {
      this._refreshQueue()
      this._showNext()
      this._scheduleNext()
    }, delay)
  },

  _refreshQueue() {
    try {
      if (this._context === 'portal') this._queue = this._collectPortal()
      else if (this._context === 'customer') this._queue = this._collectCustomer()
      else this._queue = this._collectStudio()
    } catch {
      this._queue = []
    }
    if (!this._queue.length) {
      this._queue = [{
        key: 'empty',
        icon: 'fa-bell-slash',
        color: '#64748B',
        title: 'اعلان جدیدی نیست',
        text: 'یادآوری‌ها و رویدادها اینجا نمایش داده می‌شوند.'
      }]
    }
  },

  _collectStudio() {
    const items = []
    const today = Utils.todayJalali()
    const push = (item) => items.push(item)

    ;(DB.get('notifications') || []).filter(n => !n.read).slice(0, 15).forEach(n => {
      push({
        key: `n-${n.id}`,
        icon: 'fa-bell',
        color: '#0071E3',
        title: n.title || 'اعلان',
        text: n.text || '',
        notificationId: n.id,
        route: 'notifications'
      })
    })

    this._calendarToday(today).forEach((e, i) => {
      push({
        key: `cal-${e.id || i}`,
        icon: 'fa-calendar-day',
        color: '#E68619',
        title: 'یادآوری امروز',
        text: `${e.title || ''}${e.time ? ` — ${e.time}` : ''}`.trim(),
        route: 'calendar'
      })
    })

    ;(DB.active('cheques') || []).forEach(c => {
      if (c.status === 'passed' || c.status === 'cancelled') return
      const d = Utils.daysUntil(c.dueDate)
      if (d === null || d < 0 || d > 7) return
      push({
        key: `ch-${c.id}`,
        icon: 'fa-money-check',
        color: '#FF3B30',
        title: 'سررسید چک',
        text: `${c.number || 'چک'} — ${Utils.fmtNum(c.amount || 0)} تومان — ${d === 0 ? 'امروز' : `${d} روز مانده`}`,
        route: 'accounting'
      })
    })

    const pending = (DB.get('customerRequests') || []).filter(r => r.status === 'pending').length
    if (pending) {
      push({
        key: 'inbox-pending',
        icon: 'fa-inbox',
        color: '#5856D6',
        title: 'درخواست مشتری',
        text: `${pending.toLocaleString('fa-IR')} درخواست در انتظار تأیید`,
        route: 'inbox'
      })
    }

    ;(DB.active('contracts') || []).forEach(c => {
      if (c.status === 'cancelled') return
      const d = Utils.daysUntil(c.eventDate || c.date)
      if (d === null || d < 0 || d > 7) return
      push({
        key: `wed-${c.id}`,
        icon: 'fa-heart',
        color: '#FF375F',
        title: d === 0 ? 'مراسم امروز' : 'مراسم نزدیک',
        text: `${c.couple || `${c.bride || ''} و ${c.groom || ''}`.trim()} — ${c.eventDate || c.date || ''}`,
        route: 'contracts'
      })
    })

    const custody = (DB.get('customerCustody') || []).filter(x => {
      if (x.status === 'returned' || x.returnedAt) return false
      const d = Utils.daysUntil(x.dueDate)
      return d !== null && d >= 0 && d <= 3
    })
    custody.slice(0, 3).forEach(x => {
      push({
        key: `cust-${x.id}`,
        icon: 'fa-usb-drive',
        color: '#009688',
        title: 'تحویل امانت مشتری',
        text: `${x.customerName || 'مشتری'} — ${x.itemDesc || x.itemType || 'امانت'}`,
        route: 'custody'
      })
    })

    return items
  },

  _calendarToday(today) {
    if (typeof SMCalendar !== 'undefined' && SMCalendar.eventsForDate) {
      return SMCalendar.eventsForDate(today).slice(0, 6)
    }
    const out = []
    ;(DB.get('calendarReminders') || []).forEach(r => {
      if (Utils.normJalali(r.date) !== today) return
      out.push({ id: r.id, title: r.title, time: r.time || '' })
    })
    ;(DB.get('appointments') || []).forEach(a => {
      if (Utils.normJalali(a.date) !== today) return
      out.push({ id: a.id, title: a.title || 'نوبت', time: a.time || '' })
    })
    return out.slice(0, 6)
  },

  _collectPortal() {
    const items = []
    const user = typeof Auth !== 'undefined' ? Auth.getUser() : null
    const personnel = user
      ? (DB.findPersonnelByUserId(user.id) || DB.findPersonnelByPhone(user.phone))
      : null
    if (!personnel) return items

    const push = (item) => items.push(item)

    DB.filter('persProjects', p => p.personnelId === personnel.id && p.accepted === null).forEach(p => {
      push({
        key: `inv-${p.id}`,
        icon: 'fa-envelope-open-text',
        color: '#E68619',
        title: 'آفیش جدید',
        text: `${p.couple || '—'} — نقش: ${p.role || '—'}`
      })
    })

    DB.filter('persProjects', p => p.personnelId === personnel.id && p.accepted === true).forEach(p => {
      const dl = typeof PortalShared !== 'undefined' ? PortalShared.getDeadlineInfo(p.deadline) : null
      if (!dl?.urgent && !dl?.overdue) return
      push({
        key: `dl-${p.id}`,
        icon: 'fa-clock',
        color: dl.overdue ? '#FF3B30' : '#FF9500',
        title: 'مهلت تحویل',
        text: `${p.couple || '—'}: ${dl.text}`
      })
    })

    ;(DB.get('persContracts') || []).filter(c =>
      c.personnelId === personnel.id && c.type === 'employment' &&
      c.status !== 'verified' && c.status !== 'rejected'
    ).forEach(c => {
      push({
        key: `emp-${c.id}`,
        icon: 'fa-file-signature',
        color: '#5856D6',
        title: 'قرارداد همکاری',
        text: `${c.studioName || 'استودیو'} — منتظر تأیید شما`
      })
    })

    const t = Utils.parseJalaliToday()
    if (typeof PortalShared !== 'undefined' && PortalShared.calculatePayroll) {
      const calc = PortalShared.calculatePayroll(personnel, Utils.formatJalali(t.jy, t.jm, 1).slice(0, 7))
      if (calc && !calc.alreadyPaid && calc.total > 0) {
        push({
          key: `pay-${calc.month}`,
          icon: 'fa-wallet',
          color: '#34C759',
          title: 'حقوق ماه جاری',
          text: `${calc.monthLabel} — ${Utils.fmtNum(calc.total)} تومان (در انتظار پرداخت)`
        })
      }
    }

    ;(DB.get('notifications') || []).filter(n => !n.read).slice(0, 8).forEach(n => {
      push({
        key: `pn-${n.id}`,
        icon: 'fa-bell',
        color: '#0071E3',
        title: n.title || 'اعلان',
        text: n.text || ''
      })
    })

    return items
  },

  _collectCustomer() {
    const items = []
    const contractId = this._opts.contractId
    const c = contractId
      ? DB.find('contracts', x => x.id === contractId)
      : (typeof CustomerPortal !== 'undefined' ? CustomerPortal.state?.contract : null)
    if (!c) return items

    const push = (item) => items.push(item)
    const persProjects = DB.filter('persProjects', p => p.contractId === c.id)

    if (typeof PortalShared !== 'undefined') {
      const queue = PortalShared.getCustomerQueue(c)
      if (queue.stage < 2) {
        push({
          key: 'queue',
          icon: 'fa-hourglass-half',
          color: '#0071E3',
          title: 'وضعیت نوبت',
          text: queue.statusText
        })
      }
      const live = PortalShared.getCustomerLiveStatus(c, persProjects)
      push({
        key: 'live',
        icon: 'fa-clapperboard',
        color: '#5856D6',
        title: 'روند پروژه',
        text: live.label
      })
      const dl = PortalShared.getDeadlineInfo(c.deliveryDate)
      if (dl) {
        push({
          key: 'delivery',
          icon: 'fa-box-open',
          color: dl.overdue ? '#FF3B30' : '#34C759',
          title: 'زمان تحویل',
          text: dl.text
        })
      }
    }

    const d = Utils.daysUntil(c.eventDate || c.date)
    if (d !== null && d >= 0 && d <= 14) {
      push({
        key: 'event',
        icon: 'fa-heart',
        color: '#FF375F',
        title: d === 0 ? 'مراسم شما امروز است' : 'مراسم نزدیک',
        text: `${c.eventDate || c.date || ''} — ${c.venue || ''}`.trim()
      })
    }

    DB.filter('customerRequests', r => r.contractId === c.id && r.status === 'pending').forEach(r => {
      push({
        key: `req-p-${r.id}`,
        icon: 'fa-paper-plane',
        color: '#FF9500',
        title: 'درخواست شما',
        text: 'در انتظار بررسی مدیر استودیو'
      })
    })

    DB.filter('customerRequests', r => r.contractId === c.id && r.status === 'sent_to_editing').slice(-2).forEach(r => {
      const label = typeof PortalShared !== 'undefined'
        ? PortalShared.getCustomerRequestStatus(r)
        : 'تأیید شد'
      push({
        key: `req-ok-${r.id}`,
        icon: 'fa-circle-check',
        color: '#34C759',
        title: 'به‌روزرسانی درخواست',
        text: label
      })
    })

    return items
  },

  _showNext() {
    if (!this._queue.length) this._refreshQueue()
    if (!this._queue.length) return

    let tries = 0
    let item
    while (tries < this._queue.length) {
      item = this._queue[this._index % this._queue.length]
      this._index++
      tries++
      if (item.key !== this._lastKey || this._queue.length === 1) break
    }
    if (!item) return
    this._lastKey = item.key
    this._render(item)
  },

  _render(item) {
    this._dismissActive()
    const stack = document.getElementById('notify-ticker-stack')
    if (!stack) return

    const el = document.createElement('div')
    el.className = 'notify-ticker-item'
    el.style.setProperty('--nt-color', item.color || '#0071E3')
    el.style.setProperty('--nt-duration', `${this.DISPLAY_MS}ms`)
    el.innerHTML = `
      <div class="notify-ticker-icon"><i class="fas ${item.icon || 'fa-bell'}"></i></div>
      <div class="notify-ticker-body">
        <div class="notify-ticker-title">${Utils.escapeHtml(item.title || '')}</div>
        <div class="notify-ticker-text">${Utils.escapeHtml(item.text || '')}</div>
      </div>
      <button type="button" class="notify-ticker-close" aria-label="بستن">×</button>
      <div class="notify-ticker-progress"><span></span></div>`

    el.querySelector('.notify-ticker-close')?.addEventListener('click', (e) => {
      e.stopPropagation()
      this._dismissActive()
    })

    el.addEventListener('click', () => {
      if (item.notificationId) {
        const n = DB.find('notifications', x => x.id === item.notificationId)
        if (n && !n.read) DB.update('notifications', item.notificationId, { read: true })
      }
      if (item.route && this._context === 'studio' && typeof SM !== 'undefined') {
        SM.navigate(item.route)
      }
      this._dismissActive()
    })

    stack.appendChild(el)
    this._activeEl = el
    this._hideTimer = setTimeout(() => this._dismissActive(), this.DISPLAY_MS)
  },

  _dismissActive() {
    if (this._hideTimer) clearTimeout(this._hideTimer)
    this._hideTimer = null
    if (!this._activeEl) return
    const el = this._activeEl
    this._activeEl = null
    el.classList.add('is-out')
    setTimeout(() => el.remove(), 280)
  }
}

window.NotificationTicker = NotificationTicker
