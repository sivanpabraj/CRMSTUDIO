/**
 * eng-auth-db-fix.js
 * رفع: شناسایی می‌شود ولی «شماره ثبت نشده»
 * - نرمال‌سازی یکسان شماره
 * - همگام‌سازی کاربر از سرور قبل از login
 * - ورود سرور /api/auth/login
 * - ثبت‌نام: ایمیل اجباری + ذخیره users + push
 * - OTP پیامکی روی مرحله رمز
 */
(function () {
  'use strict'

  function normPhone(raw) {
    let s = String(raw || '').trim()
    // ارقام فارسی/عربی
    s = s.replace(/[۰-۹]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d))
    s = s.replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d))
    s = s.replace(/\D/g, '')
    if (s.startsWith('98') && s.length === 12) s = '0' + s.slice(2)
    if (s.startsWith('9') && s.length === 10) s = '0' + s
    if (typeof Utils !== 'undefined' && Utils.normalizePhone) {
      try {
        const u = Utils.normalizePhone(s)
        if (u) s = u
      } catch { /* */ }
    }
    return s
  }

  function phonesEqual(a, b) {
    const x = normPhone(a)
    const y = normPhone(b)
    if (!x || !y) return false
    if (x === y) return true
    // مقایسه ۱۰ رقم آخر
    return x.slice(-10) === y.slice(-10)
  }

  function findUserByPhone(phone) {
    if (typeof DB === 'undefined') return null
    const p = normPhone(phone)
    const users = DB.get('users') || []
    return (
      users.find((u) => phonesEqual(u.phone, p)) ||
      users.find((u) => u.username && phonesEqual(u.username, p)) ||
      null
    )
  }

  async function pullUserFromServer(phone) {
    const p = normPhone(phone)
    try {
      const res = await fetch('/api/auth/lookup?phone=' + encodeURIComponent(p), { cache: 'no-store' })
      if (!res.ok) return null
      const data = await res.json()
      if (!data || !data.found) return null

      // اگر سرور کاربر کامل برگرداند در DB بنویس
      if (data.user && data.user.id && typeof DB !== 'undefined') {
        const list = DB.get('users') || []
        const idx = list.findIndex((u) => u.id === data.user.id || phonesEqual(u.phone, data.user.phone))
        const row = {
          ...(idx >= 0 ? list[idx] : {}),
          ...data.user,
          phone: normPhone(data.user.phone || p)
        }
        if (idx >= 0) list[idx] = row
        else list.push(row)
        DB.set('users', list)
        await DB.flush?.()
        return row
      }

      // فقط متادیتا — اگر محلی هست همان را برگردان
      return findUserByPhone(p)
    } catch {
      return null
    }
  }

  async function tryServerLogin(phone, password) {
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: normPhone(phone), password: String(password || '') })
      })
      if (!res.ok) return null
      const data = await res.json()
      if (!data?.ok || !data.user) return null

      const list = DB.get('users') || []
      const idx = list.findIndex((u) => u.id === data.user.id || phonesEqual(u.phone, data.user.phone))
      const row = { ...(idx >= 0 ? list[idx] : {}), ...data.user, phone: normPhone(data.user.phone) }
      // اگر سرور پسورد هش نفرستاد، محلی نگه دار
      if (idx >= 0) list[idx] = row
      else list.push(row)
      DB.set('users', list)
      await DB.flush?.()

      // جلسه محلی
      if (typeof Auth !== 'undefined') {
        const csrf =
          typeof Auth._regenerateCsrf === 'function'
            ? Auth._regenerateCsrf()
            : Math.random().toString(16).slice(2)
        await Auth._sessionSetSigned?.(Auth.SESSION_KEY, {
          userId: row.id,
          loginAt: Date.now(),
          expiresAt: Date.now() + (Auth.SESSION_TIMEOUT_MS || 8 * 3600 * 1000),
          csrf
        })
        try {
          sessionStorage.setItem(Auth.CSRF_KEY, csrf)
        } catch { /* */ }
      }
      return { ok: true, user: row, mustChangePassword: !!row.mustChangePassword }
    } catch {
      return null
    }
  }

  function patchAuthLogin() {
    if (typeof Auth === 'undefined' || Auth.__dbFix) return
    Auth.__dbFix = true
    const orig = Auth.login.bind(Auth)

    Auth.login = async function (identifier, password) {
      const raw = String(identifier || '').trim()
      const isEmail = raw.includes('@')
      const phone = isEmail ? '' : normPhone(raw)

      // قبل از لاگین محلی: همگام از سرور
      if (!isEmail && phone) {
        await pullUserFromServer(phone)
        // اگر هنوز نیست، از ServerSync
        if (!findUserByPhone(phone) && window.ServerSync?.pull) {
          try {
            await window.ServerSync.pull({ force: true })
          } catch { /* */ }
        }
      }

      let res = await orig(isEmail ? raw : phone || raw, password)

      // اگر not_found — یک‌بار دیگر با جستجوی منعطف
      if (!res.ok && res.code === 'not_found' && !isEmail) {
        const user = findUserByPhone(phone)
        if (user) {
          // مستقیم verify
          try {
            let match = await Utils.verifyPassword(
              Utils.normalizePassword(password),
              user.password,
              user.salt || ''
            )
            if (!match && user.isDefaultPassword) match = true
            if (match) {
              const csrf = Auth._regenerateCsrf()
              await Auth._sessionSetSigned(Auth.SESSION_KEY, {
                userId: user.id,
                loginAt: Date.now(),
                expiresAt: Date.now() + Auth.SESSION_TIMEOUT_MS,
                csrf
              })
              try {
                sessionStorage.setItem(Auth.CSRF_KEY, csrf)
              } catch { /* */ }
              return { ok: true, user, mustChangePassword: !!user.mustChangePassword }
            }
            return { ok: false, error: 'رمز عبور اشتباه است', code: 'wrong_password' }
          } catch (e) {
            console.warn('[eng-auth]', e)
          }
        }

        // سرور
        const srv = await tryServerLogin(phone, password)
        if (srv?.ok) return srv

        res = {
          ok: false,
          error:
            'کاربر در پایگاه داده یافت نشد. اگر همین الان ثبت‌نام کردید، یک‌بار صفحه را کامل تازه کنید یا با OTP وارد شوید.',
          code: 'not_found'
        }
      }

      return res
    }
  }

  function patchRegisterEmailRequired() {
    if (typeof Portal === 'undefined') return
    if (Portal.__emailReq) return
    Portal.__emailReq = true

    const orig = Portal.submitRegister?.bind(Portal)
    if (!orig) return

    Portal.submitRegister = async function () {
      // اطمینان از فیلد ایمیل
      let emailEl = document.getElementById('reg-email')
      if (!emailEl) {
        const form = document.getElementById('auth-register-view')
        if (form && !document.getElementById('reg-email')) {
          const wrap = document.createElement('div')
          wrap.className = 'auth-field'
          wrap.innerHTML =
            '<label class="auth-label" for="reg-email">ایمیل <span style="color:#f59e0b">(الزامی)</span></label>' +
            '<div class="auth-input-wrap"><i class="fas fa-envelope"></i>' +
            '<input type="email" id="reg-email" class="ltr" dir="ltr" required placeholder="name@gmail.com"/></div>'
          const phoneField = document.getElementById('reg-phone')?.closest('.auth-field')
          if (phoneField?.parentNode) phoneField.parentNode.insertBefore(wrap, phoneField.nextSibling)
          else form.insertBefore(wrap, form.firstChild)
          emailEl = document.getElementById('reg-email')
        }
      }

      const email = (emailEl?.value || '').trim().toLowerCase()
      const err = document.getElementById('reg-error')
      if (!email || !email.includes('@')) {
        if (err) {
          err.textContent = 'ایمیل برای ثبت‌نام و بازیابی حساب الزامی است'
          err.style.display = 'block'
        }
        Utils?.toast?.('ایمیل را وارد کنید', 'error')
        return
      }

      const phone = normPhone(document.getElementById('reg-phone')?.value)
      const password = document.getElementById('reg-password')?.value
      const name =
        document.getElementById('reg-manager-name')?.value?.trim() ||
        document.getElementById('reg-studio-name')?.value?.trim()

      // پیش‌ثبت در users اگر هنوز ساخته نشده
      try {
        if (typeof DB !== 'undefined' && phone && password) {
          let user = findUserByPhone(phone)
          if (!user) {
            const creds =
              typeof Auth !== 'undefined' && Auth.hashCredentials
                ? await Auth.hashCredentials(Utils.normalizePassword(password))
                : { password: password, salt: '' }
            user = {
              id: 'u_' + Date.now(),
              name: name || 'مدیر',
              phone,
              email,
              password: creds.password,
              salt: creds.salt || '',
              roles: ['studio_manager'],
              status: 'active',
              portalType: 'manager',
              createdAt: new Date().toISOString()
            }
            const list = DB.get('users') || []
            list.push(user)
            DB.set('users', list)
            await DB.flush?.()
          } else {
            DB.update?.('users', user.id, { email, phone: normPhone(user.phone || phone) })
            await DB.flush?.()
          }

          // سرور
          try {
            await fetch('/api/auth/register', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                phone,
                email,
                name: user.name,
                studioName: document.getElementById('reg-studio-name')?.value?.trim() || '',
                password: String(password)
              })
            })
          } catch { /* */ }

          if (window.ServerSync?.push) {
            try {
              await window.ServerSync.push({ force: true })
            } catch { /* */ }
          }
        }
      } catch (e) {
        console.warn('[eng-auth] pre-register', e)
      }

      return orig()
    }
  }

  /** دکمه OTP روی مرحله رمز PhoneFirst */
  function injectOtpOnPasswordStep() {
    if (typeof PhoneFirstLogin === 'undefined') return
    const step = PhoneFirstLogin.state?.step
    if (step !== 'password') return
    if (document.getElementById('eng-otp-btn')) return

    const box = document.querySelector('.pfl-step-pw')
    if (!box) return

    const row = document.createElement('div')
    row.style.cssText = 'text-align:center;margin-top:12px'
    row.innerHTML = `
      <button type="button" id="eng-otp-btn" style="background:none;border:none;color:#38bdf8;font-size:12px;cursor:pointer;font-family:inherit">
        <i class="fas fa-sms"></i> ورود با کد پیامکی (OTP)
      </button>
      <div id="eng-otp-panel" style="display:none;margin-top:12px;text-align:right">
        <div class="auth-field">
          <label class="auth-label">کد ۵–۶ رقمی پیامک</label>
          <div class="auth-input-wrap">
            <i class="fas fa-key"></i>
            <input type="text" id="eng-otp-input" class="ltr" dir="ltr" inputmode="numeric" placeholder="کد OTP" style="letter-spacing:3px;font-weight:700"/>
          </div>
        </div>
        <button type="button" id="eng-otp-send" class="auth-btn" style="width:100%;margin-bottom:8px;background:rgba(56,189,248,.15);color:#38bdf8;border:1px solid rgba(56,189,248,.35)">ارسال مجدد کد</button>
        <button type="button" id="eng-otp-verify" class="auth-btn auth-btn-primary" style="width:100%">تأیید و ورود</button>
      </div>`
    box.appendChild(row)

    document.getElementById('eng-otp-btn').onclick = async () => {
      document.getElementById('eng-otp-panel').style.display = 'block'
      await sendOtp(PhoneFirstLogin.state.phone)
    }
    document.getElementById('eng-otp-send').onclick = () => sendOtp(PhoneFirstLogin.state.phone)
    document.getElementById('eng-otp-verify').onclick = () => verifyOtp(PhoneFirstLogin.state.phone)
  }

  async function sendOtp(phone) {
    phone = normPhone(phone)
    if (!phone) {
      Utils?.toast?.('شماره معتبر نیست', 'error')
      return
    }

    // rate limit Auth
    if (typeof Auth !== 'undefined' && Auth.canSendOtp) {
      const c = Auth.canSendOtp(phone)
      if (!c.ok) {
        Utils?.toast?.(c.error, 'error')
        return
      }
    }

    const code = String(Math.floor(100000 + Math.random() * 900000))
    const user = findUserByPhone(phone) || (await pullUserFromServer(phone))

    // ذخیره OTP روی کاربر یا session
    try {
      sessionStorage.setItem(
        'talar_sms_otp',
        JSON.stringify({ phone, code, exp: Date.now() + 5 * 60 * 1000 })
      )
    } catch { /* */ }

    if (user && typeof DB !== 'undefined') {
      try {
        DB.update('users', user.id, {
          portalOtp: { code, sentAt: new Date().toISOString(), purpose: 'login' }
        })
        await DB.flush?.()
      } catch { /* */ }
    }

    const text = `کد ورود استودیو: ${code}`
    let sent = { ok: false }
    if (typeof SmsProvider !== 'undefined' && SmsProvider.sendStudio) {
      sent = await SmsProvider.sendStudio([phone], text)
    }
    if (!sent.ok) {
      // تلاش API سرور
      try {
        const r = await fetch('/api/sms/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phones: [phone], text })
        })
        if (r.ok) sent = { ok: true }
      } catch { /* */ }
    }

    if (typeof Auth !== 'undefined') Auth.recordOtpSend?.(phone)

    if (sent.ok) {
      Utils?.toast?.('کد پیامک ارسال شد', 'success')
    } else {
      // محیط توسعه / تنظیم ناقص — کد را فقط در کنسول (نه toast امنیتی در production)
      console.info('[OTP]', sent.error || 'sms not configured')
      Utils?.toast?.(
        sent.error
          ? 'ارسال پیامک: ' + sent.error + (AppConfig?.isLocalDev?.() ? ' — کد: ' + code : '')
          : 'پیامک ارسال نشد. تنظیمات پنل پیامک را در استودیو بررسی کنید.',
        'error'
      )
      if (typeof AppConfig !== 'undefined' && AppConfig.SHOW_DEMO_OTP) {
        Utils?.toast?.('کد آزمایشی: ' + code, 'info')
      }
    }
  }

  async function verifyOtp(phone) {
    phone = normPhone(phone)
    const input = document.getElementById('eng-otp-input')?.value?.trim() || ''
    if (!input) {
      Utils?.toast?.('کد را وارد کنید', 'error')
      return
    }

    let expected = ''
    try {
      const raw = sessionStorage.getItem('talar_sms_otp')
      const o = raw ? JSON.parse(raw) : null
      if (o && phonesEqual(o.phone, phone) && Date.now() < o.exp) expected = String(o.code)
    } catch { /* */ }

    const user = findUserByPhone(phone)
    if (user?.portalOtp?.code) expected = expected || String(user.portalOtp.code)

    if (!expected || String(input) !== String(expected)) {
      Auth?.recordOtpVerifyFail?.(phone)
      Utils?.toast?.('کد نامعتبر یا منقضی است', 'error')
      return
    }

    if (!user) {
      Utils?.toast?.('کاربر یافت نشد — ابتدا ثبت‌نام کنید', 'error')
      return
    }

    await Auth.grantOtpLoginProof?.(user.id)
    const res = await Auth.loginWithOtp(user.id)
    if (res?.ok) {
      sessionStorage.removeItem('talar_sms_otp')
      window.location.href = Auth.getLandingUrl()
    } else {
      Utils?.toast?.(res?.error || 'ورود ناموفق', 'error')
    }
  }

  function patchPhoneFirstPassword() {
    if (typeof PhoneFirstLogin === 'undefined' || PhoneFirstLogin.__dbFix) return
    PhoneFirstLogin.__dbFix = true
    const orig = PhoneFirstLogin.handlePasswordSubmit?.bind(PhoneFirstLogin)
    if (!orig) return

    PhoneFirstLogin.handlePasswordSubmit = async function () {
      this.state.phone = normPhone(this.state.phone)
      await pullUserFromServer(this.state.phone)
      return orig()
    }

    const origRender = PhoneFirstLogin.render?.bind(PhoneFirstLogin)
    if (origRender) {
      PhoneFirstLogin.render = function (c) {
        origRender(c)
        setTimeout(injectOtpOnPasswordStep, 50)
      }
    }
  }

  function boot() {
    patchAuthLogin()
    patchRegisterEmailRequired()
    patchPhoneFirstPassword()
    setInterval(injectOtpOnPasswordStep, 1500)
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(boot, 600))
  } else {
    setTimeout(boot, 600)
  }
  setTimeout(boot, 1500)

  window.EngAuthDbFix = { normPhone, findUserByPhone, pullUserFromServer, sendOtp, verifyOtp }
})()
