/* ══════════════════════════════════════════════
   MAN — راه‌اندازی اولیه (فقط یک‌بار، بدون ریست رمز)
   ══════════════════════════════════════════════ */

const FirstSetup = {
  HINT_KEY: 'man_first_admin_hint',

  hasManager() {
    return DB.get('users').some(u => {
      const roles = u.roles || []
      return roles.includes('studio_manager') || roles.includes('system_admin') ||
        roles.some(r => String(r).includes('مدیر آتلیه') || String(r).includes('مدیر سیستم'))
    })
  },

  /** فقط وقتی هیچ مدیر فعالی نیست — یک حساب اولیه می‌سازد */
  async ensureFirstAdmin() {
    if (this.hasManager()) return null

    const phone = Utils.normalizePhone(AppConfig.generateBootstrapPhone())
    const password = Utils.generateRandomPassword(16)
    const creds = await Auth.hashCredentials(password)

    let admin
    await SecureDB.runInternalAsync(async () => {
    admin = DB.insert('users', {
      name: 'مدیر استودیو',
      phone,
      password: creds.password,
      salt: creds.salt,
      roles: ['studio_manager'],
      status: 'active',
      avatar: 'م',
      mustChangePassword: true,
      isDefaultPassword: true,
      isBootstrapAdmin: true,
      profileCompleted: false,
      createdAt: Utils.todayJalali()
    })
    DB.syncPersonnelFromUser(admin)

    if (!DB.get('banks').length) {
      DB.insert('banks', {
        id: 'bank_cash_' + Date.now(),
        name: 'صندوق نقدی',
        account: '', accountNumber: '', iban: '', shaba: '', card: '',
        balance: 0, color: '#22C55E', icon: '💰'
      })
    }

    const info = DB.get('studioInfo') || {}
    if (!info.name || info.name === AppConfig.DEFAULT_STUDIO_NAME) {
      DB.set('studioInfo', {
        ...info,
        name: info.name || AppConfig.DEFAULT_STUDIO_NAME,
        manager: 'مدیر استودیو',
        phone: info.phone || phone,
        setupCompleted: !!(info.name && info.name !== AppConfig.DEFAULT_STUDIO_NAME)
      })
    }
    await DB.flush()
    })

    Utils.storage.set(this.HINT_KEY, true)
    try {
      sessionStorage.setItem('talar_first_setup_creds', JSON.stringify({
        phone, password, expires: Date.now() + 300000
      }))
    } catch { /* */ }
    return admin
  },

  shouldShowLoginHint() {
    return !!Utils.storage.get(this.HINT_KEY, false)
  },

  clearLoginHint() {
    Utils.storage.remove(this.HINT_KEY)
  }
}

window.FirstSetup = FirstSetup
