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
  },

  findUserByEmail(email) {
    if (!email) return null
    const norm = String(email).trim().toLowerCase()
    const users = (typeof DB !== 'undefined' && DB.get ? DB.get('users') : []) || []
    return users.find(u => (u.email && String(u.email).trim().toLowerCase() === norm) || (u.username && String(u.username).trim().toLowerCase() === norm)) || null
  },

  _maskEmail(email) {
    const s = String(email || '').trim()
    const parts = s.split('@')
    if (parts.length !== 2) return s
    const name = parts[0]
    const domain = parts[1]
    const maskedName = name.length <= 2 ? name + '***' : name[0] + '***' + name[name.length - 1]
    return `${maskedName}@${domain}`
  },

  async sendOtpEmail(email) {
    const norm = String(email || '').trim().toLowerCase()
    if (!norm || !norm.includes('@') || !norm.includes('.')) {
      return { ok: false, error: 'آدرس ایمیل نامعتبر است' }
    }

    const user = this.findUserByEmail(norm)
    if (!user) {
      return { ok: false, error: 'کاربری با این نشانی ایمیل در سیستم یافت نشد' }
    }

    const code = this._generateOtp()
    const studio = (typeof DB !== 'undefined' && DB.get ? DB.get('studioInfo')?.name : null) || AppConfig.APP_NAME
    const subject = `کد بازیابی رمز عبور استودیو ${studio}`
    const html = `
      <div dir="rtl" style="font-family:Tahoma,sans-serif;padding:20px;color:#333;background:#f9f9f9;border-radius:10px">
        <h2 style="color:#d4af37;margin-top:0">بازیابی رمز عبور استودیو ${studio}</h2>
        <p>با سلام، کد یکبار مصرف (OTP) جهت تغییر و بازیابی رمز عبور شما:</p>
        <div style="font-size:28px;font-weight:bold;letter-spacing:6px;color:#0071E3;padding:12px;background:#fff;border:1px dashed #ccc;text-align:center;border-radius:8px;margin:16px 0">
          ${code}
        </div>
        <p style="font-size:12px;color:#666">این کد به مدت ۵ دقیقه معتبر است. اگر شما درخواستی ثبت نکرده‌اید، این پیام را نادیده بگیرید.</p>
      </div>`

    try {
      if (typeof fetch !== 'undefined') {
        await fetch('/api/auth/forgot-password/email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: norm, code, html, subject })
        }).catch(() => null)
      }
    } catch { /* continue */ }

    sessionStorage.setItem('talar_pw_reset_email_otp', JSON.stringify({
      email: norm,
      userId: user.id,
      code,
      expiresAt: Date.now() + AppConfig.OTP_TTL_MS,
      verifyAttempts: 0
    }))

    if (typeof DB !== 'undefined' && DB.log) {
      DB.log('password_reset_email_otp', `ارسال کد بازیابی رمز ایمیل به ${norm}`)
    }

    return { ok: true, maskedEmail: this._maskEmail(norm), demoCode: code }
  },

  async verifyAndResetEmail(email, otp, newPassword) {
    const norm = String(email || '').trim().toLowerCase()
    otp = Utils.faToEn(String(otp || '')).replace(/\D/g, '')

    let session = null
    try {
      const raw = sessionStorage.getItem('talar_pw_reset_email_otp')
      if (raw) session = JSON.parse(raw)
    } catch { /* ignore */ }

    if (!session || !session.expiresAt || Date.now() > session.expiresAt) {
      return { ok: false, error: 'کد منقضی شده است. لطفاً مجدداً کد دریافت نمایید.' }
    }
    if (session.email !== norm) {
      return { ok: false, error: 'نشانی ایمیل با درخواست کد مطابقت ندارد' }
    }

    session.verifyAttempts = (session.verifyAttempts || 0) + 1
    if (session.verifyAttempts > AppConfig.OTP_MAX_VERIFY_ATTEMPTS) {
      sessionStorage.removeItem('talar_pw_reset_email_otp')
      return { ok: false, error: 'تعداد تلاش‌های ناموفق بیش از حد مجاز است. کد جدید بگیرید.' }
    }
    sessionStorage.setItem('talar_pw_reset_email_otp', JSON.stringify(session))

    if (otp.length !== 6 || otp !== session.code) {
      const left = AppConfig.OTP_MAX_VERIFY_ATTEMPTS - session.verifyAttempts
      return { ok: false, error: `کد وارد شده صحیح نیست (${Utils.fmtNum(left)} تلاش باقی‌مانده)` }
    }

    sessionStorage.removeItem('talar_pw_reset_email_otp')

    const user = this.findUserByEmail(norm)
    if (!user) return { ok: false, error: 'کاربر یافت نشد' }

    if (typeof PasswordSecurity !== 'undefined' && PasswordSecurity.hashPassword) {
      const hash = await PasswordSecurity.hashPassword(newPassword)
      user.passwordHash = hash
      delete user.password
    } else {
      user.password = newPassword
    }
    user.updatedAt = new Date().toISOString()
    if (typeof DB !== 'undefined' && DB.update) {
      DB.update('users', user.id, user)
    }
    return { ok: true }
  }
}

window.PasswordReset = PasswordReset
