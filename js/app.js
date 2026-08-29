/* Studio M — ورود واحد · شناسایی خودکار از DB */
const Portal = {
  state: { currentUser: null, currentSection: 'overview', step: 'login', loginMethod: 'password', _phone: '', notice: '' },

  async init() {
    const params = new URLSearchParams(location.search)
    if (params.get('logout') === '1') {
      Auth.logout()
      CustomerSession?.clear?.()
      params.delete('logout')
      history.replaceState(null, '', location.pathname + (params.toString() ? `?${params}` : ''))
    }

    await DB.ready

    if (params.get('signup') === '1' || params.get('mode') === 'register') {
      this.state.step = 'signup'
      params.delete('signup')
      params.delete('mode')
      history.replaceState(null, '', location.pathname + (params.toString() ? `?${params}` : ''))
    }

    if (params.get('wipe') === 'confirm' && typeof FactoryReset !== 'undefined') {
      if (AppConfig.isLocalDev() && Auth.isLoggedIn() && Auth.isAdmin()) {
        const pw = prompt('رمز مدیر برای تأیید بازنشانی کامل:')
        if (!pw) {
          Utils.toast?.('لغو شد', 'info')
          params.delete('wipe')
          history.replaceState(null, '', location.pathname + (params.toString() ? `?${params}` : ''))
          return
        }
        const v = await Auth.verifyCurrentPassword(pw)
        if (!v.ok) {
          Utils.toast?.(v.error || 'رمز اشتباه', 'error')
          params.delete('wipe')
          history.replaceState(null, '', location.pathname + (params.toString() ? `?${params}` : ''))
          return
        }
        await FactoryReset.wipeForTesting()
        window.location.replace('index.html?fresh=1')
        return
      }
      Utils.toast?.('بازنشانی از URL فقط در محیط توسعه و با ورود مدیر مجاز است', 'error')
      params.delete('wipe')
      history.replaceState(null, '', location.pathname + (params.toString() ? `?${params}` : ''))
    }

    if (AppConfig.allowsLocalIdentity?.() && !DB.get('users').length) {
      window.location.replace('start.html')
      return
    }

    // CustomerSession.get is async — must await (Promise is always truthy)
    if (typeof CustomerSession !== 'undefined' && CustomerSession.get) {
      try {
        const custSession = await CustomerSession.get()
        if (custSession) { window.location.href = 'customer.html'; return }
      } catch { /* ignore corrupt session */ }
    }

    if (Auth.isLoggedIn()) {
      const next = params.get('next')
      const safeNext = Utils.safeRedirectPath?.(next)
      if (safeNext) { window.location.href = safeNext; return }
      if (params.get('view') === 'portal') {
        const u = Auth.getUser()
        // اگر ادمین/مدیر باشد، او را به پنل اصلی بفرست
        if (typeof Access !== 'undefined' && Access.canAccessStudioM?.(u)) {
          window.location.href = 'studio-m/'
          return
        }
        this.state.currentUser = u
        this.renderPortal()
        return
      }
      window.location.href = Auth.getLandingUrl()
      return
    }

    const pending = UnifiedLogin?.getPending?.()
    if (pending?.phone) {
      this.state._phone = pending.phone
      if (pending.portalVerify) this.state.step = 'portal_verify'
      else this.state.step = pending.verified ? 'consultation' : 'otp'
    }

    this.renderAuth()
  },

  _studio() { return DB.get('studioInfo') || {} },

  _hasConfiguredStudio(studio) {
    const name = (studio?.name || '').trim()
    return !!(studio?.setupCompleted && name && name !== 'Studio M')
  },

  _authTitle(studio) {
    if (!this._hasConfiguredStudio(studio)) return 'ورود'
    return studio.name.trim()
  },

  _logoHtml(studio) {
    if (studio.logo && this._hasConfiguredStudio(studio)) {
      return Utils.safeImgHtml(studio.logo, 'class="auth-unified-logo-img"') || '<i class="fas fa-camera-retro"></i>'
    }
    return '<i class="fas fa-camera-retro"></i>'
  },

  _firstSetupHintHtml() {
    try {
      const raw = sessionStorage.getItem('talar_first_setup_creds')
      if (!raw) return ''
      const data = JSON.parse(raw)
      if (!data?.expires || Date.now() > data.expires) {
        sessionStorage.removeItem('talar_first_setup_creds')
        return ''
      }
      sessionStorage.removeItem('talar_first_setup_creds')
      return `<div class="auth-first-hint"><i class="fas fa-info-circle"></i> رمز اولیه (یک‌بار): <strong dir="ltr">${Utils.escapeHtml(data.phone)}</strong> / <strong dir="ltr">${Utils.escapeHtml(data.password)}</strong></div>`
    } catch { return '' }
  },

  renderAuth() {
    document.body.classList.add('auth-screen')
    const studio = this._studio()
    const step = this.state.step || 'login'
    const phone = this.state._phone || UnifiedLogin?.getPending?.()?.phone || ''
    const title = this._authTitle(studio)

    document.title = title === 'ورود' ? 'ورود' : `ورود — ${title}`

    const body = step === 'signup' ? this._signupStep()
      : step === 'signup_otp' ? this._signupOtpStep(phone)
        : step === 'forgot' ? this._forgotStep()
        : step === 'reset' ? this._resetStep(phone)
          : step === 'otp' ? this._otpStep(phone)
      : step === 'portal_verify' ? this._portalVerifyStep(phone)
        : step === 'consultation' ? this._consultationStep(phone)
          : step === 'done' ? this._doneStep()
            : this._loginStep()

    document.getElementById('portal-app').innerHTML = `
      <div class="auth-page auth-page--unified">
        <canvas class="auth-ambient" data-auth-ambient aria-hidden="true"></canvas>
        <div class="auth-ambient-fallback" aria-hidden="true"></div>
        <div class="auth-unified-wrap">
          <div class="auth-card glass-panel auth-unified-card">
            <div class="auth-unified-head">
              <div class="auth-unified-logo">${this._logoHtml(studio)}</div>
              <h1 class="auth-title">${Utils.escapeHtml(title)}</h1>
              <p class="auth-sub">${step === 'login' ? 'ورود امن به ERP' : step === 'signup' || step === 'signup_otp' ? 'ساخت حساب و استودیو' : step === 'forgot' || step === 'reset' ? 'بازیابی امن رمز عبور' : step === 'otp' ? 'کد ۶ رقمی را وارد کنید' : step === 'portal_verify' ? 'کد دعوت پرتال' : step === 'consultation' ? 'رزرو وقت مشاوره' : ''}</p>
            </div>
            ${body}
            <p class="auth-unified-foot"><a href="site.html">صفحه اصلی</a></p>
          </div>
        </div>
      </div>`

    window.AuthAmbient?.mount?.()
    this._bindStepKeys(step)
    if (step === 'consultation') {
      ConsultationBooking.reset()
      ConsultationBooking.render('auth-booking-root')
    }
  },

  _loginStep() {
    const isPw = this.state.loginMethod === 'password'
    const params = new URLSearchParams(location.search)
    const showHint = params.get('fresh') === '1' ? this._firstSetupHintHtml() : ''
    return `
      ${showHint}
      ${this.state.notice ? `<div class="auth-notice" role="status">${Utils.escapeHtml(this.state.notice)}</div>` : ''}
      <div class="auth-view-tabs" role="tablist" aria-label="ورود یا ثبت‌نام">
        <button type="button" class="auth-method-tab auth-method-tab--active" role="tab" aria-selected="true">ورود</button>
        <button type="button" class="auth-method-tab" role="tab" aria-selected="false" data-csp-action="Portal.showSignup">ثبت‌نام</button>
      </div>
      <div class="auth-method-tabs">
        <button type="button" class="auth-method-tab${!isPw ? ' auth-method-tab--active' : ''}" data-csp-action="Portal.setLoginMethod" data-csp-arg="sms">
          <i class="fas fa-sms"></i> پیامک
        </button>
        <button type="button" class="auth-method-tab${isPw ? ' auth-method-tab--active' : ''}" data-csp-action="Portal.setLoginMethod" data-csp-arg="password">
          <i class="fas fa-lock"></i> رمز عبور
        </button>
      </div>
      <div class="auth-form">
        <div class="auth-field">
          <label class="auth-label" for="login-phone">شماره موبایل</label>
          <div class="auth-input-wrap">
            <i class="fas fa-mobile-alt"></i>
            <input type="tel" id="login-phone" class="ltr" dir="ltr" inputmode="numeric" autocomplete="tel" placeholder="09121234567" value="${Utils.escapeHtml(this.state._phone || '')}" autofocus/>
          </div>
        </div>
        ${isPw ? `
        <div class="auth-field">
          <label class="auth-label" for="login-password">رمز عبور</label>
          <div class="auth-input-wrap">
            <i class="fas fa-key"></i>
            <input type="password" id="login-password" class="ltr" dir="ltr" autocomplete="current-password" placeholder="رمز (انگلیسی)"/>
          </div>
        </div>` : ''}
        <div class="auth-error" id="login-error" role="alert" aria-live="assertive"></div>
        <button type="button" class="auth-btn auth-btn-primary" id="login-btn" data-csp-action="Portal.${isPw ? 'loginPassword' : 'sendOtp'}">
          <i class="fas fa-${isPw ? 'sign-in-alt' : 'paper-plane'}"></i> ${isPw ? 'ورود' : 'ارسال کد'}
        </button>
        ${isPw ? '<p class="auth-forgot"><a href="#" data-csp-action="Portal.showForgot" data-csp-prevent>رمز عبور را فراموش کرده‌اید؟</a></p>' : ''}
        ${typeof Cloud !== 'undefined' && Cloud.isConfigured?.() ? `
        <div class="auth-social-divider"><span>یا ورود امن تیم با</span></div>
        <div class="auth-social-grid">
          <button type="button" class="auth-btn auth-btn-social" data-csp-action="Portal.oauthLogin" data-csp-arg="google"><i class="fab fa-google"></i> Google</button>
          <button type="button" class="auth-btn auth-btn-social" data-csp-action="Portal.oauthLogin" data-csp-arg="apple"><i class="fab fa-apple"></i> Apple</button>
        </div>` : ''}
        <p class="auth-hint">سیستم بر اساس شماره شما را شناسایی و به پنل مربوط هدایت می‌کند.</p>
      </div>`
  },

  _signupStep() {
    return `
      <div class="auth-view-tabs" role="tablist" aria-label="ورود یا ثبت‌نام">
        <button type="button" class="auth-method-tab" role="tab" aria-selected="false" data-csp-action="Portal.backToLogin">ورود</button>
        <button type="button" class="auth-method-tab auth-method-tab--active" role="tab" aria-selected="true">ثبت‌نام</button>
      </div>
      <form class="auth-form" data-auth-form="signup">
        <div class="auth-field"><label class="auth-label" for="signup-name">نام و نام خانوادگی</label><div class="auth-input-wrap"><i class="fas fa-user"></i><input id="signup-name" autocomplete="name" maxlength="100"/></div></div>
        <div class="auth-field"><label class="auth-label" for="signup-studio">نام استودیو</label><div class="auth-input-wrap"><i class="fas fa-building"></i><input id="signup-studio" autocomplete="organization" maxlength="120"/></div></div>
        <div class="auth-field"><label class="auth-label" for="signup-phone">شماره موبایل</label><div class="auth-input-wrap"><i class="fas fa-mobile-alt"></i><input type="tel" id="signup-phone" class="ltr" dir="ltr" inputmode="numeric" autocomplete="tel" placeholder="09121234567"/></div></div>
        <div class="auth-field"><label class="auth-label" for="signup-email">ایمیل</label><div class="auth-input-wrap"><i class="fas fa-envelope"></i><input type="email" id="signup-email" class="ltr" dir="ltr" autocomplete="email" placeholder="name@example.com"/></div></div>
        <div class="auth-field"><label class="auth-label" for="signup-password">رمز اولیه حساب</label><div class="auth-input-wrap"><i class="fas fa-key"></i><input type="password" id="signup-password" class="ltr" dir="ltr" autocomplete="new-password"/></div><p class="auth-field-help">حداقل ${Utils.fmtNum?.(AppConfig.MIN_PASSWORD_LENGTH) || AppConfig.MIN_PASSWORD_LENGTH} کاراکتر شامل حرف بزرگ، حرف کوچک، عدد و علامت. این رمز در مرورگر ذخیره نمی‌شود.</p></div>
        <div class="auth-field"><label class="auth-label" for="signup-password-confirm">تکرار رمز اولیه</label><div class="auth-input-wrap"><i class="fas fa-check"></i><input type="password" id="signup-password-confirm" class="ltr" dir="ltr" autocomplete="new-password"/></div></div>
        <div class="auth-error" id="login-error" role="alert"></div>
        <button type="button" class="auth-btn auth-btn-primary" id="login-btn" data-csp-action="Portal.registerAccount"><i class="fas fa-user-plus"></i> ثبت‌نام</button>
      </form>`
  },

  _forgotStep() {
    return `<div class="auth-form">
      <p class="auth-hint">شماره موبایل حساب را وارد کنید. پاسخ سامانه عمداً مشخص نمی‌کند شماره عضو هست یا نه.</p>
      <div class="auth-field"><label class="auth-label" for="reset-phone">شماره موبایل</label><div class="auth-input-wrap"><i class="fas fa-mobile-alt"></i><input type="tel" id="reset-phone" class="ltr" dir="ltr" inputmode="numeric" autocomplete="tel" value="${Utils.escapeHtml(this.state._phone || '')}" placeholder="09121234567" autofocus/></div></div>
      <div class="auth-error" id="login-error" role="alert"></div>
      <button type="button" class="auth-btn auth-btn-primary" id="login-btn" data-csp-action="Portal.requestPasswordReset"><i class="fas fa-paper-plane"></i> ارسال کد بازیابی</button>
      <button type="button" class="auth-btn auth-btn-ghost" data-csp-action="Portal.backToLogin">بازگشت به ورود</button>
    </div>`
  },

  _signupOtpStep(phone) {
    const mask = phone ? `${phone.slice(0, 4)}•••${phone.slice(-4)}` : ''
    return `<div class="auth-form">
      <p class="auth-otp-meta">برای تکمیل ثبت‌نام، کد ارسال‌شده به <strong dir="ltr">${Utils.escapeHtml(mask)}</strong> را وارد کنید.</p>
      <div class="auth-field"><label class="auth-label" for="signup-otp">کد ۶ رقمی</label><div class="auth-input-wrap"><i class="fas fa-shield-alt"></i><input id="signup-otp" class="ltr auth-otp-input" dir="ltr" inputmode="numeric" maxlength="6" autocomplete="one-time-code" autofocus/></div></div>
      <div class="auth-error" id="login-error" role="alert"></div>
      <button type="button" class="auth-btn auth-btn-primary" id="login-btn" data-csp-action="Portal.verifySignup"><i class="fas fa-check"></i> تأیید و تکمیل ثبت‌نام</button>
      <button type="button" class="auth-btn auth-btn-ghost" data-csp-action="Portal.showSignup">اصلاح اطلاعات ثبت‌نام</button>
    </div>`
  },

  _resetStep(phone) {
    const mask = phone ? `${phone.slice(0, 4)}•••${phone.slice(-4)}` : ''
    return `<div class="auth-form">
      <p class="auth-otp-meta">کد بازیابی ارسال‌شده به <strong dir="ltr">${Utils.escapeHtml(mask)}</strong> را وارد کنید.</p>
      <div class="auth-field"><label class="auth-label" for="reset-otp">کد ۶ رقمی</label><div class="auth-input-wrap"><i class="fas fa-shield-alt"></i><input id="reset-otp" class="ltr auth-otp-input" dir="ltr" inputmode="numeric" maxlength="6" autocomplete="one-time-code"/></div></div>
      <div class="auth-field"><label class="auth-label" for="reset-password">رمز جدید</label><div class="auth-input-wrap"><i class="fas fa-key"></i><input type="password" id="reset-password" class="ltr" dir="ltr" autocomplete="new-password"/></div></div>
      <div class="auth-field"><label class="auth-label" for="reset-password-confirm">تکرار رمز جدید</label><div class="auth-input-wrap"><i class="fas fa-check"></i><input type="password" id="reset-password-confirm" class="ltr" dir="ltr" autocomplete="new-password"/></div></div>
      <div class="auth-error" id="login-error" role="alert"></div>
      <button type="button" class="auth-btn auth-btn-primary" id="login-btn" data-csp-action="Portal.completePasswordReset"><i class="fas fa-unlock"></i> ثبت رمز جدید</button>
      <button type="button" class="auth-btn auth-btn-ghost" data-csp-action="Portal.showForgot">ارسال دوباره کد</button>
    </div>`
  },

  _portalVerifyStep(phone) {
    const mask = phone ? `${phone.slice(0, 4)}•••${phone.slice(-4)}` : ''
    return `
      <div class="auth-form">
        <p class="auth-otp-meta">کد دعوت جداگانه به <strong dir="ltr">${Utils.escapeHtml(mask)}</strong> ارسال شده است.</p>
        <div class="auth-field">
          <label class="auth-label" for="portal-invite-otp">کد دعوت ۶ رقمی</label>
          <div class="auth-input-wrap">
            <i class="fas fa-envelope-open-text"></i>
            <input type="text" id="portal-invite-otp" class="ltr auth-otp-input" dir="ltr" inputmode="numeric" maxlength="6" placeholder="123456" autofocus/>
          </div>
        </div>
        <div class="auth-error" id="login-error"></div>
        <button type="button" class="auth-btn auth-btn-primary" id="login-btn" data-csp-action="Portal.verifyPortalInvite"><i class="fas fa-check"></i> تأیید دعوت و ورود</button>
        <button type="button" class="auth-btn auth-btn-ghost" data-csp-action="Portal.backToLogin"><i class="fas fa-arrow-right"></i> بازگشت</button>
      </div>`
  },

  _otpStep(phone) {
    const mask = phone ? `${phone.slice(0, 4)}•••${phone.slice(-4)}` : ''
    const pending = UnifiedLogin?.getPending?.()
    return `
      <div class="auth-form">
        <p class="auth-otp-meta">کد به <strong dir="ltr">${Utils.escapeHtml(mask)}</strong>${pending?.label ? ` · ${Utils.escapeHtml(pending.label)}` : ''}</p>
        <div class="auth-field">
          <label class="auth-label" for="login-otp">کد ۶ رقمی</label>
          <div class="auth-input-wrap">
            <i class="fas fa-key"></i>
            <input type="text" id="login-otp" class="ltr auth-otp-input" dir="ltr" inputmode="numeric" maxlength="6" autocomplete="one-time-code" placeholder="123456" autofocus/>
          </div>
        </div>
        <div class="auth-error" id="login-error"></div>
        <button type="button" class="auth-btn auth-btn-primary" id="login-btn" data-csp-action="Portal.verifyOtp"><i class="fas fa-check"></i> تأیید و ورود</button>
        <button type="button" class="auth-btn auth-btn-ghost" data-csp-action="Portal.backToLogin"><i class="fas fa-arrow-right"></i> بازگشت</button>
      </div>`
  },

  _consultationStep(phone) {
    const mask = phone ? `${phone.slice(0, 4)}•••${phone.slice(-4)}` : ''
    return `
      <div class="auth-form">
        <p class="auth-otp-meta">شماره <strong dir="ltr">${Utils.escapeHtml(mask)}</strong> در سیستم نیست — وقت مشاوره رزرو کنید.</p>
        <div class="auth-field">
          <label class="auth-label" for="cons-name">نام</label>
          <div class="auth-input-wrap"><i class="fas fa-user"></i><input type="text" id="cons-name" placeholder="نام و نام خانوادگی" autofocus/></div>
        </div>
        <div id="auth-booking-root"></div>
        <div class="auth-field">
          <label class="auth-label" for="cons-notes">توضیح (اختیاری)</label>
          <div class="auth-input-wrap"><i class="fas fa-comment"></i><input type="text" id="cons-notes" placeholder="نوع مراسم..."/></div>
        </div>
        <div class="auth-error" id="login-error"></div>
        <button type="button" class="auth-btn auth-btn-primary" data-csp-action="Portal.saveConsultation"><i class="fas fa-calendar-check"></i> ثبت درخواست</button>
        <button type="button" class="auth-btn auth-btn-ghost" data-csp-action="Portal.backToLogin">انصراف</button>
      </div>`
  },

  _doneStep() {
    return `
      <div class="auth-card--success">
        <div class="auth-success-icon"><i class="fas fa-check-circle"></i></div>
        <h2 class="auth-success-title">ثبت شد</h2>
        <p class="auth-success-text">درخواست مشاوره به مدیریت ارسال شد.</p>
        <button type="button" class="auth-btn auth-btn-primary" data-csp-action="Portal.backToLogin">بازگشت</button>
      </div>`
  },

  setLoginMethod(method) {
    this.state._phone = Utils.normalizePhone(document.getElementById('login-phone')?.value || this.state._phone)
    this.state.notice = ''
    this.state.loginMethod = method
    this.renderAuth()
  },

  async oauthLogin(provider) {
    const errorEl = document.getElementById('login-error')
    if (errorEl) errorEl.textContent = ''
    const result = await Cloud?.signInWithOAuth?.(provider)
    if (!result?.ok && errorEl) errorEl.textContent = result?.error || 'شروع ورود امن ناموفق بود'
  },

  _bindStepKeys(step) {
    if (step === 'login') {
      document.getElementById('login-phone')?.addEventListener('keydown', e => {
        if (e.key === 'Enter') Portal[this.state.loginMethod === 'password' ? 'loginPassword' : 'sendOtp']()
      })
      document.getElementById('login-password')?.addEventListener('keydown', e => {
        if (e.key === 'Enter') Portal.loginPassword()
      })
    }
    if (step === 'otp') {
      document.getElementById('login-otp')?.addEventListener('keydown', e => {
        if (e.key === 'Enter') Portal.verifyOtp()
      })
    }
    if (step === 'portal_verify') {
      document.getElementById('portal-invite-otp')?.addEventListener('keydown', e => {
        if (e.key === 'Enter') Portal.verifyPortalInvite()
      })
    }
    if (step === 'signup') {
      for (const id of ['signup-name', 'signup-studio', 'signup-phone', 'signup-email', 'signup-password', 'signup-password-confirm']) {
        document.getElementById(id)?.addEventListener('keydown', e => { if (e.key === 'Enter') Portal.registerAccount() })
      }
    }
    if (step === 'signup_otp') {
      document.getElementById('signup-otp')?.addEventListener('keydown', e => { if (e.key === 'Enter') Portal.verifySignup() })
    }
    if (step === 'forgot') {
      document.getElementById('reset-phone')?.addEventListener('keydown', e => { if (e.key === 'Enter') Portal.requestPasswordReset() })
    }
    if (step === 'reset') {
      for (const id of ['reset-otp', 'reset-password', 'reset-password-confirm']) {
        document.getElementById(id)?.addEventListener('keydown', e => { if (e.key === 'Enter') Portal.completePasswordReset() })
      }
    }
  },

  _err(msg) {
    const el = document.getElementById('login-error')
    if (el) { el.textContent = msg; el.style.display = 'block' }
  },

  _clearErr() {
    const el = document.getElementById('login-error')
    if (el) el.style.display = 'none'
  },

  _setBtn(loading, label) {
    const btn = document.getElementById('login-btn')
    if (!btn) return
    btn.disabled = loading
    btn.innerHTML = loading ? '<i class="fas fa-spinner fa-spin"></i>...' : label
  },

  backToLogin() {
    UnifiedLogin?.clearPending?.()
    ConsultationBooking?.reset?.()
    this.state.step = 'login'
    if (!this.state.notice) this.state._phone = ''
    this.renderAuth()
  },

  showSignup() {
    this.state.notice = ''
    this.state.step = 'signup'
    this.renderAuth()
  },

  showForgot() {
    this.state.notice = ''
    this.state.step = 'forgot'
    this.renderAuth()
  },

  async registerAccount() {
    this._clearErr()
    const name = document.getElementById('signup-name')?.value?.trim() || ''
    const studioName = document.getElementById('signup-studio')?.value?.trim() || ''
    const phone = Utils.normalizePhone(document.getElementById('signup-phone')?.value)
    const email = document.getElementById('signup-email')?.value?.trim() || ''
    const password = Utils.normalizePassword(document.getElementById('signup-password')?.value)
    const confirm = Utils.normalizePassword(document.getElementById('signup-password-confirm')?.value)
    if (!name || !studioName) { this._err('نام مدیر و نام استودیو الزامی است'); return }
    if (!Utils.isValidPhone(phone)) { this._err('شماره موبایل نامعتبر است'); return }
    if (!/^\S+@\S+\.\S+$/.test(email)) { this._err('ایمیل معتبر وارد کنید'); return }
    const pwError = Auth.validatePassword(password)
    if (pwError) { this._err(pwError); return }
    if (password !== confirm) { this._err('رمز اولیه و تکرار آن یکسان نیست'); return }
    if (typeof Cloud === 'undefined' || !Cloud.isConfigured?.()) {
      this._err('ثبت‌نام سرور در این استقرار پیکربندی نشده است')
      return
    }
    this._setBtn(true, '')
    let result
    try {
      result = await Cloud.signUp({ email, password, phone, name, studioName })
    } catch {
      result = { ok: false, error: 'ارتباط با سرویس ثبت‌نام قطع شد؛ دوباره تلاش کنید' }
    }
    this._setBtn(false, '<i class="fas fa-user-plus"></i> ثبت‌نام')
    if (!result.ok) { this._err(result.error || 'ثبت‌نام انجام نشد'); return }
    this.state._phone = phone
    if (result.needsPhoneConfirm) {
      this.state.signupPending = { phone, name, studioName }
      this.state.step = 'signup_otp'
      this.renderAuth()
      return
    }
    await Cloud.signOut()
    this.state.loginMethod = 'password'
    this.state.notice = 'ثبت‌نام با موفقیت انجام شد. اکنون با شماره موبایل و رمز اولیه وارد شوید.'
    this.state.step = 'login'
    this.renderAuth()
  },

  async verifySignup() {
    this._clearErr()
    const pending = this.state.signupPending
    const code = Utils.faToEn(String(document.getElementById('signup-otp')?.value || '')).replace(/\D/g, '')
    if (!pending?.phone || !/^\d{6}$/.test(code)) { this._err('کد ثبت‌نام باید ۶ رقم باشد'); return }
    this._setBtn(true, '')
    try {
      const verified = await Cloud.verifyPhoneOtp(pending.phone, code)
      if (!verified.ok) { this._err('کد نامعتبر یا منقضی است'); return }
      const registered = await Cloud.registerCurrentStudio({ studioName: pending.studioName, phone: pending.phone, name: pending.name })
      if (!registered.ok) { this._err(registered.error || 'ساخت عضویت استودیو انجام نشد'); return }
      await Cloud.signOut()
      this.state.signupPending = null
      this.state.loginMethod = 'password'
      this.state.notice = 'ثبت‌نام کامل شد. اکنون با رمز اولیه وارد شوید.'
      this.state.step = 'login'
      this.renderAuth()
    } finally {
      this._setBtn(false, '<i class="fas fa-check"></i> تأیید و تکمیل ثبت‌نام')
    }
  },

  async requestPasswordReset() {
    this._clearErr()
    const phone = Utils.normalizePhone(document.getElementById('reset-phone')?.value)
    if (!Utils.isValidPhone(phone)) { this._err('شماره موبایل نامعتبر است'); return }
    this._setBtn(true, '')
    const result = await PasswordReset.sendOtp(phone)
    this._setBtn(false, '<i class="fas fa-paper-plane"></i> ارسال کد بازیابی')
    if (!result.ok) { this._err(result.error || 'درخواست بازیابی انجام نشد'); return }
    this.state._phone = phone
    this.state.step = 'reset'
    this.renderAuth()
  },

  async completePasswordReset() {
    this._clearErr()
    const code = Utils.faToEn(String(document.getElementById('reset-otp')?.value || '')).replace(/\D/g, '')
    const password = Utils.normalizePassword(document.getElementById('reset-password')?.value)
    const confirm = Utils.normalizePassword(document.getElementById('reset-password-confirm')?.value)
    if (!/^\d{6}$/.test(code)) { this._err('کد بازیابی باید ۶ رقم باشد'); return }
    const pwError = Auth.validatePassword(password)
    if (pwError) { this._err(pwError); return }
    if (password !== confirm) { this._err('رمز جدید و تکرار آن یکسان نیست'); return }
    this._setBtn(true, '')
    const result = await PasswordReset.verifyAndReset(this.state._phone, code, password)
    this._setBtn(false, '<i class="fas fa-unlock"></i> ثبت رمز جدید')
    if (!result.ok) { this._err(result.error || 'بازیابی رمز انجام نشد'); return }
    this.state.loginMethod = 'password'
    this.state.notice = 'رمز جدید ثبت شد. اکنون وارد شوید.'
    this.state.step = 'login'
    this.renderAuth()
  },

  async loginPassword() {
    this._clearErr()
    const phone = Utils.normalizePhone(document.getElementById('login-phone')?.value?.trim())
    const password = Utils.normalizePassword(document.getElementById('login-password')?.value)
    if (!Utils.isValidPhone(phone)) { this._err('شماره موبایل نامعتبر است'); return }

    if (AppConfig.allowsLocalIdentity?.()) {
      const resolved = UnifiedLogin.resolvePhone(phone)
      if (resolved.kind === 'customer') {
        this._err('مشتریان با پیامک وارد می‌شوند — تب «پیامک» را بزنید')
        return
      }
      if (resolved.kind === 'guest') {
        this._err('اطلاعات ورود نامعتبر است')
        return
      }
    }

    this._setBtn(true, '')
    const result = await UnifiedLogin.loginWithPassword(phone, password)
    this._setBtn(false, '<i class="fas fa-sign-in-alt"></i> ورود')

    if (!result.ok) { this._err(result.error || 'خطا'); return }

    const finish = () => {
      const safe = Utils.safeAppRedirect?.(result.url)
      window.location.href = safe || result.url || 'index.html'
    }
    if (typeof PortalInvite !== 'undefined' && PortalInvite.needsOtpVerification(result.user)) {
      PortalInvite.gateAfterLogin(result.user, finish)
      return
    }
    finish()
  },

  async sendOtp() {
    this._clearErr()
    const phone = Utils.normalizePhone(document.getElementById('login-phone')?.value?.trim())
    if (!Utils.isValidPhone(phone)) { this._err('شماره موبایل نامعتبر است'); return }

    this._setBtn(true, '')
    const result = await UnifiedLogin.sendOtp(phone)
    this._setBtn(false, '<i class="fas fa-paper-plane"></i> ارسال کد')

    if (!result.ok) { this._err(result.error || 'خطا'); return }
    if (result.demoCode) Utils.toast(`کد تست: ${result.demoCode}`, 'info', 10000)

    this.state.step = 'otp'
    this.state._phone = phone
    this.renderAuth()
  },

  async verifyOtp() {
    this._clearErr()
    const phone = this.state._phone || UnifiedLogin.getPending()?.phone
    const code = document.getElementById('login-otp')?.value
    if (!phone) { this.backToLogin(); return }

    this._setBtn(true, '')
    const result = await UnifiedLogin.verifyOtp(phone, code)
    this._setBtn(false, '<i class="fas fa-check"></i> تأیید و ورود')

    if (!result.ok) { this._err(result.error || 'خطا'); return }

    if (result.next === 'consultation') {
      this.state.step = 'consultation'
      this.state._phone = phone
      this.renderAuth()
      return
    }

    if (result.next === 'portal_verify') {
      this.state.step = 'portal_verify'
      this.state._phone = phone
      this.renderAuth()
      return
    }

    const safe = Utils.safeAppRedirect?.(result.url)
    window.location.href = safe || result.url || 'index.html'
  },

  async verifyPortalInvite() {
    this._clearErr()
    const phone = this.state._phone || UnifiedLogin.getPending()?.phone
    const code = document.getElementById('portal-invite-otp')?.value
    if (!phone) { this.backToLogin(); return }

    this._setBtn(true, '')
    const result = await UnifiedLogin.verifyPortalInviteCode(phone, code)
    this._setBtn(false, '<i class="fas fa-check"></i> تأیید دعوت و ورود')

    if (!result.ok) { this._err(result.error || 'خطا'); return }

    const safe = Utils.safeAppRedirect?.(result.url)
    window.location.href = safe || result.url || 'index.html'
  },

  saveConsultation() {
    this._clearErr()
    const phone = this.state._phone || UnifiedLogin.getPending()?.phone
    const sel = ConsultationBooking.getSelection()
    const result = UnifiedLogin.saveConsultation({
      phone,
      name: document.getElementById('cons-name')?.value,
      date: sel.date,
      time: sel.time,
      notes: document.getElementById('cons-notes')?.value
    })
    if (!result.ok) { this._err(result.error); return }
    this.state.step = 'done'
    this.renderAuth()
  },

  logout() {
    Auth.logout()
    CustomerSession?.clear?.()
    UnifiedLogin?.clearPending?.()
    window.location.href = 'index.html?logout=1'
  }
}

window.Portal = Portal

document.addEventListener('DOMContentLoaded', () => {
  Bootstrap.start(async () => {
    if (typeof Studio !== 'undefined') Studio.ensureIdentity()
    await Portal.init()
  })
})
