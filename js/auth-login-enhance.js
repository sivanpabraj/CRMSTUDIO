/**
 * Auth Login Enhance — فراموشی رمز (همه نقش‌ها)، ورود با کد دعوت، اجبار تعویض رمز، مسیر نقش
 * بدون بازنویسی کامل app.js — بعد از لود Portal/Auth پچ می‌شود
 */
(function () {
  'use strict'

  /* ─── Auth: تغییر/بازیابی رمز ─── */
  function patchAuth() {
    if (typeof Auth === 'undefined' || Auth.__loginEnhance) return
    Auth.__loginEnhance = true

    Auth.validatePassword = Auth.validatePassword || function (pw) {
      pw = String(pw || '')
      if (pw.length < (AppConfig.MIN_PASSWORD_LENGTH || 6)) {
        return `رمز حداقل ${AppConfig.MIN_PASSWORD_LENGTH || 6} کاراکتر باشد`
      }
      return null
    }

    Auth.resetUserPassword = async function (phone, newPassword, opts = {}) {
      return SecureDB.runInternalAsync(async () => {
        phone = Utils.normalizePhone(phone)
        const pwErr = this.validatePassword(newPassword)
        if (pwErr) return { ok: false, error: pwErr }
        if (!opts.otpVerified) return { ok: false, error: 'تأیید OTP لازم است' }
        const user = DB.find('users', (u) => Utils.normalizePhone(u.phone) === phone)
        if (!user) return { ok: false, error: 'کاربر یافت نشد' }
        if (user.status === 'inactive' || user.status === 'disabled') {
          return { ok: false, error: 'حساب غیرفعال است' }
        }
        const creds = await this.hashCredentials(Utils.normalizePassword(newPassword))
        DB.update('users', user.id, {
          password: creds.password,
          salt: creds.salt,
          mustChangePassword: false,
          isDefaultPassword: false,
          portalStatus: user.portalStatus === 'pending_verify' ? 'active' : user.portalStatus
        })
        await DB.flush()
        DB.log('password_reset', user.name || phone)
        return { ok: true, user: DB.find('users', (u) => u.id === user.id) }
      })
    }

    // سازگاری با PasswordReset قدیمی
    Auth.resetManagerPassword = async function (phone, newPassword, opts) {
      return this.resetUserPassword(phone, newPassword, opts)
    }

    Auth.changeOwnPassword = async function (currentPassword, newPassword) {
      return SecureDB.runInternalAsync(async () => {
        const user = this.getUser()
        if (!user) return { ok: false, error: 'وارد نشده‌اید' }
        const pwErr = this.validatePassword(newPassword)
        if (pwErr) return { ok: false, error: pwErr }
        if (currentPassword) {
          const match = await Utils.verifyPassword(
            Utils.normalizePassword(currentPassword),
            user.password,
            user.salt || ''
          )
          if (!match) return { ok: false, error: 'رمز فعلی اشتباه است' }
        }
        const creds = await this.hashCredentials(Utils.normalizePassword(newPassword))
        DB.update('users', user.id, {
          password: creds.password,
          salt: creds.salt,
          mustChangePassword: false,
          isDefaultPassword: false
        })
        await DB.flush()
        this._setForcePwFlag(false)
        return { ok: true }
      })
    }

    /** ورود مستقیم با موبایل + کد دعوت پرسنل (بدون نام استودیو) */
    Auth.loginWithInviteCode = async function (phone, code) {
      const exec = (typeof SecureDB !== 'undefined' && SecureDB.runInternalAsync)
        ? (fn) => SecureDB.runInternalAsync(fn)
        : (fn) => fn()
      return exec(async () => {
        phone = Utils.normalizePhone(phone)
        code = String(code || '')
          .trim()
          .replace(/[۰-۹]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d))
        if (!Utils.isValidPhone(phone)) return { ok: false, error: 'موبایل نامعتبر' }
        if (!code) return { ok: false, error: 'کد ورود را وارد کنید' }

        const locked = typeof this._isLocked === 'function' ? this._isLocked(phone) : 0
        if (locked) return { ok: false, error: `قفل موقت — ${locked} دقیقه دیگر` }

        // گام ۱: بررسی مستقیم در سرور (قابلیت ورود پرسنل از هر دستگاه/موبایل جدید)
        try {
          const srvRes = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ identifier: phone, password: code, code })
          })
          const srvJson = await srvRes.json().catch(() => ({}))
          if (srvRes.ok && srvJson.ok && srvJson.user) {
            if (srvJson.fullData && typeof DB !== 'undefined' && DB.importJSON) {
              try { await DB.importJSON(JSON.stringify(srvJson.fullData)) } catch (e) { console.warn('DB import:', e) }
            } else if (typeof DB !== 'undefined') {
              const curUsers = DB.get('users') || []
              if (!curUsers.some(u => Utils.normalizePhone(u.phone) === phone)) {
                DB.set('users', [...curUsers, srvJson.user])
              }
            }

            if (srvJson.tenantKey || srvJson.studioInfo?.id) {
              const sid = srvJson.tenantKey || srvJson.studioInfo?.id
              try {
                localStorage.setItem('crm_studio_id', sid)
                Utils?.storage?.set?.('talar_studio_id', sid)
                if (typeof window !== 'undefined' && window.ServerSync?.setStudioId) {
                  window.ServerSync.setStudioId(sid)
                }
              } catch (e) { console.warn('Sync studio id:', e) }
            }

            const csrf = this._regenerateCsrf()
            await this._sessionSetSigned(this.SESSION_KEY, {
              userId: srvJson.user.id,
              loginAt: Date.now(),
              expiresAt: Date.now() + this.SESSION_TIMEOUT_MS,
              csrf,
              inviteLogin: true
            })
            try { sessionStorage.setItem(this.CSRF_KEY, csrf) } catch (e) { console.warn('CSRF save:', e) }
            this._clearAttempts(phone)
            this._setForcePwFlag(Boolean(srvJson.mustChangePassword))

            DB.log?.('login_invite_code_server', srvJson.user.name || phone)
            return {
              ok: true,
              user: srvJson.user,
              mustChangePassword: Boolean(srvJson.mustChangePassword)
            }
          } else if (srvJson && srvJson.error && !srvJson.error.includes('پایگاه داده یافت نشد')) {
            // سرور صراحتاً ارور داده است (مثلاً کد اشتباه است)
            this._recordFailedAttempt(phone)
            return { ok: false, error: srvJson.error }
          }
        } catch (srvErr) {
          console.warn('Server auth notice, checking local database:', srvErr)
        }

        // گام ۲: فال‌بک دیتابیس محلی (در صورت قطعی شبکه یا حالت آفلاین)
        const user = DB.find('users', (u) => Utils.normalizePhone(u.phone) === phone)
        const personnel = DB.find('personnel', (p) => p.phone && Utils.normalizePhone(p.phone) === phone)
        if (!user && !personnel) return { ok: false, error: 'این شماره در سیستم ثبت نشده است. از مدیر استودیو کد ورود بگیرید.' }
        if (user && (user.status === 'pending' || user.status === 'pending_approval')) {
          return { ok: false, error: 'حساب هنوز تأیید نشده — منتظر مدیر باشید.' }
        }
        if (user && (user.status === 'inactive' || user.status === 'disabled')) {
          return { ok: false, error: 'حساب غیرفعال است' }
        }

        let otpOk = false
        if (user?.portalOtp) {
          if (user.portalOtp.code && String(user.portalOtp.code).trim() === code) otpOk = true
          else if (user.portalOtp.codeHash && user.portalOtp.codeSalt && Utils.legacyHashPassword) {
            const hash = await Utils.legacyHashPassword(code, user.portalOtp.codeSalt)
            if (hash === user.portalOtp.codeHash) otpOk = true
          }
        }
        if (!otpOk && (user?.inviteCode || user?.code)) {
          const uCode = String(user.inviteCode || user.code).trim()
          if (uCode === code || uCode.toUpperCase() === code.toUpperCase()) otpOk = true
        }
        if (!otpOk && personnel && (personnel.inviteCode || personnel.code)) {
          const pCode = String(personnel.inviteCode || personnel.code).trim()
          if (pCode === code || pCode.toUpperCase() === code.toUpperCase()) otpOk = true
        }
        // کد موقت unified
        if (!otpOk && typeof UnifiedLogin !== 'undefined') {
          const pending = UnifiedLogin.getPending?.()
          if (pending && pending.phone === phone && pending.code === code) otpOk = true
        }

        if (!otpOk) {
          this._recordFailedAttempt(phone)
          return { ok: false, error: 'کد ورود اشتباه است' }
        }

        const effectiveUser = user || {
          id: personnel?.id || ('emp_' + Date.now()),
          name: personnel?.name || 'همکار',
          phone,
          roles: personnel?.roles || ['photographer'],
          portalType: 'staff',
          status: 'active'
        }

        // تبدیل کد به رمز موقت هش‌شده + اجبار تعویض
        const creds = await this.hashCredentials(code)
        DB.update('users', effectiveUser.id, {
          password: creds.password,
          salt: creds.salt,
          portalStatus: 'active',
          mustChangePassword: true,
          portalOtp: {
            ...(effectiveUser.portalOtp || {}),
            verified: true,
            verifiedAt: new Date().toISOString(),
            via: 'invite_code_login'
          }
        })
        await DB.flush()
        this._clearAttempts(phone)
        this._setForcePwFlag(true)

        const csrf = this._regenerateCsrf()
        await this._sessionSetSigned(this.SESSION_KEY, {
          userId: effectiveUser.id,
          loginAt: Date.now(),
          expiresAt: Date.now() + this.SESSION_TIMEOUT_MS,
          csrf,
          inviteLogin: true
        })
        try {
          sessionStorage.setItem(this.CSRF_KEY, csrf)
        } catch { /* */ }
        DB.log('login_invite_code', effectiveUser.name)
        return {
          ok: true,
          user: DB.find('users', (u) => u.id === effectiveUser.id) || effectiveUser,
          mustChangePassword: true
        }
      })
    }
  }

  /* ─── PasswordReset: همه کاربران فعال ─── */
  function patchPasswordReset() {
    if (typeof PasswordReset === 'undefined' || PasswordReset.__allRoles) return
    PasswordReset.__allRoles = true

    PasswordReset.findUserByPhone = function (phone) {
      phone = Utils.normalizePhone(phone)
      return (
        DB.get('users').find(
          (u) =>
            Utils.normalizePhone(u.phone) === phone &&
            u.status !== 'inactive' &&
            u.status !== 'disabled'
        ) || null
      )
    }

    const _origSend = PasswordReset.sendOtp.bind(PasswordReset)
    PasswordReset.sendOtp = async function (phone) {
      phone = Utils.normalizePhone(phone)
      if (!Utils.isValidPhone(phone)) return { ok: false, error: 'شماره موبایل نامعتبر است' }

      const user = this.findUserByPhone(phone)
      if (!user) {
        return { ok: false, error: 'این شماره در سیستم ثبت نشده است' }
      }
      if (user.status === 'pending') {
        return { ok: false, error: 'حساب هنوز تأیید نشده' }
      }

      const rate = this._canSendOtp(phone)
      if (!rate.ok) return rate

      const code = this._generateOtp()
      const studio = DB.get('studioInfo')?.name || AppConfig.APP_NAME
      const text = `${studio}\nکد بازیابی رمز: ${code}\nاعتبار ۵ دقیقه.`

      let demoCode = ''
      let smsOk = false
      if (typeof SmsProvider !== 'undefined' && SmsProvider.isConfigured()) {
        const sms = await SmsProvider.sendStudio(phone, text)
        smsOk = !!sms?.ok
        if (!smsOk) demoCode = code
      } else {
        demoCode = code
      }

      sessionStorage.setItem(
        this.SESSION_KEY,
        JSON.stringify({
          phone,
          userId: user.id,
          code,
          expiresAt: Date.now() + (AppConfig.OTP_TTL_MS || 300000),
          verifyAttempts: 0
        })
      )
      this._recordSend(phone)
      DB.log('password_reset_otp', phone)

      if (demoCode && typeof Utils !== 'undefined' && Utils.toast) {
        Utils.toast('کد بازیابی (موقت): ' + demoCode, 'info', 20000)
      }

      return {
        ok: true,
        maskedPhone: this._maskPhone(phone),
        demoCode: demoCode || null,
        smsSent: smsOk
      }
    }

    PasswordReset.verifyAndReset = async function (phone, otp, newPassword) {
      phone = Utils.normalizePhone(phone)
      otp = Utils.faToEn(String(otp || '')).replace(/\D/g, '')
      const session = this.getSession()
      if (!session) return { ok: false, error: 'کد منقضی شده. دوباره ارسال کنید.' }
      if (session.phone !== phone) return { ok: false, error: 'شماره با درخواست کد یکی نیست' }

      session.verifyAttempts = (session.verifyAttempts || 0) + 1
      if (session.verifyAttempts > (AppConfig.OTP_MAX_VERIFY_ATTEMPTS || 5)) {
        sessionStorage.removeItem(this.SESSION_KEY)
        return { ok: false, error: 'تلاش زیاد — کد جدید بگیرید' }
      }
      sessionStorage.setItem(this.SESSION_KEY, JSON.stringify(session))

      if (otp.length !== 6 || otp !== session.code) {
        return { ok: false, error: 'کد تأیید اشتباه است' }
      }
      sessionStorage.removeItem(this.SESSION_KEY)
      return Auth.resetUserPassword(phone, newPassword, { otpVerified: true })
    }
  }

  /* ─── UI: فراموشی رمز + کد دعوت + اجبار تعویض ─── */
  function patchPortal() {
    if (typeof Portal === 'undefined' || Portal.__loginEnhance) return
    Portal.__loginEnhance = true

    if (!Portal.sendForgotPasswordEmail) {
      Portal.showForgotPassword = function () {
        document.getElementById('auth-forgot-overlay')?.remove()
        const el = document.createElement('div')
        el.id = 'auth-forgot-overlay'
      el.className = 'admin-onboarding-overlay'
      el.style.cssText =
        'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.65);display:flex;align-items:center;justify-content:center;padding:16px'
      el.innerHTML = `
        <div class="auth-card glass-panel" style="max-width:400px;width:100%;padding:20px;border-radius:16px" role="dialog">
          <h3 style="margin:0 0 8px;font-size:1.05rem"><i class="fas fa-key"></i> بازیابی رمز عبور</h3>
          <p style="opacity:.75;font-size:.82rem;margin:0 0 14px">موبایل ثبت‌شده در سیستم را وارد کنید. کد برای مدیر و پرسنل ارسال می‌شود.</p>
          <div class="auth-field">
            <label class="auth-label">موبایل</label>
            <div class="auth-input-wrap"><i class="fas fa-mobile-alt"></i>
              <input type="tel" id="forgot-phone" class="ltr" dir="ltr" placeholder="0912..."/>
            </div>
          </div>
          <div class="auth-field" id="forgot-otp-wrap" style="display:none">
            <label class="auth-label">کد ۶ رقمی</label>
            <div class="auth-input-wrap"><i class="fas fa-shield-alt"></i>
              <input type="text" id="forgot-otp" class="ltr" dir="ltr" maxlength="6" inputmode="numeric"/>
            </div>
          </div>
          <div class="auth-field" id="forgot-pw-wrap" style="display:none">
            <label class="auth-label">رمز جدید</label>
            <div class="auth-input-wrap"><i class="fas fa-lock"></i>
              <input type="password" id="forgot-new-pw" class="ltr" dir="ltr" autocomplete="new-password"/>
            </div>
          </div>
          <p class="auth-error" id="forgot-err" style="display:none"></p>
          <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap">
            <button type="button" class="auth-btn auth-btn-primary" id="forgot-send" style="flex:1">ارسال کد</button>
            <button type="button" class="auth-btn auth-btn-primary" id="forgot-submit" style="flex:1;display:none">ثبت رمز جدید</button>
            <button type="button" class="auth-btn" id="forgot-close" style="background:transparent;border:1px solid rgba(255,255,255,.2)">بستن</button>
          </div>
        </div>`
      document.body.appendChild(el)
      const err = (m) => {
        const e = document.getElementById('forgot-err')
        if (e) {
          e.textContent = m
          e.style.display = m ? 'block' : 'none'
        }
      }
      document.getElementById('forgot-close').onclick = () => el.remove()
      el.addEventListener('click', (ev) => {
        if (ev.target === el) el.remove()
      })
      document.getElementById('forgot-send').onclick = async () => {
        err('')
        const phone = document.getElementById('forgot-phone')?.value
        if (typeof PasswordReset === 'undefined') {
          err('ماژول بازیابی در دسترس نیست')
          return
        }
        const res = await PasswordReset.sendOtp(phone)
        if (!res.ok) {
          err(res.error || 'خطا')
          return
        }
        document.getElementById('forgot-otp-wrap').style.display = 'block'
        document.getElementById('forgot-pw-wrap').style.display = 'block'
        document.getElementById('forgot-submit').style.display = 'block'
        document.getElementById('forgot-send').textContent = 'ارسال مجدد'
        if (res.demoCode) err('کد موقت: ' + res.demoCode)
        else Utils?.toast?.('کد ارسال شد', 'success')
      }
      document.getElementById('forgot-submit').onclick = async () => {
        err('')
        const phone = document.getElementById('forgot-phone')?.value
        const otp = document.getElementById('forgot-otp')?.value
        const pw = document.getElementById('forgot-new-pw')?.value
        const res = await PasswordReset.verifyAndReset(phone, otp, pw)
        if (!res.ok) {
          err(res.error || 'خطا')
          return
        }
        Utils?.toast?.('رمز عوض شد — وارد شوید', 'success')
        el.remove()
      }
    }
  }

  Portal.showForcePasswordChange = function () {
      if (document.getElementById('force-pw-overlay')) return
      const el = document.createElement('div')
      el.id = 'force-pw-overlay'
      el.style.cssText =
        'position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,.8);display:flex;align-items:center;justify-content:center;padding:16px'
      el.innerHTML = `
        <div class="auth-card glass-panel" style="max-width:400px;width:100%;padding:22px;border-radius:16px">
          <h3 style="margin:0 0 8px"><i class="fas fa-shield-halved"></i> تعویض رمز الزامی</h3>
          <p style="opacity:.8;font-size:.85rem">با کد دعوت وارد شده‌اید. قبل از ادامه یک رمز شخصی بگذارید.</p>
          <div class="auth-field">
            <label class="auth-label">رمز جدید</label>
            <div class="auth-input-wrap"><i class="fas fa-lock"></i>
              <input type="password" id="force-pw-new" class="ltr" dir="ltr" autocomplete="new-password"/>
            </div>
          </div>
          <div class="auth-field">
            <label class="auth-label">تکرار رمز</label>
            <div class="auth-input-wrap"><i class="fas fa-lock"></i>
              <input type="password" id="force-pw-2" class="ltr" dir="ltr" autocomplete="new-password"/>
            </div>
          </div>
          <p class="auth-error" id="force-pw-err" style="display:none"></p>
          <button type="button" class="auth-btn auth-btn-primary" id="force-pw-btn" style="width:100%;margin-top:10px">ذخیره و ادامه</button>
        </div>`
      document.body.appendChild(el)
      document.getElementById('force-pw-btn').onclick = async () => {
        const a = document.getElementById('force-pw-new')?.value
        const b = document.getElementById('force-pw-2')?.value
        const errEl = document.getElementById('force-pw-err')
        const show = (m) => {
          if (errEl) {
            errEl.textContent = m
            errEl.style.display = m ? 'block' : 'none'
          }
        }
        if (a !== b) {
          show('تکرار رمز یکسان نیست')
          return
        }
        const res = await Auth.changeOwnPassword('', a)
        if (!res.ok) {
          show(res.error || 'خطا')
          return
        }

        try {
          const u = Auth.getUser()
          if (u?.phone) {
            await fetch('/api/auth/change-password', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ phone: u.phone, newPassword: a })
            })
          }
        } catch { /* ignore network */ }

        el.remove()
        Utils?.toast?.('رمز شخصی با موفقیت ذخیره شد', 'success')
        const url = typeof UnifiedLogin !== 'undefined'
          ? UnifiedLogin.landingUrl(UnifiedLogin.resolveUser(Auth.getUser()))
          : Auth.getLandingUrl()
        location.href = url
      }
    }

    const origLoginPw = Portal.loginPassword?.bind(Portal)
    Portal.loginPassword = async function () {
      const errEl = document.getElementById('login-error')
      const showErr = (m) => {
        if (errEl) {
          errEl.textContent = m
          errEl.style.display = m ? 'block' : 'none'
        }
      }
      const id = document.getElementById('login-identifier')?.value?.trim()
      const pw = document.getElementById('login-password')?.value
      const mode = this.state.loginPath || 'auto'

      // مسیر پرسنل: اگر فیلد کد دعوت پر شده
      const inviteCode = document.getElementById('login-invite-code')?.value?.trim()
      if (mode === 'staff' || (inviteCode && id && !pw)) {
        showErr('')
        const res = await Auth.loginWithInviteCode(id, inviteCode || pw)
        if (!res.ok) {
          showErr(res.error)
          return
        }
        if (res.mustChangePassword) {
          this.showForcePasswordChange()
          return
        }
        location.href = Auth.getLandingUrl()
        return
      }

      if (origLoginPw) {
        await origLoginPw()
        // بعد از ورود موفق در app.js معمولاً redirect می‌شود؛ اگر mustChange ماند:
        setTimeout(() => {
          try {
            if (localStorage.getItem('talar_force_pw_change') === '1' && Auth.isLoggedIn()) {
              this.showForcePasswordChange()
            }
          } catch { /* */ }
        }, 400)
        return
      }

      // fallback
      const res = await UnifiedLogin.loginWithPassword(id, pw)
      if (!res.ok) {
        showErr(res.error)
        return
      }
      if (res.user?.mustChangePassword || localStorage.getItem('talar_force_pw_change') === '1') {
        this.showForcePasswordChange()
        return
      }
      location.href = res.url || Auth.getLandingUrl()
    }

    const origFields = Portal._loginFields?.bind(Portal)
    Portal._loginFields = function () {
      let html = origFields ? origFields() : ''
      // تزریق مسیر نقش + کد دعوت + فراموشی اگر نبود
      if (!html.includes('login-invite-code')) {
        const inject = `
      <div class="auth-path-chips" style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px">
        <button type="button" class="auth-path-chip" data-path="auto" onclick="Portal.setLoginPath('auto')">خودکار</button>
        <button type="button" class="auth-path-chip" data-path="staff" onclick="Portal.setLoginPath('staff')">پرسنل (کد دعوت)</button>
        <button type="button" class="auth-path-chip" data-path="manager" onclick="Portal.setLoginPath('manager')">مدیر / رمز</button>
      </div>
      <div class="auth-field" id="login-invite-wrap" style="display:none">
        <label class="auth-label" for="login-invite-code">کد دعوت / کد ورود (از مدیر)</label>
        <div class="auth-input-wrap">
          <i class="fas fa-ticket-alt"></i>
          <input type="text" id="login-invite-code" class="ltr" dir="ltr" inputmode="numeric" placeholder="کد ۶ رقمی" autocomplete="one-time-code"/>
        </div>
        <p style="font-size:11px;opacity:.65;margin:6px 0 0">نام استودیو لازم نیست — فقط موبایل + کد</p>
      </div>`
        html = inject + html
      }
      if (!html.includes('showForgotPassword') && !html.includes('فراموشی')) {
        html = html.replace(
          /<label class="auth-label" for="login-password">رمز عبور<\/label>/,
          `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
            <label class="auth-label" for="login-password" style="margin:0">رمز عبور</label>
            <button type="button" onclick="Portal.showForgotPassword()" style="background:none;border:none;color:#f59e0b;font-size:11.5px;cursor:pointer">فراموشی رمز؟</button>
          </div>`
        )
      }
      return html
    }

    Portal.setLoginPath = function (path) {
      this.state.loginPath = path
      const wrap = document.getElementById('login-invite-wrap')
      const pw = document.getElementById('login-pw-field')
      if (wrap) wrap.style.display = path === 'staff' ? 'block' : 'none'
      document.querySelectorAll('.auth-path-chip').forEach((b) => {
        b.style.outline = b.getAttribute('data-path') === path ? '2px solid #C9A96E' : 'none'
      })
      if (path === 'staff') {
        this.state.loginMethod = 'password'
        if (pw) pw.style.display = 'none'
      } else if (pw) {
        pw.style.display = 'block'
      }
    }

    // بعد از init اگر force flag
    setTimeout(() => {
      try {
        if (localStorage.getItem('talar_force_pw_change') === '1' && Auth.isLoggedIn()) {
          Portal.showForcePasswordChange()
        }
      } catch { /* */ }
    }, 800)
  }

  function boot() {
    patchAuth()
    patchPasswordReset()
    patchPortal()
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        setTimeout(boot, 0)
        setTimeout(boot, 500)
        setTimeout(boot, 1500)
      })
    } else {
      setTimeout(boot, 0)
      setTimeout(boot, 500)
    }
  } else {
    boot()
  }
  if (typeof window !== 'undefined') {
    window.AuthLoginEnhance = { boot }
  }
})()
