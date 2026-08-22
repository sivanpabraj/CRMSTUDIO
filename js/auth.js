/* ══════════════════════════════════════════════
   Studio M — Authentication & Session
   ══════════════════════════════════════════════ */

const Auth = {
  SESSION_KEY: AppConfig.SESSION_KEY,
  SESSION_TIMEOUT_MS: AppConfig.SESSION_TIMEOUT_MS,
  LOCKOUT_THRESHOLD: AppConfig.LOCKOUT_THRESHOLD,
  LOCKOUT_DURATION_MS: AppConfig.LOCKOUT_DURATION_MS,
  OTP_PROOF_KEY: AppConfig.OTP_LOGIN_PROOF_KEY,
  PW_RESET_PROOF_KEY: 'talar_pw_reset_proof',
  CSRF_KEY: AppConfig.CSRF_KEY,
  _cloudPrincipal: null,
  _cloudSession: null,

  _allowsLocalIdentity() {
    return typeof AppConfig.allowsLocalIdentity === 'function'
      ? !!AppConfig.allowsLocalIdentity()
      : !!AppConfig.isLocalDev?.()
  },

  acceptCloudIdentity(authUser, membership) {
    const roles = Array.isArray(membership?.roles)
      ? membership.roles.map(role => typeof normalizeRole === 'function' ? normalizeRole(role) : role).filter(Boolean)
      : []
    const now = Date.now()
    const validFrom = membership?.valid_from ? Date.parse(membership.valid_from) : Number.NaN
    const validUntil = membership?.valid_until ? Date.parse(membership.valid_until) : null
    const membershipInvalid = membership?.status !== 'active' || !!membership?.revoked_at ||
      !Number.isFinite(validFrom) || validFrom > now ||
      (validUntil !== null && (!Number.isFinite(validUntil) || validUntil <= now))
    if (!authUser?.id || !membership?.studio_id || !roles.length || membershipInvalid) {
      this.clearCloudIdentity()
      return null
    }
    this._cloudPrincipal = Object.freeze({
      id: authUser.id,
      authUserId: authUser.id,
      studioId: membership.studio_id,
      name: membership.display_name || authUser.email || 'کاربر',
      phone: membership.phone || '',
      roles: Object.freeze(roles.slice()),
      status: 'active',
      sessionVersion: Number(membership.session_version) || 1,
      cloudAuthoritative: true
    })
    this._cloudSession = Object.freeze({
      userId: authUser.id,
      studioId: membership.studio_id,
      sessionVersion: Number(membership.session_version) || 1,
      cloudAuthoritative: true
    })
    return this._cloudPrincipal
  },

  clearCloudIdentity() {
    this._cloudPrincipal = null
    this._cloudSession = null
  },

  _securityState() {
    let s = DB.get('securityState')
    if (!s || typeof s !== 'object') {
      s = { loginAttempts: {}, otpSend: {}, otpVerify: {} }
      DB.set('securityState', s)
    }
    if (!s.loginAttempts) s.loginAttempts = {}
    if (!s.otpSend) s.otpSend = {}
    if (!s.otpVerify) s.otpVerify = {}
    return s
  },

  _persistSecurity() {
    DB.flush?.()
  },

  _loginAttemptData(phone) {
    const s = this._securityState()
    phone = Utils.normalizePhone(phone)
    if (!s.loginAttempts[phone]) s.loginAttempts[phone] = { count: 0, lockedUntil: 0 }
    return s.loginAttempts[phone]
  },

  _getAttempts(phone) {
    return this._loginAttemptData(phone)
  },

  _recordFailedAttempt(phone) {
    const data = this._loginAttemptData(phone)
    data.count = (data.count || 0) + 1
    if (data.count >= this.LOCKOUT_THRESHOLD) {
      data.lockedUntil = Date.now() + this.LOCKOUT_DURATION_MS
      data.count = 0
    }
    this._persistSecurity()
  },

  _clearAttempts(phone) {
    phone = Utils.normalizePhone(phone)
    const s = this._securityState()
    delete s.loginAttempts[phone]
    this._persistSecurity()
  },

  _isLocked(phone) {
    const data = this._loginAttemptData(phone)
    if (data.lockedUntil && Date.now() < data.lockedUntil) {
      return Math.ceil((data.lockedUntil - Date.now()) / 60000)
    }
    return 0
  },

  isLocked(phone) {
    return this._isLocked(phone)
  },

  _otpSendData(key) {
    const s = this._securityState()
    if (!s.otpSend[key]) s.otpSend[key] = { sends: [], lastSend: 0 }
    const data = s.otpSend[key]
    const hourAgo = Date.now() - 60 * 60 * 1000
    data.sends = (data.sends || []).filter(t => t > hourAgo)
    return data
  },

  canSendOtp(key) {
    const data = this._otpSendData(key)
    const max = AppConfig.OTP_MAX_SENDS_PER_HOUR || 3
    if (data.sends.length >= max) {
      return { ok: false, error: 'تعداد درخواست بیش از حد. یک ساعت دیگر تلاش کنید.' }
    }
    const wait = (AppConfig.OTP_RESEND_COOLDOWN_MS || 60000) - (Date.now() - (data.lastSend || 0))
    if (data.lastSend && wait > 0) {
      return { ok: false, error: `${Utils.fmtNum(Math.ceil(wait / 1000))} ثانیه تا ارسال مجدد` }
    }
    return { ok: true }
  },

  recordOtpSend(key) {
    const data = this._otpSendData(key)
    data.sends.push(Date.now())
    data.lastSend = Date.now()
    this._persistSecurity()
  },

  recordOtpVerifyFail(key) {
    const s = this._securityState()
    if (!s.otpVerify[key]) s.otpVerify[key] = { count: 0, lockedUntil: 0 }
    const data = s.otpVerify[key]
    data.count = (data.count || 0) + 1
    const max = AppConfig.OTP_MAX_VERIFY_ATTEMPTS || 5
    if (data.count >= max) {
      data.lockedUntil = Date.now() + this.LOCKOUT_DURATION_MS
      data.count = 0
      this._persistSecurity()
      return Math.ceil(this.LOCKOUT_DURATION_MS / 60000)
    }
    this._persistSecurity()
    return 0
  },

  isOtpVerifyLocked(key) {
    const s = this._securityState()
    const data = s.otpVerify[key]
    if (!data?.lockedUntil || Date.now() >= data.lockedUntil) return 0
    return Math.ceil((data.lockedUntil - Date.now()) / 60000)
  },

  clearOtpVerify(key) {
    const s = this._securityState()
    delete s.otpVerify[key]
    this._persistSecurity()
  },

  async hashCredentials(password) {
    return Utils.hashPasswordSecure(password)
  },

  async grantOtpLoginProof(userId) {
    if (typeof SignedProof !== 'undefined' && SignedProof.issue) {
      await SignedProof.issue(this.OTP_PROOF_KEY, { userId }, 60000)
      return
    }
    try {
      sessionStorage.setItem(this.OTP_PROOF_KEY, JSON.stringify({
        userId,
        expires: Date.now() + 60000
      }))
    } catch { /* */ }
  },

  _regenerateCsrf() {
    return Array.from(crypto.getRandomValues(new Uint8Array(16)))
      .map(b => b.toString(16).padStart(2, '0')).join('')
  },

  _ensureCsrf() {
    const session = this.getSession()
    if (!session?.userId) return ''
    const user = this.getUser()
    if (!user) return ''

    if (!this._allowsLocalIdentity()) {
      if (session.csrf) return session.csrf
      const csrf = this._regenerateCsrf()
      this._cloudSession = Object.freeze({ ...session, csrf })
      return csrf
    }

    if (session.csrf) {
      try { sessionStorage.setItem(this.CSRF_KEY, session.csrf) } catch { /* */ }
      return session.csrf
    }

    const t = this._regenerateCsrf()
    try { sessionStorage.setItem(this.CSRF_KEY, t) } catch { /* */ }
    const next = { ...session, csrf: t }
    this._sessionSet(this.SESSION_KEY, next)
    this._scheduleSessionResign(next)
    return t
  },

  _scheduleSessionResign(session) {
    if (typeof SessionSign === 'undefined' || !SessionSign.sign) return
    SessionSign.sign(session).then(signed => {
      const cur = this.getSession()
      if (cur?.userId === session.userId && cur?.csrf === session.csrf) {
        this._sessionSet(this.SESSION_KEY, signed)
      }
    }).catch(() => {})
  },

  getCsrfToken() {
    return this._ensureCsrf()
  },

  validateCsrf(token) {
    if (!token) return false
    const session = this.getSession()
    const user = this.getUser()
    if (!session?.userId || !user || user.id !== session.userId) return false
    if (session.csrf === token) return true
    try {
      if (sessionStorage.getItem(this.CSRF_KEY) === token) {
        const next = { ...session, csrf: token }
        this._sessionSet(this.SESSION_KEY, next)
        this._scheduleSessionResign(next)
        return true
      }
    } catch { /* */ }
    return false
  },

  _sessionGet(key, fallback = null) {
    try {
      const raw = sessionStorage.getItem(key)
      if (raw != null) return JSON.parse(raw)
    } catch { /* */ }
    const legacy = Utils.storage.get(key, fallback)
    if (legacy !== fallback && key === this.SESSION_KEY) {
      try {
        sessionStorage.setItem(key, JSON.stringify(legacy))
        Utils.storage.remove(key)
      } catch { /* */ }
    }
    return legacy
  },

  _sessionSet(key, value) {
    try {
      sessionStorage.setItem(key, JSON.stringify(value))
    } catch (e) {
      console.warn('[Auth] sessionStorage unavailable — session not persisted', e)
    }
  },

  async _sessionSetSigned(key, session) {
    let payload = session
    if (typeof SessionSign !== 'undefined' && SessionSign.sign) {
      payload = await SessionSign.sign(session)
    }
    this._sessionSet(key, payload)
  },

  _sessionRemove(key) {
    try { sessionStorage.removeItem(key) } catch { /* */ }
    Utils.storage.remove(key)
  },

  async login(phone, password) {
    if (!this._allowsLocalIdentity()) {
      if (typeof Cloud === 'undefined' || !Cloud.isConfigured?.()) {
        return { ok: false, code: 'cloud_required', error: 'ورود سرور در این استقرار پیکربندی نشده است' }
      }
      const result = await Cloud.signIn({ phone, password })
      if (!result.ok || !result.identity) {
        this.clearCloudIdentity()
        return { ok: false, code: result.code || 'cloud_auth_failed', error: result.error || 'ورود ناموفق بود' }
      }
      return { ok: true, user: result.identity, mustChangePassword: false }
    }
    return SecureDB.runInternalAsync(async () => {
    phone = Utils.normalizePhone(phone)
    password = Utils.normalizePassword(password)

    const locked = this._isLocked(phone)
    if (locked) {
      return { ok: false, error: `ورود موقتاً قفل شده. ${locked} دقیقه دیگر تلاش کنید`, code: 'locked' }
    }

    let user = DB.find('users', u => Utils.normalizePhone(u.phone) === phone)
    if (!user) {
      return { ok: false, error: 'شماره موبایل در سیستم ثبت نشده است', code: 'not_found' }
    }
    if (user.status === 'pending') {
      return { ok: false, error: 'حساب شما هنوز تأیید نشده. منتظر مدیر باشید.', code: 'pending' }
    }
    if (user.status === 'inactive' || user.status === 'disabled') {
      return { ok: false, error: 'حساب غیرفعال است', code: 'inactive' }
    }

    let match = await Utils.verifyPassword(password, user.password, user.salt || '')
    if (match && !Utils.isPbkdf2Password(user.password)) {
      const creds = await this.hashCredentials(password)
      DB.update('users', user.id, { password: creds.password, salt: creds.salt })
      await DB.flush()
      user = DB.find('users', u => u.id === user.id) || user
    }

    if (!match) {
      this._recordFailedAttempt(phone)
      const isManager = (user.roles || []).some(r => {
        const n = typeof normalizeRole === 'function' ? normalizeRole(r) : r
        return n === 'studio_manager' || n === 'system_admin'
      })
      const hint = isManager
        ? ' اگر در آنبوردینگ اول رمز را عوض کرده‌اید، همان رمز جدید را وارد کنید.'
        : ''
      return { ok: false, error: `رمز عبور اشتباه است.${hint}`, code: 'wrong_password' }
    }

    this._clearAttempts(phone)
    if (user.isDefaultPassword) {
      DB.update('users', user.id, { mustChangePassword: true })
      await DB.flush()
      user = DB.find('users', u => u.id === user.id) || user
    }
    this._setForcePwFlag(user.mustChangePassword || user.isDefaultPassword)
    const csrf = this._regenerateCsrf()
    await this._sessionSetSigned(this.SESSION_KEY, {
      userId: user.id,
      loginAt: Date.now(),
      expiresAt: Date.now() + this.SESSION_TIMEOUT_MS,
      csrf
    })
    try { sessionStorage.setItem(this.CSRF_KEY, csrf) } catch { /* */ }
    DB.log('login', user.name)
    if (typeof AuthBridge !== 'undefined') {
      AuthBridge.afterLocalLogin(user, password).catch(() => {})
    }
    return { ok: true, user, mustChangePassword: !!user.mustChangePassword }
    })
  },

  /** ورود با OTP پیامکی — فقط پس از تأیید کد (grantOtpLoginProof) */
  async loginWithOtp(userId) {
    if (!this._allowsLocalIdentity()) {
      return { ok: false, code: 'cloud_otp_required', error: 'OTP محلی در محیط عملیاتی مجاز نیست' }
    }
    return SecureDB.runInternalAsync(async () => {
    let proofOk
    if (typeof SignedProof !== 'undefined' && SignedProof.verify) {
      proofOk = await SignedProof.verify(this.OTP_PROOF_KEY, { userId })
    } else {
      let proof = null
      try {
        const raw = sessionStorage.getItem(this.OTP_PROOF_KEY)
        proof = raw ? JSON.parse(raw) : null
      } catch { /* */ }
      proofOk = !!(proof && proof.userId === userId && Date.now() <= proof.expires)
    }
    if (!proofOk) {
      return { ok: false, error: 'ورود با OTP نیاز به تأیید پیامک دارد' }
    }
    if (typeof SignedProof !== 'undefined') SignedProof.clear(this.OTP_PROOF_KEY)
    else sessionStorage.removeItem(this.OTP_PROOF_KEY)

    const user = DB.find('users', u => u.id === userId)
    if (!user) return { ok: false, error: 'کاربر یافت نشد' }
    if (user.status === 'inactive' || user.status === 'disabled') {
      return { ok: false, error: 'حساب غیرفعال است' }
    }
    this._clearAttempts(Utils.normalizePhone(user.phone))
    const csrf = this._regenerateCsrf()
    await this._sessionSetSigned(this.SESSION_KEY, {
      userId: user.id,
      loginAt: Date.now(),
      expiresAt: Date.now() + this.SESSION_TIMEOUT_MS,
      otpAuth: true,
      csrf
    })
    try { sessionStorage.setItem(this.CSRF_KEY, csrf) } catch { /* */ }
    DB.log('login_otp', user.name)
    return { ok: true, user }
    })
  },

  logout() {
    this.clearCloudIdentity()
    if (!this._allowsLocalIdentity() && typeof Cloud !== 'undefined') {
      Promise.resolve(Cloud.signOut?.()).catch(() => {})
    }
    this._sessionRemove(this.SESSION_KEY)
    if (typeof SessionSign !== 'undefined') SessionSign.clearSecret?.()
    if (typeof SignedProof !== 'undefined') SignedProof.clearSecret?.()
    try {
      if (typeof SignedProof !== 'undefined') SignedProof.clear(this.OTP_PROOF_KEY)
      else sessionStorage.removeItem(this.OTP_PROOF_KEY)
      sessionStorage.removeItem(this.CSRF_KEY)
    } catch { /* */ }
    this._setForcePwFlag(false)
  },

  getSession() {
    if (!this._allowsLocalIdentity()) return this._cloudSession
    return this._sessionGet(this.SESSION_KEY, null)
  },

  getUser() {
    if (!this._allowsLocalIdentity()) return this._cloudPrincipal
    const session = this.getSession()
    if (!session?.userId) return null
    if (session.expiresAt && Date.now() > session.expiresAt) {
      this.logout()
      return null
    }
    if (session._sigInvalid) {
      this.logout()
      return null
    }
    // Production fail-closed: unsigned sessions are never trusted on the sync path
    if (typeof SessionSign !== 'undefined' && !session.sig) {
      const allowUnsigned = typeof AppConfig !== 'undefined'
        ? AppConfig.isLocalDev?.()
        : (typeof location !== 'undefined' && ['localhost', '127.0.0.1', '::1'].includes(location.hostname))
      if (!allowUnsigned) return null
    }
    return DB.find('users', u => u.id === session.userId) || null
  },

  async verifySessionSignature() {
    if (!this._allowsLocalIdentity()) {
      if (typeof Cloud === 'undefined' || !Cloud.restoreAuthoritativeIdentity) {
        this.clearCloudIdentity()
        return false
      }
      const restored = await Cloud.restoreAuthoritativeIdentity()
      if (!restored.ok) this.clearCloudIdentity()
      return !!restored.ok
    }
    const session = this.getSession()
    if (!session?.userId) return false
    if (typeof SessionSign === 'undefined') {
      this._ensureCsrf()
      return true
    }

    let working = { ...session }
    if (!working.csrf) {
      working.csrf = this._regenerateCsrf()
      try { sessionStorage.setItem(this.CSRF_KEY, working.csrf) } catch { /* */ }
    }

    if (!working.sig) {
      // Local/dev: upgrade legacy unsigned sessions once. Production: reject.
      const allowUpgrade = typeof AppConfig !== 'undefined'
        ? AppConfig.isLocalDev?.()
        : (typeof location !== 'undefined' && ['localhost', '127.0.0.1', '::1'].includes(location.hostname))
      if (allowUpgrade) {
        await this._sessionSetSigned(this.SESSION_KEY, working)
        return true
      }
      session._sigInvalid = true
      this.logout()
      return false
    }

    let ok = await SessionSign.verify(working)
    if (!ok && working.csrf) {
      const legacy = { ...working, csrf: '' }
      if (await SessionSign.verify(legacy)) {
        await this._sessionSetSigned(this.SESSION_KEY, working)
        ok = true
      }
    }

    if (!ok) {
      session._sigInvalid = true
      this.logout()
      return false
    }

    try { sessionStorage.setItem(this.CSRF_KEY, working.csrf) } catch { /* */ }
    if (session.csrf !== working.csrf || session.sig !== working.sig) {
      await this._sessionSetSigned(this.SESSION_KEY, working)
    }
    return true
  },

  currentUser() {
    return this.getUser()
  },

  isLoggedIn() {
    return !!this.getUser()
  },

  checkSessionExpiry() {
    const session = this.getSession()
    if (!session) return
    if (session.expiresAt && Date.now() > session.expiresAt) {
      this.logout()
      const path = location.pathname
      if (path.includes('admin') || path.includes('studio-m')) {
        window.location.href = '../index.html'
      } else if (path.includes('index')) {
        window.location.href = 'site.html'
      }
    }
  },

  isSystemAdmin() {
    if (typeof Access !== 'undefined') return Access.isSystemAdmin()
    const user = this.getUser()
    if (!user) return false
    return (user.roles || []).some(r => normalizeRole(r) === 'system_admin')
  },

  isStudioManager() {
    if (typeof Access !== 'undefined') return Access.isStudioManager()
    const user = this.getUser()
    if (!user) return false
    return (user.roles || []).some(r => normalizeRole(r) === 'studio_manager')
  },

  isAdmin() {
    return this.isSystemAdmin() || this.isStudioManager() || this._legacyManagerRole()
  },

  _legacyManagerRole() {
    const user = this.getUser()
    if (!user) return false
    return (user.roles || []).some(r =>
      String(r).includes('مدیر آتلیه') || String(r).includes('مدیر سیستم')
    )
  },

  isFullAdmin() {
    return this.isSystemAdmin()
  },

  _setForcePwFlag(enabled) {
    try {
      if (enabled) {
        localStorage.setItem('talar_force_pw_change', '1')
      } else {
        localStorage.removeItem('talar_force_pw_change')
      }
    } catch { /* */ }
  },

  canAccessAdmin() {
    if (typeof Access !== 'undefined') return Access.canAccessStudioM()
    if (this.isAdmin()) return true
    const user = this.getUser()
    if (!user) return false
    return (user.roles || []).some(r => normalizeRole(r) === 'office_secretary') ||
      this.userHasPermission('view_all') || this.userHasPermission('calendar')
  },

  getHomePage() {
    const user = this.getUser()
    if (!user) return 'login'
    if (typeof Access !== 'undefined') {
      const url = Access.getLandingUrl()
      if (url.includes('studio-m')) return 'studio-m'
      if (url.includes('view=portal')) return 'portal'
    }
    if (this.canAccessAdmin()) return 'studio-m'
    return 'portal'
  },

  getLandingUrl() {
    if (typeof Access !== 'undefined') return Access.getLandingUrl()
    return this.getHomePage() === 'studio-m' ? 'studio-m/' : 'index.html?view=portal'
  },

  userHasPermission(perm) {
    const user = this.getUser()
    if (!user) return false
    const roles = user.roles || []
    if (roles.some(r => String(r).includes('مدیر آتلیه') || String(r).includes('مدیر سیستم'))) return true
    return roles.some(r => {
      const roleId = typeof normalizeRole === 'function' ? normalizeRole(r) : r
      return typeof hasPermission === 'function' && hasPermission(roleId, perm)
    })
  },

  ownsPersonnelProject(projectId) {
    const user = this.getUser()
    if (!user) return false
    if (this.isAdmin()) return true
    const project = DB.find('persProjects', p => p.id === projectId)
    if (!project) return false
    const person = DB.findPersonnelByUserId(user.id) || DB.findPersonnelByPhone(user.phone)
    return person && project.personnelId === person.id
  },

  mustChangePassword() {
    const user = this.getUser()
    return !!(user && user.mustChangePassword)
  },

  validatePassword(password) {
    const raw = password ?? ''
    const pw = Utils.normalizePassword(raw)
    const min = AppConfig.MIN_PASSWORD_LENGTH
    if (!pw || pw.length < min) {
      return `رمز عبور حداقل ${min} کاراکتر باشد (فقط انگلیسی و اعداد)`
    }
    if (Utils.hasPersianLetters(raw)) {
      return 'از حروف فارسی در رمز استفاده نکنید — کیبورد را انگلیسی کنید'
    }
    if (typeof PasswordSecurity !== 'undefined') {
      const a = PasswordSecurity.analyze(raw)
      if (a.level === 'weak' && a.len >= min) {
        return 'رمز ضعیف است — حروف بزرگ/کوچک، عدد و علامت خاص اضافه کنید'
      }
    }
    return ''
  },

  async verifyCurrentPassword(password) {
    if (!this._allowsLocalIdentity()) {
      if (typeof Cloud === 'undefined' || !Cloud.verifyCurrentPassword) {
        return { ok: false, error: 'سرویس احراز هویت در دسترس نیست' }
      }
      return Cloud.verifyCurrentPassword(password)
    }
    const user = this.getUser()
    if (!user) return { ok: false, error: 'ابتدا وارد شوید' }
    const pw = Utils.normalizePassword(password)
    if (!pw) return { ok: false, error: 'رمز را وارد کنید' }
    const match = await Utils.verifyPassword(pw, user.password, user.salt || '')
    return match ? { ok: true } : { ok: false, error: 'رمز فعلی اشتباه است' }
  },

  async updatePassword(userId, currentPassword, newPassword) {
    if (!this._allowsLocalIdentity()) {
      const pwErr = this.validatePassword(newPassword)
      if (pwErr) return { ok: false, error: pwErr }
      if (typeof Cloud === 'undefined' || !Cloud.changePassword) {
        return { ok: false, error: 'سرویس احراز هویت در دسترس نیست' }
      }
      return Cloud.changePassword(currentPassword, newPassword)
    }
    const user = DB.find('users', u => u.id === userId)
    if (!user) return { ok: false, error: 'کاربر یافت نشد' }
    currentPassword = Utils.normalizePassword(currentPassword)
    newPassword = Utils.normalizePassword(newPassword)
    const pwErr = this.validatePassword(newPassword)
    if (pwErr) return { ok: false, error: pwErr }

    const match = await Utils.verifyPassword(currentPassword, user.password, user.salt || '')
    if (!match) return { ok: false, error: 'رمز فعلی اشتباه است' }

    const creds = await this.hashCredentials(newPassword)
    DB.update('users', userId, {
      password: creds.password,
      salt: creds.salt,
      mustChangePassword: false,
      isDefaultPassword: false,
      profileCompleted: true,
      passwordChangedAt: Utils.todayJalali()
    })
    await DB.flush()
    this._setForcePwFlag(false)
    const info = DB.get('studioInfo') || {}
    if (info.cloudUnifyPassword && typeof AuthBridge !== 'undefined') {
      AuthBridge.unifyPassword(newPassword).catch(() => {})
    }
    return { ok: true }
  },

  async resetManagerPassword(phone, newPassword, opts = {}) {
    if (!this._allowsLocalIdentity()) {
      return { ok: false, code: 'cloud_reset_required', error: 'بازیابی رمز فقط از مسیر Supabase Auth مجاز است' }
    }
    return SecureDB.runInternalAsync(async () => {
    if (!opts.otpVerified) {
      return { ok: false, error: 'بازیابی رمز فقط با کد تأیید پیامکی امکان‌پذیر است' }
    }
    phone = Utils.normalizePhone(phone)
    if (typeof SignedProof !== 'undefined' && SignedProof.verify) {
      const proofOk = await SignedProof.verify(this.PW_RESET_PROOF_KEY, { phone, purpose: 'pw_reset' })
      if (!proofOk) {
        return { ok: false, error: 'اعتبارسنجی بازیابی نامعتبر یا منقضی است — دوباره کد بگیرید' }
      }
    } else if (!(typeof AppConfig !== 'undefined' && AppConfig.isLocalDev?.())) {
      return { ok: false, error: 'ماژول اعتبارسنجی بازیابی در دسترس نیست' }
    }
    newPassword = Utils.normalizePassword(newPassword)
    const user = DB.find('users', u => Utils.normalizePhone(u.phone) === phone)
    if (!user) return { ok: false, error: 'کاربری با این شماره یافت نشد' }
    const isManager = (user.roles || []).some(r => {
      const n = typeof normalizeRole === 'function' ? normalizeRole(r) : r
      return n === 'studio_manager' || n === 'system_admin' ||
        String(r).includes('مدیر آتلیه') || String(r).includes('مدیر سیستم')
    })
    if (!isManager) return { ok: false, error: 'بازیابی فقط برای حساب مدیر استودیو است' }
    const pwErr = this.validatePassword(newPassword)
    if (pwErr) return { ok: false, error: pwErr }
    const creds = await this.hashCredentials(newPassword)
    DB.update('users', user.id, {
      password: creds.password,
      salt: creds.salt,
      mustChangePassword: false,
      profileCompleted: user.profileCompleted !== false,
      passwordChangedAt: Utils.todayJalali()
    })
    await DB.flush()
    this._clearAttempts(phone)
    if (typeof SignedProof !== 'undefined') SignedProof.clear?.(this.PW_RESET_PROOF_KEY)
    DB.log('password_reset', `بازیابی رمز مدیر: ${user.name}`)
    return { ok: true }
    })
  }
}

window.Auth = Auth

export default Auth
