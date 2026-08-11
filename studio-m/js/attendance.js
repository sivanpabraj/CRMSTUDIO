/* Studio M — حضور و غیاب پرسنل (تقویم + ثبت ورود/خروج) */

const SMAttendance = {
  _tab: 'calendar',
  _viewYear: null,
  _viewMonth: null,
  _selectedDate: null,
  _filterPersonId: '',

  STATUS: {
    present: { label: 'حاضر', color: '#34C759', icon: 'fa-check' },
    completed: { label: 'تکمیل (خروج)', color: '#0071E3', icon: 'fa-door-open' },
    absent: { label: 'غایب', color: '#FF3B30', icon: 'fa-times' },
    late: { label: 'تأخیر', color: '#FF9500', icon: 'fa-clock' },
    leave: { label: 'مرخصی', color: '#5856D6', icon: 'fa-umbrella-beach' },
    half: { label: 'نیمه‌روز', color: '#00A3BF', icon: 'fa-adjust' }
  },

  setTab(tab) {
    this._tab = tab
    SM.navigate('attendance')
  },

  _initView() {
    const t = Utils.parseJalaliToday()
    if (!this._viewYear) this._viewYear = t.jy
    if (!this._viewMonth) this._viewMonth = t.jm
    if (!this._selectedDate) this._selectedDate = Utils.todayJalali()
  },

  _nowTime() {
    const d = new Date()
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  },

  _parseTime(t) {
    if (!t) return null
    const m = String(t).match(/(\d{1,2})[:：](\d{2})/)
    if (!m) return null
    return (+m[1]) * 60 + (+m[2])
  },

  _durationMinutes(checkIn, checkOut) {
    const a = this._parseTime(checkIn)
    const b = this._parseTime(checkOut)
    if (a == null || b == null || b <= a) return null
    return b - a
  },

  _formatDuration(mins) {
    if (mins == null || mins < 0) return '—'
    const h = Math.floor(mins / 60)
    const m = mins % 60
    return `${h.toLocaleString('fa-IR')} ساعت و ${m.toLocaleString('fa-IR')} دقیقه`
  },

  _records() {
    return DB.active('attendance') || []
  },

  _forMonth(jy, jm, personId) {
    return this._records().filter(r => {
      const p = Utils.parseJalali(r.date)
      if (!p || p.jy !== jy || p.jm !== jm) return false
      if (personId && r.personnelId !== personId) return false
      return true
    })
  },

  _forDate(date, personId) {
    const key = Utils.normJalali(date)
    return this._records().filter(r => {
      if (Utils.normJalali(r.date) !== key) return false
      if (personId && r.personnelId !== personId) return false
      return true
    })
  },

  _mapByDate(jy, jm, personId) {
    const map = {}
    this._forMonth(jy, jm, personId).forEach(r => {
      const key = Utils.normJalali(r.date)
      if (!map[key]) map[key] = []
      map[key].push(r)
    })
    return map
  },

  _dominantStatus(records) {
    if (!records?.length) return null
    const order = ['absent', 'late', 'half', 'leave', 'present', 'completed']
    for (const s of order) {
      if (records.some(r => r.status === s)) return s
    }
    return records[0].status || 'present'
  },

  _monthStats(jy, jm, personId) {
    const recs = this._forMonth(jy, jm, personId)
    let present = 0, absent = 0, leave = 0, late = 0, totalMins = 0
    recs.forEach(r => {
      if (r.status === 'absent') absent++
      else if (r.status === 'leave') leave++
      else if (r.status === 'late') { late++; present++ }
      else if (['present', 'completed', 'half'].includes(r.status)) present++
      const m = this._durationMinutes(r.checkIn, r.checkOut)
      if (m) totalMins += m
    })
    return { present, absent, leave, late, totalMins, total: recs.length }
  },

  render(el) {
    if (SM.state.viewStack.length) return
    this._initView()
    el.innerHTML = `
      ${SMUI.sectionHead('حضور و غیاب', 'ثبت ورود و خروج · تقویم شمسی · گزارش ماهانه', `
        <button type="button" class="sm-btn sm-btn-ghost" ${SMEvents.attrs('SMAttendance.add')}><i class="fas fa-plus"></i> ثبت دستی</button>
        <button type="button" class="sm-btn sm-btn-primary" ${SMEvents.attrs('SMAttendance.quickCheckIn')}><i class="fas fa-sign-in-alt"></i> ورود امروز</button>`)}
      ${SMUI.tabs([
        { id: 'calendar', fa: 'تقویم', en: 'Calendar', icon: 'fa-calendar-days', fn: 'SMAttendance.setTab', args: ['calendar'] },
        { id: 'list', fa: 'لیست', en: 'List', icon: 'fa-list', fn: 'SMAttendance.setTab', args: ['list'] },
        { id: 'stats', fa: 'آمار', en: 'Stats', icon: 'fa-chart-bar', fn: 'SMAttendance.setTab', args: ['stats'] }
      ], this._tab)}
      <div style="margin-top:16px">${this._renderTab()}</div>`
  },

  _renderTab() {
    if (this._tab === 'list') return this._listHtml()
    if (this._tab === 'stats') return this._statsHtml()
    return this._calendarHtml()
  },

  _personFilterHtml() {
    const personnel = DB.active('personnel').filter(p => p.status !== 'inactive')
    return `<div class="sm-att-filter">
      <label class="sm-label" for="att-filter-person">پرسنل</label>
      <select class="sm-input" id="att-filter-person" data-sm-change-fn="SMAttendance.onPersonFilterChange" data-sm-args='[]'>
        <option value="">همه پرسنل</option>
        ${personnel.map(p => `<option value="${p.id}"${this._filterPersonId === p.id ? ' selected' : ''}>${SM.esc(p.name)}</option>`).join('')}
      </select>
    </div>`
  },

  _calendarHtml() {
    const jy = this._viewYear
    const jm = this._viewMonth
    const map = this._mapByDate(jy, jm, this._filterPersonId || null)
    const stats = this._monthStats(jy, jm, this._filterPersonId || null)

    return `<div class="sm-att-layout">
      <div class="sm-att-side">
        ${this._personFilterHtml()}
        <div class="sm-cal-nav">
          <button type="button" class="sm-btn sm-btn-ghost sm-btn-sm" ${SMEvents.attrs('SMAttendance.prevMonth')}><i class="fas fa-chevron-right"></i></button>
          <strong>${Utils.jalaliMonthName(jm)} ${jy.toLocaleString('fa-IR')}</strong>
          <button type="button" class="sm-btn sm-btn-ghost sm-btn-sm" ${SMEvents.attrs('SMAttendance.nextMonth')}><i class="fas fa-chevron-left"></i></button>
        </div>
        ${this._renderGrid(jy, jm, map)}
        <div class="sm-att-legend">${Object.entries(this.STATUS).map(([_k, v]) =>
          `<span><i class="fas ${v.icon}" style="color:${v.color}"></i> ${v.label}</span>`
        ).join('')}</div>
        <div class="sm-att-mini-stats">
          <span>حاضر: <strong>${stats.present.toLocaleString('fa-IR')}</strong></span>
          <span>غایب: <strong>${stats.absent.toLocaleString('fa-IR')}</strong></span>
          <span>ساعت: <strong>${Math.floor(stats.totalMins / 60).toLocaleString('fa-IR')}</strong></span>
        </div>
      </div>
      <div class="sm-att-day-panel">${this._renderDayPanel(this._selectedDate)}</div>
    </div>`
  },

  _renderGrid(jy, jm, map) {
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
      const recs = map[date] || []
      const status = this._dominantStatus(recs)
      const meta = status ? this.STATUS[status] : null
      const isToday = date === today
      const isSelected = date === this._selectedDate
      const count = recs.length

      html += `<button type="button" class="sm-cal-day sm-att-day${isToday ? ' is-today' : ''}${isSelected ? ' is-selected' : ''}${count ? ' has-events' : ''}"
        style="${meta ? `--cal-accent:${meta.color}` : ''}"
        ${SMEvents.attrs('SMAttendance.pickDay', [date])}>
        <span class="sm-cal-day-num">${d.toLocaleString('fa-IR')}</span>
        ${count ? `<span class="sm-att-day-badge">${count.toLocaleString('fa-IR')}</span>` : ''}
      </button>`
    }
    html += '</div>'
    return html
  },

  _renderDayPanel(date) {
    const recs = this._forDate(date, this._filterPersonId || null)
    const p = Utils.parseJalali(date)
    const title = p ? `${p.jd.toLocaleString('fa-IR')} ${Utils.jalaliMonthName(p.jm)} ${p.jy.toLocaleString('fa-IR')}` : date

    return `<div class="sm-cal-day-panel">
      <div class="sm-cal-day-panel-head">
        <div>
          <strong>${SM.esc(title)}</strong>
          <span class="sm-cal-day-panel-sub">${recs.length ? `${recs.length.toLocaleString('fa-IR')} ثبت` : 'ثبت نشده'}</span>
        </div>
        <button type="button" class="sm-btn sm-btn-sm sm-btn-primary" ${SMEvents.attrs('SMAttendance.add', [date])}><i class="fas fa-plus"></i> ثبت</button>
      </div>
      ${recs.length ? `<div class="sm-att-rec-list">${recs.map(r => this._recordCard(r)).join('')}</div>` :
        `<div class="sm-cal-empty-day">برای این روز حضور ثبت نشده — پرسنل را انتخاب و وضعیت را مشخص کنید.</div>`}
    </div>`
  },

  _recordCard(r) {
    const st = this.STATUS[r.status] || this.STATUS.present
    const dur = this._formatDuration(this._durationMinutes(r.checkIn, r.checkOut))
    return `<div class="sm-att-rec-card" style="--att-color:${st.color}">
      <div class="sm-att-rec-top">
        <strong>${SM.esc(r.personnelName || '—')}</strong>
        ${SMUI.badge(st.label, r.status === 'absent' ? 'danger' : 'success')}
      </div>
      <div class="sm-att-rec-meta">
        ${r.status !== 'absent' && r.status !== 'leave' ? `
          <span dir="ltr"><i class="fas fa-sign-in-alt"></i> ${SM.esc(r.checkIn || '—')}</span>
          <span dir="ltr"><i class="fas fa-sign-out-alt"></i> ${SM.esc(r.checkOut || '—')}</span>
          <span><i class="fas fa-hourglass-half"></i> ${dur}</span>` : ''}
        ${r.notes ? `<span><i class="fas fa-sticky-note"></i> ${SM.esc(r.notes)}</span>` : ''}
      </div>
      <div class="sm-att-rec-actions">
        ${!r.checkOut && r.status !== 'absent' && r.status !== 'leave' ? `<button type="button" class="sm-btn sm-btn-sm sm-btn-primary" ${SMEvents.attrs('SMAttendance.checkOut', [r.id])}>ثبت خروج</button>` : ''}
        <button type="button" class="sm-btn sm-btn-sm sm-btn-ghost" ${SMEvents.attrs('SMAttendance.edit', [r.id])}>ویرایش</button>
      </div>
    </div>`
  },

  _listHtml() {
    const q = SM.getModuleSearch('attendance')
    let recs = this._records().slice().reverse()
    if (this._filterPersonId) recs = recs.filter(r => r.personnelId === this._filterPersonId)
    if (q) recs = recs.filter(r => JSON.stringify(r).toLowerCase().includes(q))

    return `${this._personFilterHtml()}
      ${SMUI.moduleSearch('attendance', 'جستجو — نام، تاریخ، یادداشت...')}
      ${recs.length ? `<div class="sm-att-rec-list">${recs.slice(0, 80).map(r => this._recordCard(r)).join('')}</div>` :
        SMUI.empty('fa-user-clock', 'ثبت حضور وجود ندارد', 'از تقویم یا «ثبت دستی» استفاده کنید')}`
  },

  _statsHtml() {
    const t = Utils.parseJalaliToday()
    const stats = this._monthStats(t.jy, t.jm, this._filterPersonId || null)
    const personnel = DB.active('personnel').filter(p => p.status === 'active')
    const perPerson = personnel.map(p => {
      const s = this._monthStats(t.jy, t.jm, p.id)
      return { name: p.name, id: p.id, ...s }
    }).filter(x => x.total > 0).sort((a, b) => b.present - a.present)

    return `${this._personFilterHtml()}
      ${SMUI.statCards([
        { label: 'حاضر این ماه', value: stats.present, color: '#34C759' },
        { label: 'غایب', value: stats.absent, color: '#FF3B30' },
        { label: 'مرخصی / تأخیر', value: stats.leave + stats.late, color: '#FF9500' },
        { label: 'مجموع ساعت', value: Math.floor(stats.totalMins / 60), color: '#0071E3' }
      ])}
      <div class="sm-card" style="margin-top:16px"><div class="sm-card-head"><div class="sm-card-title">خلاصه پرسنل — ${Utils.jalaliMonthName(t.jm)}</div></div>
        <div class="sm-card-body">${perPerson.length ? perPerson.map(p => `
          <div class="sm-att-person-stat" ${SMEvents.elAttrs('SMAttendance.openPersonCalendar', [p.id])} role="button" tabindex="0">
            <strong>${SM.esc(p.name)}</strong>
            <span>حاضر ${p.present.toLocaleString('fa-IR')} · غایب ${p.absent.toLocaleString('fa-IR')} · ${Math.floor(p.totalMins / 60).toLocaleString('fa-IR')} ساعت</span>
          </div>`).join('') : SMUI.empty('fa-users', 'این ماه ثبت نشده')}</div></div>`
  },

  setPersonFilter(id) {
    this._filterPersonId = id || ''
  },

  onPersonFilterChange(value) {
    this.setPersonFilter(value)
    SM.navigate('attendance')
  },

  openPersonCalendar(id) {
    this.setPersonFilter(id)
    this.setTab('calendar')
  },

  prevMonth() {
    if (this._viewMonth === 1) { this._viewMonth = 12; this._viewYear-- }
    else this._viewMonth--
    SM.navigate('attendance')
  },

  nextMonth() {
    if (this._viewMonth === 12) { this._viewMonth = 1; this._viewYear++ }
    else this._viewMonth++
    SM.navigate('attendance')
  },

  pickDay(date) {
    this._selectedDate = date
    SM.navigate('attendance')
  },

  async quickCheckIn() {
    const user = SM.user()
    const person = DB.findPersonnelByUserId?.(user?.id) || DB.find('personnel', p => p.phone === user?.phone)
    if (!person) return this.add(Utils.todayJalali())
    const today = Utils.todayJalali()
    const open = this._forDate(today, person.id).find(r => !r.checkOut && r.status !== 'absent')
    if (open) return SM.toast('ورود امروز قبلاً ثبت شده — خروج را بزنید', 'info')
    await SecureDB.insert('attendance', {
      personnelId: person.id,
      personnelName: person.name,
      date: today,
      checkIn: this._nowTime(),
      status: 'present',
      source: 'admin',
      notes: ''
    })
    SM.log('attendance_checkin', person.name)
    SM.toast('ورود ثبت شد', 'success')
    this._selectedDate = today
    SM.navigate('attendance')
  },

  async checkOut(id) {
    const rec = DB.find('attendance', r => r.id === id)
    if (!rec) return
    await SecureDB.update('attendance', id, { checkOut: this._nowTime(), status: 'completed' })
    SM.toast('خروج ثبت شد', 'success')
    SM.navigate('attendance')
  },

  add(presetDate) {
    const date = presetDate || this._selectedDate || Utils.todayJalali()
    const personnel = DB.active('personnel').filter(p => p.status !== 'inactive')
    const statusOpts = Object.entries(this.STATUS).map(([k, v]) => ({ value: k, label: v.label }))
    SMUI.modal('ثبت حضور و غیاب', `
      ${SMUI.formField('پرسنل', 'att-person', {
        type: 'select',
        value: this._filterPersonId || '',
        options: personnel.map(p => ({ value: p.id, label: p.name }))
      })}
      ${SMUI.formField('تاریخ', 'att-date', { value: date })}
      ${SMUI.formField('وضعیت', 'att-status', { type: 'select', value: 'present', options: statusOpts })}
      ${SMUI.formField('ساعت ورود', 'att-in', { dir: 'ltr', placeholder: '09:00', value: this._nowTime() })}
      ${SMUI.formField('ساعت خروج', 'att-out', { dir: 'ltr', placeholder: '18:00' })}
      ${SMUI.formField('یادداشت', 'att-notes', { type: 'textarea', placeholder: 'توضیح مدیر...' })}`, {
      width: 480,
      onSave: () => {
        const d = SMUI.readForm(['att-person', 'att-date', 'att-in', 'att-out', 'att-status', 'att-notes'])
        if (!d['att-person']) return SM.toast('پرسنل را انتخاب کنید', 'error')
        const person = personnel.find(p => p.id === d['att-person'])
        const status = d['att-status'] || 'present'
        const dup = this._forDate(d['att-date'], d['att-person']).length
        if (dup) return SM.toast('برای این پرسنل در این روز قبلاً ثبت شده — ویرایش کنید', 'error')
        SecureDB.insert('attendance', {
          personnelId: d['att-person'],
          personnelName: person?.name,
          date: Utils.normJalali(d['att-date']) || d['att-date'],
          checkIn: ['absent', 'leave'].includes(status) ? '' : (d['att-in'] || ''),
          checkOut: d['att-out'] || '',
          status: d['att-out'] && status === 'present' ? 'completed' : status,
          notes: d['att-notes'] || '',
          source: 'admin'
        })
        SMUI.closeModal()
        this._selectedDate = Utils.normJalali(d['att-date']) || d['att-date']
        SM.navigate('attendance')
        SM.toast('ثبت شد', 'success')
      }
    })
  },

  edit(id) {
    const r = DB.find('attendance', x => x.id === id)
    if (!r) return
    const personnel = DB.active('personnel')
    const statusOpts = Object.entries(this.STATUS).map(([k, v]) => ({ value: k, label: v.label }))
    SMUI.modal('ویرایش حضور', `
      ${SMUI.formField('پرسنل', 'att-person', { type: 'select', value: r.personnelId || '', options: personnel.map(p => ({ value: p.id, label: p.name })) })}
      ${SMUI.formField('تاریخ', 'att-date', { value: r.date || '' })}
      ${SMUI.formField('وضعیت', 'att-status', { type: 'select', value: r.status || 'present', options: statusOpts })}
      ${SMUI.formField('ساعت ورود', 'att-in', { value: r.checkIn || '', dir: 'ltr' })}
      ${SMUI.formField('ساعت خروج', 'att-out', { value: r.checkOut || '', dir: 'ltr' })}
      ${SMUI.formField('یادداشت', 'att-notes', { type: 'textarea', value: r.notes || '' })}`, {
      width: 480,
      onSave: () => {
        const d = SMUI.readForm(['att-person', 'att-date', 'att-in', 'att-out', 'att-status', 'att-notes'])
        const person = personnel.find(p => p.id === d['att-person'])
        const status = d['att-status'] || 'present'
        SecureDB.update('attendance', id, {
          personnelId: d['att-person'],
          personnelName: person?.name || r.personnelName,
          date: Utils.normJalali(d['att-date']) || d['att-date'],
          checkIn: d['att-in'],
          checkOut: d['att-out'],
          status: d['att-out'] && status === 'present' ? 'completed' : status,
          notes: d['att-notes'] || ''
        })
        SMUI.closeModal()
        SM.navigate('attendance')
      },
      onDelete: () => SMH.remove('attendance', id, 'attendance')
    })
  },

  /** API for portal & reports */
  async portalCheckIn(personnelId) {
    const person = DB.find('personnel', p => p.id === personnelId)
    if (!person) return { ok: false, error: 'پرسنل یافت نشد' }
    const today = Utils.todayJalali()
    const open = this._forDate(today, personnelId).find(r => !r.checkOut && r.status !== 'absent')
    if (open) return { ok: false, error: 'ورود امروز ثبت شده', record: open }
    const rec = await SecureDB.insert('attendance', {
      personnelId,
      personnelName: person.name,
      date: today,
      checkIn: this._nowTime(),
      status: 'present',
      source: 'portal',
      notes: ''
    })
    return { ok: true, record: rec }
  },

  async portalCheckOut(personnelId) {
    const today = Utils.todayJalali()
    const open = this._forDate(today, personnelId).find(r => !r.checkOut && r.status !== 'absent')
    if (!open) return { ok: false, error: 'ورود امروز ثبت نشده' }
    await SecureDB.update('attendance', open.id, { checkOut: this._nowTime(), status: 'completed' })
    return { ok: true, record: DB.find('attendance', x => x.id === open.id) }
  },

  reportSummary(jy, jm) {
    const stats = this._monthStats(jy, jm, null)
    const personnel = DB.active('personnel').filter(p => p.status === 'active')
    const withRecords = personnel.filter(p => this._forMonth(jy, jm, p.id).length > 0).length
    return {
      ...stats,
      activeStaff: personnel.length,
      staffWithRecords: withRecords,
      hours: Math.floor(stats.totalMins / 60)
    }
  }
}

SMModules.attendance = {
  setTab(tab) { SMAttendance.setTab(tab) },
  render(el) { SMAttendance.render(el) },
  add() { SMAttendance.add() },
  edit(id) { SMAttendance.edit(id) },
  checkIn() { SMAttendance.quickCheckIn() },
  checkOut(id) { SMAttendance.checkOut(id) }
}

window.SMAttendance = SMAttendance
