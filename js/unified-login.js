/* ══════════════════════════════════════════════
   UnifiedLogin — ورود واحد با پیامک
   ══════════════════════════════════════════════ */

const UnifiedLogin = {
  OTP_KEY: 'talar_unified_otp',
  RATE_PREFIX: 'talar_unified_otp_rate_',
  OTP_TTL_MS: AppConfig.OTP_TTL_MS || 5 * 60 * 1000,

  _contractPhones(c) {
    return [c.groomPhone, c.bridePhone, c.phoneGroom, c.phoneBride, c.phone]
      .map(p => Utils.normalizePhone(p))
      .filter(Boolean)
  },

  findContractsByPhone(phone) {
    phone = Utils.normalizePhone(phone)
    return (DB.get('contracts') || []).filter(c => {
      if (c.status === 'cancelled') return false
      return this._contractPhones(c).includes(phone)
    })
  },

  pickContract(list) {
    if (!list?.length) return null
    const sorted = list.slice().sort((a, b) => {
      const da = a.eventDate || a.date || ''
      const db = b.eventDate || b.date || ''
      const daysA = Utils.daysUntil(da)
      const daysB = Utils.daysUntil(db)
      if (daysA !== null && daysB !== null) {
        if (daysA >= 0 && daysB >= 0) return daysA - daysB
        if (daysA >= 0) return -1
        if (daysB >= 0) return 1
      }
      return db.localeCompare(da)
    })
    return sorted[0]
  },

  resolvePhone(phone) {
    phone = Utils.normalizePhone(phone)
    const user = DB.find('users', u => Utils.normalizePhone(u.phone) === phone)
    if (user && user.status !== 'inactive' && user.status !== 'disabled' && user.status !== 'pending') {
      if (typeof Access !== 'undefined') {
        if (Access.isStudioManager(user) || Access.isSystemAdmin(user)) {
          return { kind: 'manager', user, label: 'مدیر استودیو' }
        }
        if (Access.isManagement(user)) {
          return { kind: 'admin', user, label: typeof PortalInvite !== 'undefined' ? PortalInvite.portalLabel(user) : 'ادمین' }
        }
        return { kind: 'staff', user, label: 'پرسنل' }
      }
      return { kind: 'staff', user, label: 'کاربر' }
    }

    const contracts = this.findContractsByPhone(phone)
    if (contracts.length) {
      const contract = this.pickContract(contracts)
      return {
        kind: 'customer',
        contracts,
        contract,
        label: contract?.couple || 'مشتری'
      }
    }

    return { kind: 'guest', phone, label: 'مشتری جدید' }
  },

  landingUrl(resolved) {
    if (!resolved) return 'index.html'
    if (resolved.kind === 'manager') return 'studio-m/'
    if (resolved.kind === 'admin') return 'studio-m/'
    if (resolved.kind === 'staff') return 'index.html?view=portal'
    if (resolved.kind === 'customer') return 'customer.html'
    return 'index.html'
  },

  _getRate(phone) {
    if (typeof Auth !== 'undefined') return Auth._otpSendData(phone)
    const key = this.RATE_PREFIX + phone
    const raw = Utils.storage.get(key, { sends: [], lastSend: 0 })
    const hourAgo = Date.now() - 60 * 60 * 1000
    raw.sends = (raw.sends || []).filter(t => t > hourAgo)
    return raw
  },

  _recordSend(phone) {
    if (typeof Auth !== 'undefined') {
      Auth.recordOtpSend(phone)
      return
    }
    const key = this.RATE_PREFIX + phone
    const raw = this._getRate(phone)
    raw.sends.push(Date.now())
    raw.lastSend = Date.now()
    Utils.storage.set(key, raw)
  },

  _canSend(phone) {
    if (typeof Auth !== 'undefined') return Auth.canSendOtp(phone)
    const raw = this._getRate(phone)
    const max = AppConfig.OTP_MAX_SENDS_PER_HOUR || 3
    if (raw.sends.length >= max) {
      return { ok: false, error: 'تعداد درخواست بیش از حد. یک ساعت دیگر تلاش کنید.' }
    }
    const wait = (AppConfig.OTP_RESEND_COOLDOWN_MS || 60000) - (Date.now() - (raw.lastSend || 0))
    if (raw.lastSend && wait > 0) {
      return { ok: false, error: `${Utils.fmtNum(Math.ceil(wait / 1000))} ثانیه تا ارسال مجدد` }
    }
    return { ok: true }
  },

  _generateOtp() {
    const n = crypto.getRandomValues(new Uint32Array(1))[0] % 1000000
    return String(n).padStart(6, '0')
  },

  getPending() {
    try {
      const raw = sessionStorage.getItem(this.OTP_KEY)
      if (!raw) return null
      const data = JSON.parse(raw)
      if (!data?.expires || Date.now() > data.expires) {
        sessionStorage.removeItem(this.OTP_KEY)
        return null
      }
      return data
    } catch {
      return null
    }
  },

  _setPending(data) {
    sessionStorage.setItem(this.OTP_KEY, JSON.stringify(data))
  },

  clearPending() {
    sessionStorage.removeItem(this.OTP_KEY)
  },

  async sendOtp(phone) {
    phone = Utils.normalizePhone(phone)
    if (!Utils.isValidPhone(phone)) return { ok: false, error: 'شماره موبایل نامعتبر است' }

    const locked = typeof Auth !== 'undefined'
      ? Auth.isLocked(phone)
      : (CustomerSession?.isLocked?.(phone) || 0)
    if (locked) return { ok: false, error: `ورود موقتاً قفل شده. ${locked} دقیقه دیگر تلاش کنید.` }

    const rate = this._canSend(phone)
    if (!rate.ok) return rate

    const resolved = this.resolvePhone(phone)

    // پرسنل/ادمین دعوت‌شده: همان کد دعوت مدیر را دوباره بفرست / نشان بده (کد دوم نساز)
    if (resolved.user && typeof PortalInvite !== 'undefined' &&
        PortalInvite.needsOtpVerification(resolved.user)) {
      const inv = await PortalInvite.sendInvite(resolved.user.id)
      if (!inv.ok) return inv
      this._setPending({
        phone,
        code: inv.code,
        kind: resolved.kind,
        label: resolved.label,
        userId: resolved.user.id,
        inviteLogin: true,
        contractIds: [],
        expires: Date.now() + this.OTP_TTL_MS
      })
      this._recordSend(phone)
      return {
        ok: true,
        demoCode: inv.smsSent ? '' : (inv.code || inv.demoCode || ''),
        resolved,
        inviteLogin: true
      }
    }

    const code = this._generateOtp()
    const studio = DB.get('studioInfo')?.name || AppConfig.DEFAULT_STUDIO_NAME
    const text = `${studio}\nکد ورود: ${code}\nاعتبار: ۵ دقیقه`

    this._setPending({
      phone,
      code,
      kind: resolved.kind,
      label: resolved.label,
      userId: resolved.user?.id || null,
      contractIds: (resolved.contracts || []).map(c => c.id),
      expires: Date.now() + this.OTP_TTL_MS
    })
    this._recordSend(phone)

    let demoCode = ''
    if (typeof SmsProvider !== 'undefined' && SmsProvider.isConfigured()) {
      const res = await SmsProvider.sendStudio(phone, text)
      if (!res?.ok) {
        this.clearPending()
        return { ok: false, error: res?.error || 'خطا در ارسال پیامک' }
      }
    } else if (Utils.isDemoOtpMode?.()) {
      demoCode = code
    } else {
      this.clearPending()
      return { ok: false, error: 'سرویس پیامک تنظیم نشده. با مدیر تماس بگیرید.' }
    }

    if (typeof MessagingShared !== 'undefined') {
      MessagingShared.logOutbound({
        channel: 'sms', to: phone, message: text,
        status: 'sent', templateName: 'ورود یکپارچه'
      })
    }

    return { ok: true, demoCode, resolved }
  },

  async verifyOtp(phone, inputCode) {
    phone = Utils.normalizePhone(phone)
    const pending = this.getPending()
    if (!pending || pending.phone !== phone) {
      return { ok: false, error: 'ابتدا کد ورود را درخواست کنید.' }
    }
    if (Date.now() > pending.expires) {
      this.clearPending()
      return { ok: false, error: 'کد منقضی شده — دوباره درخواست دهید.' }
    }

    const code = Utils.faToEn(String(inputCode || '')).replace(/\D/g, '')
    const verifyKey = `unified:${phone}`
    const otpLocked = typeof Auth !== 'undefined' ? Auth.isOtpVerifyLocked(verifyKey) : 0
    if (otpLocked) {
      return { ok: false, error: `تعداد تلاش بیش از حد. ${otpLocked} دقیقه دیگر تلاش کنید.` }
    }
    if (code !== pending.code) {
      if (typeof Auth !== 'undefined') {
        const mins = Auth.recordOtpVerifyFail(verifyKey)
        if (mins) return { ok: false, error: `تعداد تلاش بیش از حد. ${mins} دقیقه دیگر تلاش کنید.` }
        Auth._recordFailedAttempt(phone)
      } else {
        CustomerSession?.recordFailedAttempt?.(phone)
      }
      return { ok: false, error: 'کد وارد‌شده نادرست است.' }
    }

    if (typeof Auth !== 'undefined') {
      Auth.clearOtpVerify(verifyKey)
      Auth._clearAttempts(phone)
    } else {
      CustomerSession?.clearAttempts?.(phone)
    }
    const resolved = this.resolvePhone(phone)

    // ورود پرسنل دو مدرک مستقل می‌خواهد: کد ورود یکپارچه و کد دعوت پرتال.
    // تأیید کد عمومی نباید حساب دعوت‌شده را خودکار فعال کند.
    if (resolved.user && typeof PortalInvite !== 'undefined' &&
        PortalInvite.needsOtpVerification(resolved.user)) {
      pending.portalVerify = true
      pending.userId = resolved.user.id
      pending.kind = resolved.kind
      pending.label = resolved.label
      this._setPending(pending)
      return { ok: true, next: 'portal_verify', resolved, pending }
    }

    if (resolved.kind === 'guest') {
      pending.verified = true
      this._setPending(pending)
      return { ok: true, next: 'consultation', resolved, pending }
    }

    const finish = await this._completeLogin(resolved, phone, pending)
    if (!finish.ok) return finish
    if (finish.next === 'portal_verify') return finish

    this.clearPending()
    return { ok: true, next: 'redirect', url: finish.url, resolved, user: finish.user }
  },

  async _completeLogin(resolved, phone, pending) {
    if (resolved.kind === 'customer') {
      const ids = pending?.contractIds || (resolved.contracts || []).map(c => c.id)
      const contracts = ids.map(id => DB.find('contracts', c => c.id === id)).filter(Boolean)
      const contract = this.pickContract(contracts.length ? contracts : resolved.contracts || [])
      if (!contract) return { ok: false, error: 'قرارداد یافت نشد.' }
      const session = CustomerSession.create(contract, phone)
      await CustomerSession.save(session)
      await DB.flush?.()
      return { ok: true, url: 'customer.html' }
    }

    const user = resolved.user || DB.find('users', u => u.id === resolved.user?.id)
    if (!user) return { ok: false, error: 'کاربر یافت نشد.' }

    return this.finishStaffLogin(resolved, user)
  },

  async finishStaffLogin(resolved, user) {
    if (!user?.id) return { ok: false, error: 'کاربر یافت نشد.' }

    await Auth.grantOtpLoginProof(user.id)
    const loginResult = await Auth.loginWithOtp(user.id)
    if (!loginResult.ok) return loginResult

    await DB.flush?.()
    return { ok: true, url: this.landingUrl(resolved), user }
  },

  async verifyPortalInviteCode(phone, inviteCode) {
    phone = Utils.normalizePhone(phone)
    const pending = this.getPending()
    if (!pending?.portalVerify || pending.phone !== phone) {
      return { ok: false, error: 'ابتدا کد ورود پیامکی را تأیید کنید.' }
    }
    if (Date.now() > pending.expires) {
      this.clearPending()
      return { ok: false, error: 'نشست منقضی شده — دوباره کد ورود درخواست کنید.' }
    }

    if (typeof PortalInvite === 'undefined') {
      return { ok: false, error: 'سیستم دعوت پرتال در دسترس نیست.' }
    }

    const portalResult = await PortalInvite.verifyOtp(phone, inviteCode)
    if (!portalResult.ok) return portalResult

    const user = portalResult.user || DB.find('users', u => u.id === pending.userId)
    if (!user) return { ok: false, error: 'کاربر یافت نشد.' }

    const resolved = this.resolvePhone(phone)
    const finish = await this.finishStaffLogin(resolved, user)
    if (!finish.ok) return finish

    this.clearPending()
    return { ok: true, next: 'redirect', url: finish.url, resolved, user }
  },

  async loginWithPassword(phone, password) {
    phone = Utils.normalizePhone(phone)
    password = Utils.normalizePassword(password)
    if (!Utils.isValidPhone(phone)) return { ok: false, error: 'شماره موبایل نامعتبر است' }
    if (!password) return { ok: false, error: 'رمز عبور را وارد کنید' }

    const result = await Auth.login(phone, password)
    if (!result.ok) return result

    const resolved = this.resolvePhone(phone)
    if (resolved.kind === 'guest') {
      Auth.logout()
      return { ok: false, error: 'این شماره در سیستم ثبت نشده. از ورود با پیامک استفاده کنید.' }
    }

    return { ok: true, user: result.user, url: this.landingUrl(resolved), resolved }
  },

  async saveConsultation({ phone, name, date, time, notes }) {
    phone = Utils.normalizePhone(phone)
    name = (name || '').trim()
    date = (date || '').trim()
    time = (time || '').trim()
    notes = (notes || '').trim()

    if (!name) return { ok: false, error: 'نام الزامی است' }
    if (!date) return { ok: false, error: 'روز مشاوره را انتخاب کنید' }
    if (!time) return { ok: false, error: 'ساعت مشاوره را انتخاب کنید' }

    const lead = await SecureDB.insert('leads', {
      name,
      phone,
      stage: 'new',
      source: 'ورود وب',
      type: 'consultation',
      notes: [notes, date && time ? `زمان پیشنهادی: ${date} ${time}` : date ? `تاریخ: ${date}` : ''].filter(Boolean).join(' — '),
      createdAt: Utils.todayJalali()
    })

    const booking = await SecureDB.insert('bookings', {
      title: `مشاوره — ${name}`,
      date,
      time: time || '',
      client: name,
      phone,
      status: 'scheduled',
      type: 'consultation',
      leadId: lead.id,
      source: 'web_login',
      createdAt: Utils.todayJalali()
    })

    DB.log('consultation_request', `${name} — ${phone} — ${date} ${time}`)

    if (typeof NotifyHub !== 'undefined' && NotifyHub.consultationRequested) {
      NotifyHub.consultationRequested({ name, phone, date, time, notes })
    }

    this.clearPending()
    return { ok: true, lead, booking }
  }
}

window.UnifiedLogin = UnifiedLogin
