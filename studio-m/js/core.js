/* Studio M Pro — Core: i18n, router, permissions, shell */
const SM = {
  state: { route: 'dashboard', locale: 'fa', theme: 'light', accent: 'blue', search: '', moduleSearch: {}, viewStack: [] },
  _routes: null,

  /** بخش‌های موقتاً غیرفعال */
  DISABLED_MODULES: {
    files: 'مدیریت فایل'
  },

  _normalizeRoute(route) {
    if (route === 'gallery' || route === 'media') return 'dashboard'
    return route
  },

  isModuleDisabled(route) {
    const r = this._normalizeRoute(route)
    if (r === 'files' && typeof Cloud !== 'undefined' && Cloud.isEnabled?.()) return false
    return Object.prototype.hasOwnProperty.call(this.DISABLED_MODULES, r)
  },

  disabledModuleTitle(route) {
    const r = this._normalizeRoute(route)
    return this.DISABLED_MODULES[r] || this.t(r)
  },

  t(key) {
    const dict = I18N[this.state.locale] || I18N.fa
    return dict[key] || key
  },

  fmt(n) {
    return typeof Utils !== 'undefined' ? Utils.fmtNum(n) : String(n ?? 0)
  },

  esc(v) {
    return typeof Utils !== 'undefined' ? Utils.escapeHtml(v == null ? '' : String(v)) : String(v ?? '')
  },

  toast(msg, type = 'info') {
    const stack = document.getElementById('sm-toasts')
    if (!stack) return
    const el = document.createElement('div')
    el.className = `sm-toast sm-toast-${type}`
    const icon = type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'info-circle'
    el.innerHTML = `<i class="fas fa-${icon}"></i><span>${this.esc(msg)}</span>`
    stack.appendChild(el)
    setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 300) }, 3200)
  },

  log(action, detail) {
    if (typeof DB !== 'undefined') DB.log(`sm:${action}`, detail)
  },

  can(perm) {
    if (typeof Auth === 'undefined') return false
    const user = Auth.getUser()
    if (!user) return false
    if (typeof Access !== 'undefined') {
      if (perm === 'manage_users') return Access.canManageUsers(user)
      if (perm === 'manage_system' || perm === 'all') return Access.isSystemAdmin(user)
      // Finance writes/views require manage_finance — not granted by view_all alone
      if (perm === 'manage_finance') {
        return Access.isSystemAdmin(user) || Access.isStudioManager(user) ||
          !!Auth.userHasPermission?.('manage_finance')
      }
      if (Access.isSystemAdmin(user) || Access.isStudioManager(user)) return true
    } else if (Auth.isAdmin?.()) return true
    return Auth.userHasPermission?.(perm) || Auth.userHasPermission?.('view_all') || false
  },

  user() {
    return typeof Auth !== 'undefined' ? Auth.getUser() : null
  },

  studio() {
    return typeof DB !== 'undefined' ? (DB.get('studioInfo') || {}) : {}
  },

  initPrefs() {
    this.state.locale = 'fa'
    localStorage.setItem('sm_locale', 'fa')
    this.state.theme = localStorage.getItem('sm_theme') || 'light'
    this.state.accent = localStorage.getItem('sm_accent') || 'blue'
    document.documentElement.lang = this.state.locale
    document.documentElement.dir = this.state.locale === 'fa' ? 'rtl' : 'ltr'
    document.body.dataset.theme = this.state.theme
    document.body.dataset.accent = this.state.accent
  },

  setLocale(loc) {
    this.state.locale = loc
    localStorage.setItem('sm_locale', loc)
    document.documentElement.lang = loc
    document.documentElement.dir = loc === 'fa' ? 'rtl' : 'ltr'
    this.renderShell()
    this.navigate(this.state.route)
  },

  toggleTheme() {
    this.state.theme = this.state.theme === 'light' ? 'dark' : 'light'
    localStorage.setItem('sm_theme', this.state.theme)
    document.body.dataset.theme = this.state.theme
  },

  getRoutes() {
    if (this._routes) return this._routes
    this._routes = [
      { id: 'dashboard', icon: 'fa-chart-line', group: 'main', perm: null },
      { id: 'bookings', icon: 'fa-calendar-check', group: 'main', perm: 'calendar' },
      { id: 'calendar', icon: 'fa-calendar-days', group: 'main', perm: 'calendar' },
      { id: 'timeline', icon: 'fa-clock', group: 'main', perm: 'view_contract' },
      { id: 'contracts', icon: 'fa-file-signature', group: 'business', perm: 'view_contract' },
      { id: 'packages', icon: 'fa-box-open', group: 'business', perm: 'view_all' },
      { id: 'invoices', icon: 'fa-file-invoice-dollar', group: 'finance', perm: 'manage_finance' },
      { id: 'accounting', icon: 'fa-calculator', group: 'finance', perm: 'manage_finance' },
      { id: 'expenses', icon: 'fa-receipt', group: 'finance', perm: 'manage_finance' },
      { id: 'reports', icon: 'fa-chart-pie', group: 'finance', perm: 'manage_finance' },
      { id: 'employees', icon: 'fa-users', group: 'hr', perm: 'view_all' },
      { id: 'attendance', icon: 'fa-user-clock', group: 'hr', perm: 'view_all' },
      { id: 'payroll', icon: 'fa-money-check-alt', group: 'hr', perm: 'manage_finance' },
      { id: 'equipment', icon: 'fa-camera', group: 'assets', perm: 'view_all' },
      { id: 'custody', icon: 'fa-right-left', group: 'assets', perm: 'view_all' },
      { id: 'files', icon: 'fa-folder-open', group: 'assets', perm: 'view_all' },
      { id: 'workflow', icon: 'fa-diagram-project', group: 'assets', perm: 'editing' },
      { id: 'notifications', icon: 'fa-bell', group: 'comms', perm: null },
      { id: 'inbox', icon: 'fa-inbox', group: 'comms', perm: 'view_contract' },
      { id: 'messaging', icon: 'fa-comments', group: 'comms', perm: 'sms' },
      { id: 'portal', icon: 'fa-door-open', group: 'comms', perm: null },
      { id: 'settings', icon: 'fa-sliders', group: 'system', perm: null },
      { id: 'audit', icon: 'fa-shield-halved', group: 'system', perm: 'view_all' },
      { id: 'users', icon: 'fa-user-shield', group: 'system', perm: 'manage_users' },
      { id: 'api', icon: 'fa-plug', group: 'system', perm: 'manage_system' }
    ]
    return this._routes
  },

  visibleRoutes() {
    const routes = this.getRoutes().filter(r => !this.isModuleDisabled(r.id))
    if (typeof Access !== 'undefined') return Access.filterStudioRoutes(routes)
    return routes.filter(r => !r.perm || this.can(r.perm) || this.can('all'))
  },

  openSidebar() {
    document.getElementById('sm-sidebar')?.classList.add('open')
    document.getElementById('sm-sidebar-overlay')?.classList.add('open')
    document.body.classList.add('sm-sidebar-open')
  },

  closeSidebar() {
    document.getElementById('sm-sidebar')?.classList.remove('open')
    document.getElementById('sm-sidebar-overlay')?.classList.remove('open')
    document.body.classList.remove('sm-sidebar-open')
  },

  toggleSidebar() {
    const sidebar = document.getElementById('sm-sidebar')
    if (sidebar?.classList.contains('open')) this.closeSidebar()
    else this.openSidebar()
  },

  goBack() {
    if (this.state.viewStack.length) {
      this.popSubView()
      return
    }
    if (this.state.route !== 'dashboard') this.navigate('dashboard')
  },

  navigate(route) {
    const routes = this.getRoutes()
    const meta = routes.find(r => r.id === route)
    if (meta?.perm && !this.can(meta.perm) && !this.can('all')) {
      if (typeof SM !== 'undefined' && SM.toast) SM.toast('دسترسی به این بخش ندارید', 'error')
      route = 'dashboard'
    }
    this.state.route = route
    this.state.viewStack = []
    location.hash = route
    document.querySelectorAll('.sm-nav-item').forEach(el => {
      el.classList.toggle('active', el.dataset.route === route)
    })
    this._updateHeaderBack()
    const main = document.getElementById('sm-content')
    if (!main) return
    if (this.isModuleDisabled(route)) {
      main.innerHTML = SMUI.moduleDisabled(route)
    } else {
      const mod = SMModules[route]
      if (mod?.render) {
        mod.render(main)
      } else {
        main.innerHTML = `<div class="sm-empty"><i class="fas fa-puzzle-piece"></i><div class="sm-empty-title">${this.t(route)}</div></div>`
      }
    }
    const faTitles = {
      dashboard: ['داشبورد', ''],
      crm: ['CRM', ''],
      bookings: ['رزرو', ''],
      calendar: ['تقویم', ''],
      timeline: ['تایم‌لاین عروسی', ''],
      contracts: ['قراردادها', ''],
      packages: ['پکیج قیمت', ''],
      invoices: ['فاکتور', ''],
      accounting: ['حسابداری', ''],
      expenses: ['هزینه‌ها', ''],
      reports: ['گزارش‌ها', ''],
      employees: ['پرسنل', ''],
      attendance: ['حضور و غیاب', ''],
      payroll: ['حقوق', ''],
      equipment: ['تجهیزات', ''],
      custody: ['امانات مشتری', ''],
      files: ['مدیریت فایل', ''],
      workflow: ['گردش کار', ''],
      media: ['کتابخانه رسانه', ''],
      notifications: ['اعلان‌ها', ''],
      inbox: ['صندوق مشتری', ''],
      messaging: ['پیام‌رسانی', ''],
      portal: ['مدیریت پرتال', ''],
      settings: ['تنظیمات', ''],
      audit: ['لاگ ممیزی', ''],
      api: ['API', '']
    }
    const titles = (this.state.locale === 'fa' ? faTitles : ROUTE_TITLES)[route] || [this.t(route), '']
    const ht = document.getElementById('sm-header-title')
    const hs = document.getElementById('sm-header-sub')
    if (ht) ht.textContent = titles[0]
    if (hs) {
      hs.textContent = titles[1] || ''
      hs.hidden = !titles[1]
    }
    document.getElementById('sm-sidebar')?.classList.remove('open')
    this.closeSidebar()
  },

  pushSubView(title, renderHtml) {
    this.state.viewStack.push({ title, html: typeof renderHtml === 'function' ? renderHtml() : renderHtml })
    this._renderSubView()
  },

  popSubView() {
    if (!this.state.viewStack.length) return
    this.state.viewStack.pop()
    if (this.state.viewStack.length) this._renderSubView()
    else this.navigate(this.state.route)
  },

  _renderSubView() {
    const view = this.state.viewStack[this.state.viewStack.length - 1]
    const main = document.getElementById('sm-content')
    if (!main || !view) return
    main.innerHTML = `${SMUI.backBar(view.title, 'SM.popSubView()')}${view.html}`
    this._updateHeaderBack()
    const ht = document.getElementById('sm-header-title')
    const hs = document.getElementById('sm-header-sub')
    if (ht) ht.textContent = view.title
    if (hs) {
      hs.textContent = ''
      hs.hidden = true
    }
  },

  _updateHeaderBack() {
    const btn = document.getElementById('sm-header-back')
    if (!btn) return
    const show = this.state.viewStack.length > 0 || this.state.route !== 'dashboard'
    btn.hidden = !show
  },

  renderShell() {
    const user = this.user()
    const studio = this.studio()
    const routes = this.visibleRoutes()
    const groups = {
      main: this.t('group_main'),
      business: this.t('group_business'),
      finance: this.t('group_finance'),
      hr: this.t('group_hr'),
      assets: this.t('group_assets'),
      comms: this.t('group_comms'),
      system: this.t('group_system')
    }
    const unread = (typeof DB !== 'undefined'
      ? (typeof DB.active === 'function' ? DB.active('notifications') : DB.get('notifications'))
      : []).filter(n => !n.read && !n._deleted).length

    let navHtml = ''
    for (const [gid, label] of Object.entries(groups)) {
      const items = routes.filter(r => r.group === gid)
      if (!items.length) continue
      navHtml += `<div class="sm-nav-group"><div class="sm-nav-label">${label}</div>`
      navHtml += items.map(r => {
        const off = this.isModuleDisabled(r.id)
        return `
        <button type="button" class="sm-nav-item${this.state.route === r.id ? ' active' : ''}${off ? ' sm-nav-item--off' : ''}" data-route="${r.id}" onclick="SM.navigate('${r.id}')">
          <i class="fas ${r.icon}"></i><span>${this.t(r.id)}</span>
          ${off ? '<span class="sm-nav-soon">به‌زودی</span>' : ''}
          ${r.id === 'notifications' && unread ? `<span class="sm-nav-badge">${unread}</span>` : ''}
        </button>`
      }).join('')
      navHtml += '</div>'
    }

    const roleBadge = typeof Access !== 'undefined' ? Access.getRoleBadge(user) : { emoji: '👑', title: roleLabel }

    document.getElementById('sm-root').innerHTML = `
      <div class="sm-shell">
        <div class="sm-sidebar-overlay" id="sm-sidebar-overlay" onclick="SM.closeSidebar()" aria-hidden="true"></div>
        <aside class="sm-sidebar" id="sm-sidebar">
          <div class="sm-sidebar-head">
            <div class="sm-brand">
              <div class="sm-brand-icon">${studio.logo
                ? (Utils.safeImgHtml(studio.logo, 'class="sm-brand-logo"') || '<i class="fas fa-camera-retro"></i>')
                : '<i class="fas fa-camera-retro"></i>'}</div>
              <div>
                <div class="sm-brand-text">${this.esc(studio.name || 'Studio M')}</div>
                <div class="sm-brand-sub">${roleBadge.emoji} ${this.esc(roleBadge.title)} · Pro v${AppConfig.APP_VERSION}</div>
              </div>
            </div>
          </div>
          <nav class="sm-nav">${navHtml}</nav>
          <div class="sm-sidebar-foot">
            <button type="button" class="sm-sidebar-foot-btn" onclick="SM.openProfile()" title="پروفایل و تنظیمات">
              <div class="sm-user-avatar">${studio.logo
                ? (Utils.safeImgHtml(studio.logo, 'class="sm-user-avatar-img"') || this.esc((user?.name || '?').charAt(0)))
                : this.esc((user?.name || '?').charAt(0))}</div>
              <div class="sm-user-info">
                <div class="sm-user-name">${this.esc(user?.name || '')}</div>
                <div class="sm-user-role">${this.esc(roleBadge.title)}</div>
              </div>
              <i class="fas fa-chevron-left sm-user-chevron"></i>
            </button>
            <button type="button" class="sm-btn-icon" onclick="SM.logout()" title="${this.t('logout')}"><i class="fas fa-right-from-bracket"></i></button>
          </div>
        </aside>
        <div class="sm-main">
          <header class="sm-header">
            <button type="button" class="sm-btn-icon sm-menu-toggle" onclick="SM.toggleSidebar()" aria-label="${this.t('menu')}"><i class="fas fa-bars"></i></button>
            <button type="button" class="sm-btn-icon sm-header-back" id="sm-header-back" hidden onclick="SM.goBack()" title="${this.t('back')}"><i class="fas fa-arrow-right"></i></button>
            <div class="sm-header-titles">
              <div class="sm-header-title" id="sm-header-title">${this.t('dashboard')}</div>
              <div class="sm-header-sub" id="sm-header-sub" hidden></div>
            </div>
            <div class="sm-header-actions">
              <button type="button" class="sm-btn-icon" onclick="SM.toggleTheme()" title="${this.t('theme')}"><i class="fas fa-${this.state.theme === 'light' ? 'moon' : 'sun'}"></i></button>
            </div>
          </header>
          <main class="sm-content" id="sm-content"></main>
        </div>
      </div>`
  },

  getModuleSearch(route) {
    return (this.state.moduleSearch[route] || '').trim().toLowerCase()
  },

  setModuleSearch(route, q) {
    this.state.moduleSearch[route] = q
    if (this.state.route === route && !this.state.viewStack.length) {
      const main = document.getElementById('sm-content')
      if (!main) return
      if (this.isModuleDisabled(route)) {
        main.innerHTML = SMUI.moduleDisabled(route)
        return
      }
      const mod = SMModules[route]
      if (mod?.render) mod.render(main)
    }
  },

  handleSearch(q) {
    this.state.search = q.trim().toLowerCase()
  },

  logout() {
    if (typeof Auth !== 'undefined') Auth.logout()
    window.location.href = '../index.html?logout=1'
  },

  openProfile() {
    if (typeof SMSettings !== 'undefined') {
      SMSettings.setTab('profile')
      return
    }
    SM.navigate('settings')
  },

  guard() {
    if (typeof Auth === 'undefined' || !Auth.isLoggedIn()) {
      const returnPath = location.pathname.includes('studio-m')
        ? location.pathname + (location.search || '') + (location.hash || '#dashboard')
        : '/studio-m/index.html' + (location.hash || '#dashboard')
      const next = encodeURIComponent(returnPath.startsWith('/') ? returnPath : `/${returnPath}`)
      window.location.replace(`../index.html?next=${next}`)
      return false
    }
    if (Auth.getSession()?._sigInvalid) {
      Auth.logout?.()
      window.location.replace('../index.html?next=' + encodeURIComponent('/studio-m/'))
      return false
    }
    Auth.getCsrfToken?.()

    const user = this.user()
    if (typeof Access !== 'undefined') {
      if (!Access.canAccessStudioM(user)) {
        window.location.replace('../index.html?view=portal')
        return false
      }
      return true
    }
    const isManager = (user?.roles || []).some(r => {
      const n = typeof normalizeRole === 'function' ? normalizeRole(r) : r
      return n === 'studio_manager' || n === 'system_admin'
    })
    const hasAccess = isManager || this.can('view_all') || this.can('view_contract') || this.can('calendar')
    if (!hasAccess) {
      window.location.replace('../index.html?view=portal')
      return false
    }
    return true
  }
}

const ROUTE_TITLES = {
  dashboard: ['Dashboard', 'Studio overview'],
  crm: ['CRM', 'Leads & pipeline'],
  bookings: ['Bookings', 'Session reservations'],
  calendar: ['Calendar', 'Events & appointments'],
  timeline: ['Wedding Timeline', 'Day-of schedule'],
  contracts: ['Contracts', 'Client agreements'],
  packages: ['Packages', 'Pricing tiers'],
  invoices: ['Invoices', 'Billing documents'],
  accounting: ['Accounting', 'Ledger & banks'],
  expenses: ['Expenses', 'Cost tracking'],
  reports: ['Reports', 'Analytics & exports'],
  employees: ['Employees', 'Team management'],
  attendance: ['Attendance', 'Time tracking'],
  payroll: ['Payroll', 'Salary & payments'],
  equipment: ['Equipment', 'Cameras & lenses'],
  files: ['Files', 'Asset management'],
  workflow: ['Workflow', 'Editing pipeline'],
  media: ['Media Library', 'Photos, video & files'],
  notifications: ['Notifications', 'Alerts & updates'],
  inbox: ['Customer Inbox', 'Client requests & messages'],
  messaging: ['Messaging', 'SMS, Email, WhatsApp'],
  portal: ['Portal Users', 'Admin · Staff · SMS invite'],
  settings: ['Settings', 'Studio & system'],
  audit: ['Audit Logs', 'Activity history'],
  api: ['API', 'Integration layer']
}

const I18N = {
  fa: {
    group_main: 'اصلی', group_business: 'کسب‌وکار', group_finance: 'مالی',
    group_hr: 'منابع انسانی', group_assets: 'دارایی', group_comms: 'ارتباطات', group_system: 'سیستم',
    dashboard: 'داشبورد', crm: 'لید / CRM', bookings: 'رزرو', calendar: 'تقویم',
    timeline: 'تایم‌لاین عروسی', contracts: 'قراردادها',
    packages: 'پکیج قیمت', invoices: 'فاکتور', accounting: 'حسابداری', expenses: 'هزینه‌های جاری',
    reports: 'گزارش‌ها', employees: 'پرسنل', attendance: 'حضور و غیاب', payroll: 'حقوق',
    equipment: 'تجهیزات', custody: 'امانات مشتری', files: 'مدیریت فایل', workflow: 'گردش کار تدوین', media: 'کتابخانه رسانه',
    notifications: 'اعلان‌ها', inbox: 'صندوق مشتری', messaging: 'پیام‌رسانی', portal: 'مدیریت پرتال',
    settings: 'تنظیمات', audit: 'لاگ ممیزی', users: 'کاربران سیستم', api: 'API',
    search: 'جستجو...', logout: 'خروج', theme: 'تم', menu: 'منو', add: 'افزودن', save: 'ذخیره',
    cancel: 'لغو', delete: 'حذف', edit: 'ویرایش', view: 'مشاهده', export: 'خروجی',
    back: 'بازگشت', close: 'بستن', actions: 'عملیات',
    no_data: 'داده‌ای وجود ندارد', success: 'انجام شد', error: 'خطا'
  },
  en: {
    group_main: 'Main', group_business: 'Business', group_finance: 'Finance',
    group_hr: 'HR', group_assets: 'Assets', group_comms: 'Communications', group_system: 'System',
    dashboard: 'Dashboard', crm: 'CRM / Leads', bookings: 'Bookings', calendar: 'Calendar',
    timeline: 'Wedding Timeline', contracts: 'Contracts',
    packages: 'Price Packages', invoices: 'Invoices', accounting: 'Accounting', expenses: 'Expenses',
    reports: 'Reports', employees: 'Employees', attendance: 'Attendance', payroll: 'Payroll',
    equipment: 'Equipment', files: 'File Management', workflow: 'Editing Pipeline', media: 'Media Library',
    notifications: 'Notifications', inbox: 'Customer Inbox', messaging: 'Messaging', portal: 'Customer Portal',
    settings: 'Settings', audit: 'Audit Logs', users: 'System Users', api: 'API',
    search: 'Search...', logout: 'Logout', theme: 'Theme', menu: 'Menu', add: 'Add', save: 'Save',
    cancel: 'Cancel', delete: 'Delete', edit: 'Edit', view: 'View', export: 'Export',
    back: 'Back', close: 'Close', actions: 'Actions',
    no_data: 'No data yet', success: 'Done', error: 'Error'
  }
}

Object.keys(ROUTE_TITLES).forEach(k => {
  I18N.fa[k + '_sub'] = ROUTE_TITLES[k][1]
})

window.SM = SM
