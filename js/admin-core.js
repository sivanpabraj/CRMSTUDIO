/* Studio M — Admin Core (shell, navigation, session) */
const Admin = {
  state: { section: 'dashboard', financeTab: 'transactions' },
  _intervalsStarted: false,
  _keydownBound: false,
  _sectionRendered: new Set(),
  _sectionInvalidated: new Set(),

  invalidateSection(section) {
    this._sectionInvalidated.add(section)
    this._sectionRendered.delete(section)
  },

  init() {
    document.body.classList.add('admin-app')
    if (!Auth.isLoggedIn()) {
      this._showGate('login')
      return
    }
    if (!Auth.canAccessLegacyAdmin()) {
      this._showGate('forbidden')
      return
    }
    if (!new URLSearchParams(location.search).has('classic')) {
      window.location.replace('studio-m/')
      return
    }
    if (this.needsOnboarding()) {
      this._enterOnboardingMode()
      return
    }
    const user = Auth.getUser()
    if (typeof PortalInvite !== 'undefined' && PortalInvite.needsOtpVerification(user)) {
      PortalInvite.gateAfterLogin(user.phone, () => {
        this.renderShell()
        this._bootAdmin()
      })
      return
    }
    this.renderShell()
    this._bootAdmin()
  },

  _showGate(reason) {
    const app = document.getElementById('admin-app')
    if (!app) return
    document.getElementById('bottom-nav')?.setAttribute('hidden', '')
    document.querySelector('.fab')?.setAttribute('hidden', '')
    if (reason === 'login') {
      app.innerHTML = `
        <div class="admin-gate">
          <div class="admin-gate-card">
            <i class="fas fa-lock"></i>
            <h2>ورود لازم است</h2>
            <p>برای پنل کلاسیک ابتدا وارد حساب مدیر شوید.</p>
            <a class="btn btn-primary" href="index.html?next=${encodeURIComponent('admin.html?classic=1')}">ورود</a>
            <a class="btn btn-ghost" href="studio-m/">رفتن به Studio M Pro (اصلی)</a>
          </div>
        </div>`
    } else {
      app.innerHTML = `
        <div class="admin-gate">
          <div class="admin-gate-card">
            <i class="fas fa-ban"></i>
            <h2>دسترسی ندارید</h2>
            <p>این بخش فقط برای مدیر استودیو است.</p>
            <a class="btn btn-primary" href="index.html?view=portal">پورتال پرسنل</a>
          </div>
        </div>`
    }
  },

  needsOnboarding() {
    const user = Auth.getUser()
    if (!user) return false
    const isManager = (user.roles || []).some(r => {
      const n = normalizeRole(r)
      return n === 'studio_manager' || n === 'system_admin'
    })
    return isManager && (!!user.mustChangePassword || !user.profileCompleted)
  },

  _enterOnboardingMode() {
    document.body.classList.add('admin-onboarding-mode')
    document.getElementById('admin-app').innerHTML = ''
    document.getElementById('bottom-nav')?.setAttribute('hidden', '')
    document.querySelector('.fab')?.setAttribute('hidden', '')
    this.showAdminOnboarding()
  },

  _exitOnboardingMode() {
    document.body.classList.remove('admin-onboarding-mode')
    document.getElementById('bottom-nav')?.removeAttribute('hidden')
    document.querySelector('.fab')?.removeAttribute('hidden')
  },

  _bootAdmin() {
    const hash = (location.hash || '').replace('#', '').trim()
    this.showSection(hash && document.getElementById(`sec-${hash}`) ? hash : 'dashboard')
    if (typeof ChequeManager !== 'undefined') ChequeManager.syncNotifications()
    if (!this._intervalsStarted) {
      this._intervalsStarted = true
      setInterval(() => Auth.checkSessionExpiry(), 300000)
    }
    if (!this._keydownBound) {
      this._keydownBound = true
      document.addEventListener('keydown', e => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'k') { e.preventDefault(); this.openGlobalSearch() }
      })
    }
    if (typeof NotificationTicker !== 'undefined') {
      NotificationTicker.init('studio')
    }
  },

  renderShell() {
    const user = Auth.getUser()
    const info = DB.get('studioInfo') || {}
    const isSys = Auth.isSystemAdmin()
    const isStudio = Auth.isStudioManager()
    const _isSubAdmin = !isSys && !isStudio && typeof Access !== 'undefined' && Access.isManagement(user)
    const canStudio = isStudio || isSys || Auth.userHasPermission('view_all') || Auth.userHasPermission('view_contract')
    const canSms = Auth.userHasPermission('sms') || canStudio
    const roleBadge = typeof Access !== 'undefined' ? Access.getRoleBadge(user) : { emoji: '👤', title: 'مدیر' }
    const app = document.getElementById('admin-app')
    const classic = new URLSearchParams(location.search).has('classic')
    app.innerHTML = `
      ${classic ? `<div class="admin-deprecation-banner" role="status">
        <i class="fas fa-triangle-exclamation"></i>
        <span>پنل کلاسیک منسوخ شده — <a href="studio-m/">Studio M Pro</a> نسخه اصلی است. فقط برای CRM/عکس‌خانه/قرارداد کلاسیک از <code>?classic=1</code> استفاده کنید.</span>
      </div>` : ''}
      <div class="admin-layout">
        <aside class="sidebar admin-sidebar" id="admin-sidebar">
          <div class="sidebar-head">
            <div class="sidebar-logo">
              <div class="sidebar-logo-icon"><i class="fas fa-camera-retro"></i></div>
              <div>
                <div class="sidebar-logo-text">${Utils.escapeHtml(info.name || 'Studio M')}</div>
                <div class="sidebar-logo-ver">v${AppConfig.APP_VERSION}</div>
              </div>
            </div>
            <button type="button" class="menu-toggle-btn" onclick="Admin.toggleSidebar()"><i class="fas fa-times"></i></button>
          </div>
          <nav class="sidebar-nav">
            ${this._sidebarItem('dashboard', 'fa-chart-line', 'داشبورد', 'var(--clr-primary)')}
            ${this._sidebarItem('reports', 'fa-chart-pie', 'گزارش‌ها', 'var(--clr-success)')}
            ${canStudio ? this._sidebarItem('contracts', 'fa-file-signature', 'قراردادها', 'var(--clr-primary)') : ''}
            ${canStudio ? this._sidebarItem('crm', 'fa-funnel-dollar', 'CRM / لید', 'var(--clr-warning)') : ''}
            ${canStudio ? this._sidebarItem('calendar', 'fa-calendar-days', 'تقویم / رزرو', 'var(--clr-info)') : ''}
            ${canStudio ? this._sidebarItem('finance', 'fa-coins', 'مالی', 'var(--clr-success)') : ''}
            ${canStudio ? this._sidebarItem('equipment', 'fa-camera', 'تجهیزات', 'var(--clr-accent)') : ''}
            ${canStudio ? this._sidebarItem('personnel', 'fa-user-tie', 'پرسنل', 'var(--clr-accent)') : ''}
            ${canStudio ? this._sidebarItem('print', 'fa-images', 'عکس‌خانه', 'var(--clr-accent)') : ''}
            ${canStudio ? this._sidebarItem('requests', 'fa-inbox', 'درخواست مشتری', 'var(--clr-warning)') : ''}
            ${canSms ? this._sidebarItem('messaging', 'fa-sms', 'پیام و پیگیری', 'var(--clr-info)') : ''}
            ${isSys ? this._sidebarItem('users', 'fa-user-shield', 'کاربران (ادمین)', 'var(--clr-info)') : ''}
            ${this._sidebarItem('settings', 'fa-sliders', 'تنظیمات', 'var(--clr-success)')}
            ${this._sidebarItem('logs', 'fa-clock-rotate-left', 'لاگ', 'var(--clr-danger)')}
            ${isStudio || isSys ? `<div class="sidebar-item sidebar-item--portal" onclick="window.location.href='studio-m/'">
              <span class="sidebar-item-icon"><i class="fas fa-rocket"></i></span><span>Studio M Pro (اصلی)</span>
            </div>` : ''}
          </nav>
          <div class="sidebar-footer sidebar-foot">
            <div class="sidebar-user">${Utils.escapeHtml(user?.name || '')}<br><small style="opacity:.65">${roleBadge.emoji} ${Utils.escapeHtml(roleBadge.title)}</small></div>
            <button type="button" class="sidebar-logout" onclick="Admin.logout()"><i class="fas fa-right-from-bracket"></i></button>
          </div>
        </aside>
        <div class="sidebar-overlay" onclick="Admin.toggleSidebar()"></div>
        <main class="admin-main">
          <header class="header admin-header-bar">
            <button type="button" class="menu-toggle-btn" onclick="Admin.toggleSidebar()"><i class="fas fa-bars"></i></button>
            <div class="header-titles">
              <h1 class="header-title" id="admin-header-title">داشبورد</h1>
              <div class="header-sub" id="admin-header-sub">خلاصه وضعیت استودیو</div>
            </div>
            <button class="header-btn" onclick="GlassTheme.openPicker()" title="ظاهر"><i class="fas fa-wand-magic-sparkles"></i></button>
            <button class="header-btn" onclick="Admin.openGlobalSearch()" title="جستجو"><i class="fas fa-search"></i></button>
          </header>
          <div class="admin-sections">
            <section id="sec-dashboard" class="admin-section active"></section>
            <section id="sec-reports" class="admin-section"></section>
            <section id="sec-contracts" class="admin-section"></section>
            <section id="sec-crm" class="admin-section"></section>
            <section id="sec-calendar" class="admin-section"></section>
            <section id="sec-finance" class="admin-section"></section>
            <section id="sec-equipment" class="admin-section"></section>
            <section id="sec-personnel" class="admin-section"></section>
            <section id="sec-print" class="admin-section"></section>
            <section id="sec-requests" class="admin-section"></section>
            <section id="sec-messaging" class="admin-section"></section>
            <section id="sec-users" class="admin-section"></section>
            <section id="sec-settings" class="admin-section"></section>
            <section id="sec-logs" class="admin-section"></section>
          </div>
        </main>
      </div>`
    document.getElementById('bottom-nav')?.removeAttribute('hidden')
    this._sectionRendered.clear()
    this._sectionInvalidated.clear()
  },

  _sidebarItem(id, icon, label, accent) {
    return `<div class="sidebar-item" data-section="${id}" style="--accent:${accent}" onclick="Admin.showSection('${id}')" role="button">
      <span class="sidebar-item-icon"><i class="fas ${icon}"></i></span><span>${label}</span>
    </div>`
  },

  canAccessSection(section) {
    const user = Auth.getUser()
    if (!user) return false
    const isSys = Auth.isSystemAdmin()
    const isStudio = Auth.isStudioManager()
    const canStudio = isStudio || isSys || Auth.userHasPermission('view_all') || Auth.userHasPermission('view_contract')
    const canSms = Auth.userHasPermission('sms') || canStudio
    const openSections = ['dashboard', 'reports', 'settings', 'logs']
    if (openSections.includes(section)) return true
    if (section === 'users') return isSys
    if (section === 'messaging') return canSms
    return canStudio
  },

  showSection(section, force = false) {
    if (!this.canAccessSection(section)) {
      Utils.toast('دسترسی به این بخش ندارید', 'error')
      section = 'dashboard'
    }
    this.state.section = section
    document.querySelectorAll('.admin-section').forEach(el => el.classList.remove('active'))
    document.getElementById(`sec-${section}`)?.classList.add('active')
    document.querySelectorAll('.sidebar-item[data-section]').forEach(el => {
      el.classList.toggle('active', el.dataset.section === section)
    })
    document.getElementById('admin-sidebar')?.classList.remove('open')
    const titles = {
      dashboard: ['داشبورد', 'خلاصه وضعیت استودیو'],
      reports: ['گزارش‌ها', 'خروجی و تحلیل'],
      contracts: ['قراردادها', 'مدیریت مشتریان و مراسم'],
      crm: ['CRM', 'لیدها و فرصت‌های فروش'],
      calendar: ['تقویم', 'رزرو و نوبت‌ها'],
      finance: ['مالی', 'تراکنش‌ها، بانک و چک'],
      equipment: ['تجهیزات', 'دوربین، لنز و موجودی'],
      personnel: ['پرسنل', 'همکاران و پروژه‌ها'],
      print: ['عکس‌خانه', 'چاپ و آلبوم'],
      requests: ['درخواست مشتری', 'پیام‌های عروس و داماد'],
      messaging: ['پیام و پیگیری', 'SMS رسمی · شخصی · یادآوری مراسم'],
      users: ['کاربران', 'نقش‌ها و دسترسی'],
      settings: ['تنظیمات', 'استودیو، لایسنس و پشتیبان'],
      logs: ['لاگ', 'تاریخچه عملیات']
    }
    const [t, s] = titles[section] || ['پنل', '']
    const ht = document.getElementById('admin-header-title')
    const hs = document.getElementById('admin-header-sub')
    if (ht) ht.textContent = t
    if (hs) hs.textContent = s
    location.hash = section
    this._updateBottomNav(section)
    const container = document.getElementById(`sec-${section}`)
    if (!container) return

    const skipRender = !force && !this._sectionInvalidated.has(section) && this._sectionRendered.has(section)

    if (skipRender) return

    this._sectionInvalidated.delete(section)
    const renderers = {
      dashboard: () => AdminSections.renderDashboard(container),
      reports: () => typeof AdminReports !== 'undefined' ? AdminReports.render(container) : AdminSections.renderReports(container),
      contracts: () => AdminSections.renderContracts(container),
      crm: () => AdminSections.renderCrm(container),
      calendar: () => AdminSections.renderCalendar(container),
      finance: () => AdminSections.renderFinance(container),
      equipment: () => AdminSections.renderEquipment(container),
      personnel: () => AdminSections.renderPersonnel(container),
      print: () => typeof PhotoHouseAdmin !== 'undefined' ? PhotoHouseAdmin.render(container) : AdminSections.renderPlaceholder(container, 'عکس‌خانه'),
      requests: () => AdminSections.renderRequests(container),
      messaging: () => typeof AdminMessaging !== 'undefined' ? AdminMessaging.render(container) : AdminSections.renderPlaceholder(container, 'پیام'),
      users: () => AdminSections.renderUsers(container),
      settings: () => AdminSections.renderSettings(container),
      logs: () => AdminSections.renderLogs(container)
    }
    ;(renderers[section] || (() => AdminSections.renderPlaceholder(container, section)))()
    this._sectionRendered.add(section)
  },

  _updateBottomNav(section) {
    const navMap = { dashboard: 'dashboard', contracts: 'contracts', finance: 'finance' }
    const active = navMap[section] || null
    document.querySelectorAll('.bottom-nav-item[data-section]').forEach(el => {
      if (el.dataset.section === 'more') return
      el.classList.toggle('active', el.dataset.section === active)
    })
  },

  toggleSidebar() {
    document.getElementById('admin-sidebar')?.classList.toggle('open')
  },

  toggleBottomMore() {
    document.getElementById('bottom-more-menu')?.classList.toggle('open')
  },

  logout() {
    Auth.logout()
    window.location.href = 'site.html'
  },

  openNewContract() {
    window.location.href = 'contract.html'
  },

  openGlobalSearch() {
    const m = document.getElementById('global-search-modal')
    if (m) { m.hidden = false; document.getElementById('global-search-input')?.focus() }
  },

  closeGlobalSearch() {
    const m = document.getElementById('global-search-modal')
    if (m) m.hidden = true
  },

  handleGlobalSearch(q) { if (typeof AdminTools !== 'undefined') AdminTools.searchAll(q) },
  handleGlobalSearchKey(e) { if (e.key === 'Escape') this.closeGlobalSearch() },

  contractStatus(s) {
    const map = { active: 'فعال', done: 'تسویه', issue: 'مشکل', pending: 'در انتظار', cancelled: 'لغو' }
    return map[s] || s || '—'
  },

  highlightText(text, q) {
    if (!q || !text) return Utils.escapeHtml(text || '')
    const esc = Utils.escapeHtml(String(text))
    const re = new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi')
    return esc.replace(re, '<mark>$1</mark>')
  },

  _esc(v) { return Utils.escapeHtml(v == null ? '' : String(v)) }
}

window.Admin = Admin

document.addEventListener('DOMContentLoaded', () => Bootstrap.start(async () => {
  if (typeof Studio !== 'undefined') Studio.ensureIdentity()
  if (typeof DemoSeed !== 'undefined' && DemoSeed.isDemoMode()) await DemoSeed.seed()
  Admin.init()
  Bootstrap.showChangelogIfNeeded()
}))
