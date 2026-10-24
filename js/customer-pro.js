/* ══════════════════════════════════════════════════════════════════════════
   CRMSTUDIO — Professional Customer Portal (Customer Pro)
   ماژول پرتال مشتری: تم دوگانه، ۳ کارت شاخص و هوش مصنوعی مقید به پرونده
   ══════════════════════════════════════════════════════════════════════════ */

(function () {
  'use strict'

  const CustomerPro = {
    state: {
      theme: 'dark',
      messages: [],
      isThinking: false
    },

    init() {
      if (typeof window === 'undefined' || typeof document === 'undefined') return
      this.initTheme()
      this.hookCustomerPortal()
    },

    // ─── ۱. تم تاریک و روشن بدون عکس ──────────────────────────────────────
    initTheme() {
      try {
        const saved = localStorage.getItem('customer_theme') || 'dark'
        this.setTheme(saved)
      } catch {
        this.setTheme('dark')
      }
    },

    setTheme(theme) {
      this.state.theme = theme === 'light' ? 'light' : 'dark'
      document.body.setAttribute('data-customer-theme', this.state.theme)
      try { localStorage.setItem('customer_theme', this.state.theme) } catch { /* */ }
      this.updateThemeButton()
    },

    toggleTheme() {
      const next = this.state.theme === 'dark' ? 'light' : 'dark'
      this.setTheme(next)
      if (typeof Utils !== 'undefined' && Utils.toast) {
        Utils.toast(next === 'light' ? 'تم روشن استودیویی فعال شد' : 'تم تاریک فعال شد', 'info')
      }
    },

    updateThemeButton() {
      const btn = document.getElementById('customer-pro-theme-toggle')
      if (btn) {
        const isDark = this.state.theme === 'dark'
        btn.innerHTML = `<i class="fas fa-${isDark ? 'sun' : 'moon'}"></i>`
        btn.title = isDark ? 'تغییر به تم روشن' : 'تغییر به تم تاریک'
      }
    },

    // ─── ۲. اتصال به چرخه رندر پرتال مشتری ───────────────────────────────
    hookCustomerPortal() {
      if (typeof CustomerPortal === 'undefined') return
      const origRender = CustomerPortal.renderDashboard

      CustomerPortal.renderDashboard = () => {
        origRender.call(CustomerPortal)
        this.enhanceHeader()
        this.injectCardsAndAI()
        this.injectInteractiveTimeline()
      }
    },

    enhanceHeader() {
      const actions = document.querySelector('.portal-header-actions')
      if (actions && !document.getElementById('customer-pro-theme-toggle')) {
        const themeBtn = document.createElement('button')
        themeBtn.type = 'button'
        themeBtn.id = 'customer-pro-theme-toggle'
        themeBtn.className = 'customer-pro-theme-btn'
        themeBtn.onclick = () => this.toggleTheme()
        actions.prepend(themeBtn)
        this.updateThemeButton()
      }
    },

    getContractData() {
      if (typeof CustomerPortal === 'undefined') return null
      const cached = CustomerPortal.state?.contract
      if (!cached) return null
      if (typeof DB !== 'undefined' && DB.find) {
        return DB.find('contracts', x => x.id === cached.id) || cached
      }
      return cached
    },

    // ─── ۳. ساخت و تزریق سه کارت شاخص و باکس دستیار هوشمند ───────────────
    injectCardsAndAI() {
      const c = this.getContractData()
      if (!c) return

      const appEl = document.getElementById('customer-app')
      const targetParent = appEl ? appEl.querySelector('.customer-welcome') : null
      if (!targetParent) return

      // محاسبه اطلاعات ۳ کارت شاخص
      const persProjects = (typeof DB !== 'undefined' && DB.filter) ? DB.filter('persProjects', p => p.contractId === c.id) : []
      const stage = typeof PortalShared !== 'undefined' ? PortalShared.getContractStage(c, persProjects) : 0
      const stageLabel = (typeof PortalShared !== 'undefined' && PortalShared.CUSTOMER_PIPELINE?.[stage]?.label) || 'در حال انجام'

      const total = Number(c.total) || 0
      const paid = Number(c.paid) || 0
      const remaining = Math.max(0, total - paid)

      // محاسبه اقدام بعدی
      let nextActionTitle = 'در انتظار تحویل خروجی‌ها'
      let nextActionSub = 'استودیو در حال نهایی‌سازی سفارش شماست.'
      if (!c.customerSignature) {
        nextActionTitle = 'تأیید و امضای قرارداد'
        nextActionSub = 'لطفاً مفاد قرارداد را مطالعه و امضا فرمایید.'
      } else if (remaining > 0 && stage >= 3) {
        nextActionTitle = 'تسویه مانده حساب'
        nextActionSub = 'جهت تحویل فایل‌ها و آلبوم، مانده را تسویه فرمایید.'
      } else if (stage === 1) {
        nextActionTitle = 'هماهنگی روز مراسم'
        nextActionSub = 'بررسی ساعت حضور عکاسان و لوکیشن فرمالیته.'
      } else if (stage === 2) {
        nextActionTitle = 'انتخاب عکس‌های ژورنال'
        nextActionSub = 'عکس‌های منتخب خود را در بخش عکس‌خانه تایید کنید.'
      }

      // کارت‌های شاخص
      const topCardsHtml = `
        <div class="customer-pro-top-cards" id="customer-pro-cards">
          <!-- کارت ۱: وضعیت پروژه -->
          <div class="customer-pro-card status-card">
            <div class="customer-pro-card-header">
              <span class="customer-pro-card-title">مرحله و وضعیت</span>
              <span class="customer-pro-card-icon">📊</span>
            </div>
            <div class="customer-pro-stat-val">${Utils?.escapeHtml?.(stageLabel)}</div>
            <div class="customer-pro-stat-sub">${c.eventDate || c.date ? 'مراسم: ' + Utils.escapeHtml(c.eventDate || c.date) : 'تاریخ ثبت‌نشده'} ${c.venue ? '· ' + Utils.escapeHtml(c.venue) : ''}</div>
          </div>

          <!-- کارت ۲: وضعیت مالی -->
          <div class="customer-pro-card finance-card">
            <div class="customer-pro-card-header">
              <span class="customer-pro-card-title">حساب و مانده</span>
              <span class="customer-pro-card-icon">💳</span>
            </div>
            <div class="customer-pro-stat-val" style="color:var(--cpro-green)">
              ${remaining > 0 ? (Utils?.fmtNum ? Utils.fmtNum(remaining) : remaining) + ' تومان' : 'تسویه کامل ✓'}
            </div>
            <div class="customer-pro-stat-sub">کل: ${(Utils?.fmtNum ? Utils.fmtNum(total) : total)} تومان · واریز: ${(Utils?.fmtNum ? Utils.fmtNum(paid) : paid)}</div>
          </div>

          <!-- کارت ۳: اقدام بعدی -->
          <div class="customer-pro-card action-card">
            <div class="customer-pro-card-header">
              <span class="customer-pro-card-title">اقدام بعدی شما</span>
              <span class="customer-pro-card-icon">🎯</span>
            </div>
            <div class="customer-pro-stat-val" style="color:var(--cpro-gold)">${Utils?.escapeHtml?.(nextActionTitle)}</div>
            <div class="customer-pro-stat-sub">${Utils?.escapeHtml?.(nextActionSub)}</div>
          </div>
        </div>
      `

      // پیام اولیه هوش مصنوعی در صورت خالی بودن
      if (this.state.messages.length === 0) {
        const couple = c.couple || [c.bride, c.groom].filter(Boolean).join(' و ') || 'عزیز'
        this.state.messages.push({
          role: 'bot',
          text: `سلام به شما عروس و داماد گرامی (${couple})! من دستیار هوشمند پرونده شما هستم. هر سؤالی درباره تاریخ مراسم، مانده حساب، مراحل آماده‌سازی فیلم و آلبوم دارید بپرسید.`
        })
      }

      // باکس هوش مصنوعی
      const aiWidgetHtml = `
        <div class="customer-ai-widget" id="customer-pro-ai-box">
          <div class="customer-ai-head">
            <div class="customer-ai-avatar">
              <i class="fas fa-sparkles"></i>
            </div>
            <div>
              <h3 class="customer-ai-title">دستیار اختصاصی پرونده شما</h3>
              <p class="customer-ai-subtitle">پاسخگویی آنی به سؤالات قرارداد، اقساط و مراحل تحویل کار</p>
            </div>
          </div>

          <!-- پرسش‌های سریع -->
          <div class="customer-ai-chips">
            <button type="button" class="customer-ai-chip" onclick="CustomerPro.askQuick('مانده حساب من چقدر است؟')">💰 مانده حساب؟</button>
            <button type="button" class="customer-ai-chip" onclick="CustomerPro.askQuick('تاریخ مراسم و لوکیشن ما چیست؟')">📅 تاریخ مراسم؟</button>
            <button type="button" class="customer-ai-chip" onclick="CustomerPro.askQuick('کار ما در چه مرحله‌ای قرار دارد؟')">🎬 وضعیت پروژه؟</button>
            <button type="button" class="customer-ai-chip" onclick="CustomerPro.askQuick('اقدام بعدی من چیست؟')">🎯 اقدام بعدی؟</button>
          </div>

          <!-- لاگ گفتگو -->
          <div class="customer-ai-chat-log" id="customer-pro-chat-log">
            ${this.state.messages.map(m => `
              <div class="customer-ai-msg ${m.role}">
                ${Utils?.escapeHtml?.(m.text)}
              </div>
            `).join('')}
            ${this.state.isThinking ? '<div class="customer-ai-msg bot"><em>در حال بررسی پرونده...</em></div>' : ''}
          </div>

          <!-- فیلد ورودی -->
          <div class="customer-ai-input-wrap">
            <input type="text" class="customer-ai-input" id="customer-pro-ai-input"
              placeholder="سؤال خود را درباره این قرارداد بپرسید..."
              onkeydown="if(event.key==='Enter') CustomerPro.sendQuery()" />
            <button type="button" class="customer-ai-send-btn" onclick="CustomerPro.sendQuery()">
              <i class="fas fa-paper-plane"></i> ارسال
            </button>
          </div>
        </div>
      `

      const wrapper = document.createElement('div')
      wrapper.id = 'customer-pro-root-section'
      wrapper.innerHTML = topCardsHtml + aiWidgetHtml

      const oldRoot = document.getElementById('customer-pro-root-section')
      if (oldRoot) oldRoot.remove()

      targetParent.after(wrapper)
    },

    // ─── ۴. موتور هوش مصنوعی مقید به همان قرارداد و گاردریل ─────────────
    STAGES: [
      { id: 'contract', title: 'عقد و ثبت رسمی قرارداد', icon: 'fa-file-signature', desc: 'تایید شرایط، ثبت بیعانه و رزرو قطعی تاریخ مراسم' },
      { id: 'shooting', title: 'تصویربرداری و عکاسی', icon: 'fa-video', desc: 'حضور تیم تخصصی در عمارت، باغ و تالار مراسم' },
      { id: 'ingest', title: 'تخلیه رم‌ها و آرشیو امن', icon: 'fa-hard-drive', desc: 'بکاپ‌گیری دونسخه‌ای، تفکیک شات‌ها و چیدمان راف‌کات' },
      { id: 'selection', title: 'انتخاب عکس‌های ژورنال', icon: 'fa-images', desc: 'انتخاب فریم‌های منتخب توسط زوجین در عکس‌خانه آنلاین' },
      { id: 'album_design', title: 'طراحی آلبوم و صفحه‌آرایی', icon: 'fa-palette', desc: 'چیدمان گرافیکی صفحات، روتوش پوست و طراحی ژورنال' },
      { id: 'color_grade', title: 'اصلاح رنگ و تدوین فیلم', icon: 'fa-film', desc: 'کالرگریدینگ حرفه‌ای در DaVinci Resolve و مسترینگ صدا' },
      { id: 'lab_print', title: 'چاپ لابراتوار و صحافی', icon: 'fa-print', desc: 'چاپ شیمیایی عکس‌ها، جلدسازی چرم و صحافی حرارتی' },
      { id: 'ready_pickup', title: 'کنترل کیفی و آماده تحویل', icon: 'fa-box-open', desc: 'بسته‌بندی اختصاصی استودیو و تحویل کامل سفارش' }
    ],

    getTimelineStageIndex(c) {
      if (!c) return 0
      if (c.status === 'delivered' || c.isDelivered) return 7
      if (c.readyForDelivery || c.status === 'ready') return 7
      if (c.labPrinted || c.status === 'printing') return 6
      if (c.filmEdited || c.status === 'grading' || c.status === 'editing') return 5
      if (c.albumDesigned || c.status === 'designing') return 4
      if (c.photoSelected || c.status === 'selection') return 3

      const today = typeof Utils !== 'undefined' && Utils.todayJalali ? Utils.todayJalali() : ''
      const evDate = c.eventDate || c.date || ''
      if (evDate && today && evDate < today) {
        return 2 // مراسم انجام شده، در مرحله تخلیه رم و تدوین
      }
      if (c.status === 'confirmed' || c.status === 'active') {
        return 1 // در نوبت عکاسی / روز مراسم
      }
      return 0 // ثبت قرارداد
    },

    injectInteractiveTimeline() {
      const c = this.getContractData()
      if (!c) return

      const studioInfo = (typeof DB !== 'undefined' && DB.get ? DB.get('studioInfo') : null) || {}
      const rawPhone = studioInfo.whatsappPhone || studioInfo.phone || '09120000000'
      const waNumber = String(rawPhone).replace(/\D/g, '').replace(/^0/, '98')

      const activeIdx = this.getTimelineStageIndex(c)
      const pct = Math.min(100, Math.round(((activeIdx + 1) / this.STAGES.length) * 100))
      const currentStage = this.STAGES[activeIdx] || this.STAGES[0]

      const timelineHtml = `
        <div class="customer-timeline-container" id="customer-pro-timeline">
          <div class="customer-timeline-header">
            <div class="customer-timeline-title">
              <i class="fas fa-route"></i> تایم‌لاین زنده تولید و تدوین سفارش
            </div>
            <div class="customer-timeline-badge">
              <i class="fas fa-circle-notch fa-spin"></i> ${Utils?.fmtNum ? Utils.fmtNum(pct) : pct}٪ تکمیل شده
            </div>
          </div>

          <div class="customer-timeline-prog-wrap">
            <div class="customer-timeline-prog-bar" style="width: ${pct}%"></div>
          </div>

          <div style="margin-bottom:18px;padding:12px 14px;background:rgba(212,175,55,0.06);border:1px solid rgba(212,175,55,0.25);border-radius:12px;display:flex;align-items:center;gap:12px">
            <div style="font-size:22px;color:#d4af37"><i class="fas ${currentStage.icon}"></i></div>
            <div>
              <div style="font-size:12px;font-weight:800;color:#fff">مرحله فعال فعلی: ${Utils.escapeHtml(currentStage.title)}</div>
              <div style="font-size:11px;color:var(--cpro-text-muted);margin-top:2px">${Utils.escapeHtml(currentStage.desc)}</div>
            </div>
          </div>

          <div class="customer-timeline-steps">
            ${this.STAGES.map((s, idx) => {
              const isDone = idx < activeIdx || (idx === 7 && (c.status === 'delivered' || c.isDelivered))
              const isActive = idx === activeIdx && !isDone
              const stateClass = isDone ? 'is-done' : (isActive ? 'is-active' : 'is-pending')
              const stateBadge = isDone ? 'تکمیل شد ✓' : (isActive ? 'در حال انجام ⚡' : 'در انتظار 🔒')

              return `
                <div class="customer-timeline-step ${stateClass}">
                  <div class="customer-step-icon-wrap">
                    <i class="fas ${isDone ? 'fa-check' : s.icon}"></i>
                  </div>
                  <div class="customer-step-content">
                    <div class="customer-step-head">
                      <span class="customer-step-name">${idx + 1}. ${Utils.escapeHtml(s.title)}</span>
                      <span class="customer-step-state-badge">${stateBadge}</span>
                    </div>
                    <div class="customer-step-desc">${Utils.escapeHtml(s.desc)}</div>
                  </div>
                </div>
              `
            }).join('')}
          </div>

          ${(c.teaserUrl || c.teaserLink) ? `
            <div class="customer-teaser-box">
              <div class="customer-teaser-title">
                <i class="fas fa-film" style="color:#d4af37"></i> تیزر و پیش‌نمایش اختصاصی مراسم شما آماده است!
              </div>
              <p style="font-size:11.5px;color:rgba(255,255,255,0.7);margin:0">
                تدوین تیزر اینستاگرامی شما با کیفیت 4K به اتمام رسیده و می‌توانید آن را مشاهده یا دریافت نمایید.
              </p>
              <div class="customer-teaser-actions">
                <a href="${Utils.escapeHtml(c.teaserUrl || c.teaserLink)}" target="_blank" rel="noopener noreferrer" class="customer-ai-send-btn" style="text-decoration:none;padding:8px 16px">
                  <i class="fas fa-play"></i> مشاهده و دانلود تیزر
                </a>
              </div>
            </div>
          ` : ''}

          <div style="margin-top:16px;padding-top:14px;border-top:1px dashed var(--cpro-border);display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px">
            <div style="font-size:11.5px;color:var(--cpro-text-muted)">
              <i class="fas fa-user-headset"></i> پشتیبانی و سرپرست تدوین استودیو
            </div>
            <div style="display:flex;gap:8px">
              <a href="https://wa.me/${waNumber}?text=${encodeURIComponent('سلام، در مورد مراحل تدوین قرارداد ' + (c.contractNum || c.id) + ' سوال داشتم')}" target="_blank" rel="noopener noreferrer" class="sm-btn sm-btn-sm sm-btn-ghost" style="color:#25d366;border-color:rgba(37,211,102,0.3);text-decoration:none;padding:5px 12px;border-radius:8px;font-size:11px;display:flex;align-items:center;gap:6px">
                <i class="fab fa-whatsapp"></i> واتساپ استودیو
              </a>
              <a href="tel:${Utils.escapeHtml(rawPhone)}" class="sm-btn sm-btn-sm sm-btn-ghost" style="color:#38bdf8;border-color:rgba(56,189,248,0.3);text-decoration:none;padding:5px 12px;border-radius:8px;font-size:11px;display:flex;align-items:center;gap:6px">
                <i class="fas fa-phone"></i> تماس تلفنی
              </a>
            </div>
          </div>
        </div>
      `

      const oldTimeline = document.getElementById('customer-pro-timeline')
      if (oldTimeline) oldTimeline.remove()

      const oldPipelineCard = document.querySelector('.customer-card .pipeline')?.closest('.customer-card')
      if (oldPipelineCard) {
        const wrap = document.createElement('div')
        wrap.innerHTML = timelineHtml
        oldPipelineCard.replaceWith(wrap.firstElementChild)
      } else {
        const rootSec = document.getElementById('customer-pro-root-section')
        if (rootSec) {
          const wrap = document.createElement('div')
          wrap.innerHTML = timelineHtml
          rootSec.after(wrap.firstElementChild)
        }
      }
    },

    askQuick(q) {
      const inp = document.getElementById('customer-pro-ai-input')
      if (inp) inp.value = q
      this.sendQuery()
    },

    async sendQuery() {
      const inp = document.getElementById('customer-pro-ai-input')
      const text = inp ? inp.value.trim() : ''
      if (!text || this.state.isThinking) return

      inp.value = ''
      this.state.messages.push({ role: 'user', text })
      this.state.isThinking = true
      this.renderChatLog()

      const reply = await this.generateContractAnswer(text)
      this.state.isThinking = false
      this.state.messages.push({ role: 'bot', text: reply })
      this.renderChatLog()
    },

    renderChatLog() {
      const log = document.getElementById('customer-pro-chat-log')
      if (!log) return
      log.innerHTML = `
        ${this.state.messages.map(m => `
          <div class="customer-ai-msg ${m.role}">
            ${Utils?.escapeHtml?.(m.text)}
          </div>
        `).join('')}
        ${this.state.isThinking ? '<div class="customer-ai-msg bot"><em>در حال بررسی پرونده...</em></div>' : ''}
      `
      log.scrollTop = log.scrollHeight
    },

    // بررسی گاردریل سؤالات نامرتبط
    isOffTopic(q) {
      const lower = q.toLowerCase()
      const blockedTopics = [
        'سیاست', 'سیاسی', 'انتخابات', 'پزشکی', 'دارو', 'بیماری',
        'برنامه‌نویسی', 'کدنویسی', 'جاوااسکریپت', 'پایتون', 'هک',
        'ریاضی', 'فرمول', 'آشپزی', 'دستور پخت', 'فوتبال', 'هواشناسی',
        'استقلال', 'پرسپولیس', 'بیت کوین', 'ارز دیجیتال', 'سهام'
      ]
      return blockedTopics.some(topic => lower.includes(topic))
    },

    async generateContractAnswer(query) {
      const c = this.getContractData()
      if (!c) return 'پرونده قرارداد در دسترس نیست.'

      const couple = c.couple || [c.bride, c.groom].filter(Boolean).join(' و ') || 'همراه گرامی'

      // ۱. گاردریل سؤالات متفرقه
      if (this.isOffTopic(query)) {
        return `من دستیار هوشمند اختصاصی قرارداد شما در استودیو هستم و تنها درباره جزئیات، مراحل کاری، تاریخ‌ها و امور مالی پروژه ${couple} پاسخ می‌دهم.`
      }

      // استخراج داده‌های دقیق پرونده
      const persProjects = (typeof DB !== 'undefined' && DB.filter) ? DB.filter('persProjects', p => p.contractId === c.id) : []
      const stage = typeof PortalShared !== 'undefined' ? PortalShared.getContractStage(c, persProjects) : 0
      const stageLabel = (typeof PortalShared !== 'undefined' && PortalShared.CUSTOMER_PIPELINE?.[stage]?.label) || 'در حال اجرا'
      const total = Number(c.total) || 0
      const paid = Number(c.paid) || 0
      const remaining = Math.max(0, total - paid)
      const eventDate = c.eventDate || c.date || 'ثبت‌نشده'
      const venue = c.venue || 'لوکیشن نامشخص'
      const deliveryDate = c.deliveryDate || 'طبق زمان‌بندی قرارداد'

      // ۲. در صورت وجود کلید Gemini در تنظیمات استودیو
      const studioInfo = (typeof DB !== 'undefined' && DB.get) ? DB.get('studioInfo') : null
      const geminiKey = studioInfo?.geminiApiKey
      if (geminiKey) {
        try {
          const sysPrompt = `شما دستیار پرتال اختصاصی مشتری در استودیو ماندنی هستید.
اطلاعات قرارداد:
- نام زوج: ${couple}
- شماره قرارداد: ${c.contractNum || c.id}
- تاریخ مراسم: ${eventDate}
- تالار / لوکیشن: ${venue}
- مرحله پروژه: ${stageLabel}
- تاریخ تحویل: ${deliveryDate}
- مبلغ کل: ${total} تومان
- مبلغ پرداختی: ${paid} تومان
- مانده بدهی: ${remaining} تومان

قوانین سفت‌وسخت:
۱. فقط و فقط درباره اطلاعات فوق پاسخ دهید.
۲. به هیچ عنوان به سؤالات غیرمرتبط، عمومی، سیاسی، علمی یا نامربوط پاسخ ندهید و عذرخواهی کنید.
۳. لحن شما بسیار مؤدبانه، حرفه‌ای، محترمانه و فارسی باشد.`

          const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [
                { role: 'user', parts: [{ text: `${sysPrompt}\n\nسؤال کاربر: ${query}` }] }
              ]
            })
          })
          const data = await res.json()
          const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text
          if (reply) return reply.trim()
        } catch { /* fallback to local deterministic NLP */ }
      }

      // ۳. موتور هوشمند محلی و قطعی (Deterministic Local Matching)
      const q = query.toLowerCase()

      // تاریخ مراسم و لوکیشن
      if (q.includes('تاریخ') || q.includes('مراسم') || q.includes('تالار') || q.includes('باغ') || q.includes('لوکیشن') || q.includes('ساعت') || q.includes('کجاست')) {
        return `تاریخ ثبت‌شده مراسم شما روز ${eventDate} در محل «${venue}» می‌باشد. برای هماهنگی ساعت آفیش می‌توانید با تیم مدیریت در تماس باشید.`
      }

      // امور مالی و حساب
      if (q.includes('مانده') || q.includes('حساب') || q.includes('پول') || q.includes('واریز') || q.includes('بدهی') || q.includes('قسط') || q.includes('چقدر')) {
        if (remaining === 0) {
          return `تمامی مبالغ قرارداد شما (${(Utils?.fmtNum ? Utils.fmtNum(total) : total)} تومان) به طور کامل تسویه شده است و بدهی معوقه‌ای ندارید ✓`
        }
        return `مبلغ کل قرارداد شما ${(Utils?.fmtNum ? Utils.fmtNum(total) : total)} تومان است که تا کنون ${(Utils?.fmtNum ? Utils.fmtNum(paid) : paid)} تومان واریز شده و مانده حساب شما ${(Utils?.fmtNum ? Utils.fmtNum(remaining) : remaining)} تومان می‌باشد.`
      }

      // اقدام بعدی
      if (q.includes('اقدام') || q.includes('بعدی') || q.includes('چیکار') || q.includes('چه کار') || q.includes('وظیفه')) {
        if (remaining > 0 && stage >= 3) {
          return `اقدام بعدی: هماهنگی جهت تسویه حساب نهایی و دریافت آلبوم ژورنال و فیلم تدوین‌شده مراسم.`
        }
        if (stage === 2) {
          return `اقدام بعدی: ورود به بخش «عکس‌خانه» و انتخاب عکس‌های برگزیده جهت طراحی آلبوم ژورنال.`
        }
        return `اقدام بعدی شما طبق روند پروژه: همکاران ما در استودیو در حال پیگیری مراحل «${stageLabel}» هستند و به محض پیشرفت پروژه، از طریق پیامک به شما اطلاع داده خواهد شد.`
      }

      // وضعیت و مراحل کار
      if (q.includes('وضعیت') || q.includes('مرحله') || q.includes('روند') || q.includes('اماده') || q.includes('آماده')) {
        return `پروژه شما (${couple}) هم‌اکنون در مرحله «${stageLabel}» قرار دارد. موعد تقریبی تحویل خروجی‌های شما: ${deliveryDate} می‌باشد.`
      }

      // پاسخ پیش‌فرض هوشمند
      return `پروژه مراسم ${couple} (شماره قرارداد #${c.contractNum || c.id}) با وضعیت «${stageLabel}» و تاریخ مراسم ${eventDate} در سیستم فعال است. چنانچه نیاز به مشاوره یا هماهنگی بیشتر دارید، می‌توانید با شماره استودیو ارتباط برقرار فرمایید.`
    }
  }

  window.CustomerPro = CustomerPro

  // راه‌اندازی خودکار
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => setTimeout(() => CustomerPro.init(), 150))
    } else {
      setTimeout(() => CustomerPro.init(), 150)
    }
  }
})()
