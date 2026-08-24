/* ══════════════════════════════════════════════
   ConsultationBooking — انتخاب تاریخ و ساعت مشاوره
   ══════════════════════════════════════════════ */

const ConsultationBooking = {
  _selectedDate: '',
  _selectedTime: '',
  _showCalendar: false,
  _viewYear: null,
  _viewMonth: null,

  _weekdayNames: ['یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنج‌شنبه', 'جمعه', 'شنبه'],

  _dateLabel(offset) {
    if (offset === 0) return 'امروز'
    if (offset === 1) return 'فردا'
    if (offset === 2) return 'پس‌فردا'
    return null
  },

  _addDays(offset) {
    const t = Utils.parseJalaliToday()
    const [gy, gm, gd] = Utils._jalaliToGregorian(t.jy, t.jm, t.jd)
    const d = new Date(gy, gm - 1, gd)
    d.setDate(d.getDate() + offset)
    const [jy, jm, jd] = Utils._gregorianToJalali(d.getFullYear(), d.getMonth() + 1, d.getDate())
    return {
      jalali: Utils.formatJalali(jy, jm, jd),
      weekday: this._weekdayNames[d.getDay()],
      jm, jd
    }
  },

  _isBooked(date, time) {
    return (DB.get('bookings') || []).some(b =>
      b.status !== 'cancelled' &&
      Utils.normJalali(b.date) === Utils.normJalali(date) &&
      b.time === time
    )
  },

  _timeSlots() {
    const morning = []
    const afternoon = []
    for (let h = 9; h <= 11; h++) {
      morning.push(`${String(h).padStart(2, '0')}:00`)
      morning.push(`${String(h).padStart(2, '0')}:30`)
    }
    for (let h = 14; h <= 18; h++) {
      afternoon.push(`${String(h).padStart(2, '0')}:00`)
      if (h < 18) afternoon.push(`${String(h).padStart(2, '0')}:30`)
    }
    return { morning, afternoon }
  },

  render(containerId) {
    const el = document.getElementById(containerId)
    if (!el) return

    const quick = []
    for (let i = 0; i < 14; i++) quick.push({ offset: i, ...this._addDays(i) })

    const thisWeek = quick.slice(0, 7)
    const nextWeek = quick.slice(7, 14)

    el.innerHTML = `
      <div class="auth-booking">
        <p class="auth-booking-label">انتخاب روز</p>
        <div class="auth-date-row auth-date-row--quick">
          ${quick.slice(0, 3).map(d => this._dateChip(d, this._dateLabel(d.offset))).join('')}
        </div>
        <p class="auth-booking-sublabel">این هفته</p>
        <div class="auth-date-grid">
          ${thisWeek.map(d => this._dateChip(d, d.weekday)).join('')}
        </div>
        <p class="auth-booking-sublabel">هفته آینده</p>
        <div class="auth-date-grid">
          ${nextWeek.map(d => this._dateChip(d, d.weekday)).join('')}
        </div>
        <button type="button" class="auth-calendar-toggle" data-csp-action="ConsultationBooking.toggleCalendar">
          <i class="fas fa-calendar-alt"></i> ${this._showCalendar ? 'بستن تقویم' : 'نمایش تقویم ماه'}
        </button>
        <div id="auth-cal-panel" class="auth-cal-panel" style="display:${this._showCalendar ? 'block' : 'none'}"></div>
        <p class="auth-booking-label" style="margin-top:16px">انتخاب ساعت</p>
        <p class="auth-booking-sublabel">قبل از ظهر</p>
        <div class="auth-time-grid" id="auth-time-morning"></div>
        <p class="auth-booking-sublabel">بعد از ظهر</p>
        <div class="auth-time-grid" id="auth-time-afternoon"></div>
      </div>`

    if (this._showCalendar) this._renderCalendar()
    this._renderTimes()
  },

  _dateChip(d, label) {
    const sel = this._selectedDate === d.jalali ? ' auth-chip--active' : ''
    const sub = `${d.jd}/${d.jm}`
    return `<button type="button" class="auth-date-chip${sel}" data-date="${d.jalali}"
      data-csp-action="ConsultationBooking.pickDate" data-csp-arg="${d.jalali}">
      <span class="auth-date-chip-label">${Utils.escapeHtml(label)}</span>
      <span class="auth-date-chip-sub" dir="ltr">${sub}</span>
    </button>`
  },

  pickDate(jalali) {
    this._selectedDate = Utils.normJalali(jalali)
    this._selectedTime = ''
    this.render('auth-booking-root')
  },

  toggleCalendar() {
    this._showCalendar = !this._showCalendar
    const t = Utils.parseJalali(this._selectedDate) || Utils.parseJalaliToday()
    this._viewYear = t.jy
    this._viewMonth = t.jm
    this.render('auth-booking-root')
  },

  _renderCalendar() {
    const panel = document.getElementById('auth-cal-panel')
    if (!panel) return
    const jy = this._viewYear || Utils.parseJalaliToday().jy
    const jm = this._viewMonth || Utils.parseJalaliToday().jm
    const days = Utils.jalaliMonthDays(jy, jm)
    const start = Utils.jalaliMonthStartWeekday(jy, jm)
    const _today = Utils.todayJalali()
    const weekdays = Utils.jalaliWeekdaysShort()

    let daysHtml = weekdays.map(w => `<span class="auth-cal-wd">${w}</span>`).join('')
    for (let i = 0; i < start; i++) daysHtml += '<span class="auth-cal-day auth-cal-empty"></span>'
    for (let d = 1; d <= days; d++) {
      const date = Utils.formatJalali(jy, jm, d)
      const past = Utils.daysUntil(date) < 0
      const sel = this._selectedDate === date ? ' auth-cal-day--active' : ''
      const cls = past ? 'auth-cal-day auth-cal-past' : `auth-cal-day${sel}`
      daysHtml += past
        ? `<span class="${cls}">${d}</span>`
        : `<button type="button" class="${cls}" data-csp-action="ConsultationBooking.pickDate" data-csp-arg="${date}">${d}</button>`
    }

    panel.innerHTML = `
      <div class="auth-cal-head">
        <button type="button" class="auth-cal-nav" data-csp-action="ConsultationBooking._shiftMonth" data-csp-arg="-1"><i class="fas fa-chevron-right"></i></button>
        <span>${Utils.jalaliMonthName(jm)} ${jy.toLocaleString('fa-IR')}</span>
        <button type="button" class="auth-cal-nav" data-csp-action="ConsultationBooking._shiftMonth" data-csp-arg="1"><i class="fas fa-chevron-left"></i></button>
      </div>
      <div class="auth-cal-grid">${daysHtml}</div>`
  },

  _shiftMonth(delta) {
    delta = Number(delta)
    let jy = this._viewYear
    let jm = this._viewMonth + delta
    if (jm < 1) { jm = 12; jy-- }
    if (jm > 12) { jm = 1; jy++ }
    this._viewYear = jy
    this._viewMonth = jm
    this._renderCalendar()
  },

  _renderTimes() {
    const { morning, afternoon } = this._timeSlots()
    const mk = (t, containerId) => {
      const el = document.getElementById(containerId)
      if (!el) return
      el.innerHTML = t.map(time => {
        const booked = this._selectedDate && this._isBooked(this._selectedDate, time)
        const sel = this._selectedTime === time ? ' auth-chip--active' : ''
        const dis = booked ? ' auth-time-chip--busy' : ''
        return `<button type="button" class="auth-time-chip${sel}${dis}" ${booked ? 'disabled' : ''}
          data-csp-action="ConsultationBooking.pickTime" data-csp-arg="${time}">${time}</button>`
      }).join('')
    }
    mk(morning, 'auth-time-morning')
    mk(afternoon, 'auth-time-afternoon')
  },

  pickTime(time) {
    if (!this._selectedDate) {
      Utils.toast('ابتدا روز را انتخاب کنید', 'error')
      return
    }
    if (this._isBooked(this._selectedDate, time)) return
    this._selectedTime = time
    this._renderTimes()
  },

  getSelection() {
    return { date: this._selectedDate, time: this._selectedTime }
  },

  reset() {
    this._selectedDate = ''
    this._selectedTime = ''
    this._showCalendar = false
  }
}

window.ConsultationBooking = ConsultationBooking
