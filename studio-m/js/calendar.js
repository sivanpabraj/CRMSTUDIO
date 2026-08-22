/* Studio M — تقویم شمسی، رویدادها و یادآوری SMS */

const SMCalendar = {
  _viewYear: null,
  _viewMonth: null,
  _selectedDate: null,

  EVENT_TYPES: {
    wedding: { label: 'عروسی', color: '#E68619', icon: 'fa-heart' },
    engagement: { label: 'عقد', color: '#EC4899', icon: 'fa-rings-wedding' },
    formalite: { label: 'فرمالیته', color: '#8B5CF6', icon: 'fa-camera-retro' },
    clip: { label: 'کلیپ', color: '#0EA5E9', icon: 'fa-film' },
    album: { label: 'آلبوم', color: '#14B8A6', icon: 'fa-book-open' },
    industrial: { label: 'صنعتی', color: '#64748B', icon: 'fa-industry' },
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

  _contractEventType(contract) {
    const raw = String(contract.type || contract.contractType || 'عروسی').toLowerCase()
    if (raw.includes('عقد') || raw.includes('engagement')) return 'engagement'
    if (raw.includes('فرمالیته') || raw.includes('formalite')) return 'formalite'
    if (raw.includes('صنعتی') || raw.includes('industrial')) return 'industrial'
    if (raw.includes('آلبوم') || raw.includes('album')) return 'album'
    if (raw.includes('کلیپ') || raw.includes('clip')) return 'clip'
    return 'wedding'
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

    DB.active('contracts').forEach(c => {
      if (c.status === 'cancelled') return
      const d = c.eventDate || c.date
      if (!d) return
      const eventType = this._contractEventType(c)
      add(d, {
        id: `contract-${c.id}`,
        type: eventType,
        title: `${this.EVENT_TYPES[eventType].label} ${this._couple(c)}`,
        date: Utils.normJalali(d),
        time: c.time || '',
        detail: c.venue ? `تالار: ${c.venue}` : '',
        src: 'contract',
        srcId: c.id,
        smsNotify: true,
        raw: c
      })
    })

    DB.active('contracts').forEach(c => {
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

    DB.active('bookings').forEach(b => {
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

    DB.active('appointments').forEach(a => {
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

    DB.active('cheques').forEach(ch => {
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

    DB.active('calendarReminders').forEach(r => {
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
    const order = ['wedding', 'engagement', 'formalite', 'industrial', 'clip', 'album', 'cheque', 'anniversary', 'booking', 'reminder', 'appointment']
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
        ${SMEvents.attrs('SMCalendar.pickDay', [date])} aria-label="${date}">
        <span class="sm-cal-day-num">${d.toLocaleString('fa-IR')}</span>
        ${events.length ? `<span class="sm-cal-dots">${dots}</span>` : ''}
      </button>`
    }

    html += '</div>'
    return html
  },

  _renderDayPanel(date) {
    const events = this.eventsForDate(date)
    const conflicts = this.personnelConflictsForDate(date)
    const p = Utils.parseJalali(date)
    const title = p ? `${p.jd.toLocaleString('fa-IR')} ${Utils.jalaliMonthName(p.jm)} ${p.jy.toLocaleString('fa-IR')}` : date

    return `<div class="sm-cal-day-panel">
      <div class="sm-cal-day-panel-head">
        <div>
          <strong>${SM.esc(title)}</strong>
          <span class="sm-cal-day-panel-sub">${events.length ? `${events.length.toLocaleString('fa-IR')} رویداد` : 'رویدادی ثبت نشده'}</span>
        </div>
        <button type="button" class="sm-btn sm-btn-sm sm-btn-primary" ${SMEvents.attrs('SMCalendar.addReminder', [date])}><i class="fas fa-plus"></i> یادآوری</button>
      </div>
      ${conflicts.length ? `<div class="sm-cal-conflict-alert"><i class="fas fa-triangle-exclamation"></i><div><strong>تداخل تخصیص پرسنل</strong>${conflicts.map(c => `<p>${SM.esc(c.person)} در ${c.count.toLocaleString('fa-IR')} پروژه این روز ثبت شده است.</p>`).join('')}</div></div>` : ''}
      ${events.length ? `<div class="sm-cal-event-list">${events.map(e => this._eventCard(e)).join('')}</div>` :
        `<div class="sm-cal-empty-day">روی این روز چیزی نیست — یادآوری شخصی (چک، دادگاه، قرار…) اضافه کنید.</div>`}
    </div>`
  },

  personnelConflictsForDate(date) {
    const normalized = Utils.normJalali(date)
    const assignments = new Map()
    ;(DB.get('contracts') || []).filter(c => c.status !== 'cancelled' &&
      Utils.normJalali(c.eventDate || c.date) === normalized).forEach(contract => {
      const rows = Object.values(contract.staffAssignments || contract.staff || {})
      rows.forEach(row => {
        const id = typeof row === 'object' ? (row.id || row.name) : row
        const name = typeof row === 'object' ? (row.name || row.id) : row
        if (!id && !name) return
        const key = String(id || name)
        const current = assignments.get(key) || { person: String(name || id), contracts: [] }
        if (!current.contracts.some(item => String(item.id) === String(contract.id))) current.contracts.push(contract)
        assignments.set(key, current)
      })
    })
    return [...assignments.values()]
      .map(row => {
        const overlapping = new Set()
        row.contracts.forEach((first, index) => row.contracts.slice(index + 1).forEach(second => {
          if (this._contractsOverlap(first, second)) {
            overlapping.add(String(first.id))
            overlapping.add(String(second.id))
          }
        }))
        return { person: row.person, count: overlapping.size }
      })
      .filter(row => row.count > 1)
  },

  _timeMinutes(value) {
    const match = String(value || '').match(/^(\d{1,2}):(\d{2})$/)
    if (!match) return null
    const hours = Number(match[1]), minutes = Number(match[2])
    if (hours > 23 || minutes > 59) return null
    return hours * 60 + minutes
  },

  _contractsOverlap(first, second) {
    const startA = this._timeMinutes(first.time || first.startTime)
    const startB = this._timeMinutes(second.time || second.startTime)
    if (startA == null || startB == null) return true
    const durationA = Math.max(1, Number(first.durationMinutes) || 240)
    const durationB = Math.max(1, Number(second.durationMinutes) || 240)
    const endA = this._timeMinutes(first.endTime) ?? startA + durationA
    const endB = this._timeMinutes(second.endTime) ?? startB + durationB
    return startA < endB && startB < endA
  },

  _eventCard(e) {
    const meta = this.EVENT_TYPES[e.type] || this.EVENT_TYPES.reminder
    const time = e.time ? `<span class="sm-cal-ev-time" dir="ltr">${SM.esc(e.time)}</span>` : ''
    let action = ''
    if (e.src === 'contract') {
      action = `<button type="button" class="sm-btn sm-btn-sm sm-btn-ghost" ${SMEvents.attrs('SMModules.contracts.view', [e.srcId])}>جزئیات عروسی</button>`
    } else if (e.src === 'booking') {
      action = `<button type="button" class="sm-btn sm-btn-sm sm-btn-ghost" ${SMEvents.attrs('SMModules.bookings.view', [e.srcId])}>مشاهده</button>`
    } else if (e.src === 'appointment') {
      action = `<button type="button" class="sm-btn sm-btn-sm sm-btn-ghost" ${SMEvents.attrs('SMCalendar.editAppointment', [e.srcId])}>ویرایش</button>`
    } else if (e.src === 'reminder') {
      action = `<button type="button" class="sm-btn sm-btn-sm sm-btn-ghost" ${SMEvents.attrs('SMCalendar.editReminder', [e.srcId])}>ویرایش</button>`
    } else if (e.src === 'cheque') {
      action = `<button type="button" class="sm-btn sm-btn-sm sm-btn-ghost" ${SMEvents.attrs('SM.navigate', ["accounting"])}>حسابداری</button>`
    }

    const movable = ['contract', 'booking', 'appointment', 'reminder'].includes(e.src)
    if (movable) action += `<button type="button" class="sm-btn sm-btn-sm sm-btn-ghost" ${SMEvents.attrs('SMCalendar.moveDialog', [e.src, e.srcId, e.date])}><i class="fas fa-calendar-arrow-up"></i> انتقال</button>`
    return `<div class="sm-cal-event${movable ? ' is-draggable' : ''}" style="--cal-accent:${meta.color}"${movable ? ` draggable="true" data-cal-src="${SM.esc(e.src)}" data-cal-id="${SM.esc(e.srcId)}"` : ''}>
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
        <button type="button" class="sm-btn sm-btn-primary" ${SMEvents.attrs('SMCalendar.addReminder')}><i class="fas fa-bell"></i> یادآوری جدید</button>`)}
      ${SMUI.moduleSearch('calendar', 'جستجو در تقویم — نام مراسم، یادآوری...')}
      <div class="sm-cal-wrap">
        <div class="sm-cal-main sm-card">
          <div class="sm-cal-toolbar">
            <button type="button" class="sm-btn sm-btn-sm sm-btn-ghost" ${SMEvents.attrs('SMCalendar.prevMonth')}><i class="fas fa-chevron-right"></i></button>
            <div class="sm-cal-month-label">${SM.esc(monthLabel)}</div>
            <button type="button" class="sm-btn sm-btn-sm sm-btn-ghost" ${SMEvents.attrs('SMCalendar.nextMonth')}><i class="fas fa-chevron-left"></i></button>
            <button type="button" class="sm-btn sm-btn-sm sm-btn-ghost" ${SMEvents.attrs('SMCalendar.goToday')}>امروز</button>
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
    Promise.resolve().then(() => this.bindDragDrop())
  },

  bindDragDrop() {
    document.querySelectorAll('.sm-cal-event.is-draggable').forEach(card => {
      if (card.dataset.dragBound === 'true') return
      card.dataset.dragBound = 'true'
      card.addEventListener('dragstart', event => {
        event.dataTransfer.effectAllowed = 'move'
        event.dataTransfer.setData('application/json', JSON.stringify({
          src: card.dataset.calSrc,
          id: card.dataset.calId
        }))
        card.classList.add('is-dragging')
      })
      card.addEventListener('dragend', () => card.classList.remove('is-dragging'))
    })
    document.querySelectorAll('.sm-cal-day[data-date]').forEach(day => {
      if (day.dataset.dropBound === 'true') return
      day.dataset.dropBound = 'true'
      day.addEventListener('dragover', event => {
        event.preventDefault()
        event.dataTransfer.dropEffect = 'move'
        day.classList.add('is-drop-target')
      })
      day.addEventListener('dragleave', () => day.classList.remove('is-drop-target'))
      day.addEventListener('drop', async event => {
        event.preventDefault()
        day.classList.remove('is-drop-target')
        try {
          const payload = JSON.parse(event.dataTransfer.getData('application/json'))
          await this.rescheduleEvent(payload.src, payload.id, day.dataset.date)
        } catch {
          SM.toast('انتقال رویداد انجام نشد', 'error')
        }
      })
    })
  },

  async rescheduleEvent(src, id, date) {
    const target = Utils.normJalali(date)
    const map = {
      contract: ['contracts', 'eventDate'],
      booking: ['bookings', 'date'],
      appointment: ['appointments', 'date'],
      reminder: ['calendarReminders', 'date']
    }
    const [collection, field] = map[src] || []
    if (!collection || !target || !DB.find(collection, row => String(row.id) === String(id))) {
      SM.toast('رویداد قابل انتقال نیست', 'error')
      return false
    }
    await SecureDB.update(collection, id, { [field]: target, updatedAtIso: new Date().toISOString() })
    this._selectedDate = target
    const p = Utils.parseJalali(target)
    if (p) { this._viewYear = p.jy; this._viewMonth = p.jm }
    SM.toast(`رویداد به ${target} منتقل شد`, 'success')
    this.refresh()
    return true
  },

  moveDialog(src, id, currentDate) {
    SMUI.modal('انتقال رویداد', `${SMUI.formField('تاریخ جدید', 'cal-move-date', { value: currentDate || Utils.todayJalali() })}`, {
      width: 420,
      onSave: async () => {
        const date = document.getElementById('cal-move-date')?.value
        if (await this.rescheduleEvent(src, id, date)) SMUI.closeModal()
      }
    })
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
    Promise.resolve().then(() => this.bindDragDrop())
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
