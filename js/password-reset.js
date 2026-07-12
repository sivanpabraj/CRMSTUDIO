/* ══════════════════════════════════════════════
   MAN — بازیابی رمز مدیر با OTP پیامکی
   ══════════════════════════════════════════════ */

const PasswordReset = {
  SESSION_KEY: 'talar_pw_reset_otp',
  RATE_PREFIX: 'talar_pw_reset_rate_',

  _isManagerUser(user) {
    if (!user) return false
    return (user.roles || []).some(r => {
      const n = typeof normalizeRole === 'function' ? normalizeRole(r) : r
      return n === 'studio_manager' || n === 'system_admin' ||
        String(r).includes('مدیر آتلیه') || String(r).includes('مدیر سیستم')
    })
  },

  findManagerByPhone(phone) {
    phone = Utils.normalizePhone(phone)
    return DB.get('users').find(u =>
      Utils.normalizePhone(u.phone) === phone && this._isManagerUser(u)
    ) || null
  },

  _getRate(phone) {
    const key = this.RATE_PREFIX + phone
    const raw = Utils.storage.get(key, { sends: [], lastSend: 0 })
    const hourAgo = Date.now() - 60 * 60 * 1000
    raw.sends = (raw.sends || []).filter(t => t > hourAgo)
    return raw
  },

  _recordSend(phone) {
    const key = this.RATE_PREFIX + phone
    const raw = this._getRate(phone)
    raw.sends.push(Date.now())
    raw.lastSend = Date.now()
    Utils.storage.set(key, raw)
  },

  _canSendOtp(phone) {
    const raw = this._getRate(phone)
    if (raw.sends.length >= AppConfig.OTP_MAX_SENDS_PER_HOUR) {
      return { ok: false, error: 'تعداد درخواست کد بیش از حد است. یک ساعت دیگر تلاش کنید.' }
    }
    const wait = AppConfig.OTP_RESEND_COOLDOWN_MS - (Date.now() - (raw.lastSend || 0))
    if (raw.lastSend && wait > 0) {
      const sec = Math.ceil(wait / 1000)
      return { ok: false, error: `${Utils.fmtNum(sec)} ثانیه تا ارسال مجدد کد` }
    }
    return { ok: true }
  },

  _generateOtp() {
    const n = crypto.getRandomValues(new Uint32Array(1))[0] % 1000000
    return String(n).padStart(6, '0')
  },

  _maskPhone(phone) {
    const p = Utils.normalizePhone(phone)
    if (p.length < 11) return p
    return `${p.slice(0, 4)}***${p.slice(-4)}`
  },

  getSession() {
    try {
      const raw = sessionStorage.getItem(this.SESSION_KEY)
      if (!raw) return null
      const s = JSON.parse(raw)
      if (!s?.expiresAt || Date.now() > s.expiresAt) {
        sessionStorage.removeItem(this.SESSION_KEY)
        return null
      }
      return s
    } catch {
      return null
    }
  },

  /** ارسال کد تأیید به موبایل مدیر ثبت‌شده در دیتابیس */
  async sendOtp(phone) {
    phone = Utils.normalizePhone(phone)
    if (!Utils.isValidPhone(phone)) {
      return { ok: false, error: 'شماره موبایل نامعتبر است' }
    }

    const user = this.findManagerByPhone(phone)
    if (!user) {
      return { ok: false, error: 'این شماره به‌عنوان مدیر استودیو در سیستم ثبت نشده است' }
    }
    if (user.status !== 'active') {
      return { ok: false, error: 'حساب مدیر غیرفعال است. با مدیر دیگر تماس بگیرید.' }
    }

    if (typeof SmsProvider === 'undefined' || !SmsProvider.isConfigured()) {
      return {
        ok: false,
        code: 'no_sms',
        error: 'پنل پیامک هنوز تنظیم نشده است. پس از ورود، از تنظیمات → پیامک، سرویس (کاوه‌نگار / فراز / sms.ir) را فعال کنید.'
      }
    }

    const rate = this._canSendOtp(phone)
    if (!rate.ok) return rate

    const code = this._generateOtp()
    const studio = DB.get('studioInfo')?.name || AppConfig.APP_NAME
    const text = `${studio}\nکد بازیابی رمز MAN: ${code}\nاعتبار ۵ دقیقه.\nاگر شما درخواست نداده‌اید این پیام را نادیده بگیرید.`

    const sms = await SmsProvider.sendStudio(phone, text)
    if (!sms.ok) {
      return { ok: false, error: sms.error || 'خطا در ارسال پیامک. تنظیمات API را بررسی کنید.' }
    }

    sessionStorage.setItem(this.SESSION_KEY, JSON.stringify({
      phone,
      userId: user.id,
      code,
      expiresAt: Date.now() + AppConfig.OTP_TTL_MS,
      verifyAttempts: 0
    }))
    this._recordSend(phone)
    DB.log('password_reset_otp', `ارسال کد بازیابی رمز به ${phone}`)

    if (typeof DemoSeed !== 'undefined' && DemoSeed.isDemoMode()) {
      console.info('[MAN Demo] کد بازیابی:', code)
    }

    return { ok: true, maskedPhone: this._maskPhone(phone), demoCode: DemoSeed?.isDemoMode?.() ? code : null }
  },

  /** تأیید کد پیامکی و تنظیم رمز جدید */
  async verifyAndReset(phone, otp, newPassword) {
    phone = Utils.normalizePhone(phone)
    otp = Utils.faToEn(String(otp || '')).replace(/\D/g, '')

    const session = this.getSession()
    if (!session) {
      return { ok: false, error: 'کد منقضی شده. دوباره «ارسال کد» بزنید.' }
    }
    if (session.phone !== phone) {
      return { ok: false, error: 'شماره موبایل با درخواست کد مطابقت ندارد' }
    }

    session.verifyAttempts = (session.verifyAttempts || 0) + 1
    if (session.verifyAttempts > AppConfig.OTP_MAX_VERIFY_ATTEMPTS) {
      sessionStorage.removeItem(this.SESSION_KEY)
      return { ok: false, error: 'تلاش‌های زیاد. دوباره کد جدید بگیرید.' }
    }
    sessionStorage.setItem(this.SESSION_KEY, JSON.stringify(session))

    if (otp.length !== 6 || otp !== session.code) {
      const left = AppConfig.OTP_MAX_VERIFY_ATTEMPTS - session.verifyAttempts
      return { ok: false, error: `کد تأیید اشتباه است (${Utils.fmtNum(left)} تلاش باقی‌مانده)` }
    }

    sessionStorage.removeItem(this.SESSION_KEY)
    return Auth.resetManagerPassword(phone, newPassword, { otpVerified: true })
  }
}

window.PasswordReset = PasswordReset
