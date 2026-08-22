/* ══════════════════════════════════════════════
   دعوت به پرتال — ادمین / پرسنل (بدون ثبت‌نام)
   ══════════════════════════════════════════════ */

const PortalInvite = {
  ADMIN_ROLE_OPTIONS: [
    { value: 'office_secretary', label: 'منشی / هماهنگ‌کننده' },
    { value: 'coordinator', label: 'هماهنگ‌کننده مراسم' },
    { value: 'inspector', label: 'بازرس' }
  ],

  portalTypeForUser(user) {
    if (!user) return 'staff'
    if (typeof Access !== 'undefined' && Access.isManagement(user) &&
      !Access.isStudioManager(user) && !Access.isSystemAdmin(user)) return 'admin'
    return 'staff'
  },

  portalPath(user) {
    const type = user?.portalType || this.portalTypeForUser(user)
    if (type === 'admin') {
      const inStudio = /\/studio-m\/?(?:index\.html)?$/i.test(location.pathname) ||
        location.pathname.includes('/studio-m/')
      return inStudio ? './' : 'studio-m/'
    }
    const inStudio = location.pathname.includes('/studio-m/')
    return inStudio ? '../index.html?view=portal' : 'index.html?view=portal'
  },

  portalUrl(user) {
    const base = location.origin + location.pathname.replace(/[^/]+$/, '')
    return base + this.portalPath(user)
  },

  portalLabel(user) {
    return (user?.portalType || this.portalTypeForUser(user)) === 'admin' ? 'پنل ادمین' : 'پورتال پرسنل'
  },

  statusLabel(user) {
    if (!user) return '—'
    if (user.portalStatus === 'pending_verify') return 'منتظر کد SMS'
    if (user.status === 'inactive' || user.status === 'disabled') return 'غیرفعال'
    if (user.portalStatus === 'active' || user.status === 'active') return 'فعال'
    return user.status || '—'
  },

  async _hashOtpCode(code) {
    const salt = Array.from(crypto.getRandomValues(new Uint8Array(8)))
      .map(b => b.toString(16).padStart(2, '0')).join('')
    const hash = await Utils.legacyHashPassword(String(code).trim(), salt)
    return { codeHash: hash, codeSalt: salt }
  },

  async _verifyOtpCode(code, stored) {
    if (!stored) return false
    if (stored.code && !stored.codeHash) {
      return String(code).trim() === String(stored.code)
    }
    if (!stored.codeHash || !stored.codeSalt) return false
    const hash = await Utils.legacyHashPassword(String(code).trim(), stored.codeSalt)
    return hash === stored.codeHash
  },

  listPortalUsers() {
    return (DB.get('users') || []).filter(u => {
      if (Access.isSystemAdmin(u)) return false
      if (Access.isStudioManager(u)) return false
      return u.portalType === 'admin' || u.portalType === 'staff' ||
        Access.isManagement(u) || Access.isStaffOnly(u)
    })
  },

  async createPortalUser({ name, phone, password, portalType, roles, invitedBy }) {
    phone = Utils.normalizePhone(phone)
    if (!Utils.isValidPhone(phone)) return { ok: false, error: 'موبایل نامعتبر' }
    if (DB.find('users', u => Utils.normalizePhone(u.phone) === phone)) {
      return { ok: false, error: 'این موبایل قبلاً ثبت شده' }
    }

    // رمز داخلی تصادفی — کاربر با پیامک وارد می‌شود، نیازی به رمز از مدیر نیست
    const rawPw = password && String(password).trim()
      ? Utils.normalizePassword(password)
      : (typeof Utils.generateRandomPassword === 'function'
        ? Utils.generateRandomPassword(12)
        : `Tmp${Date.now()}!a`)
    const pwErr = Auth.validatePassword(rawPw)
    if (pwErr && password) return { ok: false, error: pwErr }

    const creds = await Auth.hashCredentials(rawPw)
    const normRoles = normalizeRoles(roles || (portalType === 'admin' ? ['office_secretary'] : ['other']))
    const user = await SecureDB.insert('users', {
      name: name.trim(),
      phone,
      password: creds.password,
      salt: creds.salt,
      roles: normRoles,
      status: 'active',
      portalType: portalType || 'staff',
      portalStatus: 'pending_verify',
      mustChangePassword: false,
      profileCompleted: true,
      invitedAt: Utils.todayJalali(),
      invitedBy: invitedBy || '',
      portalOtp: null
    })

    if (portalType === 'staff') {
      const existing = DB.findPersonnelByPhone(phone)
      if (!existing) {
        await SecureDB.insert('personnel', {
          name: user.name,
          phone,
          userId: user.id,
          roles: normRoles,
          status: 'active',
          salaryType: 'project',
          salary: 0,
          roleAmounts: {},
          jobs: 0
        })
      } else {
        await SecureDB.update('personnel', existing.id, { userId: user.id, name: user.name, roles: normRoles, status: 'active' })
      }
    }
    return { ok: true, user }
  },

  /** ساخت کاربر + یک کد ورود؛ مدیر همان لحظه کد را می‌بیند و به کاربر می‌دهد */
  async inviteWithCode({ name, phone, portalType, roles, invitedBy }) {
    const created = await this.createPortalUser({
      name, phone, portalType, roles, invitedBy
    })
    if (!created.ok) return created
    const inv = await this.sendInvite(created.user.id)
    if (!inv.ok) return { ...inv, user: created.user }
    return {
      ok: true,
      user: created.user,
      code: inv.code || inv.demoCode || '',
      demoCode: inv.demoCode || '',
      smsSent: !!inv.smsSent,
      url: inv.url
    }
  },

  async sendInvite(userId, _tempPassword) {
    const user = DB.find('users', u => u.id === userId)
    if (!user?.phone) return { ok: false, error: 'کاربر یافت نشد' }

    const code = Utils.generateOtp6()
    const studio = DB.get('studioInfo')?.name || AppConfig.DEFAULT_STUDIO_NAME
    const url = this.portalUrl(user)
    const label = this.portalLabel(user)
    const otpStored = await this._hashOtpCode(code)

    await SecureDB.update('users', userId, {
      portalStatus: 'pending_verify',
      portalOtp: {
        ...otpStored,
        /* plaintext code returned only in this response for manager toast — never persisted */
        sentAt: new Date().toISOString(),
        verified: false,
        phone: user.phone
      }
    })

    const smsText = `${studio}\nورود ${label}\nموبایل: ${user.phone}\nکد ورود: ${code}\n${url}`

    const smsConfigured = typeof SmsProvider !== 'undefined' && SmsProvider.isConfigured()
    let demoCode = ''
    let smsSent = false
    if (smsConfigured) {
      const res = await SmsProvider.sendStudio([user.phone], smsText)
      if (!res?.ok) {
        // SMS شکست — کد را به مدیر برمی‌گردانیم تا دستی بدهد
        demoCode = code
      } else {
        smsSent = true
      }
    } else {
      demoCode = code
    }

    if (typeof MessagingShared !== 'undefined') {
      MessagingShared.logOutbound({
        channel: 'sms', to: user.phone, message: smsText,
        status: smsSent ? 'sent' : 'queued',
        templateName: `دعوت ${label}`
      })
    }

    return { ok: true, code, demoCode, smsSent, url }
  },

  needsOtpVerification(user) {
    return !!(user && user.portalStatus === 'pending_verify' &&
      user.portalOtp && !user.portalOtp.verified)
  },

  async verifyOtp(phone, code) {
    phone = Utils.normalizePhone(phone)
    const user = DB.find('users', u => Utils.normalizePhone(u.phone) === phone)
    if (!user) return { ok: false, error: 'کاربر یافت نشد' }
    const ok = await this._verifyOtpCode(code, user.portalOtp)
    if (!ok) {
      return { ok: false, error: 'کد تأیید اشتباه است' }
    }
    await SecureDB.update('users', user.id, {
      portalStatus: 'active',
      portalOtp: { ...user.portalOtp, verified: true, verifiedAt: new Date().toISOString() }
    })
    return { ok: true, user: DB.find('users', u => u.id === user.id) }
  },

  showOtpOverlay(phone, onSuccess) {
    document.getElementById('portal-otp-overlay')?.remove()
    const overlay = document.createElement('div')
    overlay.id = 'portal-otp-overlay'
    overlay.className = 'admin-onboarding-overlay'
    overlay.innerHTML = `
      <div class="admin-onboarding-modal" role="dialog" style="max-width:420px">
        <h2>تأیید دسترسی پرتال</h2>
        <p class="admin-onboarding-lead">کد ۶ رقمی پیامک‌شده را وارد کنید تا ${this.portalLabel(Auth.getUser())} فعال شود.</p>
        <div class="form-group">
          <label class="form-label">کد تأیید</label>
          <input class="form-input ltr" id="portal-otp-code" maxlength="6" inputmode="numeric" dir="ltr" placeholder="۱۲۳۴۵۶"/>
        </div>
        <p class="admin-onboarding-error" id="portal-otp-error"></p>
        <button type="button" class="btn btn-primary" style="width:100%;padding:12px" id="portal-otp-btn">تأیید و ورود</button>
      </div>`
    document.body.appendChild(overlay)
    document.getElementById('portal-otp-btn')?.addEventListener('click', async () => {
      const c = document.getElementById('portal-otp-code')?.value?.trim()
      const res = await this.verifyOtp(phone, c)
      const err = document.getElementById('portal-otp-error')
      if (!res.ok) {
        if (err) { err.textContent = res.error; err.style.display = 'block' }
        return
      }
      overlay.remove()
      Utils.toast('دسترسی پرتال فعال شد', 'success')
      if (onSuccess) onSuccess(res.user)
    })
    document.getElementById('portal-otp-code')?.focus()
  },

  gateAfterLogin(user, continueFn) {
    if (!this.needsOtpVerification(user)) {
      continueFn(user)
      return
    }
    this.showOtpOverlay(user.phone, continueFn)
  }
}

window.PortalInvite = PortalInvite
