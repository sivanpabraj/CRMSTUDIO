/* ══════════════════════════════════════════════
   FactoryReset — صفر کردن داده‌ها
   ══════════════════════════════════════════════ */

const FactoryReset = {
  STORAGE_PREFIXES: ['talar_', 'studio_', 'man_', 'sm_'],

  IDENTITY_KEYS: [
    'id', 'name', 'logo', 'phone', 'address', 'manager', 'managerEmail', 'social',
    'slug', 'joinCode', 'siteLinks', 'appBaseUrl', 'externalSiteUrl', 'tagline',
    'setupCompleted', 'smsMorningReminders',
    'autoBackup', 'backupHourly', 'backupDaily', 'backupAutoDownload', 'backupPathNote',
    'lastBackup', 'backupLastAt', 'backupLastKey', 'backupLastLabel'
  ],

  clearClientStorage(keepDbMirror) {
    try { sessionStorage.clear() } catch { /* */ }
    const remove = new Set([
      AppConfig.SESSION_KEY,
      AppConfig.DRAFT_KEY,
      'customer_session',
      'talar_unified_otp',
      'talar_customer_otp',
      'talar_pw_reset_otp',
      'man_demo_mode',
      ...(AppConfig.LEGACY_DB_KEYS || [])
    ])
    if (!keepDbMirror) remove.add(AppConfig.DB_KEY)

    try {
      Object.keys(localStorage).forEach(key => {
        if (remove.has(key)) { localStorage.removeItem(key); return }
        if (this.STORAGE_PREFIXES.some(p => key.startsWith(p))) localStorage.removeItem(key)
        if (key.startsWith(AppConfig.BACKUP_PREFIX)) localStorage.removeItem(key)
        if (key.startsWith('talar_login_attempts_')) localStorage.removeItem(key)
        if (key.startsWith('talar_customer_attempts_')) localStorage.removeItem(key)
        if (key.startsWith('talar_unified_otp_rate_')) localStorage.removeItem(key)
        if (key.startsWith('talar_pw_reset_rate_')) localStorage.removeItem(key)
      })
    } catch { /* */ }
  },

  async clearIndexedDB() {
    try { await IdbStore.clear(AppConfig.IDB_BACKUP_STORE) } catch { /* */ }
    try { await IdbStore.clear(AppConfig.IDB_STORE) } catch { /* */ }
  },

  _extractIdentity(info) {
    info = info || {}
    const out = {}
    this.IDENTITY_KEYS.forEach(k => {
      if (info[k] !== undefined && info[k] !== null && info[k] !== '') out[k] = info[k]
    })
    return out
  },

  _isManager(u) {
    if (!u) return false
    return (u.roles || []).some(r => {
      const n = typeof normalizeRole === 'function' ? normalizeRole(r) : r
      return n === 'studio_manager' || n === 'system_admin'
    })
  },

  _assertManagerSession() {
    if (typeof Auth === 'undefined' || !Auth.isLoggedIn()) {
      throw new Error('برای این عملیات باید وارد شوید')
    }
    const user = Auth.getUser()
    const ok = this._isManager(user) ||
      (typeof Access !== 'undefined' && Access.isSystemAdmin?.(user))
    if (!ok) throw new Error('فقط مدیر سیستم مجاز است')
  },

  async _seedManager(identity) {
    const password = Utils.generateRandomPassword(16)
    const creds = await Auth.hashCredentials(password)
    const phone = Utils.normalizePhone(identity.phone || AppConfig.generateBootstrapPhone())
    const admin = DB.insert('users', {
      name: identity.manager || 'مدیر استودیو',
      phone,
      password: creds.password,
      salt: creds.salt,
      roles: ['studio_manager'],
      status: 'active',
      mustChangePassword: !identity.setupCompleted,
      isBootstrapAdmin: !identity.setupCompleted,
      profileCompleted: !!identity.setupCompleted,
      createdAt: Utils.todayJalali()
    })
    DB.insert('banks', {
      id: 'bank_cash_' + Date.now(),
      name: 'صندوق نقدی',
      account: '', accountNumber: '', iban: '', shaba: '', card: '',
      balance: 0, color: '#22C55E', icon: '💰'
    })
    DB.syncPersonnelFromUser(admin)
    return { admin, phone, password }
  },

  /** صفر عملیاتی — برند و تنظیمات استودیو + مدیر حفظ می‌شود */
  async wipeOperationalData() {
    this._assertManagerSession()
    if (typeof Auth !== 'undefined') Auth.logout()
    CustomerSession?.clear?.()
    UnifiedLogin?.clearPending?.()

    const info = DB.get('studioInfo') || {}
    const identity = this._extractIdentity(info)
    const managers = (DB.get('users') || []).filter(u => this._isManager(u))

    this.clearClientStorage(false)
    await this.clearIndexedDB()
    await DB.reset()

    if (typeof Studio !== 'undefined') Studio.ensureIdentity()

    if (managers.length) {
      managers.forEach(u => {
        const copy = { ...u }
        delete copy.id
        DB.insert('users', copy)
      })
    } else {
      const seeded = await this._seedManager(identity)
      if (seeded?.password && !AppConfig.isLocalDev()) {
        try {
          sessionStorage.setItem('talar_first_setup_creds', JSON.stringify({
            phone: seeded.phone,
            password: seeded.password,
            expires: Date.now() + 300000
          }))
        } catch { /* */ }
      }
    }

    const joinCode = identity.joinCode || (typeof Studio !== 'undefined' ? Studio.generateJoinCode() : '')
    DB.set('studioInfo', {
      ...DB.get('studioInfo'),
      ...identity,
      joinCode,
      setupCompleted: identity.setupCompleted !== false && !!identity.name
    })

    DB.log('factory_reset', 'داده‌های عملیاتی صفر شد — هویت استودیو حفظ شد')
    await DB.flush()
    return { ok: true, mode: 'operational' }
  },

  /** صفر کامل — فقط مدیر پیش‌فرض */
  async wipeForTesting() {
    this._assertManagerSession()
    if (typeof Auth !== 'undefined') Auth.logout()
    CustomerSession?.clear?.()
    UnifiedLogin?.clearPending?.()

    this.clearClientStorage(false)
    await this.clearIndexedDB()
    await DB.reset()

    const seeded = await this._seedManager({})
    try {
      sessionStorage.setItem('talar_first_setup_creds', JSON.stringify({
        phone: seeded.phone,
        password: seeded.password,
        expires: Date.now() + 300000
      }))
    } catch { /* */ }

    if (typeof SiteBridge !== 'undefined') {
      DB.set('studioInfo', {
        ...DB.get('studioInfo'),
        name: '',
        phone: '',
        address: '',
        manager: '',
        managerEmail: '',
        logo: '',
        social: '',
        setupCompleted: false,
        siteLinks: SiteBridge.defaultSiteLinksForStudio(''),
        appBaseUrl: '',
        externalSiteUrl: '',
        tagline: '',
        autoBackup: false,
        backupHourly: false,
        backupDaily: false
      })
    } else {
      DB.set('studioInfo', {
        name: '', phone: '', address: '', manager: '', logo: '',
        setupCompleted: false, joinCode: '', slug: ''
      })
    }

    if (typeof Studio !== 'undefined') Studio.ensureIdentity()
    DB.log('factory_reset', 'صفر کامل — آماده راه‌اندازی')
    if (typeof FirstSetup !== 'undefined') Utils.storage.set(FirstSetup.HINT_KEY, true)
    await DB.flush()
    return { ok: true, mode: 'full', phone: seeded.phone, password: seeded.password }
  },

  credentialsLabel() {
    return 'پس از بازنشانی، اطلاعات ورود یک‌بار در صفحه ورود نمایش داده می‌شود'
  }
}

window.FactoryReset = FactoryReset
