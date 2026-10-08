/**
 * Studio AI Brain — موتور تصمیم و هشدار مقید به داده استودیو
 * - فقط موضوعات پروژه (قرارداد، مالی، پرسنل، workflow، مشتری)
 * - محاسبه بدهی/فیش از DB واقعی
 * - بریفینگ نقش‌محور + اعلان داخل‌اپ
 * - Gemini فقط با همان context (سوالات نامرتبط رد می‌شود)
 */
const StudioAIBrain = {
  version: '1.0.0',
  _lastRun: 0,
  _notifiedKeys: new Set(),

  /** ─── داده دقیق مالی و عملیاتی ─── */
  snapshot() {
    const contracts = (typeof DB !== 'undefined' && DB.get('contracts')) || []
    const tx = (typeof DB !== 'undefined' && DB.get('transactions')) || []
    const cheques = (typeof DB !== 'undefined' && DB.get('cheques')) || []
    const personnel = (typeof DB !== 'undefined' && DB.get('personnel')) || []
    const projects = (typeof DB !== 'undefined' && DB.get('persProjects')) || []
    const bookings = (typeof DB !== 'undefined' && DB.get('bookings')) || []
    const invoices = (typeof DB !== 'undefined' && DB.get('invoices')) || []
    const packages = (typeof DB !== 'undefined' && DB.get('packages')) || []

    const income = tx.filter((t) => t.type === 'deposit').reduce((s, t) => s + Number(t.amount || 0), 0)
    const expense = tx.filter((t) => t.type === 'withdrawal').reduce((s, t) => s + Number(t.amount || 0), 0)

    const contractFinance = contracts
      .filter((c) => c.status !== 'cancelled')
      .map((c) => {
        const total = Number(c.total || c.totalPrice || c.finalAmount || c.price || 0)
        const deposit = Number(c.deposit || c.prepayment || 0)
        const paidExtra = Number(c.paid || c.paidAmount || 0)
        // تراکنش‌های مرتبط
        const txPaid = tx
          .filter((t) => t.type === 'deposit' && t.contractId === c.id)
          .reduce((s, t) => s + Number(t.amount || 0), 0)
        const paid = Math.max(deposit + paidExtra, deposit + txPaid > deposit ? deposit + txPaid - deposit + paidExtra : deposit + paidExtra)
        // دقیق‌تر: max(deposit,0) + sum deposits linked - avoid double count if deposit already in tx
        const linkedDeposits = tx
          .filter((t) => t.type === 'deposit' && (t.contractId === c.id))
          .reduce((s, t) => s + Number(t.amount || 0), 0)
        const totalPaid = linkedDeposits > 0 ? linkedDeposits : deposit + paidExtra
        const debt = Math.max(0, total - totalPaid)
        const days = typeof Utils !== 'undefined' ? Utils.daysUntil(c.eventDate || c.date) : null
        return {
          id: c.id,
          couple: c.couple || `${c.bride || ''} و ${c.groom || ''}`.replace(/^ و | و $/g, '').trim() || '—',
          contractNum: c.contractNum || '',
          total,
          totalPaid,
          debt,
          days,
          status: c.status || '',
          stage: c.stage || c.workflowStage || '',
          packageName: c.packageName || c.package || ''
        }
      })

    const totalDebt = contractFinance.reduce((s, c) => s + c.debt, 0)
    const overdueDebt = contractFinance.filter((c) => c.days !== null && c.days < 0 && c.debt > 0)
    const upcoming = contractFinance.filter((c) => c.days !== null && c.days >= 0 && c.days <= 7)

    const pendingCheques = cheques.filter((c) => c.status === 'pending' || (!c.status && c.status !== 'passed'))
    const chequeSoon = pendingCheques
      .map((c) => ({ ...c, days: typeof Utils !== 'undefined' ? Utils.daysUntil(c.dueDate) : null }))
      .filter((c) => c.days !== null && c.days >= 0 && c.days <= 7)

    const todayProjects = projects.filter((p) => {
      if (p.status === 'done' || p.status === 'cancelled') return false
      const d = typeof Utils !== 'undefined' ? Utils.daysUntil(p.eventDate || p.deadline || p.date) : null
      return d !== null && d >= 0 && d <= 1
    })

    return {
      income,
      expense,
      net: income - expense,
      totalDebt,
      contractFinance,
      overdueDebt,
      upcoming,
      pendingCheques: pendingCheques.length,
      chequeSoon,
      activePersonnel: personnel.filter((p) => p.status === 'active').length,
      todayProjects,
      openBookings: bookings.filter((b) => b.status === 'pending' || b.status === 'lead').length,
      invoicesCount: invoices.length,
      packages: packages.map((p) => ({ name: p.name || p.title, price: Number(p.price || p.total || 0) })),
      today: typeof Utils !== 'undefined' && Utils.todayJalali ? Utils.todayJalali() : ''
    }
  },

  /** مرحله قابل فهم برای مشتری */
  customerStage(contract) {
    if (!contract) return null
    const days = typeof Utils !== 'undefined' ? Utils.daysUntil(contract.eventDate || contract.date) : null
    const stage = contract.stage || contract.workflowStage || ''
    const total = Number(contract.total || contract.totalPrice || 0)
    const deposit = Number(contract.deposit || 0)
    const paidExtra = Number(contract.paid || 0)
    const txPaid = ((typeof DB !== 'undefined' && DB.get('transactions')) || [])
      .filter((t) => t.type === 'deposit' && t.contractId === contract.id)
      .reduce((s, t) => s + Number(t.amount || 0), 0)
    const totalPaid = txPaid > 0 ? txPaid : deposit + paidExtra
    const debt = Math.max(0, total - totalPaid)

    let label = 'در حال پیگیری'
    let detail = ''
    let nextAction = ''

    if (days === null) {
      label = 'ثبت اولیه'
      detail = 'تاریخ مراسم در پرونده کامل نیست.'
      nextAction = 'با استودیو برای تثبیت تاریخ هماهنگ کنید.'
    } else if (days > 14) {
      label = 'آماده‌سازی پیش از مراسم'
      detail = `${days.toLocaleString('fa-IR')} روز تا مراسم`
      nextAction = debt > 0 ? `مانده حساب: ${this._fmt(debt)} تومان — اقساط را پیگیری کنید.` : 'حساب شما از نظر بیعانه در وضعیت مناسب است.'
    } else if (days >= 1 && days <= 14) {
      label = 'هماهنگی نهایی'
      detail = `فقط ${days.toLocaleString('fa-IR')} روز مانده`
      nextAction = 'ساعت خروج، لوکیشن و جزئیات روز مراسم را تأیید کنید.'
    } else if (days === 0) {
      label = 'روز مراسم'
      detail = 'تیم استودیو امروز در کنار شماست.'
      nextAction = 'آرامش و هماهنگی با هماهنگ‌کننده.'
    } else {
      const passed = Math.abs(days)
      if (/edit|تدوین|color|روتوش/i.test(stage) || passed <= 20) {
        label = 'تدوین و تولید'
        detail = `${passed.toLocaleString('fa-IR')} روز از مراسم گذشته`
        nextAction = 'پیش‌نمایش و انتخاب عکس به‌زودی در پرتال.'
      } else if (/deliver|تحویل|done|complete/i.test(stage)) {
        label = 'آماده تحویل / تحویل‌شده'
        detail = 'مرحله نهایی بسته'
        nextAction = debt > 0 ? `برای تحویل نهایی مانده ${this._fmt(debt)} تومان را تسویه کنید.` : 'برای دریافت نهایی با استودیو هماهنگ کنید.'
      } else {
        label = 'پس از مراسم — تولید'
        detail = `${passed.toLocaleString('fa-IR')} روز از مراسم`
        nextAction = debt > 0 ? `مانده: ${this._fmt(debt)} تومان` : 'در صف تولید و کنترل کیفیت.'
      }
    }

    return {
      couple: contract.couple || `${contract.bride || ''} و ${contract.groom || ''}`.trim(),
      label,
      detail,
      nextAction,
      debt,
      total,
      totalPaid,
      days,
      stage
    }
  },

  /** برنامه امروز برای یک پرسنل */
  staffTodayBrief(personnelId, phone) {
    const projects = ((typeof DB !== 'undefined' && DB.get('persProjects')) || []).filter((p) => {
      if (personnelId && (p.personnelId === personnelId || p.userId === personnelId)) return true
      if (phone && String(p.personnelPhone || '').includes(String(phone).slice(-10))) return true
      return false
    })
    const open = projects.filter((p) => p.status !== 'done' && p.status !== 'cancelled' && p.accepted !== false)
    const due = open
      .map((p) => ({
        ...p,
        days: typeof Utils !== 'undefined' ? Utils.daysUntil(p.deadline || p.eventDate || p.date) : null
      }))
      .sort((a, b) => (a.days ?? 99) - (b.days ?? 99))

    const first = due[0]
    const lines = []
    if (!first) {
      lines.push('برای امروز پروژه فوری ثبت نشده — با هماهنگ‌کننده وضعیت آفیش را چک کنید.')
    } else {
      const when =
        first.days === 0 ? 'امروز' : first.days === 1 ? 'فردا' : first.days != null ? `${first.days} روز دیگر` : 'بدون ددلاین'
      lines.push(`شروع پیشنهادی: «${first.couple || first.title || 'پروژه'}» — نقش: ${first.role || '—'} — موعد: ${when}`)
      if (due.length > 1) lines.push(`بعدی در صف: ${due.length - 1} مورد دیگر`)
    }
    const unpaid = open.reduce((s, p) => s + Math.max(0, Number(p.amount || 0) - Number(p.paid || 0)), 0)
    if (unpaid > 0) lines.push(`جمع دستمزد تسویه‌نشده پروژه‌ها: ${this._fmt(unpaid)} تومان`)
    return { lines, due, openCount: open.length }
  },

  /** پیشنهادات مدیر — دقیق */
  managerActions(snap) {
    const actions = []
    if (snap.overdueDebt.length) {
      const top = snap.overdueDebt.slice(0, 3)
      actions.push({
        severity: 'danger',
        title: 'بدهی پس از مراسم',
        text: `${snap.overdueDebt.length} قرارداد مانده دارند (جمع ${this._fmt(snap.totalDebt)} تومان مطالبات کل). نمونه: ${top.map((c) => c.couple).join('، ')}`,
        route: 'contracts',
        key: 'debt-overdue'
      })
    }
    if (snap.chequeSoon.length) {
      actions.push({
        severity: 'warning',
        title: 'چک‌های ۷ روز آینده',
        text: `${snap.chequeSoon.length} فقره — جمع ${this._fmt(snap.chequeSoon.reduce((s, c) => s + Number(c.amount || 0), 0))} تومان`,
        route: 'accounting',
        key: 'cheque-soon'
      })
    }
    if (snap.upcoming.length) {
      actions.push({
        severity: 'info',
        title: 'مراسم هفته پیش‌رو',
        text: snap.upcoming.map((c) => `${c.couple} (${c.days === 0 ? 'امروز' : c.days + ' روز'})`).join(' · '),
        route: 'calendar',
        key: 'events-week'
      })
    }
    if (snap.openBookings > 0) {
      actions.push({
        severity: 'warning',
        title: 'رزرو/لید باز',
        text: `${snap.openBookings} مورد در انتظار پیگیری منشی`,
        route: 'bookings',
        key: 'bookings-open'
      })
    }
    if (snap.expense > snap.income && snap.income > 0) {
      actions.push({
        severity: 'warning',
        title: 'هزینه بیشتر از واریز',
        text: `خالص فعلی ${this._fmt(snap.net)} تومان — تفکیک هزینه را ببینید`,
        route: 'accounting',
        key: 'burn'
      })
    }
    if (!actions.length) {
      actions.push({
        severity: 'success',
        title: 'وضعیت پایدار',
        text: `خالص ${this._fmt(snap.net)} · مطالبات ${this._fmt(snap.totalDebt)} · چک در انتظار ${snap.pendingCheques}`,
        route: 'dashboard',
        key: 'ok'
      })
    }
    return actions
  },

  /** اعلان‌های لازم — بدون اسپم */
  pushAlerts(force = false) {
    const snap = this.snapshot()
    const actions = this.managerActions(snap)
    const today = snap.today || 'x'
    actions.forEach((a) => {
      if (a.severity === 'success') return
      const key = `${today}:${a.key}`
      if (!force && this._notifiedKeys.has(key)) return
      if (!force) {
        try {
          const stored = JSON.parse(localStorage.getItem('sm_ai_alert_keys') || '[]')
          if (stored.includes(key)) return
          stored.push(key)
          while (stored.length > 40) stored.shift()
          localStorage.setItem('sm_ai_alert_keys', JSON.stringify(stored))
        } catch { /* */ }
      }
      this._notifiedKeys.add(key)
      if (typeof NotifyHub !== 'undefined' && NotifyHub.notifyInApp) {
        NotifyHub.notifyInApp(`🤖 ${a.title}`, a.text, {
          type: 'ai_alert',
          severity: a.severity,
          route: a.route,
          priority: a.severity === 'danger' ? 'high' : 'normal'
        })
      }
    })
    return actions
  },

  /** متن بریفینگ برای UI */
  renderBriefHtml(role = 'manager', opts = {}) {
    const snap = this.snapshot()
    const esc = (s) => (typeof SM !== 'undefined' && SM.esc ? SM.esc(String(s ?? '')) : String(s ?? ''))
    let body = ''

    if (role === 'manager') {
      const acts = this.managerActions(snap)
      body = `
        <div class="sai-kpis">
          <div><span>واریز</span><b>${esc(this._fmt(snap.income))}</b></div>
          <div><span>هزینه</span><b>${esc(this._fmt(snap.expense))}</b></div>
          <div><span>مطالبات</span><b>${esc(this._fmt(snap.totalDebt))}</b></div>
          <div><span>خالص</span><b>${esc(this._fmt(snap.net))}</b></div>
        </div>
        <ul class="sai-list">${acts.map((a) => `<li class="sai-${a.severity}"><strong>${esc(a.title)}</strong> — ${esc(a.text)}
          ${a.route ? `<button type="button" class="sm-btn sm-btn-xs sm-btn-ghost" onclick="SM.navigate('${a.route}')">برو</button>` : ''}
        </li>`).join('')}</ul>`
    } else if (role === 'staff') {
      const brief = this.staffTodayBrief(opts.personnelId, opts.phone)
      body = `<ul class="sai-list">${brief.lines.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>`
    } else if (role === 'customer' && opts.contract) {
      const st = this.customerStage(opts.contract)
      body = st
        ? `<div class="sai-stage"><div class="sai-stage-label">${esc(st.label)}</div>
            <p>${esc(st.detail)}</p><p class="sai-next">${esc(st.nextAction)}</p>
            <div class="sai-kpis"><div><span>مبلغ کل</span><b>${esc(this._fmt(st.total))}</b></div>
            <div><span>پرداخت‌شده</span><b>${esc(this._fmt(st.totalPaid))}</b></div>
            <div><span>مانده</span><b>${esc(this._fmt(st.debt))}</b></div></div></div>`
        : '<p>قراردادی یافت نشد.</p>'
    }

    return `<div class="sai-brief glass-card" data-studio-ai-brief="1">
      <div class="sai-head"><i class="fas fa-brain"></i> مغز استودیو <small>v${this.version}</small>
        <button type="button" class="sm-btn sm-btn-xs sm-btn-ghost" onclick="StudioAIBrain.refreshUi()">به‌روز</button>
      </div>
      ${body}
      <p class="sai-note">فقط بر اساس داده همین استودیو — سؤالات نامرتبط پاسخ داده نمی‌شود.</p>
    </div>`
  },

  refreshUi() {
    this.pushAlerts(false)
    if (typeof SM !== 'undefined' && SM.navigate) SM.navigate(SM.state?.route || 'dashboard')
    else location.reload()
  },

  /** پاسخ مقید — اول قوانین محلی، بعد Gemini */
  async answer(question, role = 'manager') {
    const q = String(question || '').trim()
    if (!q) return 'سؤال خالی است.'

    if (!this._isOnTopic(q)) {
      return 'فقط درباره قرارداد، مالی، پرسنل، زمان‌بندی، تحویل و امور همین استودیو پاسخ می‌دهم. سؤال را در همین چارچوب بپرسید.'
    }

    // پاسخ قطعی محلی برای اعداد
    const local = this._tryLocalAnswer(q)
    if (local) return local

    if (typeof SMGemini === 'undefined' || !SMGemini.getApiKey()) {
      const snap = this.snapshot()
      const acts = this.managerActions(snap)
      return acts.map((a) => `• ${a.title}: ${a.text}`).join('\n')
    }

    // Gemini با system سخت
    const snap = this.snapshot()
    const strict = `تو فقط دستیار ERP استودیو فیلم/عکس هستی.
قوانین:
1) فقط درباره داده JSON زیر صحبت کن.
2) اگر سؤال سیاسی، عمومی، برنامه‌نویسی، یا خارج از استودیو بود دقیقاً بگو: «خارج از محدوده استودیو است.»
3) مبالغ را به تومان و از روی JSON بگو؛ عدد از خودت نساز.
4) بدهی = total - totalPaid برای هر قرارداد.
5) پاسخ فارسی، کوتاه، عملی.
داده:
${JSON.stringify({
  stats: {
    income: snap.income,
    expense: snap.expense,
    net: snap.net,
    totalDebt: snap.totalDebt,
    pendingCheques: snap.pendingCheques,
    openBookings: snap.openBookings
  },
  debts: snap.contractFinance.filter((c) => c.debt > 0).slice(0, 15),
  upcoming: snap.upcoming.slice(0, 10),
  chequesSoon: snap.chequeSoon.slice(0, 8).map((c) => ({ amount: c.amount, due: c.dueDate, days: c.days })),
  packages: snap.packages.slice(0, 12),
  role
})}`

    const prev = SMGemini.askStudio
    // use raw fetch with strict prompt
    const key = SMGemini.getApiKey()
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${SMGemini.MODEL}:generateContent?key=${encodeURIComponent(key)}`
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: strict + '\n\nسؤال: ' + q }] }],
        generationConfig: { temperature: 0.2, maxOutputTokens: 600 }
      })
    })
    if (!res.ok) throw new Error('خطای Gemini ' + res.status)
    const data = await res.json()
    return (data?.candidates?.[0]?.content?.parts || []).map((p) => p.text).join('\n').trim() || 'پاسخی نبود.'
  },

  _isOnTopic(q) {
    const s = q.toLowerCase()
    const allow = /قرارداد|مشتری|عروس|داماد|بدهی|مانده|پرداخت|واریز|هزینه|چک|فیش|فاکتور|پرسنل|عکاس|تدوین|مراسم|آلبوم|تحویل|رزرو|نوبت|حقوق|دستمزد|پکیج|قیمت|حساب|بانک|استودیو|workflow|تایم|امروز|فردا|وضعیت|مرحله/i
    const deny = /انتخابات|بیت‌?کوین|دموکراسی|جنگ|فوتبال جهانی|دستور پخت|برنامه‌?نویسی پایتون|جوک سیاسی/i
    if (deny.test(s)) return false
    if (allow.test(s)) return true
    // کوتاه و مبهم: اجازه بده مدل با context جواب بدهد ولی اگر کاملاً بی‌ربط بود deny
    if (s.length < 8) return true
    return allow.test(s)
  },

  _tryLocalAnswer(q) {
    const snap = this.snapshot()
    if (/مطالبات|بدهی|مانده مشتری|بدهکار/i.test(q)) {
      const lines = snap.contractFinance
        .filter((c) => c.debt > 0)
        .sort((a, b) => b.debt - a.debt)
        .slice(0, 8)
        .map((c) => `• ${c.couple}: مانده ${this._fmt(c.debt)} از ${this._fmt(c.total)} (پرداخت ${this._fmt(c.totalPaid)})`)
      return `جمع مطالبات: ${this._fmt(snap.totalDebt)} تومان\n${lines.join('\n') || 'مانده‌ای ثبت نشده.'}`
    }
    if (/خالص|سود|موجودی کل|جمع واریز|درآمد/i.test(q)) {
      return `واریز کل: ${this._fmt(snap.income)}\nهزینه کل: ${this._fmt(snap.expense)}\nخالص: ${this._fmt(snap.net)} تومان`
    }
    if (/چک/i.test(q)) {
      return `چک در انتظار: ${snap.pendingCheques}\nسررسید ۷ روز: ${snap.chequeSoon.length} فقره`
    }
    if (/پکیج|قیمت پکیج/i.test(q) && snap.packages.length) {
      return snap.packages.map((p) => `• ${p.name}: ${this._fmt(p.price)} تومان`).join('\n')
    }
    return null
  },

  _fmt(n) {
    if (typeof SM !== 'undefined' && SM.fmt) return SM.fmt(n)
    return Number(n || 0).toLocaleString('fa-IR')
  },

  /** شروع خودکار بعد از ورود */
  start() {
    if (this._started) return
    this._started = true
    setTimeout(() => {
      try {
        this.pushAlerts(false)
        this._injectBrief()
      } catch (e) {
        console.warn('[StudioAIBrain]', e)
      }
    }, 1200)
    // هر ۲ ساعت یک‌بار در session
    setInterval(() => {
      try {
        this.pushAlerts(false)
      } catch { /* */ }
    }, 2 * 60 * 60 * 1000)
  },

  _injectBrief() {
    const route = (location.hash || '#dashboard').replace('#', '') || 'dashboard'
    if (route !== 'dashboard') return
    const main = document.getElementById('sm-content')
    if (!main || main.querySelector('[data-studio-ai-brief]')) return
    const html = this.renderBriefHtml('manager')
    main.insertAdjacentHTML('afterbegin', html)
  }
}

window.StudioAIBrain = StudioAIBrain

;(function () {
  function boot() {
    if (typeof SM !== 'undefined' && SM.guard) {
      // wait for login shell
      setTimeout(() => StudioAIBrain.start(), 1500)
    } else {
      setTimeout(boot, 500)
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot)
  else boot()
  window.addEventListener('hashchange', () => setTimeout(() => StudioAIBrain._injectBrief(), 300))
})()
