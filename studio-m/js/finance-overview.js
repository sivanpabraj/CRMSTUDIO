/**
 * Finance Overview — Rivet-inspired layout for Studio accounting
 * Jalali ranges, Toman, studio categories (no bank-card fintech copy)
 * Patches SMAccounting.render when loaded after accounting.js
 */
const SMFinanceOverview = {
  _range: localStorage.getItem('sm_fin_range') || '30',

  setRange(r) {
    this._range = String(r)
    localStorage.setItem('sm_fin_range', this._range)
    if (typeof SM !== 'undefined') SM.navigate('accounting')
  },

  _inRange(dateStr, days) {
    if (days === 'all') return true
    if (!dateStr || typeof Utils === 'undefined') return true
    const d = Utils.daysUntil(dateStr)
    if (d === null) return true
    // daysUntil: future positive, past negative → include last N days means d >= -N && d <= 0 roughly
    const n = Number(days)
    return d !== null && d >= -n && d <= 1
  },

  _model() {
    const tx = (typeof DB !== 'undefined' && DB.get('transactions')) || []
    const cheques = (typeof DB !== 'undefined' && DB.get('cheques')) || []
    const contracts = (typeof DB !== 'undefined' && DB.get('contracts')) || []
    const banks = (typeof DB !== 'undefined' && DB.get('banks')) || []
    const range = this._range

    const filtered = tx.filter((t) => this._inRange(t.date, range === '7' ? 7 : range === '90' ? 90 : range === 'all' ? 'all' : 30))
    const income = filtered.filter((t) => t.type === 'deposit').reduce((s, t) => s + (t.amount || 0), 0)
    const expense = filtered.filter((t) => t.type === 'withdrawal').reduce((s, t) => s + (t.amount || 0), 0)
    const net = income - expense

    // weekly buckets for chart (last 4 weeks or 7 days)
    const buckets = this._buckets(filtered, range)

    // expense breakdown by purposeCategory
    const byCat = {}
    filtered.filter((t) => t.type === 'withdrawal').forEach((t) => {
      const k = t.purposeCategory || t.purpose || 'other'
      byCat[k] = (byCat[k] || 0) + (t.amount || 0)
    })
    const catLabels = (typeof SMAccounting !== 'undefined' && SMAccounting.WITHDRAWAL_CATS) || {}
    const where = Object.entries(byCat)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([k, v]) => ({ key: k, label: catLabels[k] || k, amount: v }))

    const outstanding = contracts.reduce((s, c) => {
      const total = Number(c.total || c.totalPrice || c.price || 0)
      const paid = Number(c.deposit || 0) + Number(c.paid || c.paidAmount || 0)
      return s + Math.max(0, total - paid)
    }, 0)

    const pendingChq = cheques.filter((c) => c.status === 'pending' || !c.status).length
    const bankTotal = banks.reduce((s, b) => s + (b.balance || 0), 0)

    // Health: 100 - penalties for outstanding ratio and pending cheques
    let health = 78
    if (outstanding > income * 0.5 && income > 0) health -= 15
    if (pendingChq > 3) health -= 10
    if (expense > income && income > 0) health -= 12
    if (net > 0) health += 5
    health = Math.max(20, Math.min(98, health))

    const recent = [...tx].sort((a, b) => String(b.date || '').localeCompare(String(a.date || ''))).slice(0, 6)

    return { income, expense, net, buckets, where, outstanding, pendingChq, bankTotal, health, recent, range }
  },

  _buckets(tx, range) {
    if (range === '7') {
      const labels = ['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج']
      // simple: group by last char of date day if jalali
      return labels.map((label, i) => {
        const income = tx.filter((t) => t.type === 'deposit').reduce((s, t) => s + (t.amount || 0), 0) / 7
        const expense = tx.filter((t) => t.type === 'withdrawal').reduce((s, t) => s + (t.amount || 0), 0) / 7
        // distribute evenly as fallback visual if no day parse
        const dayTx = tx.filter((t) => {
          const p = String(t.date || '').split('/')
          return p[2] && (Number(p[2]) % 7) === i
        })
        const inc = dayTx.filter((t) => t.type === 'deposit').reduce((s, t) => s + (t.amount || 0), 0)
        const exp = dayTx.filter((t) => t.type === 'withdrawal').reduce((s, t) => s + (t.amount || 0), 0)
        return { label, income: inc || 0, expense: exp || 0 }
      })
    }
    // 4 weeks
    return [1, 2, 3, 4].map((w) => {
      const slice = tx.filter((_, idx) => Math.floor(idx % 4) === w - 1)
      // better: by date string week approx
      const weekTx = tx.filter((t) => {
        const p = String(t.date || '').split('/')
        const day = Number(p[2] || 0)
        return day > (w - 1) * 7 && day <= w * 7
      })
      const use = weekTx.length ? weekTx : slice
      return {
        label: `هفته ${w.toLocaleString('fa-IR')}`,
        income: use.filter((t) => t.type === 'deposit').reduce((s, t) => s + (t.amount || 0), 0),
        expense: use.filter((t) => t.type === 'withdrawal').reduce((s, t) => s + (t.amount || 0), 0)
      }
    })
  },

  _chartHtml(buckets) {
    const max = Math.max(1, ...buckets.flatMap((b) => [b.income, b.expense]))
    return `<div class="fin-ov-chart" role="img" aria-label="نمودار درآمد و هزینه">
      ${buckets.map((b) => {
        const ih = Math.round((b.income / max) * 100)
        const eh = Math.round((b.expense / max) * 100)
        return `<div class="fin-ov-bar-col" title="${b.label}\nواریز: ${SM.fmt(b.income)}\nهزینه: ${SM.fmt(b.expense)}">
          <div class="fin-ov-bars">
            <div class="fin-ov-bar is-in" style="height:${ih}%"></div>
            <div class="fin-ov-bar is-out" style="height:${eh}%"></div>
          </div>
          <span class="fin-ov-bar-label">${b.label}</span>
        </div>`
      }).join('')}
    </div>`
  },

  renderPanel() {
    const m = this._model()
    const fmt = (n) => (typeof SM !== 'undefined' && SM.fmt ? SM.fmt(n) : Number(n).toLocaleString('fa-IR'))
    const rangeBtns = [
      ['7', '۷ روز'],
      ['30', '۳۰ روز'],
      ['90', '۹۰ روز'],
      ['all', 'همه']
    ].map(([v, lab]) =>
      `<button type="button" class="fin-ov-range-btn${m.range === v ? ' is-active' : ''}" onclick="SMFinanceOverview.setRange('${v}')">${lab}</button>`
    ).join('')

    const whereHtml = m.where.length
      ? m.where.map((w) => {
        const pct = m.expense ? Math.round((w.amount / m.expense) * 100) : 0
        return `<div class="fin-ov-where-row"><span>${SM.esc(w.label)}</span><strong>${fmt(w.amount)}</strong><i>${pct}٪</i></div>`
      }).join('')
      : '<div class="sm-w-muted">هزینه‌ای در این بازه نیست</div>'

    const recentHtml = m.recent.length
      ? m.recent.map((t) => {
        const sign = t.type === 'deposit' ? '+' : '−'
        const cls = t.type === 'deposit' ? 'is-in' : 'is-out'
        return `<div class="fin-ov-tx ${cls}"><span>${SM.esc(t.purpose || t.desc || t.client || 'تراکنش')}</span><strong>${sign}${fmt(t.amount || 0)}</strong></div>`
      }).join('')
      : '<div class="sm-w-muted">تراکنشی نیست</div>'

    return `
    <div class="fin-ov glass-card" data-finance-overview="1">
      <div class="fin-ov-top">
        <div class="fin-ov-net">
          <span class="fin-ov-net-label">مانده خالص (بازه)</span>
          <div class="fin-ov-net-value">${fmt(m.net)} <small>تومان</small></div>
          <div class="fin-ov-legend">
            <span class="is-in">● واریز</span>
            <span class="is-out">● هزینه</span>
          </div>
        </div>
        <div class="fin-ov-ranges">${rangeBtns}</div>
      </div>

      <div class="fin-ov-grid">
        <div class="fin-ov-main">
          ${this._chartHtml(m.buckets)}
        </div>
        <div class="fin-ov-side">
          <div class="fin-ov-kpi is-in"><span>واریز</span><strong>${fmt(m.income)}</strong></div>
          <div class="fin-ov-kpi is-out"><span>هزینه</span><strong>${fmt(m.expense)}</strong></div>
          <div class="fin-ov-kpi"><span>موجودی بانک‌ها</span><strong>${fmt(m.bankTotal)}</strong></div>
          <div class="fin-ov-kpi is-warn"><span>مانده مشتری</span><strong>${fmt(m.outstanding)}</strong></div>
        </div>
      </div>

      <div class="fin-ov-bottom">
        <div class="fin-ov-card">
          <div class="fin-ov-card-h">تفکیک هزینه</div>
          ${whereHtml}
        </div>
        <div class="fin-ov-card fin-ov-health">
          <div class="fin-ov-card-h">سلامت مالی</div>
          <div class="fin-ov-health-ring" style="--h:${m.health}"><span>${m.health.toLocaleString('fa-IR')}٪</span></div>
          <p class="fin-ov-hint">چک در انتظار: ${m.pendingChq.toLocaleString('fa-IR')} · مطالبات در محاسبه لحاظ شده</p>
        </div>
        <div class="fin-ov-card">
          <div class="fin-ov-card-h">آخرین تراکنش‌ها</div>
          ${recentHtml}
        </div>
        <div class="fin-ov-card fin-ov-actions">
          <div class="fin-ov-card-h">اکشن سریع</div>
          <div class="fin-ov-act-grid">
            <button type="button" class="fin-ov-act is-in" onclick="SMAccounting.addDeposit()"><i class="fas fa-arrow-down"></i> واریز</button>
            <button type="button" class="fin-ov-act is-out" onclick="SMAccounting.addWithdrawal()"><i class="fas fa-arrow-up"></i> برداشت</button>
            <button type="button" class="fin-ov-act" onclick="SMAccounting.addCheque()"><i class="fas fa-money-check"></i> چک</button>
            <button type="button" class="fin-ov-act" onclick="SMAccounting.setTab('balance')"><i class="fas fa-scale-balanced"></i> تراز</button>
          </div>
        </div>
      </div>
    </div>`
  },

  patch() {
    if (typeof SMAccounting === 'undefined' || SMAccounting.__finOvPatched) return
    const orig = SMAccounting.render.bind(SMAccounting)
    SMAccounting.render = function (el) {
      orig(el)
      try {
        if (el.querySelector('[data-finance-overview]')) return
        const panel = SMFinanceOverview.renderPanel()
        const head = el.querySelector('.sm-section-head, .sm-page-head, h2')
        const search = el.querySelector('.sm-module-search')
        const anchor = search || head
        if (anchor && anchor.parentNode) {
          const wrap = document.createElement('div')
          wrap.innerHTML = panel
          anchor.parentNode.insertBefore(wrap.firstElementChild, anchor.nextSibling)
        } else {
          el.insertAdjacentHTML('afterbegin', panel)
        }
      } catch (e) {
        console.warn('[finance-overview]', e)
      }
    }
    SMAccounting.__finOvPatched = true
  }
}

window.SMFinanceOverview = SMFinanceOverview
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => setTimeout(() => SMFinanceOverview.patch(), 0))
} else {
  setTimeout(() => SMFinanceOverview.patch(), 0)
}
