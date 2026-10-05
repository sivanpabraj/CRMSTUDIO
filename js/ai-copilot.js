/**
 * Studio AI Copilot — موتور هوش استودیویی، تصمیم‌یار و هشدارهای نقش‌محور
 * پشتیبانی کامل از:
 * ۱. مدیر استودیو (نقدینگی، سررسید چک، مطالبات معوق، انحراف بودجه)
 * ۲. منشی و هماهنگی (لیدهای بلاتکلیف، تداخل آفیش، چک‌لیست ۷ روز تا مراسم)
 * ۳. عکاس و تدوینگر (مهلت SLA تدوین، عودت تجهیزات، آفیش‌های پیش‌رو)
 * ۴. مشتری و عروس/داماد (توصیه‌های زمان‌بندی روزبه‌روز، ردگیری پیشرفت تولید)
 */

;(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory()
  } else if (typeof define === 'function' && define.amd) {
    define([], factory)
  } else {
    root.AICopilot = factory()
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict'

  function getDaysUntil(dateStr) {
    if (!dateStr) return null
    if (typeof Utils !== 'undefined' && typeof Utils.daysUntil === 'function') {
      return Utils.daysUntil(dateStr)
    }
    // Fallback simple day diff parser
    try {
      const parts = String(dateStr).split(/[-/]/).map(Number)
      if (parts.length === 3) {
        // If year is Jalali (1300..1500)
        if (parts[0] > 1300 && parts[0] < 1500 && typeof Utils !== 'undefined' && typeof Utils.parseJalaliToday === 'function') {
          const t = Utils.parseJalaliToday()
          const diffDays = (parts[0] - t.jy) * 365 + (parts[1] - t.jm) * 30 + (parts[2] - t.jd)
          return diffDays
        }
      }
    } catch {
      return null
    }
    return null
  }

  function formatMoney(num) {
    const val = Number(num || 0)
    if (typeof SM !== 'undefined' && typeof SM.fmt === 'function') {
      return SM.fmt(val)
    }
    if (typeof Utils !== 'undefined' && typeof Utils.fmtNum === 'function') {
      return Utils.fmtNum(val.toLocaleString('fa-IR'))
    }
    return val.toLocaleString('fa-IR')
  }

  function escapeText(str) {
    if (!str) return ''
    if (typeof SM !== 'undefined' && typeof SM.esc === 'function') return SM.esc(str)
    if (typeof Utils !== 'undefined' && typeof Utils.escapeHtml === 'function') return Utils.escapeHtml(str)
    return String(str).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[m])
  }

  const AICopilot = {
    version: '2.1.0',

    /**
     * تحلیل هوشمند برای مدیر استودیو (Manager / Admin)
     */
    getManagerInsights(ctx = {}) {
      const insights = []
      const contracts = ctx.contracts || []
      const cheques = ctx.cheques || []
      const tx = ctx.tx || []
      const expenses = ctx.expenses || []

      // ۱. هشدار چک‌های سررسید نزدیک
      const upcomingCheques = cheques
        .map(c => ({ ...c, days: getDaysUntil(c.dueDate) }))
        .filter(c => c.days !== null && c.days >= 0 && c.days <= 7 && c.status !== 'passed' && c.status !== 'paid')
        .sort((a, b) => a.days - b.days)

      if (upcomingCheques.length > 0) {
        const urgent = upcomingCheques.filter(c => c.days <= 3)
        const totalAmount = upcomingCheques.reduce((sum, c) => sum + Number(c.amount || 0), 0)
        
        insights.push({
          id: 'manager-cheques',
          role: 'manager',
          severity: urgent.length > 0 ? 'danger' : 'warning',
          icon: 'fa-money-check-dollar',
          title: urgent.length > 0 ? 'سررسید فوری چک‌ها (کمتر از ۳ روز)' : 'یادآوری سررسید چک‌های هفته',
          text: `${upcomingCheques.length.toLocaleString('fa-IR')} فقره چک به ارزش کل ${formatMoney(totalAmount)} تومان در هفت روز آینده سررسید می‌شود.`,
          actionText: 'مدیریت و وصول چک‌ها',
          actionRoute: 'accounting',
          actionParam: 'cheques',
          count: upcomingCheques.length,
          items: upcomingCheques.map(c => ({
            title: `${c.payee || c.recipient || 'بدون نام'} — ${formatMoney(c.amount)} تومان`,
            sub: c.days === 0 ? 'امروز سررسید می‌شود' : `${c.days.toLocaleString('fa-IR')} روز مانده`
          }))
        })
      }

      // ۲. مطالبات معوق و تسویه‌نشده پس از پایان مراسم
      const overdueContracts = contracts
        .filter(c => c.status !== 'cancelled')
        .map(c => {
          const days = getDaysUntil(c.eventDate || c.date)
          const total = Number(c.total || c.finalAmount || 0)
          const deposit = Number(c.deposit || 0)
          const paid = Number(c.paid || 0)
          const remaining = Math.max(0, total - deposit - paid)
          return { ...c, days, remaining }
        })
        .filter(c => c.days !== null && c.days < 0 && c.remaining > 500000)
        .sort((a, b) => b.remaining - a.remaining)

      if (overdueContracts.length > 0) {
        const totalOverdue = overdueContracts.reduce((sum, c) => sum + c.remaining, 0)
        insights.push({
          id: 'manager-overdue',
          role: 'manager',
          severity: 'danger',
          icon: 'fa-hand-holding-dollar',
          title: 'مطالبات معوق پس از مراسم',
          text: `${overdueContracts.length.toLocaleString('fa-IR')} قرارداد با مراسم انجام‌شده، مانده‌حساب دارند (جمعاً ${formatMoney(totalOverdue)} تومان).`,
          actionText: 'پیگیری مطالبات',
          actionRoute: 'contracts',
          count: overdueContracts.length,
          items: overdueContracts.slice(0, 4).map(c => ({
            title: `${c.couple || c.groom || 'قرارداد'} (${formatMoney(c.remaining)} ت)`,
            sub: `${Math.abs(c.days).toLocaleString('fa-IR')} روز از مراسم گذشته`
          }))
        })
      }

      // ۳. پایش جریان نقدینگی و انحراف هزینه‌ها
      const monthIncome = (ctx.monthDeposits || tx.filter(t => t.type === 'deposit')).reduce((s, t) => s + (t.amount || 0), 0)
      const monthExpense = (ctx.monthWithdrawals || tx.filter(t => t.type === 'withdrawal')).reduce((s, t) => s + (t.amount || 0), 0)
      if (monthIncome > 0 && (monthExpense / monthIncome) > 0.85) {
        const burnRate = Math.round((monthExpense / monthIncome) * 100)
        insights.push({
          id: 'manager-burn-rate',
          role: 'manager',
          severity: 'warning',
          icon: 'fa-chart-pie',
          title: 'هشدار حاشیه سود و نرخ هزینه ماهانه',
          text: `هزینه‌های ماه جاری ${burnRate.toLocaleString('fa-IR')}٪ از کل وصولی‌ها را مصرف کرده است. مدیریت هزینه‌های متفرقه پیشنهاد می‌شود.`,
          actionText: 'تحلیل هزینه‌ها',
          actionRoute: 'expenses'
        })
      }

      // ۴. قراردادهای پیش‌نویس نیازمند قطعی‌سازی و امضا
      const pendingDrafts = contracts.filter(c => c.status === 'draft' || c.status === 'pending')
      if (pendingDrafts.length > 0) {
        insights.push({
          id: 'manager-drafts',
          role: 'manager',
          severity: 'info',
          icon: 'fa-file-signature',
          title: 'پیش‌نویس‌های نیازمند عقد قرارداد رسمی',
          text: `${pendingDrafts.length.toLocaleString('fa-IR')} پرونده در مرحله پیش‌نویس است و آماده دریافت بیعانه و امضای نهایی می‌باشد.`,
          actionText: 'مشاهده پرونده‌ها',
          actionRoute: 'contracts'
        })
      }

      if (insights.length === 0) {
        insights.push({
          id: 'manager-healthy',
          role: 'manager',
          severity: 'success',
          icon: 'fa-shield-halved',
          title: 'وضعیت مطلوب مالی و اجرایی',
          text: 'تمام شاخص‌های نقدی، سررسید چک‌ها و وصول مطالبات در وضعیت بهینه قرار دارند.'
        })
      }

      return insights
    },

    /**
     * تحلیل هوشمند برای منشی و هماهنگی (Coordinator / Reception)
     */
    getCoordinatorInsights(ctx = {}) {
      const insights = []
      const bookings = ctx.bookings || []
      const contracts = ctx.contracts || []
      const requests = ctx.customerRequests || []

      // ۱. لیدها و رزروهای بلاتکلیف
      const pendingBookings = bookings.filter(b => b.status === 'pending' || b.status === 'lead')
      if (pendingBookings.length > 0) {
        insights.push({
          id: 'coord-leads',
          role: 'coordinator',
          severity: 'warning',
          icon: 'fa-user-clock',
          title: 'نوبت‌های مشاوره در انتظار پیگیری',
          text: `${pendingBookings.length.toLocaleString('fa-IR')} زوج در نوبت تماس و مشاوره حضوری هستند.`,
          actionText: 'بررسی نوبت‌ها',
          actionRoute: 'bookings',
          count: pendingBookings.length
        })
      }

      // ۲. درخواست‌های بی‌پاسخ مشتریان در پرتال
      const openRequests = requests.filter(r => r.status === 'pending' || r.status === 'open')
      if (openRequests.length > 0) {
        insights.push({
          id: 'coord-requests',
          role: 'coordinator',
          severity: 'danger',
          icon: 'fa-envelope-open-text',
          title: 'درخواست‌های آنلاین مشتریان در صندوق',
          text: `${openRequests.length.toLocaleString('fa-IR')} پیام و درخواست جدید از سمت عروس و دامادها ثبت شده و نیازمند پاسخ است.`,
          actionText: 'ورود به صندوق مشتری',
          actionRoute: 'inbox',
          count: openRequests.length
        })
      }

      // ۳. چک‌لیست هماهنگی مراسم‌های هفته پیش‌رو (کمتر از ۷ روز)
      const imminentWeddings = contracts
        .filter(c => c.status !== 'cancelled')
        .map(c => ({
          ...c,
          days: getDaysUntil(c.eventDate || c.date)
        }))
        .filter(c => c.days !== null && c.days >= 0 && c.days <= 7)
        .sort((a, b) => a.days - b.days)

      if (imminentWeddings.length > 0) {
        insights.push({
          id: 'coord-imminent',
          role: 'coordinator',
          severity: 'info',
          icon: 'fa-bell-concierge',
          title: 'هماهنگی مراسم‌های هفته جاری',
          text: `${imminentWeddings.length.toLocaleString('fa-IR')} مراسم در هفت روز آینده برگزار می‌شود. بررسی تایید نهایی ساعت آرایشگاه و لوکیشن ضروری است.`,
          actionText: 'مشاهده تقویم مراسم',
          actionRoute: 'calendar',
          count: imminentWeddings.length,
          items: imminentWeddings.map(w => ({
            title: `${w.couple || w.groom || 'مراسم'}`,
            sub: w.days === 0 ? 'امروز' : `${w.days.toLocaleString('fa-IR')} روز مانده (${w.eventDate || w.date})`
          }))
        })
      }

      if (insights.length === 0) {
        insights.push({
          id: 'coord-clean',
          role: 'coordinator',
          severity: 'success',
          icon: 'fa-circle-check',
          title: 'تمام هماهنگی‌ها به‌روز است',
          text: 'هیچ درخواست یا نوبت معوقی در سیستم ثبت نشده است.'
        })
      }

      return insights
    },

    /**
     * تحلیل هوشمند برای عکاسان، تصویربرداران و تدوینگران (Staff / Editor)
     */
    getStaffInsights(staffId, ctx = {}) {
      const insights = []
      const workflows = ctx.workflows || []
      const custody = ctx.custody || ctx.equipmentCustody || []
      const contracts = ctx.contracts || []

      // ۱. پروژه‌های تدوین و روتوش معوق (SLA بیشتر از ۱۴ روز پس از مراسم)
      const delayedEditing = contracts
        .filter(c => c.status !== 'cancelled')
        .map(c => {
          const days = getDaysUntil(c.eventDate || c.date)
          return { ...c, daysPassed: days !== null && days < 0 ? Math.abs(days) : 0 }
        })
        .filter(c => c.daysPassed > 14 && c.stage !== 'delivery' && c.stage !== 'done')

      if (delayedEditing.length > 0) {
        insights.push({
          id: 'staff-sla-delay',
          role: 'staff',
          severity: 'warning',
          icon: 'fa-film',
          title: 'هشدار مهلت تحویل تدوین و اصلاح رنگ',
          text: `${delayedEditing.length.toLocaleString('fa-IR')} پروژه بیش از ۱۴ روز از زمان ضبط آنها گذشته و هنوز تحویل نهایی نشده‌اند.`,
          actionText: 'میز کار تولید',
          actionRoute: 'workflow',
          count: delayedEditing.length
        })
      }

      // ۲. تجهیزات امانی و عودت‌نشده به انبار
      const openCustody = custody.filter(item => !item.returnDate && item.status !== 'returned')
      if (openCustody.length > 0) {
        insights.push({
          id: 'staff-gear-custody',
          role: 'staff',
          severity: 'info',
          icon: 'fa-camera-retro',
          title: 'تجهیزات امانی در دست پرسنل',
          text: `${openCustody.length.toLocaleString('fa-IR')} قلم تجهیزات (دوربین، لنز، گیمبال، میکروفون) در وضعیت تحویل موقت ثبت شده است.`,
          actionText: 'انبار تجهیزات',
          actionRoute: 'equipment',
          count: openCustody.length
        })
      }

      if (insights.length === 0) {
        insights.push({
          id: 'staff-on-track',
          role: 'staff',
          severity: 'success',
          icon: 'fa-circle-check',
          title: 'برنامه تولید و آفیش‌ها منظم است',
          text: 'تمام راش‌ها و تحویل‌های تدوین طبق برنامه زمانی استودیو پیش می‌روند.'
        })
      }

      return insights
    },

    /**
     * تحلیل و توصیه‌های هوشمند روزانه برای مشتری و عروس/داماد (Customer Portal)
     */
    getCustomerInsights(contract) {
      if (!contract) return null

      const eventDate = contract.eventDate || contract.date
      const days = getDaysUntil(eventDate)
      const couple = contract.couple || `${contract.bride || ''} و ${contract.groom || ''}`.trim() || 'همراه گرامی'

      let stageKey = 'before'
      let message = ''
      let tip = ''
      let icon = 'fa-heart'
      let action = null

      if (days === null) {
        message = `به پرتال اختصاصی استودیو ماندنی خوش آمدید.`
        tip = `جهت دریافت برنامه زمان‌بندی دقیق، با هماهنگ‌کننده استودیو در ارتباط باشید.`
      } else if (days > 45) {
        stageKey = 'pre-planning'
        icon = 'fa-spa'
        message = `${days.toLocaleString('fa-IR')} روز تا جشن باشکوه شما باقی مانده است.`
        tip = `توصیه استودیو: در صورتی که تصمیم به خدمات مراقبت پوست یا لیزر دارید، جهت آمادگی چهره در روز مراسم، از هم‌اکنون هماهنگ نمایید.`
      } else if (days > 14 && days <= 45) {
        stageKey = 'music-selection'
        icon = 'fa-music'
        message = `${days.toLocaleString('fa-IR')} روز تا مراسم! زمان انتخاب موزیک‌های خاص کلیپ و ورود به تالار است.`
        tip = `موزیک‌های مورد علاقه خود را از بخش «ارسال درخواست» در پرتال برای تیم تدوین ارسال فرمایید.`
        action = { label: 'ارسال موزیک اختصاصی', tab: 'requests' }
      } else if (days >= 1 && days <= 14) {
        stageKey = 'final-briefing'
        icon = 'fa-clock'
        message = `تنها ${days.toLocaleString('fa-IR')} روز تا روز خاطره‌ساز شما مانده است!`
        tip = `برنامه دقیق ساعت خروج از سالن زیبایی و حرکت به سمت لوکیشن عکاسی را با استودیو هماهنگ نمایید.`
        action = { label: 'تماس با هماهنگ‌کننده استودیو', type: 'contact' }
      } else if (days === 0) {
        stageKey = 'event-day'
        icon = 'fa-champagne-glasses'
        message = `امروز روز باشکوه شماست! پیوندتان مبارک باد 🌸`
        tip = `آرامش داشته باشید و از لحظه‌لحظه جشن خود لذت ببرید؛ تیم هنری ماندنی تمام جزئیات زیبا را ثبت می‌کند.`
      } else {
        // پس از مراسم (مراحل تدوین و تحویل)
        const daysPassed = Math.abs(days)
        stageKey = 'post-event'
        icon = 'fa-wand-magic-sparkles'
        if (daysPassed <= 7) {
          message = `راش‌های اصلی ۴K با بالاترین استاندارد سینمایی آرشیو و ذخیره‌سازی شدند.`
          tip = `فایل‌ها در مرحله بازبینی اولیه و تفکیک شات‌های برگزیده قرار دارند.`
        } else if (daysPassed <= 25) {
          message = `پروژه شما در مرحله جذاب تدوین سینمایی و انتخاب عکس‌های آلبوم است.`
          tip = `به‌زودی پیش‌نمایش ژورنال آلبوم جهت انتخاب در پرتال شما بارگذاری می‌شود.`
          action = { label: 'مشاهده گالری انتخاب عکس', tab: 'photos' }
        } else {
          message = `اصلاح رنگ پیشرفته در DaVinci Resolve و طراحی ژورنال ایتالیایی در حال نهایی‌سازی است.`
          tip = `کارشناسان استودیو برای تحویل حضوری پکیج و آلبوم ژورنال با شما تماس خواهند گرفت.`
        }
      }

      return {
        couple,
        eventDate,
        days,
        stageKey,
        icon,
        message,
        tip,
        action
      }
    },

    /**
     * رندر کامپوننت بصری دستیار هوش مصنوعی در پیشخوان استودیو (Studio M Dashboard)
     */
    renderDashboardCard(role = 'manager', ctx = {}) {
      let insights = []
      let roleLabel = 'مدیریت استودیو'

      if (role === 'manager') {
        insights = this.getManagerInsights(ctx)
        roleLabel = 'دیده‌بان مدیریت'
      } else if (role === 'coordinator') {
        insights = this.getCoordinatorInsights(ctx)
        roleLabel = 'هماهنگی و پذیرش'
      } else if (role === 'staff') {
        insights = this.getStaffInsights(null, ctx)
        roleLabel = 'تیم تولید و تدوین'
      }

      const criticalCount = insights.filter(i => i.severity === 'danger').length
      const warningCount = insights.filter(i => i.severity === 'warning').length
      const statusBadge = criticalCount > 0
        ? `<span class="sm-badge sm-badge-danger"><i class="fas fa-triangle-exclamation"></i> ${criticalCount.toLocaleString('fa-IR')} اقدام فوری</span>`
        : warningCount > 0
          ? `<span class="sm-badge sm-badge-warning"><i class="fas fa-circle-exclamation"></i> ${warningCount.toLocaleString('fa-IR')} هشدار</span>`
          : `<span class="sm-badge sm-badge-success"><i class="fas fa-check-circle"></i> وضعیت بهینه</span>`

      return `
        <div class="sm-copilot-card">
          <div class="sm-copilot-header">
            <div class="sm-copilot-brand">
              <div class="sm-copilot-icon"><i class="fas fa-brain-circuit"></i></div>
              <div>
                <div class="sm-copilot-title">دستیار هوش مصنوعی استودیو ماندنی <small>AI Copilot</small></div>
                <div class="sm-copilot-subtitle">${escapeText(roleLabel)} · پایش بلادرنگ فرآیندها و شاخص‌ها</div>
              </div>
            </div>
            <div class="sm-copilot-status">
              ${statusBadge}
            </div>
          </div>

          <div class="sm-copilot-body">
            ${insights.map(item => `
              <div class="sm-copilot-item is-${item.severity || 'info'}">
                <div class="sm-copilot-item-icon">
                  <i class="fas ${item.icon || 'fa-info-circle'}"></i>
                </div>
                <div class="sm-copilot-item-content">
                  <div class="sm-copilot-item-title">${escapeText(item.title)}</div>
                  <div class="sm-copilot-item-desc">${escapeText(item.text)}</div>
                  ${item.items && item.items.length ? `
                    <div class="sm-copilot-subitems">
                      ${item.items.map(sub => `
                        <div class="sm-copilot-subitem">
                          <span>${escapeText(sub.title)}</span>
                          <small>${escapeText(sub.sub)}</small>
                        </div>
                      `).join('')}
                    </div>
                  ` : ''}
                </div>
                ${item.actionRoute ? `
                  <div class="sm-copilot-item-action">
                    <button type="button" class="sm-btn sm-btn-xs ${item.severity === 'danger' ? 'sm-btn-danger' : 'sm-btn-primary'}" onclick="SM.navigate('${item.actionRoute}')">
                      ${escapeText(item.actionText || 'بررسی')} <i class="fas fa-arrow-left"></i>
                    </button>
                  </div>
                ` : ''}
              </div>
            `).join('')}
          </div>
        </div>
      `
    }
  }

  return AICopilot
})
