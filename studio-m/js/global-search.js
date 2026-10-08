/**
 * Global Search — ذره‌بین جمع‌شو + Command Palette
 * AI از StudioAIBrain (مقید به داده استودیو)
 */
const GlobalSearch = {
  _open: false,
  _q: '',
  _timer: null,

  ROUTE_LABELS: {
    contracts: 'قرارداد',
    employees: 'پرسنل',
    accounting: 'تراکنش',
    bookings: 'رزرو',
    cheques: 'چک',
    calendar: 'تقویم',
    inbox: 'صندوق',
    workflow: 'گردش‌کار'
  },

  mount() {
    this._injectHeaderBtn()
    this._bindKeys()
  },

  _injectHeaderBtn() {
    const actions = document.querySelector('.sm-header-actions')
    if (!actions || document.getElementById('sm-global-search-btn')) return
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.id = 'sm-global-search-btn'
    btn.className = 'sm-btn-icon sm-gs-trigger'
    btn.title = 'جستجو (Ctrl+K)'
    btn.setAttribute('aria-label', 'جستجوی سراسری')
    btn.innerHTML = '<i class="fas fa-search"></i>'
    btn.addEventListener('click', () => this.open())
    actions.insertBefore(btn, actions.firstChild)
  },

  _bindKeys() {
    if (this._keysBound) return
    this._keysBound = true
    document.addEventListener('keydown', (e) => {
      const meta = e.ctrlKey || e.metaKey
      if (meta && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault()
        this.open()
        return
      }
      if (e.key === '/' && !this._isTypingInField(e.target) && !this._open) {
        e.preventDefault()
        this.open()
        return
      }
      if (e.key === 'Escape' && this._open) {
        e.preventDefault()
        this.close()
      }
    })
  },

  _isTypingInField(el) {
    if (!el) return false
    const tag = (el.tagName || '').toLowerCase()
    return tag === 'input' || tag === 'textarea' || tag === 'select' || el.isContentEditable
  },

  open() {
    this._open = true
    let root = document.getElementById('sm-gs-root')
    if (!root) {
      root = document.createElement('div')
      root.id = 'sm-gs-root'
      document.body.appendChild(root)
    }
    root.innerHTML = this._shellHtml()
    root.classList.add('is-open')
    const input = document.getElementById('sm-gs-input')
    input?.focus()
    input?.addEventListener('input', () => {
      this._q = input.value
      clearTimeout(this._timer)
      this._timer = setTimeout(() => this._renderResults(), 120)
    })
    root.querySelector('.sm-gs-backdrop')?.addEventListener('click', () => this.close())
    document.getElementById('sm-gs-ai-btn')?.addEventListener('click', () => this._runAi())
    document.getElementById('sm-gs-key-save')?.addEventListener('click', () => this._saveKey())
    this._renderResults()
  },

  close() {
    this._open = false
    const root = document.getElementById('sm-gs-root')
    if (root) {
      root.classList.remove('is-open')
      root.innerHTML = ''
    }
  },

  _shellHtml() {
    const hasKey = !!(typeof SMGemini !== 'undefined' && SMGemini.getApiKey())
    return `
      <div class="sm-gs-backdrop" aria-hidden="true"></div>
      <div class="sm-gs-panel glass-card" role="dialog" aria-modal="true" aria-label="جستجوی سراسری">
        <div class="sm-gs-bar">
          <i class="fas fa-search sm-gs-ico"></i>
          <input type="search" id="sm-gs-input" class="sm-gs-input" placeholder="جستجو یا سؤال استودیو (بدهی، مراسم، پرسنل)..." autocomplete="off" dir="rtl"/>
          <kbd class="sm-gs-kbd">Esc</kbd>
        </div>
        <div class="sm-gs-body">
          <div id="sm-gs-results" class="sm-gs-results"></div>
          <div class="sm-gs-ai">
            <div class="sm-gs-ai-head">
              <span><i class="fas fa-brain"></i> مغز استودیو</span>
              <button type="button" class="sm-btn sm-btn-sm sm-btn-primary" id="sm-gs-ai-btn">پاسخ هوشمند</button>
            </div>
            ${hasKey ? '<p class="sm-gs-ai-hint">اعداد مالی از داده محلی؛ Gemini فقط در محدوده استودیو</p>' : `
            <div class="sm-gs-key-row">
              <input type="password" id="sm-gs-key" class="sm-input" placeholder="کلید Gemini (اختیاری — بدون آن هم پاسخ محلی کار می‌کند)" dir="ltr"/>
              <button type="button" class="sm-btn sm-btn-ghost sm-btn-sm" id="sm-gs-key-save">ذخیره</button>
            </div>`}
            <div id="sm-gs-ai-out" class="sm-gs-ai-out"></div>
          </div>
        </div>
        <div class="sm-gs-foot">
          <span>Ctrl+K</span>
          <span>Esc بستن</span>
          <span>فقط موضوعات استودیو</span>
        </div>
      </div>`
  },

  _saveKey() {
    const el = document.getElementById('sm-gs-key')
    const key = (el?.value || '').trim()
    if (!key) {
      SM?.toast?.('کلید خالی است', 'error')
      return
    }
    if (typeof SMGemini !== 'undefined') SMGemini.setApiKey(key)
    SM?.toast?.('کلید ذخیره شد', 'success')
    this.open()
  },

  _collect() {
    const q = (this._q || '').trim().toLowerCase()
    if (!q || q.length < 1) return { groups: this._emptyHints(), total: 0 }

    const groups = []
    const push = (route, items) => {
      if (items.length) groups.push({ route, label: this.ROUTE_LABELS[route] || route, items: items.slice(0, 8) })
    }

    const contracts = (DB.get('contracts') || []).filter((c) =>
      this._match(q, [c.couple, c.groom, c.bride, c.contractNum, c.phone, c.groomPhone, c.bridePhone, c.venue, c.status])
    ).map((c) => ({
      id: c.id,
      title: c.couple || `${c.bride || ''} و ${c.groom || ''}`.trim() || c.contractNum || 'قرارداد',
      sub: `${c.eventDate || c.date || '—'} · ${c.contractNum || ''}`,
      route: 'contracts'
    }))
    push('contracts', contracts)

    const personnel = (DB.get('personnel') || []).filter((p) =>
      this._match(q, [p.name, p.phone, p.role, ...(p.roles || [])])
    ).map((p) => ({
      id: p.id,
      title: p.name || 'پرسنل',
      sub: `${p.role || (p.roles || []).join('، ') || '—'} · ${p.phone || ''}`,
      route: 'employees'
    }))
    push('employees', personnel)

    const tx = (DB.get('transactions') || []).filter((t) =>
      this._match(q, [t.purpose, t.client, t.amount, t.date, t.notes, t.purposeCategory])
    ).map((t) => ({
      id: t.id,
      title: `${t.type === 'deposit' ? 'واریز' : 'برداشت'} ${typeof SM !== 'undefined' ? SM.fmt(t.amount || 0) : t.amount}`,
      sub: `${t.purpose || t.client || '—'} · ${t.date || ''}`,
      route: 'accounting'
    }))
    push('accounting', tx)

    const bookings = (DB.get('bookings') || []).filter((b) =>
      this._match(q, [b.title, b.client, b.phone, b.date, b.status])
    ).map((b) => ({
      id: b.id,
      title: b.title || b.client || 'رزرو',
      sub: `${b.date || ''} ${b.time || ''} · ${b.status || ''}`,
      route: 'bookings'
    }))
    push('bookings', bookings)

    const cheques = (DB.get('cheques') || []).filter((c) =>
      this._match(q, [c.number, c.payee, c.amount, c.dueDate, c.status])
    ).map((c) => ({
      id: c.id,
      title: `چک ${c.number || ''}`.trim(),
      sub: `${typeof SM !== 'undefined' ? SM.fmt(c.amount || 0) : c.amount} · ${c.dueDate || ''}`,
      route: 'accounting'
    }))
    push('cheques', cheques)

    const total = groups.reduce((s, g) => s + g.items.length, 0)
    return { groups, total }
  },

  _match(q, fields) {
    return fields.some((f) => String(f ?? '').toLowerCase().includes(q))
  },

  _emptyHints() {
    return [{
      route: 'hint',
      label: 'پیشنهاد',
      items: [
        { id: 'h1', title: 'بدهی‌های مشتریان چقدر است؟', sub: 'پاسخ هوشمند مالی', route: 'contracts' },
        { id: 'h2', title: 'نام عروس/داماد یا شماره قرارداد', sub: 'جستجوی مستقیم', route: 'contracts' },
        { id: 'h3', title: 'چک‌های این هفته', sub: 'هشدار سررسید', route: 'accounting' }
      ]
    }]
  },

  _renderResults() {
    const box = document.getElementById('sm-gs-results')
    if (!box) return
    const { groups, total } = this._collect()
    const esc = (s) => (typeof SM !== 'undefined' && SM.esc ? SM.esc(String(s ?? '')) : String(s ?? ''))

    if (!groups.length) {
      box.innerHTML = `<div class="sm-gs-empty">نتیجه‌ای یافت نشد</div>`
      return
    }

    box.innerHTML = groups.map((g) => `
      <div class="sm-gs-group">
        <div class="sm-gs-group-label">${esc(g.label)}${g.route !== 'hint' ? ` · ${g.items.length}` : ''}</div>
        ${g.items.map((it) => `
          <button type="button" class="sm-gs-item" data-route="${esc(it.route)}" data-id="${esc(it.id)}">
            <span class="sm-gs-item-title">${esc(it.title)}</span>
            <span class="sm-gs-item-sub">${esc(it.sub)}</span>
          </button>`).join('')}
      </div>`).join('') +
      (total ? `<div class="sm-gs-count">${total.toLocaleString('fa-IR')} نتیجه</div>` : '')

    box.querySelectorAll('.sm-gs-item').forEach((btn) => {
      btn.addEventListener('click', () => {
        const route = btn.getAttribute('data-route')
        if (route && route !== 'hint' && typeof SM !== 'undefined') {
          this.close()
          SM.navigate(route)
        }
      })
    })
  },

  async _runAi() {
    const out = document.getElementById('sm-gs-ai-out')
    const q = (document.getElementById('sm-gs-input')?.value || '').trim()
    if (!out) return
    if (!q) {
      out.textContent = 'ابتدا عبارت یا سؤال را بنویسید.'
      return
    }
    out.innerHTML = '<i class="fas fa-spinner fa-spin"></i> در حال تحلیل داده استودیو...'
    try {
      let text
      if (typeof StudioAIBrain !== 'undefined' && StudioAIBrain.answer) {
        text = await StudioAIBrain.answer(q, 'manager')
      } else if (typeof SMGemini !== 'undefined' && SMGemini.getApiKey()) {
        text = await SMGemini.askStudio(q)
      } else {
        text = 'موتور هوش استودیو بارگذاری نشده. صفحه را رفرش کنید.'
      }
      out.textContent = text || 'پاسخی دریافت نشد.'
    } catch (e) {
      out.textContent = 'خطا: ' + (e.message || e)
    }
  }
}

window.GlobalSearch = GlobalSearch

;(function boot() {
  function tryMount() {
    if (document.querySelector('.sm-header-actions')) GlobalSearch.mount()
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      setTimeout(tryMount, 200)
      setTimeout(tryMount, 800)
    })
  } else {
    setTimeout(tryMount, 200)
    setTimeout(tryMount, 800)
  }
  window.addEventListener('hashchange', () => setTimeout(tryMount, 100))
  const obs = new MutationObserver(() => tryMount())
  document.addEventListener('DOMContentLoaded', () => {
    const root = document.getElementById('sm-root')
    if (root) obs.observe(root, { childList: true, subtree: true })
  })
})()
