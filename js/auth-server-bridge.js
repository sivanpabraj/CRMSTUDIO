/**
 * Auth Server Bridge
 * مشکل: /api/auth/lookup کاربر را پیدا می‌کند ولی Auth.login فقط IndexedDB محلی را می‌بیند
 * → «شماره ثبت نشده» با وجود تشخیص استودیو
 *
 * این ماژول:
 * 1) ورود را به /api/auth/login وصل می‌کند و user را در DB محلی می‌نویسد
 * 2) نرمال‌سازی چندفرمته شماره
 * 3) OTP پیامکی از طریق SmsProvider
 * 4) ایمیل اجباری در ثبت‌نام
 */
;(function (w) {
  'use strict'

  function phoneVariants(raw) {
    const n = typeof Utils !== 'undefined' && Utils.normalizePhone
      ? Utils.normalizePhone(raw)
      : String(raw || '').replace(/\D/g, '')
    const set = new Set()
    if (n) set.add(n)
    const digits = String(raw || '').replace(/\D/g, '')
    if (digits) set.add(digits)
    if (digits.startsWith('98') && digits.length >= 12) set.add('0' + digits.slice(2))
    if (digits.startsWith('9') && digits.length === 10) set.add('0' + digits)
    if (digits.startsWith('09')) set.add(digits)
    return [...set].filter(Boolean)
  }

  function findLocalUser(identifier) {
    if (typeof DB === 'undefined') return null
    const raw = String(identifier || '').trim()
    if (raw.includes('@')) {
      const email = raw.toLowerCase()
      return DB.find('users', (u) =>
        (u.email && u.email.toLowerCase() === email) ||
        (u.username && u.username.toLowerCase() === email)
      )
    }
    const variants = phoneVariants(raw)
    return DB.find('users', (u) => {
      const up = phoneVariants(u.phone || '')
      return variants.some((v) => up.includes(v))
    })
  }

  async function upsertLocalUser(user) {
    if (!user || !user.id || typeof DB === 'undefined') return
    const list = DB.get('users') || []
    const i = list.findIndex((u) => u.id === user.id || phoneVariants(u.phone).some((v) => phoneVariants(user.phone).includes(v)))
    const row = {
      ...(i >= 0 ? list[i] : {}),
      ...user,
      status: user.status || 'active',
      phone: user.phone || (i >= 0 ? list[i].phone : '')
    }
    if (i >= 0) list[i] = row
    else list.push(row)
    DB.set('users', list)
    try {
      await DB.flush?.()
    } catch { /* */ }
    try {
      if (typeof SecureDB !== 'undefined' && SecureDB.update) {
        if (i >= 0) await SecureDB.update('users', row.id, row).catch(() => {})
        else await SecureDB.insert('users', row).catch(() => {})
      }
    } catch { /* */ }
    return row
  }

  async function serverLogin(phone, password) {
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ phone, password, identifier: phone })
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || data.ok === false) {
        return {
          ok: false,
          error: data.error || data.message || (res.status === 401 ? 'رمز عبور اشتباه است' : 'ورود سرور ناموفق'),
          code: data.code || 'server'
        }
      }
      const user = data.user || data.data?.user
      if (!user) return { ok: false, error: 'پاسخ سرور بدون کاربر', code: 'server' }
      await upsertLocalUser(user)
      if (data.studioInfo && typeof DB !== 'undefined') {
        DB.set('studioInfo', { ...(DB.get('studioInfo') || {}), ...data.studioInfo })
      }
      // session
      if (typeof Auth !== 'undefined') {
        const csrf =
          data.csrf ||
          (Auth._regenerateCsrf && Auth._regenerateCsrf()) ||
          String(Date.now())
        const session = {
          userId: user.id,
          loginAt: Date.now(),
          expiresAt: Date.now() + (Auth.SESSION_TIMEOUT_MS || 8 * 3600 * 1000),
          csrf,
          fromServer: true
        }
        if (Auth._sessionSetSigned) await Auth._sessionSetSigned(Auth.SESSION_KEY, session)
        else if (Auth._sessionSet) Auth._sessionSet(Auth.SESSION_KEY, session)
        try {
          sessionStorage.setItem(Auth.CSRF_KEY || 'talar_csrf', csrf)
        } catch { /* */ }
      }
      return { ok: true, user, mustChangePassword: !!(user.mustChangePassword || data.mustChangePassword) }
    } catch (e) {
      return { ok: false, error: 'ارتباط با سرور برقرار نشد', code: 'network', detail: String(e) }
    }
  }

  async function serverRegister(payload) {
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload)
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || data.ok === false) {
        return { ok: false, error: data.error || data.message || 'ثبت‌نام سرور ناموفق' }
      }
      if (data.user) await upsertLocalUser(data.user)
      if (data.studioInfo && typeof DB !== 'undefined') {
        DB.set('studioInfo', { ...(DB.get('studioInfo') || {}), ...data.studioInfo })
        await DB.flush?.()
      }
      return { ok: true, ...data }
    } catch (e) {
      return { ok: false, error: 'خطای شبکه در ثبت‌نام', detail: String(e) }
    }
  }

  function patchAuthLogin() {
    if (typeof Auth === 'undefined' || Auth.__serverBridge) return
    Auth.__serverBridge = true
    const orig = Auth.login.bind(Auth)

    Auth.login = async function (identifier, password) {
      // 1) تلاش محلی با چند فرم شماره
      const local = findLocalUser(identifier)
      if (local) {
        // اگر phone اصلی با نرمال یکی نیست، با phone ذخیره‌شده تلاش کن
        const res = await orig(local.phone || identifier, password)
        if (res.ok) return res
        // wrong_password را برگردان؛ not_found را ادامه به سرور نده
        if (res.code === 'wrong_password' || res.code === 'locked' || res.code === 'pending') return res
      } else {
        const resLocal = await orig(identifier, password)
        if (resLocal.ok) return resLocal
        if (resLocal.code === 'wrong_password' || resLocal.code === 'locked') return resLocal
      }

      // 2) سرور
      const phone =
        typeof Utils !== 'undefined' && Utils.normalizePhone
          ? Utils.normalizePhone(String(identifier || '').includes('@') ? '' : identifier)
          : String(identifier || '')
      if (!phone && String(identifier || '').includes('@')) {
        // ایمیل: فقط سرور با identifier
        try {
          const res = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ email: String(identifier).toLowerCase(), password, identifier })
          })
          const data = await res.json().catch(() => ({}))
          if (res.ok && (data.ok !== false) && data.user) {
            await upsertLocalUser(data.user)
            const csrf = data.csrf || (Auth._regenerateCsrf && Auth._regenerateCsrf()) || String(Date.now())
            const session = {
              userId: data.user.id,
              loginAt: Date.now(),
              expiresAt: Date.now() + (Auth.SESSION_TIMEOUT_MS || 8 * 3600 * 1000),
              csrf,
              fromServer: true
            }
            if (Auth._sessionSetSigned) await Auth._sessionSetSigned(Auth.SESSION_KEY, session)
            else Auth._sessionSet?.(Auth.SESSION_KEY, session)
            return { ok: true, user: data.user, mustChangePassword: !!data.user.mustChangePassword }
          }
          return { ok: false, error: data.error || 'ایمیل یا رمز نادرست است', code: data.code || 'server' }
        } catch {
          return { ok: false, error: 'کاربر محلی یافت نشد و سرور در دسترس نیست', code: 'not_found' }
        }
      }

      const serverRes = await serverLogin(phone || identifier, password)
      if (serverRes.ok) return serverRes

      // 3) پیام دقیق‌تر
      if (serverRes.code === 'network') {
        return {
          ok: false,
          error:
            'کاربر روی این دستگاه یافت نشد. یا سرور در دسترس نیست. یک‌بار با اینترنت وارد شوید یا دوباره ثبت‌نام کنید.',
          code: 'not_found'
        }
      }
      return serverRes
    }
  }

  /** OTP: ارسال کد */
  async function sendLoginOtp(phone) {
    phone =
      typeof Utils !== 'undefined' && Utils.normalizePhone
        ? Utils.normalizePhone(phone)
        : String(phone || '')
    if (typeof Auth !== 'undefined' && Auth.canSendOtp) {
      const gate = Auth.canSendOtp(phone)
      if (!gate.ok) return gate
    }

    // ترجیح API سرور
    try {
      const res = await fetch('/api/auth/otp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone })
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok && data.ok !== false) {
        Auth.recordOtpSend?.(phone)
        return { ok: true, message: data.message || 'کد ارسال شد' }
      }
      if (data.error) return { ok: false, error: data.error }
    } catch { /* fallback local sms */ }

    // تولید کد محلی + SmsProvider
    const code = String(Math.floor(100000 + Math.random() * 900000))
    try {
      sessionStorage.setItem(
        'talar_login_otp',
        JSON.stringify({ phone, code, exp: Date.now() + 5 * 60 * 1000 })
      )
    } catch { /* */ }

    if (typeof SmsProvider !== 'undefined' && SmsProvider.isConfigured?.()) {
      const text = `کد ورود استودیو: ${code}\nMandani Studio`
      const sent = await SmsProvider.sendStudio(phone, text)
      if (!sent.ok) return { ok: false, error: sent.error || 'ارسال پیامک ناموفق' }
      Auth.recordOtpSend?.(phone)
      return { ok: true, message: 'کد پیامک شد' }
    }

    // بدون SMS در dev نشان بده
    if (typeof AppConfig !== 'undefined' && AppConfig.isLocalDev?.()) {
      Auth.recordOtpSend?.(phone)
      return { ok: true, message: 'حالت توسعه — کد: ' + code, devCode: code }
    }

    return {
      ok: false,
      error: 'پنل پیامک تنظیم نشده یا /api/auth/otp/send در دسترس نیست. تنظیمات SMS مدیر را بررسی کنید.'
    }
  }

  async function verifyLoginOtp(phone, code) {
    phone =
      typeof Utils !== 'undefined' && Utils.normalizePhone
        ? Utils.normalizePhone(phone)
        : String(phone || '')
    code = String(code || '').trim()

    try {
      const res = await fetch('/api/auth/otp/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ phone, code })
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok && data.ok !== false && data.user) {
        await upsertLocalUser(data.user)
        if (typeof Auth !== 'undefined') {
          await Auth.grantOtpLoginProof?.(data.user.id)
          const loginRes = await Auth.loginWithOtp?.(data.user.id)
          if (loginRes?.ok) return loginRes
          // ساخت session مستقیم
          const csrf = Auth._regenerateCsrf?.() || String(Date.now())
          const session = {
            userId: data.user.id,
            loginAt: Date.now(),
            expiresAt: Date.now() + (Auth.SESSION_TIMEOUT_MS || 8 * 3600 * 1000),
            otpAuth: true,
            csrf
          }
          if (Auth._sessionSetSigned) await Auth._sessionSetSigned(Auth.SESSION_KEY, session)
          else Auth._sessionSet?.(Auth.SESSION_KEY, session)
          return { ok: true, user: data.user }
        }
      }
      if (data.error) return { ok: false, error: data.error }
    } catch { /* local */ }

    try {
      const raw = sessionStorage.getItem('talar_login_otp')
      const o = raw ? JSON.parse(raw) : null
      if (o && o.phone === phone && String(o.code) === code && Date.now() < o.exp) {
        sessionStorage.removeItem('talar_login_otp')
        let user = findLocalUser(phone)
        if (!user) {
          // از lookup سرور user id بگیر
          try {
            const lr = await fetch(`/api/auth/lookup?phone=${encodeURIComponent(phone)}`)
            const ld = await lr.json()
            if (ld.user) user = await upsertLocalUser(ld.user)
          } catch { /* */ }
        }
        if (!user) return { ok: false, error: 'کاربر یافت نشد — ابتدا ثبت‌نام کنید' }
        await Auth.grantOtpLoginProof?.(user.id)
        const r = await Auth.loginWithOtp?.(user.id)
        if (r?.ok) return r
        const csrf = Auth._regenerateCsrf?.() || String(Date.now())
        if (Auth._sessionSetSigned)
          await Auth._sessionSetSigned(Auth.SESSION_KEY, {
            userId: user.id,
            loginAt: Date.now(),
            expiresAt: Date.now() + Auth.SESSION_TIMEOUT_MS,
            otpAuth: true,
            csrf
          })
        return { ok: true, user }
      }
    } catch { /* */ }
    return { ok: false, error: 'کد نامعتبر یا منقضی شده' }
  }

  function patchPhoneFirst() {
    if (typeof PhoneFirstLogin === 'undefined') return
    const origPw = PhoneFirstLogin.handlePasswordSubmit?.bind(PhoneFirstLogin)
    if (!origPw || PhoneFirstLogin.__bridgePw) return
    PhoneFirstLogin.__bridgePw = true

    PhoneFirstLogin.handlePasswordSubmit = async function () {
      const pwInput = document.getElementById('pfl-password-input')
      const pw = pwInput?.value || ''
      if (!pw) {
        this.state.error = 'رمز عبور را وارد کنید'
        this.render()
        return
      }
      this.state.loading = true
      this.state.error = ''
      this.render()
      try {
        // قبل از login، اگر lookup فقط سرور بود user را hydrate کن
        try {
          const res = await fetch(`/api/auth/lookup?phone=${encodeURIComponent(this.state.phone)}`, {
            cache: 'no-store'
          })
          if (res.ok) {
            const ld = await res.json()
            if (ld.user) await upsertLocalUser(ld.user)
          }
        } catch { /* */ }

        const result = await Auth.login(this.state.phone, pw)
        if (!result.ok) {
          this.state.loading = false
          this.state.error = result.error || 'ورود ناموفق'
          this.render()
          return
        }
        if (result.mustChangePassword) {
          Portal.showForcePasswordChange?.()
          return
        }
        window.location.href = result.url || Auth.getLandingUrl()
      } catch (err) {
        this.state.loading = false
        this.state.error = err.message || 'خطا در ورود'
        this.render()
      }
    }

    // دکمه OTP در مرحله رمز
    const origRender = PhoneFirstLogin.render.bind(PhoneFirstLogin)
    PhoneFirstLogin.render = function (container) {
      origRender(container)
      if (this.state.step === 'password') {
        const box = document.querySelector('.pfl-step-pw')
        if (box && !document.getElementById('pfl-otp-block')) {
          const div = document.createElement('div')
          div.id = 'pfl-otp-block'
          div.style.cssText = 'margin-top:14px;text-align:center'
          div.innerHTML = `
            <button type="button" id="pfl-otp-send" style="background:none;border:none;color:#38bdf8;font-size:12px;cursor:pointer;font-family:inherit">
              ورود با کد پیامکی (OTP)
            </button>
            <div id="pfl-otp-row" style="display:none;margin-top:10px;gap:8px;flex-direction:column">
              <input type="text" id="pfl-otp-code" class="ltr" dir="ltr" inputmode="numeric" placeholder="کد ۶ رقمی" style="width:100%;box-sizing:border-box;padding:10px;border-radius:10px;border:1px solid rgba(255,255,255,.15);background:rgba(0,0,0,.25);color:#fff;text-align:center;letter-spacing:4px;font-family:inherit"/>
              <button type="button" id="pfl-otp-verify" class="auth-btn auth-btn-primary" style="width:100%">تأیید کد و ورود</button>
            </div>`
          box.appendChild(div)
          document.getElementById('pfl-otp-send').onclick = async () => {
            const r = await sendLoginOtp(this.state.phone)
            if (!r.ok) {
              this.state.error = r.error
              this.render()
              return
            }
            Utils?.toast?.(r.message || 'کد ارسال شد', 'success')
            if (r.devCode) Utils?.toast?.('کد توسعه: ' + r.devCode, 'info')
            document.getElementById('pfl-otp-row').style.display = 'flex'
          }
          document.getElementById('pfl-otp-verify').onclick = async () => {
            const code = document.getElementById('pfl-otp-code')?.value || ''
            const r = await verifyLoginOtp(this.state.phone, code)
            if (!r.ok) {
              this.state.error = r.error
              Utils?.toast?.(r.error, 'error')
              return
            }
            window.location.href = Auth.getLandingUrl()
          }
        }
      }
    }.bind(PhoneFirstLogin)
  }

  function patchRegisterEmailRequired() {
    // ثبت‌نام استودیو: ایمیل الزامی + سرور
    if (typeof Portal === 'undefined') return
    const tryPatch = () => {
      if (!Portal.submitRegister || Portal.__emailReq) return
      Portal.__emailReq = true
      const orig = Portal.submitRegister.bind(Portal)
      Portal.submitRegister = async function () {
        const emailEl =
          document.getElementById('reg-email') || document.getElementById('pfl-reg-email')
        let email = emailEl?.value?.trim() || ''
        if (!email || !email.includes('@')) {
          // اگر فیلد نیست، اضافه کن و خطا بده
          const regView = document.getElementById('auth-register-view')
          if (regView && !document.getElementById('reg-email')) {
            const field = document.createElement('div')
            field.className = 'auth-field'
            field.innerHTML = `
              <label class="auth-label" for="reg-email">ایمیل (الزامی)</label>
              <div class="auth-input-wrap"><i class="fas fa-envelope"></i>
              <input type="email" id="reg-email" class="ltr" dir="ltr" placeholder="name@gmail.com" required/></div>`
            const err = document.getElementById('reg-error')
            if (err) regView.insertBefore(field, err)
            else regView.appendChild(field)
          }
          const err = document.getElementById('reg-error')
          if (err) {
            err.style.display = 'block'
            err.textContent = 'ایمیل برای ثبت‌نام و بازیابی الزامی است'
          }
          Utils?.toast?.('ایمیل الزامی است', 'error')
          return
        }

        // بعد از ثبت محلی، به سرور هم بفرست
        const result = await orig()
        try {
          const phone = document.getElementById('reg-phone')?.value
          const name = document.getElementById('reg-manager-name')?.value
          const studio = document.getElementById('reg-studio-name')?.value
          const password = document.getElementById('reg-password')?.value
          const cleanPhone = (typeof Utils !== 'undefined' && Utils.normalizePhone?.(phone)) || phone
          await serverRegister({
            phone: cleanPhone,
            email,
            name,
            studioName: studio,
            password,
            role: 'studio_manager'
          })
          if (w.SaasContext?.registerStudio) {
            const saasRes = await w.SaasContext.registerStudio({
              studioName: studio,
              managerName: name,
              phone: cleanPhone,
              email,
              password
            })
            if (saasRes && saasRes.accessToken && saasRes.memberships) {
              w.SaasContext.setSession(saasRes)
            }
          }
        } catch { /* */ }
        return result
      }
    }
    setTimeout(tryPatch, 800)
    setTimeout(tryPatch, 2000)
  }

  function boot() {
    patchAuthLogin()
    patchPhoneFirst()
    patchRegisterEmailRequired()
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      setTimeout(boot, 400)
      setTimeout(boot, 1200)
    })
  } else {
    setTimeout(boot, 400)
    setTimeout(boot, 1200)
  }

  w.AuthServerBridge = {
    serverLogin,
    serverRegister,
    sendLoginOtp,
    verifyLoginOtp,
    findLocalUser,
    upsertLocalUser,
    phoneVariants
  }
})(typeof window !== 'undefined' ? window : globalThis)
