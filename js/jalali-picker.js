/* انتخابگر تاریخ شمسی — کلیک روی فیلد یا آیکن تقویم */

const JalaliPicker = {
  _panel: null,
  _input: null,
  _onSelect: null,
  _viewYear: null,
  _viewMonth: null,

  attach(inputId, onSelect) {
    const input = document.getElementById(inputId)
    if (!input || typeof Utils === 'undefined') return
    input.readOnly = true
    input.classList.add('jalali-picker-input')
    input.setAttribute('autocomplete', 'off')
    input.addEventListener('click', e => { e.preventDefault(); this.openFor(inputId, onSelect) })
    const wrap = input.closest('.date-picker-wrap')
    wrap?.querySelector('.date-picker-btn')?.addEventListener('click', e => {
      e.preventDefault()
      this.openFor(inputId, onSelect)
    })
  },

  openFor(inputId, onSelect) {
    const input = document.getElementById(inputId)
    if (!input) return
    this._input = input
    this._onSelect = onSelect
    const cur = Utils.parseJalali(input.value) || Utils.parseJalaliToday()
    this._viewYear = cur.jy
    this._viewMonth = cur.jm
    this._render()
  },

  close() {
    if (this._outsideClick) {
      document.removeEventListener('click', this._outsideClick)
      this._outsideClick = null
    }
    this._panel?.remove()
    this._panel = null
    this._input = null
  },

  _yearRange() {
    const t = Utils.parseJalaliToday()
    const years = []
    for (let y = t.jy - 2; y <= t.jy + 8; y++) years.push(y)
    return years
  },

  _monthSelectHtml(jm) {
    let html = ''
    for (let m = 1; m <= 12; m++) {
      html += `<option value="${m}"${m === jm ? ' selected' : ''}>${Utils.jalaliMonthName(m)}</option>`
    }
    return html
  },

  _yearSelectHtml(jy) {
    return this._yearRange().map(y =>
      `<option value="${y}"${y === jy ? ' selected' : ''}>${y.toLocaleString('fa-IR')}</option>`
    ).join('')
  },

  _render() {
    this._panel?.remove()
    const jy = this._viewYear
    const jm = this._viewMonth
    const selected = this._input?.value ? Utils.normJalali(this._input.value) : ''
    const today = Utils.todayJalali()
    const days = Utils.jalaliMonthDays(jy, jm)
    const start = Utils.jalaliMonthStartWeekday(jy, jm)
    const weekdays = Utils.jalaliWeekdaysShort()

    let daysHtml = ''
    for (let i = 0; i < start; i++) daysHtml += '<span class="jp-day jp-empty"></span>'
    for (let d = 1; d <= days; d++) {
      const date = Utils.formatJalali(jy, jm, d)
      const cls = [
        'jp-day',
        date === today ? 'is-today' : '',
        date === selected ? 'is-selected' : ''
      ].filter(Boolean).join(' ')
      daysHtml += `<button type="button" class="${cls}" data-date="${date}">${d.toLocaleString('fa-IR')}</button>`
    }

    this._panel = document.createElement('div')
    this._panel.className = 'jalali-picker-pop'
    this._panel.innerHTML = `
      <div class="jp-head">
        <button type="button" class="jp-nav" data-dir="prev" title="ماه قبل"><i class="fas fa-chevron-right"></i></button>
        <div class="jp-selects">
          <select class="jp-select jp-month" aria-label="ماه">${this._monthSelectHtml(jm)}</select>
          <select class="jp-select jp-year" aria-label="سال">${this._yearSelectHtml(jy)}</select>
        </div>
        <button type="button" class="jp-nav" data-dir="next" title="ماه بعد"><i class="fas fa-chevron-left"></i></button>
      </div>
      <div class="jp-weekdays">${weekdays.map(w => `<span>${w}</span>`).join('')}</div>
      <div class="jp-days">${daysHtml}</div>
      <button type="button" class="jp-today">امروز</button>`

    const rect = this._input.getBoundingClientRect()
    this._panel.style.top = `${rect.bottom + window.scrollY + 6}px`
    this._panel.style.right = `${window.innerWidth - rect.right}px`
    document.body.appendChild(this._panel)

    this._panel.addEventListener('mousedown', e => e.stopPropagation())
    this._panel.addEventListener('click', e => e.stopPropagation())

    this._panel.querySelector('.jp-month')?.addEventListener('change', e => {
      this._viewMonth = parseInt(e.target.value, 10) || 1
      this._render()
    })
    this._panel.querySelector('.jp-year')?.addEventListener('change', e => {
      this._viewYear = parseInt(e.target.value, 10) || this._viewYear
      this._render()
    })
    this._panel.querySelector('[data-dir="prev"]')?.addEventListener('click', e => {
      e.stopPropagation()
      this._viewMonth--
      if (this._viewMonth < 1) { this._viewMonth = 12; this._viewYear-- }
      this._render()
    })
    this._panel.querySelector('[data-dir="next"]')?.addEventListener('click', e => {
      e.stopPropagation()
      this._viewMonth++
      if (this._viewMonth > 12) { this._viewMonth = 1; this._viewYear++ }
      this._render()
    })
    this._panel.querySelector('.jp-today')?.addEventListener('click', e => {
      e.stopPropagation()
      this._pick(Utils.todayJalali())
    })
    this._panel.querySelectorAll('.jp-day[data-date]').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation()
        this._pick(btn.dataset.date)
      })
    })

    if (!this._outsideClick) {
      this._outsideClick = e => {
        if (!this._panel?.contains(e.target) && e.target !== this._input && !this._input?.closest('.date-picker-wrap')?.contains(e.target)) {
          this.close()
        }
      }
      setTimeout(() => document.addEventListener('click', this._outsideClick), 0)
    }
  },

  _pick(date) {
    if (this._input) {
      this._input.value = date
      this._input.dispatchEvent(new Event('change', { bubbles: true }))
    }
    if (typeof this._onSelect === 'function') this._onSelect(date)
    this.close()
  }
}

window.JalaliPicker = JalaliPicker
