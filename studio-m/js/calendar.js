/* Studio M — تقویم شمسی، رویدادها و یادآوری SMS */

const SMCalendar = {
  _viewYear: null,
  _viewMonth: null,
  _selectedDate: null,

  EVENT_TYPES: {
    wedding: { label: 'عروسی', color: '#E68619', icon: 'fa-heart' },
    booking: { label: 'رزرو / مشاوره', color: '#0071E3', icon: 'fa-calendar-check' },
    appointment: { label: 'نوبت', color: '#00A3BF', icon: 'fa-clock' },
    reminder: { label: 'یادآوری شخصی', color: '#34C759', icon: 'fa-bell' },
    cheque: { label: 'سررسید چک', color: '#FF3B30', icon: 'fa-money-check' },
    anniversary: { label: 'سالگرد عروسی', color: '#5856D6', icon: 'fa-cake-candles' }
  },

  _initView() {
    const t = Utils.parseJalaliToday()
    if (!this._viewYear) this._viewYear = t.jy
    if (!this._viewMonth) this._viewMonth = t.jm
    if (!this._selectedDate) this._selectedDate = Utils.todayJalali()
  },

  _couple(c) {
    if (c.couple) return c.couple
    const b = c.bride || '', g = c.groom || ''
    return b && g ? `${b} و ${g}` : b || g || '—'
  },

  _eventsForMonth(jy, jm) {
    const map = {}
    const add = (date, ev) => {
      const key = Utils.normJalali(date)
      if (!key) return
      const p = Utils.parseJalali(key)
      if (!p || p.jy !== jy || p.jm !== jm) return
      if (!map[key]) map[key] = []
      map[key].push(ev)
    }

    DB.get('contracts').forEach(c => {
      if (c.status === 'cancelled') return
      const d = c.eventDate || c.date
      if (!d) return
      add(d, {
        id: `contract-${c.id}`,
        type: 'wedding',
        title: `عروسی ${this._couple(c)}`,
        date: Utils.normJalali(d),
        time: c.time || '',
        detail: c.venue ? `تالار: ${c.venue}` : '',
        src: 'contract',
        srcId: c.id,
        smsNotify: true,
        raw: c
      })
    })

    DB.get('contracts').forEach(c => {
      if (c.status === 'cancelled') return
      const ed = Utils.parseJalali(c.eventDate || c.date)
      if (!ed) return
      if (ed.jm !== jm) return
      if (jy <= ed.jy) return
      const date = Utils.formatJalali(jy, ed.jm, ed.jd)
      const years = jy - ed.jy
      add(date, {
        id: `anniversary-${c.id}-${jy}`,
        type: 'anniversary',
        title: `سالگرد عروسی ${this._couple(c)}`,
        date,
        detail: years === 1 ? 'یک سال از مراسم گذشت' : `${years} سال از مراسم`,
        src: 'contract',
        srcId: c.id,
        smsNotify: true,
        years,
        raw: c
      })
    })

    DB.get('bookings').forEach(b => {
      if (!b.date) return
      add(b.date, {
        id: `booking-${b.id}`,
        type: 'booking',
        title: b.title || 'رزرو / مشاوره',
        date: Utils.normJalali(b.date),
        time: b.time || '',
        detail: b.client ? `مشتری: ${b.client}` : '',
        src: 'booking',
        srcId: b.id,
        smsNotify: true,
        raw: b
      })
    })

    DB.get('appointments').forEach(a => {
      if (!a.date) return
      add(a.date, {
        id: `appt-${a.id}`,
        type: 'appointment',
        title: a.title || a.type || 'نوبت',
        date: Utils.normJalali(a.date),
        time: a.time || '',
        detail: a.client ? `مشتری: ${a.client}` : '',
        src: 'appointment',
        srcId: a.id,
        smsNotify: !!a.smsNotify,
        raw: a
      })
    })

    DB.get('cheques').forEach(ch => {
      if (!ch.dueDate || ch.status === 'passed') return
      add(ch.dueDate, {
        id: `cheque-${ch.id}`,
        type: 'cheque',
        title: `سررسید چک ${ch.number || ''}`.trim(),
        date: Utils.normJalali(ch.dueDate),
        time: '',
        detail: `${Utils.fmtNum(ch.amount || 0)} تومان — ${ch.party || '—'}`,
        src: 'cheque',
        srcId: ch.id,
        smsNotify: true,
        raw: ch
      })
    })

    DB.get('calendarReminders').forEach(r => {
      if (!r.date) return
      const rd = Utils.parseJalali(r.date)
      if (!rd) return
      const dates = r.repeatYearly && rd.jm === jm
        ? [Utils.formatJalali(jy, rd.jm, rd.jd)]
        : (Utils.normJalali(r.date) && Utils.parseJalali(r.date)?.jy === jy && Utils.parseJalali(r.date)?.jm === jm ? [Utils.normJalali(r.date)] : [])
      dates.forEach(date => {
        add(date, {
          id: `reminder-${r.id}${r.repeatYearly ? `-${jy}` : ''}`,
          type: 'reminder',
          title: r.title || 'یادآوری',
          date,
          time: r.time || '',
          detail: r.notes || (r.repeatYearly ? 'تکرار سالانه' : ''),
          src: 'reminder',
          srcId: r.id,
          smsNotify: r.smsNotify !== false,
          repeatYearly: !!r.repeatYearly,
          raw: r
        })
      })
    })

    Object.keys(map).forEach(k => {
      map[k].sort((a, b) => (a.time || '').localeCompare(b.time || ''))
    })
    return map
  },

  eventsForDate(date) {
    const p = Utils.parseJalali(date)
    if (!p) return []
    return (this._eventsForMonth(p.jy, p.jm)[Utils.normJalali(date)] || []).filter(e => this._matchSearch(e))
  },

  _matchSearch(e) {
    const q = SM.getModuleSearch('calendar')
    if (!q) return true
    return [e.title, e.detail, e.type, e.time].join(' ').toLowerCase().includes(q)
  },

  _filterEventMap(eventMap) {
    const q = SM.getModuleSearch('calendar')
    if (!q) return eventMap
    const out = {}
    Object.entries(eventMap).forEach(([date, events]) => {
      const filtered = events.filter(e => this._matchSearch(e))
      if (filtered.length) out[date] = filtered
    })
    return out
  },

  _dominantType(events) {
    const order = ['wedding', 'cheque', 'anniversary', 'booking', 'reminder', 'appointment']
    for (const t of order) {
      if (events.some(e => e.type === t)) return t
    }
    return events[0]?.type || 'reminder'
  },

  _renderLegend() {
    return `<div class="sm-cal-legend">${Object.entries(this.EVENT_TYPES).map(([_k, v]) =>
      `<span class="sm-cal-legend-item"><i class="fas ${v.icon}" style="color:${v.color}"></i> ${v.label}</span>`
    ).join('')}</div>`
  },

  _renderGrid(jy, jm, eventMap) {
    const today = Utils.todayJalali()
    const daysInMonth = Utils.jalaliMonthDays(jy, jm)
    const startWd = Utils.jalaliMonthStartWeekday(jy, jm)
    const weekdays = Utils.jalaliWeekdaysShort()
    let html = `<div class="sm-cal-weekdays">${weekdays.map(w => `<span>${w}</span>`).join('')}</div><div class="sm-cal-days">`

    for (let i = 0; i < startWd; i++) {
      html += `<div class="sm-cal-day sm-cal-day--empty"></div>`
    }

    for (let d = 1; d <= daysInMonth; d++) {
      const date = Utils.formatJalali(jy, jm, d)
      const events = eventMap[date] || []
      const isToday = date === today
      const isSelected = date === this._selectedDate
      const dominant = events.length ? this._dominantType(events) : null
      const meta = dominant ? this.EVENT_TYPES[dominant] : null
      const dots = [...new Set(events.map(e => e.type))].slice(0, 4).map(t =>
        `<span class="sm-cal-dot" style="background:${this.EVENT_TYPES[t]?.color || '#888'}"></span>`
      ).join('')

      html += `<button type="button" class="sm-cal-day${isToday ? ' is-today' : ''}${isSelected ? ' is-selected' : ''}${events.length ? ' has-events' : ''}"
        style="${meta ? `--cal-accent:${meta.color}` : ''}"
        data-date="${date}"
        onclick="SMCalendar.pickDay('${date}')" aria-label="${date}">
        <span class="sm-cal-day-num">${d.toLocaleString('fa-IR')}</span>
        ${events.length ? `<span class="sm-cal-dots">${dots}</span>` : ''}
      </button>`
    }

    html += '</div>'
    return html
  },

  _renderDayPanel(date) {
    const events = this.eventsForDate(date)
    const p = Utils.parseJalali(date)
    const title = p ? `${p.jd.toLocaleString('fa-IR')} ${Utils.jalaliMonthName(p.jm)} ${p.jy.toLocaleString('fa-IR')}` : date

    return `<div class="sm-cal-day-panel">
      <div class="sm-cal-day-panel-head">
        <div>
          <strong>${SM.esc(title)}</strong>
          <span class="sm-cal-day-panel-sub">${events.length ? `${events.length.toLocaleString('fa-IR')} رویداد` : 'رویدادی ثبت نشده'}</span>
        </div>
        <button type="button" class="sm-btn sm-btn-sm sm-btn-primary" onclick="SMCalendar.addReminder('${date}')"><i class="fas fa-plus"></i> یادآوری</button>
      </div>
      ${events.length ? `<div class="sm-cal-event-list">${events.map(e => this._eventCard(e)).join('')}</div>` :
        `<div class="sm-cal-empty-day">روی این روز چیزی نیست — یادآوری شخصی (چک، دادگاه، قرار…) اضافه کنید.</div>`}
    </div>`
  },

  _eventCard(e) {
    const meta = this.EVENT_TYPES[e.type] || this.EVENT_TYPES.reminder
    const time = e.time ? `<span class="sm-cal-ev-time" dir="ltr">${SM.esc(e.time)}</span>` : ''
    let action = ''
    if (e.src === 'contract') {
      action = `<button type="button" class="sm-btn sm-btn-sm sm-btn-ghost" onclick="SMModules.contracts.view('${e.srcId}')">جزئیات عروسی</button>`
    } else if (e.src === 'booking') {
      action = `<button type="button" class="sm-btn sm-btn-sm sm-btn-ghost" onclick="SMModules.bookings.view('${e.srcId}')">مشاهده</button>`
    } else if (e.src === 'appointment') {
      action = `<button type="button" class="sm-btn sm-btn-sm sm-btn-ghost" onclick="SMCalendar.editAppointment('${e.srcId}')">ویرایش</button>`
    } else if (e.src === 'reminder') {
      action = `<button type="button" class="sm-btn sm-btn-sm sm-btn-ghost" onclick="SMCalendar.editReminder('${e.srcId}')">ویرایش</button>`
    } else if (e.src === 'cheque') {
      action = `<button type="button" class="sm-btn sm-btn-sm sm-btn-ghost" onclick="SM.navigate('accounting')">حسابداری</button>`
    }

    return `<div class="sm-cal-event" style="--cal-accent:${meta.color}">
      <div class="sm-cal-event-icon"><i class="fas ${meta.icon}"></i></div>
      <div class="sm-cal-event-body">
        <div class="sm-cal-event-top">${SMUI.badge(meta.label, 'muted')} ${time}</div>
        <div class="sm-cal-event-title">${SM.esc(e.title)}</div>
        ${e.detail ? `<div class="sm-cal-event-detail">${SM.esc(e.detail)}</div>` : ''}
        ${e.smsNotify ? `<div class="sm-cal-event-sms"><i class="fas fa-sms"></i> یادآوری پیامکی صبح</div>` : ''}
      </div>
      <div class="sm-cal-event-action">${action}</div>
    </div>`
  },

  render(el) {
    this._initView()
    const jy = this._viewYear
    const jm = this._viewMonth
    const eventMap = this._filterEventMap(this._eventsForMonth(jy, jm))
    const monthLabel = `${Utils.jalaliMonthName(jm)} ${jy.toLocaleString('fa-IR')}`

    el.innerHTML = `
      ${SMUI.sectionHead('تقویم شمسی', 'عروسی‌ها، سالگردها، چک‌ها و یادآوری‌های شخصی', `
        <button type="button" class="sm-btn sm-btn-primary" onclick="SMCalendar.addReminder()"><i class="fas fa-bell"></i> یادآوری جدید</button>`)}
      ${SMUI.moduleSearch('calendar', 'جستجو در تقویم — نام مراسم، یادآوری...')}
      <div class="sm-cal-wrap">
        <div class="sm-cal-main sm-card">
          <div class="sm-cal-toolbar">
            <button type="button" class="sm-btn sm-btn-sm sm-btn-ghost" onclick="SMCalendar.prevMonth()"><i class="fas fa-chevron-right"></i></button>
            <div class="sm-cal-month-label">${SM.esc(monthLabel)}</div>
            <button type="button" class="sm-btn sm-btn-sm sm-btn-ghost" onclick="SMCalendar.nextMonth()"><i class="fas fa-chevron-left"></i></button>
            <button type="button" class="sm-btn sm-btn-sm sm-btn-ghost" onclick="SMCalendar.goToday()">امروز</button>
          </div>
          ${this._renderLegend()}
          ${this._renderGrid(jy, jm, eventMap)}
        </div>
        <div id="sm-cal-day-panel">${this._renderDayPanel(this._selectedDate)}</div>
      </div>
      <div class="sm-cal-sms-note">
        <i class="fas fa-mobile-screen"></i>
        هر صبح (در صورت فعال بودن SMS) برای رویدادهای امروز — عروسی، سالگرد، چک و یادآوری‌های شخصی — پیامک یادآوری ارسال می‌شود.
      </div>`
  },

  refresh() { SMH.refresh('calendar') },

  prevMonth() {
    this._viewMonth--
    if (this._viewMonth < 1) { this._viewMonth = 12; this._viewYear-- }
    this.refresh()
  },

  nextMonth() {
    this._viewMonth++
    if (this._viewMonth > 12) { this._viewMonth = 1; this._viewYear++ }
    this.refresh()
  },

  goToday() {
    const t = Utils.parseJalaliToday()
    this._viewYear = t.jy
    this._viewMonth = t.jm
    this._selectedDate = Utils.todayJalali()
    this.refresh()
  },

  pickDay(date) {
    this._selectedDate = date
    const panel = document.getElementById('sm-cal-day-panel')
    if (panel) panel.innerHTML = this._renderDayPanel(date)
    document.querySelectorAll('.sm-cal-day[data-date]').forEach(el => {
      el.classList.toggle('is-selected', el.dataset.date === date)
    })
  },

  addReminder(presetDate) {
    const date = presetDate || this._selectedDate || Utils.todayJalali()
    SMUI.modal('یادآوری شخصی', `
      ${SMUI.formField('عنوان', 'cr-title', { placeholder: 'مثال: دادگاه / چک / قرار مهم' })}
      ${SMUI.formField('تاریخ', 'cr-date', { value: date })}
      ${SMUI.formField('ساعت', 'cr-time', { value: '09:00', dir: 'ltr' })}
      ${SMUI.formField('یادداشت', 'cr-notes', { type: 'textarea' })}
      <label class="sm-check-row"><input type="checkbox" id="cr-sms" checked/> ارسال پیامک یادآوری صبح</label>
      <label class="sm-check-row"><input type="checkbox" id="cr-repeat"/> تکرار سالانه (سالگرد شخصی)</label>`, {
      onSave: async () => {
        const d = SMUI.readForm(['cr-title', 'cr-date', 'cr-time', 'cr-notes'])
        if (!d['cr-title'] || !d['cr-date']) return SM.toast('عنوان و تاریخ الزامی است', 'error')
        await SecureDB.insert('calendarReminders', {
          title: d['cr-title'],
          date: d['cr-date'],
          time: d['cr-time'],
          notes: d['cr-notes'],
          smsNotify: document.getElementById('cr-sms')?.checked !== false,
          repeatYearly: document.getElementById('cr-repeat')?.checked || false,
          createdAt: Utils.todayJalali()
        })
        this._selectedDate = Utils.normJalali(d['cr-date'])
        SM.toast('یادآوری ثبت شد', 'success')
        this.refresh()
      }, width: 480
    })
  },

  editReminder(id) {
    const r = DB.find('calendarReminders', x => x.id === id)
    if (!r) return
    SMUI.modal('ویرایش یادآوری', `
      ${SMUI.formField('عنوان', 'cr-title', { value: r.title || '' })}
      ${SMUI.formField('تاریخ', 'cr-date', { value: r.date || '' })}
      ${SMUI.formField('ساعت', 'cr-time', { value: r.time || '', dir: 'ltr' })}
      ${SMUI.formField('یادداشت', 'cr-notes', { type: 'textarea', value: r.notes || '' })}
      <label class="sm-check-row"><input type="checkbox" id="cr-sms" ${r.smsNotify !== false ? 'checked' : ''}/> ارسال پیامک یادآوری صبح</label>
      <label class="sm-check-row"><input type="checkbox" id="cr-repeat" ${r.repeatYearly ? 'checked' : ''}/> تکرار سالانه</label>`, {
      onSave: async () => {
        const d = SMUI.readForm(['cr-title', 'cr-date', 'cr-time', 'cr-notes'])
        await SecureDB.update('calendarReminders', id, {
          title: d['cr-title'],
          date: d['cr-date'],
          time: d['cr-time'],
          notes: d['cr-notes'],
          smsNotify: document.getElementById('cr-sms')?.checked !== false,
          repeatYearly: document.getElementById('cr-repeat')?.checked || false
        })
        SM.toast('ذخیره شد', 'success')
        this.refresh()
      },
      onDelete: () => SMH.remove('calendarReminders', id, 'calendar')
    })
  },

  editAppointment(id) {
    const a = DB.find('appointments', x => x.id === id)
    if (!a) return
    SMUI.modal('ویرایش نوبت', `
      ${SMUI.formField('عنوان', 'ap-title', { value: a.title || '' })}
      ${SMUI.formField('نوع', 'ap-type', { value: a.type || '' })}
      ${SMUI.formField('تاریخ', 'ap-date', { value: a.date || '' })}
      ${SMUI.formField('ساعت', 'ap-time', { value: a.time || '', dir: 'ltr' })}
      ${SMUI.formField('مشتری', 'ap-client', { value: a.client || '' })}
      <label class="sm-check-row"><input type="checkbox" id="ap-sms" ${a.smsNotify ? 'checked' : ''}/> پیامک یادآوری صبح</label>`, {
      onSave: async () => {
        const d = SMUI.readForm(['ap-title', 'ap-type', 'ap-date', 'ap-time', 'ap-client'])
        await SecureDB.update('appointments', id, {
          title: d['ap-title'], type: d['ap-type'], date: d['ap-date'],
          time: d['ap-time'], client: d['ap-client'],
          smsNotify: document.getElementById('ap-sms')?.checked || false
        })
        this.refresh()
      },
      onDelete: () => SMH.remove('appointments', id, 'calendar')
    })
  },

  _reminderPhone() {
    const info = DB.get('studioInfo') || {}
    if (info.phone) return info.phone
    const mgr = (DB.get('users') || []).find(u => u.roles?.includes('studio_manager') || u.role === 'studio_manager')
    return mgr?.phone || ''
  },

  _smsAlreadySent(key) {
    try {
      const log = JSON.parse(localStorage.getItem('talar_cal_sms_log') || '[]')
      return log.includes(key)
    } catch { return false }
  },

  _markSmsSent(key) {
    try {
      const log = JSON.parse(localStorage.getItem('talar_cal_sms_log') || '[]')
      log.push(key)
      while (log.length > 120) log.shift()
      localStorage.setItem('talar_cal_sms_log', JSON.stringify(log))
    } catch { /* */ }
  },

  _buildMorningMessage(events) {
    const studio = DB.get('studioInfo')?.name || 'استودیو'
    const lines = events.map(e => {
      if (e.type === 'wedding') return `• امروز عروسی ${e.title.replace(/^عروسی\s*/, '')}${e.detail ? ' — ' + e.detail.replace('تالار: ', '') : ''}`
      if (e.type === 'anniversary') return `• تبریک ${e.title} — ${e.detail || ''}`
      if (e.type === 'cheque') return `• ${e.title}: ${e.detail || ''}`
      if (e.type === 'booking') return `• ${e.title}${e.detail ? ' — ' + e.detail : ''}`
      return `• ${e.title}${e.time ? ' ساعت ' + e.time : ''}${e.detail ? ' — ' + e.detail : ''}`
    })
    return `${studio}\nسلام، یادآوری امروز:\n${lines.join('\n')}`
  },

  async runMorningReminders() {
    const info = DB.get('studioInfo') || {}
    if (info.smsMorningReminders === false) return

    const today = Utils.todayJalali()
    const events = this.eventsForDate(today).filter(e => e.smsNotify !== false)
    if (!events.length) return

    const batchKey = `batch-${today}`
    if (this._smsAlreadySent(batchKey)) return

    const msg = this._buildMorningMessage(events)
    const phone = this._reminderPhone()

    await SecureDB.insert('notifications', {
      title: 'یادآوری تقویم — امروز',
      text: msg.replace(/\n/g, ' · '),
      read: false,
      createdAt: today
    })

    if (phone && typeof SmsProvider !== 'undefined' && SmsProvider.isConfigured()) {
      const res = await SmsProvider.sendStudio(phone, msg)
      if (res.ok) this._markSmsSent(batchKey)
    } else {
      this._markSmsSent(batchKey)
    }
  }
}

SMModules.calendar = {
  render(el) { SMCalendar.render(el) },
  runMorningReminders() { return SMCalendar.runMorningReminders() },
  addAppt() { SMCalendar.addReminder() },
  editAppt(id) { SMCalendar.editAppointment(id) },
  setTab() { SM.navigate('calendar') }
}

window.SMCalendar = SMCalendar
