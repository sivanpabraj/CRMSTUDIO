/* Studio M — ورود واحد · شناسایی خودکار از DB */
const Portal = {
  state: { currentUser: null, currentSection: 'overview', authTab: 'login', step: 'login', loginMethod: 'password', regType: 'studio', _phone: '' },

  async init() {
    const params = new URLSearchParams(location.search)
    if (params.get('logout') === '1') {
      Auth.logout()
      CustomerSession?.clear?.()
      params.delete('logout')
      history.replaceState(null, '', location.pathname + (params.toString() ? `?${params}` : ''))
    }

    await DB.ready

    const tabParam = params.get('tab')
    if (tabParam === 'register' || location.hash === '#register') {
      this.state.authTab = 'register'
    } else {
      this.state.authTab = 'login'
    }

    const isExplicitRegister = tabParam === 'register' || location.hash === '#register'
    if (Auth.isLoggedIn() && !isExplicitRegister) {
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

    const pending = typeof UnifiedLogin !== 'undefined' ? UnifiedLogin.getPending?.() : null
    if (pending?.phone) {
      this.state._phone = pending.phone
      if (pending.portalVerify) this.state.step = 'portal_verify'
      else this.state.step = pending.verified ? 'consultation' : 'otp'
    }

    this.renderAuth()
  },

  _studio() { return (typeof DB !== 'undefined' && DB.get) ? (DB.get('studioInfo') || {}) : {} },

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

  submitPasswordLogin() {
    return this.loginPassword()
  },

  renderAuth(force = false) {
    document.body.classList.add('auth-screen')
    const studio = this._studio()
    const authTab = this.state.authTab || 'login'
    const step = this.state.step || 'login'
    const phone = this.state._phone || (typeof UnifiedLogin !== 'undefined' ? UnifiedLogin.getPending?.()?.phone : '') || ''
    const title = this._authTitle(studio)

    document.title = title === 'ورود' ? 'ورود و ثبت‌نام استودیو' : `${title} — ورود و ثبت‌نام`

    // جلوگیری قطعی از پرش صفحه (Screen Jump / Flicker):
    // اگر کارت قبلاً در صفحه وجود دارد و در مرحله ورود هستیم، فقط تب را عوض کن بدون تخریب DOM
    const loginView = document.getElementById('auth-login-view')
    const regView = document.getElementById('auth-register-view')

    if (!force && step === 'login' && loginView && regView) {
      this.setAuthTab(authTab)
      window.AuthAmbient?.mount?.()
      return
    }

    this._lastRenderedTab = authTab
    this._lastRenderedStep = step

    const subText = step === 'otp' ? 'کد ۶ رقمی را وارد کنید'
      : step === 'portal_verify' ? 'کد دعوت پرتال'
      : step === 'consultation' ? 'رزرو وقت مشاوره'
      : step === 'done' ? 'ثبت شد'
      : (authTab === 'register' ? 'اطلاعات استودیو و مدیر را برای ساخت پنل وارد کنید' : (this.state.loginMethod === 'password' ? 'شماره موبایل و رمز عبور خود را وارد کنید' : 'با شماره موبایل و کد پیامک وارد شوید'))

    const mainBody = step === 'login' ? `
      <div class="auth-method-tabs auth-cinema-tabs" style="margin-bottom:20px">
        <button type="button" id="tab-btn-login" class="auth-method-tab auth-cinema-tab ${authTab === 'login' ? 'auth-method-tab--active' : ''}" onclick="Portal.setAuthTab('login')">
          <i class="fas fa-sign-in-alt"></i> ورود به سیستم
        </button>
        <button type="button" id="tab-btn-register" class="auth-method-tab auth-cinema-tab ${authTab === 'register' ? 'auth-method-tab--active' : ''}" onclick="Portal.setAuthTab('register')">
          <i class="fas fa-user-plus"></i> ثبت‌نام استودیو
        </button>
      </div>
      <div id="auth-login-view" class="auth-form" style="display:${authTab === 'login' ? 'block' : 'none'}">
        ${this._loginFields()}
      </div>
      <div id="auth-register-view" class="auth-form" style="display:${authTab === 'register' ? 'block' : 'none'}">
        ${this._registerFields()}
      </div>`
      : (step === 'otp' ? this._otpStep(phone)
        : step === 'portal_verify' ? this._portalVerifyStep(phone)
        : step === 'consultation' ? this._consultationStep(phone)
        : this._doneStep())

    document.getElementById('portal-app').innerHTML = `
      <div class="auth-page auth-page--cinema">
        <canvas class="auth-ambient" data-auth-ambient aria-hidden="true"></canvas>
        <div class="auth-ambient-fallback" aria-hidden="true"></div>

        <div class="auth-cinema-container">
          <!-- ستون برند و ویترین استودیو -->
          <div class="auth-cinema-hero">
            <div class="auth-hero-badge">
              <span class="auth-hero-badge-dot"></span>
              <i class="fas fa-camera"></i>
              <span>Studio ERP v1.0 • نسل جدید</span>
            </div>

            <h1 class="auth-hero-title">
              اکوسیستم یکپارچه<br>
              <span class="auth-hero-title-accent">مدیریت آتلیه و استودیو</span>
            </h1>

            <p class="auth-hero-subtitle">
              بستری هوشمند و اختصاصی برای قراردادهای دیجیتال، زمان‌بندی آفیش، حسابداری یکپارچه و تحویل فایل مشتریان.
            </p>

            <div class="auth-hero-cards">
              <div class="auth-hero-card">
                <div class="auth-hero-card-icon"><i class="fas fa-film"></i></div>
                <div class="auth-hero-card-content">
                  <strong>مدیریت آفیش و تایم‌لاین عکاسی</strong>
                  <span>برنامه‌ریزی عکاسان، ادیتورها، لوکیشن و تجهیزات</span>
                </div>
              </div>

              <div class="auth-hero-card">
                <div class="auth-hero-card-icon"><i class="fas fa-coins"></i></div>
                <div class="auth-hero-card-content">
                  <strong>قرارداد دیجیتال و حسابداری دقیق</strong>
                  <span>محاسبه اقساط، فاکتور هوشمند و ثبت تراکنش‌ها</span>
                </div>
              </div>

              <div class="auth-hero-card">
                <div class="auth-hero-card-icon"><i class="fas fa-shield-alt"></i></div>
                <div class="auth-hero-card-content">
                  <strong>پایداری و امنیت داده سطح سازمانی</strong>
                  <span>پایگاه داده محلی سریع + اتصال امن به سرور ایران</span>
                </div>
              </div>
            </div>

            <div class="auth-hero-footer">
              <div class="auth-hero-avatars">
                <span class="auth-avatar-circle" style="background:#D97706">م</span>
                <span class="auth-avatar-circle" style="background:#4F46E5">ن</span>
                <span class="auth-avatar-circle" style="background:#059669">آ</span>
                <span class="auth-avatar-circle" style="background:#2563EB">س</span>
              </div>
              <div class="auth-hero-stats">
                <strong>مورد اعتماد برترین استودیوها و آتلیه‌های کشور</strong>
                <small><i class="fas fa-circle" style="color:#22c55e;font-size:7px"></i> سرور ایران پرسرعت و پایدار</small>
              </div>
            </div>
          </div>

          <!-- ستون کارت ورود و فرم -->
          <div class="auth-cinema-form-wrap ${authTab === 'register' && step === 'login' ? 'auth-unified-wrap--wide' : ''}" id="auth-card-wrap">
            <div class="auth-card glass-panel auth-cinema-card">
              <div class="auth-cinema-head">
                <div class="auth-cinema-logo">${this._logoHtml(studio)}</div>
                <h2 class="auth-cinema-title" id="auth-title-text">${Utils.escapeHtml(title === 'ورود' ? 'ورود به مدیریت استودیو' : title)}</h2>
                <p class="auth-cinema-sub" id="auth-sub-text">${subText}</p>
              </div>
              ${mainBody}
              <div class="auth-cinema-foot"><a href="site.html"><i class="fas fa-home"></i> صفحه اصلی استودیو</a></div>
            </div>
          </div>
        </div>
      </div>`

    window.AuthAmbient?.mount?.()
    this._bindStepKeys(step, authTab)
    if (step === 'login' && authTab === 'register' && typeof PasswordSecurity !== 'undefined' && PasswordSecurity.bind) {
      PasswordSecurity.bind('reg-password', 'reg')
    }
    if (step === 'consultation') {
      ConsultationBooking.reset()
      ConsultationBooking.render('auth-booking-root')
    }
  },

  setAuthTab(tab) {
    if (this.state.authTab === tab && this.state.step === 'login') return
    this.state.authTab = tab
    this.state.step = 'login'
    try {
      const url = new URL(location.href)
      if (tab === 'register') {
        url.searchParams.set('tab', 'register')
      } else {
        url.searchParams.delete('tab')
      }
      history.replaceState(null, '', url.pathname + (url.search ? url.search : '') + url.hash)
    } catch { /* ignore */ }

    const loginView = document.getElementById('auth-login-view')
    const regView = document.getElementById('auth-register-view')
    const tabLogin = document.getElementById('tab-btn-login')
    const tabReg = document.getElementById('tab-btn-register')
    const wrap = document.getElementById('auth-card-wrap') || document.querySelector('.auth-cinema-form-wrap') || document.querySelector('.auth-unified-wrap')
    const subTextEl = document.getElementById('auth-sub-text') || document.querySelector('.auth-cinema-sub') || document.querySelector('.auth-sub')

    if (loginView && regView) {
      if (tab === 'register') {
        loginView.style.display = 'none'
        regView.style.display = 'block'
        if (tabLogin) tabLogin.className = 'auth-method-tab auth-cinema-tab'
        if (tabReg) tabReg.className = 'auth-method-tab auth-cinema-tab auth-method-tab--active'
        if (wrap) wrap.classList.add('auth-unified-wrap--wide')
        if (subTextEl) subTextEl.textContent = 'اطلاعات استودیو و مدیر را برای ساخت پنل وارد کنید'
        if (typeof PasswordSecurity !== 'undefined' && PasswordSecurity.bind) {
          PasswordSecurity.bind('reg-password', 'reg')
        }
        document.getElementById('reg-studio-name')?.focus()
      } else {
        regView.style.display = 'none'
        loginView.style.display = 'block'
        if (tabReg) tabReg.className = 'auth-method-tab auth-cinema-tab'
        if (tabLogin) tabLogin.className = 'auth-method-tab auth-cinema-tab auth-method-tab--active'
        if (wrap) wrap.classList.remove('auth-unified-wrap--wide')
        const isPw = this.state.loginMethod === 'password'
        if (subTextEl) subTextEl.textContent = isPw ? 'شماره موبایل و رمز عبور خود را وارد کنید' : 'با شماره موبایل و کد پیامک وارد شوید'
        document.getElementById('login-identifier')?.focus()
      }
      this._lastRenderedTab = tab
      this._lastRenderedStep = 'login'
      this._bindStepKeys('login', tab)
      return
    }

    this.renderAuth(true)
  },

  togglePasswordVisibility(inputId = 'login-password', iconId = 'pw-eye-icon') {
    const input = document.getElementById(inputId)
    const icon = document.getElementById(iconId)
    if (!input) return
    if (input.type === 'password') {
      input.type = 'text'
      if (icon) icon.className = 'fas fa-eye-slash'
    } else {
      input.type = 'password'
      if (icon) icon.className = 'fas fa-eye'
    }
  },

  _loginFields() {
    const isPw = this.state.loginMethod === 'password'
    const params = new URLSearchParams(location.search)
    const showHint = params.get('fresh') === '1' ? this._firstSetupHintHtml() : ''
    return `
      ${showHint}
      <div class="auth-field">
        <label class="auth-label" for="login-identifier">شماره موبایل یا ایمیل</label>
        <div class="auth-input-wrap">
          <i class="fas fa-user-circle"></i>
          <input type="text" id="login-identifier" class="ltr" dir="ltr" autocomplete="username" placeholder="0912... یا name@gmail.com" autofocus oninput="Portal.onIdentifierInput(this.value)"/>
        </div>
        <div id="login-role-chip" class="auth-role-chip" style="display:none"></div>
      </div>
      ${isPw ? `
      <div class="auth-field" id="login-pw-field">
        <label class="auth-label" for="login-password">رمز عبور</label>
        <div class="auth-input-wrap">
          <i class="fas fa-lock"></i>
          <input type="password" id="login-password" class="ltr" dir="ltr" autocomplete="current-password" placeholder="رمز عبور خود را وارد کنید"/>
          <button type="button" class="auth-pw-toggle" onclick="Portal.togglePasswordVisibility('login-password', 'pw-eye-icon')" title="نمایش/پنهان‌سازی رمز" tabindex="-1">
            <i class="fas fa-eye" id="pw-eye-icon"></i>
          </button>
        </div>
      </div>` : ''}
      <div class="auth-error" id="login-error"></div>
      <button type="button" class="auth-btn auth-btn-primary" id="login-btn" onclick="Portal.${isPw ? 'loginPassword' : 'sendOtp'}()">
        <i class="fas fa-${isPw ? 'sign-in-alt' : 'paper-plane'}"></i> <span id="login-btn-label">${isPw ? 'ورود به پنل استودیو' : 'ارسال کد پیامکی'}</span>
      </button>

      <div style="display:flex;justify-content:center;align-items:center;margin-top:16px;padding-top:12px;border-top:1px solid rgba(255,255,255,0.07)">
        <button type="button" class="auth-sms-chip" onclick="Portal.setLoginMethod('${isPw ? 'sms' : 'password'}')">
          ${isPw ? '<i class="fas fa-sms"></i> ورود با پیامک یک‌بار مصرف' : '<i class="fas fa-key"></i> ورود با رمز عبور'}
        </button>
      </div>`
  },

  _loginStep() {
    return `<div class="auth-form">${this._loginFields()}</div>`
  },

  setRegType(type) {
    this.state.regType = type
    const regView = document.getElementById('auth-register-view') || document.querySelector('.auth-form')
    if (regView && this.state.authTab === 'register') {
      regView.innerHTML = this._registerFields()
      return
    }
    this.renderAuth(true)
  },

  _registerFields() {
    const isStaff = this.state.regType === 'staff'
    return `
      <div style="display:flex;gap:6px;margin-bottom:16px;background:rgba(255,255,255,0.05);padding:4px;border-radius:10px;border:1px solid rgba(255,255,255,0.08)">
        <button type="button" class="auth-method-tab ${!isStaff ? 'auth-method-tab--active' : ''}" onclick="Portal.setRegType('studio')" style="flex:1;font-size:12px;padding:8px;border-radius:7px;display:flex;align-items:center;justify-content:center;gap:6px">
          <i class="fas fa-crown"></i> ثبت استودیو جدید
        </button>
        <button type="button" class="auth-method-tab ${isStaff ? 'auth-method-tab--active' : ''}" onclick="Portal.setRegType('staff')" style="flex:1;font-size:12px;padding:8px;border-radius:7px;display:flex;align-items:center;justify-content:center;gap:6px">
          <i class="fas fa-id-badge"></i> عضویت پرسنل (اتصال به استودیو)
        </button>
      </div>

      ${isStaff ? `
        <!-- فرم عضویت پرسنل و همکار -->
        <div class="auth-grid-2col">
          <div class="auth-field">
            <label class="auth-label" for="reg-staff-name">نام و نام‌خانوادگی همکار</label>
            <div class="auth-input-wrap">
              <i class="fas fa-user"></i>
              <input type="text" id="reg-staff-name" placeholder="مثلاً سارینا طهمازی" autofocus/>
            </div>
          </div>
          <div class="auth-field">
            <label class="auth-label" for="reg-staff-phone">شماره همراه همکار (جهت ورود)</label>
            <div class="auth-input-wrap">
              <i class="fas fa-mobile-alt"></i>
              <input type="tel" id="reg-staff-phone" class="ltr" dir="ltr" inputmode="numeric" placeholder="09121234567"/>
            </div>
          </div>
        </div>

        <div class="auth-grid-2col">
          <div class="auth-field">
            <label class="auth-label" for="reg-staff-role">نقش و تخصص در استودیو</label>
            <div class="auth-input-wrap">
              <i class="fas fa-camera"></i>
              <select id="reg-staff-role" style="background:transparent;border:none;color:#fff;width:100%;outline:none;font-family:inherit;font-size:13px;padding:8px 4px">
                <option value="photographer" style="background:#1e1e24;color:#fff">عکاس (آتلیه و مراسم)</option>
                <option value="videographer" style="background:#1e1e24;color:#fff">تصویربردار / فیلمبردار</option>
                <option value="editor" style="background:#1e1e24;color:#fff">تدوین‌گر و ادیتور فیلم</option>
                <option value="album_designer" style="background:#1e1e24;color:#fff">طراح آلبوم ژورنال</option>
                <option value="colorist" style="background:#1e1e24;color:#fff">اصلاح رنگ و نور (داوینچی)</option>
                <option value="office_secretary" style="background:#1e1e24;color:#fff">مسئول دفتر و پذیرش مراجعین</option>
              </select>
            </div>
          </div>
          <div class="auth-field">
            <label class="auth-label" for="reg-staff-code" style="color:#f59e0b">کد اختصاصی اتصال به استودیو</label>
            <div class="auth-input-wrap" style="border-color:rgba(245,158,11,0.5)">
              <i class="fas fa-key" style="color:#f59e0b"></i>
              <input type="text" id="reg-staff-code" class="ltr uppercase" dir="ltr" maxlength="12" placeholder="مثلاً R543WD" style="letter-spacing:2px;font-weight:700;color:#f59e0b"/>
            </div>
          </div>
        </div>

        <div class="auth-grid-2col">
          <div class="auth-field">
            <label class="auth-label" for="reg-staff-password">رمز عبور دلخواه همکار</label>
            <div class="auth-input-wrap">
              <i class="fas fa-lock"></i>
              <input type="password" id="reg-staff-password" class="ltr" dir="ltr" lang="en" autocomplete="new-password" placeholder="حداقل ۴ کاراکتر"/>
            </div>
          </div>
          <div class="auth-field">
            <label class="auth-label" for="reg-staff-password-confirm">تکرار رمز عبور</label>
            <div class="auth-input-wrap">
              <i class="fas fa-shield-alt"></i>
              <input type="password" id="reg-staff-password-confirm" class="ltr" dir="ltr" lang="en" autocomplete="new-password" placeholder="تکرار رمز عبور"/>
            </div>
          </div>
        </div>

        <div style="font-size:11.5px;color:rgba(255,255,255,0.55);margin:-4px 0 10px;line-height:1.6">
          <i class="fas fa-info-circle" style="color:#f59e0b"></i> کد اختصاصی استودیو را از مدیریت استودیو دریافت نمایید. درخواست عضویت شما مستقیماً برای مدیر ارسال می‌شود.
        </div>
        <div class="auth-error" id="reg-error"></div>
        <button type="button" class="auth-btn auth-btn-primary" id="reg-btn" onclick="Portal.submitRegisterStaff()" style="margin-top:6px;background:linear-gradient(135deg, #f59e0b 0%, #d97706 100%)">
          <i class="fas fa-paper-plane"></i> ارسال درخواست اتصال به استودیو
        </button>
      ` : `
        <!-- فرم ساخت استودیو جدید -->
        <div class="auth-grid-2col">
          <div class="auth-field">
            <label class="auth-label" for="reg-studio-name">نام استودیو / آتلیه</label>
            <div class="auth-input-wrap">
              <i class="fas fa-store"></i>
              <input type="text" id="reg-studio-name" placeholder="مثلاً استودیو ماندگار" autofocus/>
            </div>
          </div>
          <div class="auth-field">
            <label class="auth-label" for="reg-manager-name">نام و نام خانوادگی مدیر</label>
            <div class="auth-input-wrap">
              <i class="fas fa-user-tie"></i>
              <input type="text" id="reg-manager-name" placeholder="مثلاً علی محمدی"/>
            </div>
          </div>
        </div>

        <div class="auth-grid-2col">
          <div class="auth-field">
            <label class="auth-label" for="reg-phone">شماره همراه مدیر (جهت ورود)</label>
            <div class="auth-input-wrap">
              <i class="fas fa-mobile-alt"></i>
              <input type="tel" id="reg-phone" class="ltr" dir="ltr" inputmode="numeric" placeholder="09121234567"/>
            </div>
          </div>
          <div class="auth-field">
            <label class="auth-label" for="reg-email">ایمیل / جیمیل <small style="opacity:0.65">(جهت بکاپ)</small></label>
            <div class="auth-input-wrap">
              <i class="fas fa-envelope"></i>
              <input type="email" id="reg-email" class="ltr" dir="ltr" placeholder="name@gmail.com"/>
            </div>
          </div>
        </div>

        <div class="auth-grid-2col">
          <div class="auth-field">
            <label class="auth-label" for="reg-password">رمز عبور مدیر</label>
            <div class="auth-input-wrap">
              <i class="fas fa-lock"></i>
              <input type="password" id="reg-password" class="ltr" dir="ltr" lang="en" autocomplete="new-password" placeholder="حداقل ۶ کاراکتر"/>
              <button type="button" class="auth-pw-toggle" onclick="Portal.togglePasswordVisibility('reg-password', 'reg-pw-eye-icon')" title="نمایش رمز" tabindex="-1">
                <i class="fas fa-eye" id="reg-pw-eye-icon"></i>
              </button>
            </div>
          </div>
          <div class="auth-field">
            <label class="auth-label" for="reg-password-confirm">تکرار رمز عبور</label>
            <div class="auth-input-wrap">
              <i class="fas fa-shield-alt"></i>
              <input type="password" id="reg-password-confirm" class="ltr" dir="ltr" lang="en" autocomplete="new-password" placeholder="تکرار رمز عبور"/>
            </div>
          </div>
        </div>
        ${typeof PasswordSecurity !== 'undefined' && PasswordSecurity.meterHtml ? PasswordSecurity.meterHtml('reg') : ''}
        <div class="auth-error" id="reg-error"></div>
        <button type="button" class="auth-btn auth-btn-primary" id="reg-btn" onclick="Portal.submitRegister()" style="margin-top:6px">
          <i class="fas fa-rocket"></i> ساخت و ثبت استودیو
        </button>
      `}

      <div style="margin-top:14px;padding-top:10px;border-top:1px solid rgba(255,255,255,0.07);text-align:center;font-size:13px">
        <span style="color:rgba(255,255,255,0.65)">قبلاً ثبت‌نام کرده‌اید؟ </span>
        <a href="javascript:void(0)" onclick="Portal.setAuthTab('login')" style="color:var(--glass-accent, #F59E0B);font-weight:800;text-decoration:none">
          <i class="fas fa-sign-in-alt"></i> ورود به سیستم
        </a>
      </div>`
  },

  _registerStep() {
    return `<div class="auth-form">${this._registerFields()}</div>`
  },

  async submitRegisterStaff() {
    const errEl = document.getElementById('reg-error')
    const showErr = m => { if (errEl) { errEl.textContent = m; errEl.style.display = 'block' } }
    if (errEl) errEl.style.display = 'none'

    const name = document.getElementById('reg-staff-name')?.value?.trim()
    const phone = Utils.normalizePhone(document.getElementById('reg-staff-phone')?.value)
    const role = document.getElementById('reg-staff-role')?.value || 'photographer'
    const joinCode = (document.getElementById('reg-staff-code')?.value || '').trim().toUpperCase()
    const password = Utils.normalizePassword(document.getElementById('reg-staff-password')?.value)
    const passwordConfirm = Utils.normalizePassword(document.getElementById('reg-staff-password-confirm')?.value)

    if (!name) { showErr('نام و نام‌خانوادگی الزامی است'); return }
    if (!Utils.isValidPhone(phone)) { showErr('شماره موبایل نامعتبر است (مثال: 09121234567)'); return }
    if (!joinCode) { showErr('کد اختصاصی اتصال به استودیو الزامی است'); return }
    if (!password || password.length < 4) { showErr('رمز عبور باید حداقل ۴ کاراکتر باشد'); return }
    if (passwordConfirm && passwordConfirm !== password) { showErr('تکرار رمز عبور مطابقت ندارد'); return }

    const btn = document.getElementById('reg-btn')
    if (btn) {
      btn.disabled = true
      btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> در حال ارسال درخواست...'
    }

    try {
      const res = await fetch('/api/auth/register-staff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, phone, role, joinCode, password })
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok || !j.ok) {
        showErr(j.error || 'خطا در ثبت درخواست')
        if (btn) {
          btn.disabled = false
          btn.innerHTML = '<i class="fas fa-paper-plane"></i> ارسال درخواست اتصال به استودیو'
        }
        return
      }

      Utils.toast(j.message || 'درخواست عضویت شما با موفقیت ثبت شد', 'success', 10000)
      this.state.authTab = 'login'
      this.state.loginMethod = 'password'
      this.renderAuth(true)
      setTimeout(() => {
        const idInput = document.getElementById('login-identifier')
        if (idInput) {
          idInput.value = phone
          this.onIdentifierInput(phone)
        }
        const errElLogin = document.getElementById('login-error')
        if (errElLogin) {
          errElLogin.innerHTML = `
            <div style="font-size:12px;color:#10b981;padding:8px 12px;background:rgba(16,185,129,0.1);border-radius:8px;border:1px solid rgba(16,185,129,0.25)">
              <i class="fas fa-check-circle"></i> درخواست عضویت شما برای «${Utils.escapeHtml(j.studioName || 'استودیو')}» ارسال شد. به محض تأیید مدیر استودیو، می‌توانید با رمز عبور خود وارد شوید.
            </div>`
          errElLogin.style.display = 'block'
        }
      }, 100)
    } catch (e) {
      showErr(e.message || 'خطا در برقراری ارتباط با سرور')
      if (btn) {
        btn.disabled = false
        btn.innerHTML = '<i class="fas fa-paper-plane"></i> ارسال درخواست اتصال به استودیو'
      }
    }
  },

  async submitRegister() {
    const errEl = document.getElementById('reg-error')
    const showErr = m => { if (errEl) { errEl.textContent = m; errEl.style.display = 'block' } }
    if (errEl) errEl.style.display = 'none'

    const studioName = document.getElementById('reg-studio-name')?.value?.trim()
    const managerName = document.getElementById('reg-manager-name')?.value?.trim()
    const phone = Utils.normalizePhone(document.getElementById('reg-phone')?.value)
    const rawEmail = (document.getElementById('reg-email')?.value || '').trim()
    const password = Utils.normalizePassword(document.getElementById('reg-password')?.value)
    const passwordConfirm = Utils.normalizePassword(document.getElementById('reg-password-confirm')?.value)

    if (!studioName) { showErr('نام استودیو الزامی است'); return }
    if (!managerName) { showErr('نام مدیر الزامی است'); return }
    if (!Utils.isValidPhone(phone)) { showErr('شماره موبایل نامعتبر است (مثال: 09121234567)'); return }
    if (rawEmail && !Utils.isValidEmail(rawEmail)) { showErr('ایمیل واردشده نامعتبر است (مثال: name@gmail.com)'); return }
    const email = rawEmail ? Utils.normalizeEmail(rawEmail) : ''
    const pwErr = Auth.validatePassword(password)
    if (pwErr) { showErr(pwErr); return }
    if (passwordConfirm && passwordConfirm !== password) { showErr('تکرار رمز عبور با رمز عبور اصلی تطابق ندارد'); return }

    const btn = document.getElementById('reg-btn')
    if (btn) {
      btn.disabled = true
      btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> در حال ثبت استودیو...'
    }

    try {
      let joinCode
      await SecureDB.runInternalAsync(async () => {
        joinCode = Studio.generateJoinCode()
        await SecureDB.merge('studioInfo', {
          id: 'studio_' + Date.now(),
          name: studioName,
          manager: managerName,
          phone,
          email,
          backupEmail: email,
          joinCode,
          slug: studioName.replace(/\s+/g, '-').slice(0, 24),
          address: '', social: '', logo: '',
          setupCompleted: true,
          smsProxyUrl: ''
        })

        if (!DB.get('banks').length) {
          DB.insert('banks', {
            id: 'bank_cash_' + Date.now(),
            name: 'صندوق نقدی',
            accountNumber: '', shaba: '', card: '',
            balance: 0, color: '#22C55E', icon: '💰'
          })
        }

        const creds = await Auth.hashCredentials(password)
        const existing = DB.find('users', u => (phone && Utils.normalizePhone(u.phone) === phone) || (email && u.email && u.email.toLowerCase() === email.toLowerCase()))
        let user
        if (existing) {
          DB.update('users', existing.id, {
            name: managerName,
            phone,
            email,
            password: creds.password,
            salt: creds.salt,
            roles: ['studio_manager'],
            status: 'active',
            avatar: managerName.charAt(0),
            mustChangePassword: false,
            isDefaultPassword: false,
            profileCompleted: true
          })
          user = DB.find('users', u => u.id === existing.id)
        } else {
          user = DB.insert('users', {
            name: managerName,
            phone,
            email,
            password: creds.password,
            salt: creds.salt,
            roles: ['studio_manager'],
            status: 'active',
            avatar: managerName.charAt(0),
            mustChangePassword: false,
            isDefaultPassword: false,
            profileCompleted: true,
            createdAt: Utils.todayJalali()
          })
        }
        DB.syncPersonnelFromUser(user)
        await DB.flush()
      })

      Utils.applyStudioTitle(studioName)

      if (typeof ServerSync !== 'undefined' && ServerSync.push) {
        try {
          await ServerSync.push({ force: true })
        } catch (syncErr) {
          console.warn('Sync push after registration warning:', syncErr)
        }
      }

      const result = await Auth.login(email || phone, password)
      if (result.ok) {
        Utils.toast?.('استودیو با موفقیت ساخته شد. ورود به پنل...', 'success', 2500)
        setTimeout(() => {
          window.location.href = 'studio-m/'
        }, 500)
      } else {
        Utils.toast?.('استودیو ثبت شد. لطفاً از تب ورود وارد شوید', 'info', 3000)
        this.setAuthTab('login')
      }
    } catch (e) {
      console.error('Portal.submitRegister', e)
      showErr(e?.message || 'خطا در ساخت استودیو')
      if (btn) {
        btn.disabled = false
        btn.innerHTML = '<i class="fas fa-rocket"></i> ساخت و ثبت استودیو'
      }
    }
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
        <button type="button" class="auth-btn auth-btn-primary" id="login-btn" onclick="Portal.verifyPortalInvite()"><i class="fas fa-check"></i> تأیید دعوت و ورود</button>
        <button type="button" class="auth-btn auth-btn-ghost" onclick="Portal.backToLogin()"><i class="fas fa-arrow-right"></i> بازگشت</button>
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
            <input type="text" id="login-otp" class="ltr auth-otp-input" dir="ltr" inputmode="numeric" maxlength="6" placeholder="123456" autofocus/>
          </div>
        </div>
        <div class="auth-error" id="login-error"></div>
        <button type="button" class="auth-btn auth-btn-primary" id="login-btn" onclick="Portal.verifyOtp()"><i class="fas fa-check"></i> تأیید و ورود</button>
        <button type="button" class="auth-btn auth-btn-ghost" onclick="Portal.backToLogin()"><i class="fas fa-arrow-right"></i> بازگشت</button>
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
        <button type="button" class="auth-btn auth-btn-primary" onclick="Portal.saveConsultation()"><i class="fas fa-calendar-check"></i> ثبت درخواست</button>
        <button type="button" class="auth-btn auth-btn-ghost" onclick="Portal.backToLogin()">انصراف</button>
      </div>`
  },

  _doneStep() {
    return `
      <div class="auth-card--success">
        <div class="auth-success-icon"><i class="fas fa-check-circle"></i></div>
        <h2 class="auth-success-title">ثبت شد</h2>
        <p class="auth-success-text">درخواست مشاوره به مدیریت ارسال شد.</p>
        <button type="button" class="auth-btn auth-btn-primary" onclick="Portal.backToLogin()">بازگشت</button>
      </div>`
  },

  _resolveTimer: null,
  onIdentifierInput(val) {
    clearTimeout(this._resolveTimer)
    const chip = document.getElementById('login-role-chip')
    const btnLabel = document.getElementById('login-btn-label')
    const raw = String(val || '').trim()
    if (!raw || raw.includes('@') || raw.replace(/\D/g, '').length < 10) {
      if (chip) { chip.style.display = 'none'; chip.innerHTML = '' }
      if (btnLabel) {
        btnLabel.textContent = this.state.loginMethod === 'password' ? 'ورود به پنل استودیو' : 'ارسال کد پیامکی'
      }
      return
    }

    const phone = Utils.normalizePhone(raw)
    this._resolveTimer = setTimeout(async () => {
      let resolved = typeof UnifiedLogin !== 'undefined' ? UnifiedLogin.resolvePhone(phone) : null
      if ((!resolved || resolved.kind === 'guest') && phone.length === 11) {
        try {
          const res = await fetch(`/api/auth/lookup?phone=${encodeURIComponent(phone)}`, { cache: 'no-store' })
          if (res.ok) {
            const j = await res.json()
            if (j.ok && j.found) {
              resolved = {
                kind: j.userKind || 'guest',
                label: j.displayName || 'کاربر گرامی',
                roleTitle: j.roleTitle || 'استودیو',
                studioId: j.studioId,
                studioName: j.studioName,
                contractId: j.contractId,
                eventDate: j.eventDate
              }
              if (j.studioId) {
                try {
                  localStorage.setItem('crm_studio_id', j.studioId)
                  Utils?.storage?.set?.('talar_studio_id', j.studioId)
                  if (typeof window !== 'undefined' && window.ServerSync?.setStudioId) {
                    window.ServerSync.setStudioId(j.studioId)
                  }
                  if (typeof DB !== 'undefined' && (!DB.get('users') || !DB.get('users').length)) {
                    fetch(`/api/sync/pull?studioId=${encodeURIComponent(j.studioId)}&rev=0`, { cache: 'no-store' })
                      .then(r => r.json())
                      .then(async p => {
                        if (p?.data && typeof DB.importJSON === 'function') {
                          await DB.importJSON(JSON.stringify(p.data))
                        }
                      }).catch(() => {})
                  }
                } catch { /* */ }
              }
            }
          }
        } catch { /* ignore */ }
      }
      this._renderRoleChip(resolved, phone)
    }, 200)
  },

  _renderRoleChip(resolved, _phone) {
    const chip = document.getElementById('login-role-chip')
    const btnLabel = document.getElementById('login-btn-label')
    if (!chip) return

    if (!resolved || resolved.kind === 'guest') {
      chip.className = 'auth-role-chip guest'
      chip.innerHTML = `
        <div class="auth-chip-icon"><i class="fas fa-sparkles"></i></div>
        <div class="auth-chip-info">
          <div class="auth-chip-title">شماره جدید</div>
          <div class="auth-chip-desc">دریافت مشاوره و رزرو مراسم در استودیو</div>
        </div>
      `
      chip.style.display = 'flex'
      if (btnLabel) btnLabel.textContent = 'درخواست مشاوره / کد ورود'
      return
    }

    if (resolved.kind === 'manager' || resolved.kind === 'admin') {
      chip.className = 'auth-role-chip manager'
      chip.innerHTML = `
        <div class="auth-chip-icon"><i class="fas fa-crown"></i></div>
        <div class="auth-chip-info">
          <div class="auth-chip-title">خوش آمدید، ${Utils.escapeHtml(resolved.label)}</div>
          <div class="auth-chip-desc">مدیریت استودیو — پنل جامع سازمانی</div>
        </div>
      `
      chip.style.display = 'flex'
      if (btnLabel) btnLabel.textContent = 'ورود به مدیریت استودیو'
      return
    }

    if (resolved.kind === 'staff') {
      chip.className = 'auth-role-chip staff'
      chip.innerHTML = `
        <div class="auth-chip-icon"><i class="fas fa-id-badge"></i></div>
        <div class="auth-chip-info">
          <div class="auth-chip-title">خوش آمدید، ${Utils.escapeHtml(resolved.label)}</div>
          <div class="auth-chip-desc">داشبورد پرسنل (${Utils.escapeHtml(resolved.roleTitle || 'همکار')})</div>
        </div>
      `
      chip.style.display = 'flex'
      if (btnLabel) btnLabel.textContent = 'ورود به پورتال پرسنل'
      const pwInput = document.getElementById('login-password')
      if (pwInput) pwInput.placeholder = 'کد ورود ۶ رقمی دریافتی از مدیر یا رمز عبور'
      return
    }

    if (resolved.kind === 'customer') {
      chip.className = 'auth-role-chip customer'
      chip.innerHTML = `
        <div class="auth-chip-icon"><i class="fas fa-gem"></i></div>
        <div class="auth-chip-info">
          <div class="auth-chip-title">مراجع محترم: ${Utils.escapeHtml(resolved.label)}</div>
          <div class="auth-chip-desc">داشبورد پیگیری مراسم و آلبوم عکس‌ها</div>
        </div>
      `
      chip.style.display = 'flex'
      if (btnLabel) btnLabel.textContent = 'ورود به پیگیری مراسم'

      if (this.state.loginMethod === 'password') {
        const errEl = document.getElementById('login-error')
        if (errEl) {
          errEl.innerHTML = `
            <div style="font-size:12px;color:#60a5fa;display:flex;align-items:center;gap:6px">
              <i class="fas fa-info-circle"></i>
              ورود مراجعین با کد پیامک است.
              <a href="javascript:void(0)" onclick="Portal.setLoginMethod('sms')" style="color:#93c5fd;text-decoration:underline;font-weight:700">تغییر به ورود پیامکی</a>
            </div>
          `
        }
      }
    }
  },

  setLoginMethod(method) {
    const prevVal = document.getElementById('login-identifier')?.value || ''
    this.state.loginMethod = method
    const loginView = document.getElementById('auth-login-view')
    if (loginView) {
      loginView.innerHTML = this._loginFields()
      const idInput = document.getElementById('login-identifier')
      if (idInput && prevVal) {
        idInput.value = prevVal
        this.onIdentifierInput(prevVal)
      }
      const subTextEl = document.getElementById('auth-sub-text') || document.querySelector('.auth-sub')
      if (subTextEl && this.state.authTab === 'login') {
        subTextEl.textContent = method === 'password' ? 'شماره موبایل و رمز عبور خود را وارد کنید' : 'با شماره موبایل و کد پیامک وارد شوید'
      }
      this._bindStepKeys('login', this.state.authTab)
      return
    }
    this.renderAuth(true)
  },

  _bindStepKeys(step) {
    if (step === 'login') {
      document.getElementById('reg-studio-name')?.addEventListener('keydown', e => {
        if (e.key === 'Enter') document.getElementById('reg-manager-name')?.focus()
      })
      document.getElementById('reg-manager-name')?.addEventListener('keydown', e => {
        if (e.key === 'Enter') document.getElementById('reg-phone')?.focus()
      })
      document.getElementById('reg-phone')?.addEventListener('keydown', e => {
        if (e.key === 'Enter') document.getElementById('reg-email')?.focus()
      })
      document.getElementById('reg-email')?.addEventListener('keydown', e => {
        if (e.key === 'Enter') document.getElementById('reg-password')?.focus()
      })
      document.getElementById('reg-password')?.addEventListener('keydown', e => {
        if (e.key === 'Enter') document.getElementById('reg-password-confirm')?.focus()
      })
      document.getElementById('reg-password-confirm')?.addEventListener('keydown', e => {
        if (e.key === 'Enter') Portal.submitRegister()
      })

      const idInput = document.getElementById('login-identifier') || document.getElementById('login-phone')
      idInput?.addEventListener('keydown', e => {
        if (e.key === 'Enter') {
          if (this.state.loginMethod === 'password') {
            document.getElementById('login-password')?.focus()
          } else {
            Portal.sendOtp()
          }
        }
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
    this.state._phone = ''
    this.renderAuth(true)
  },

  async loginPassword() {
    this._clearErr()
    const rawId = (document.getElementById('login-identifier')?.value || document.getElementById('login-phone')?.value || '').trim()
    const password = Utils.normalizePassword(document.getElementById('login-password')?.value)
    const isEmail = rawId.includes('@')
    let identifier

    if (isEmail) {
      if (!Utils.isValidEmail(rawId)) { this._err('ایمیل واردشده معتبر نیست (مثال: name@gmail.com)'); return }
      identifier = Utils.normalizeEmail(rawId)
    } else {
      identifier = Utils.normalizePhone(rawId)
      if (!Utils.isValidPhone(identifier)) { this._err('شماره موبایل معتبر (مثال: 09121234567) یا ایمیل وارد کنید'); return }
    }
    if (!password) { this._err('رمز عبور را وارد کنید'); return }

    this._setBtn(true, '')

    let resolved = isEmail ? null : UnifiedLogin.resolvePhone(identifier)
    if (!resolved || resolved.kind === 'guest' || !DB.get('users').length) {
      try {
        const lookupUrl = `/api/auth/lookup?phone=${encodeURIComponent(identifier)}`
        const res = await fetch(lookupUrl, { cache: 'no-store' })
        if (res.ok) {
          const j = await res.json()
          if (j.ok && j.found) {
            resolved = {
              kind: j.userKind || 'guest',
              label: j.displayName || 'کاربر گرامی',
              roleTitle: j.roleTitle || 'استودیو',
              studioId: j.studioId,
              studioName: j.studioName,
              contractId: j.contractId,
              eventDate: j.eventDate
            }
          }
        }
        if (!resolved) resolved = isEmail ? null : UnifiedLogin.resolvePhone(identifier)
      } catch { /* ignore */ }
    }

    if (resolved && resolved.kind === 'customer') {
      this.setLoginMethod('sms')
      const idInput = document.getElementById('login-identifier')
      if (idInput) idInput.value = identifier
      await this.sendOtp()
      return
    }

    let result = await UnifiedLogin.loginWithPassword(identifier, password)

    // Fallback: If client-side DB has no user or password was invite code, verify via server-authoritative API
    if (!result.ok) {
      try {
        const srvRes = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ identifier, password })
        })
        if (srvRes.ok) {
          const srvJson = await srvRes.json()
          if (srvJson.ok && srvJson.user) {
            if (srvJson.fullData && typeof DB !== 'undefined' && DB.importJSON) {
              await DB.importJSON(JSON.stringify(srvJson.fullData))
            }
            if (srvJson.tenantKey) {
              localStorage.setItem('crm_studio_id', srvJson.tenantKey)
              Utils?.storage?.set?.('talar_studio_id', srvJson.tenantKey)
              if (typeof window !== 'undefined' && window.ServerSync?.setStudioId) {
                window.ServerSync.setStudioId(srvJson.tenantKey)
              }
            }
            const csrf = Auth._regenerateCsrf ? Auth._regenerateCsrf() : 'csrf_' + Date.now()
            await Auth._sessionSetSigned?.(Auth.SESSION_KEY, {
              userId: srvJson.user.id,
              loginAt: Date.now(),
              expiresAt: Date.now() + Auth.SESSION_TIMEOUT_MS,
              csrf
            })
            try { sessionStorage.setItem(Auth.CSRF_KEY, csrf) } catch { /* */ }
            DB.log?.('login', srvJson.user.name)
            result = {
              ok: true,
              user: srvJson.user,
              url: srvJson.user.portalType === 'staff' ? 'index.html?view=portal' : (Access?.canAccessStudioM?.(srvJson.user) ? 'studio-m/' : 'index.html?view=portal')
            }
          }
        } else {
          const srvErr = await srvRes.json().catch(() => ({}))
          if (srvErr.error) {
            result = { ok: false, error: srvErr.error }
          }
        }
      } catch { /* ignore */ }
    }

    this._setBtn(false, '<i class="fas fa-sign-in-alt"></i> ورود به پنل استودیو')

    if (!result.ok) {
      this._err(result.error || 'اطلاعات ورود یا رمز عبور اشتباه است')
      return
    }

    const finish = () => {
      const target = result.url || (resolved ? UnifiedLogin.landingUrl(resolved) : 'index.html')
      const safe = Utils.safeAppRedirect?.(target)
      window.location.href = safe || target || 'index.html'
    }
    if (typeof PortalInvite !== 'undefined' && PortalInvite.needsOtpVerification(result.user)) {
      PortalInvite.gateAfterLogin(result.user, finish)
      return
    }
    finish()
  },

  async sendOtp() {
    this._clearErr()
    const rawId = (document.getElementById('login-identifier')?.value || document.getElementById('login-phone')?.value || '').trim()
    if (rawId.includes('@')) {
      this._err('ورود با کد پیامکی فقط با شماره موبایل امکان‌پذیر است. لطفاً شماره موبایل وارد کنید یا با رمز عبور وارد شوید.')
      return
    }
    const phone = Utils.normalizePhone(rawId)
    if (!Utils.isValidPhone(phone)) { this._err('شماره موبایل نامعتبر است (مثال: 09121234567)'); return }

    this._setBtn(true, '')

    let resolved = UnifiedLogin.resolvePhone(phone)
    if (!resolved || resolved.kind === 'guest' || !DB.get('users').length) {
      try {
        const lookupUrl = `/api/auth/lookup?phone=${encodeURIComponent(phone)}`
        const res = await fetch(lookupUrl, { cache: 'no-store' })
        if (res.ok) {
          const j = await res.json()
          if (j.ok && j.found) {
            resolved = {
              kind: j.userKind || 'guest',
              label: j.displayName || 'کاربر گرامی',
              roleTitle: j.roleTitle || 'استودیو',
              studioId: j.studioId,
              studioName: j.studioName,
              contractId: j.contractId,
              eventDate: j.eventDate
            }
            if (j.studioId) {
              try {
                localStorage.setItem('crm_studio_id', j.studioId)
                Utils?.storage?.set?.('talar_studio_id', j.studioId)
                if (typeof window !== 'undefined' && window.ServerSync?.setStudioId) {
                  window.ServerSync.setStudioId(j.studioId)
                }
                const pRes = await fetch(`/api/sync/pull?studioId=${encodeURIComponent(j.studioId)}&rev=0`, { cache: 'no-store' })
                if (pRes.ok) {
                  const p = await pRes.json()
                  if (p?.data && typeof DB.importJSON === 'function') {
                    await DB.importJSON(JSON.stringify(p.data))
                    resolved = UnifiedLogin.resolvePhone(phone) || resolved
                  }
                }
              } catch { /* */ }
            }
          }
        }
      } catch { /* ignore */ }
    }

    const result = await UnifiedLogin.sendOtp(phone)
    this._setBtn(false, '<i class="fas fa-paper-plane"></i> ارسال کد')

    if (!result.ok) { this._err(result.error || 'خطا'); return }
    if (result.demoCode) Utils.toast(`کد ورود: ${result.demoCode}`, 'info', 10000)

    this.state.step = 'otp'
    this.state._phone = phone
    this.renderAuth()
  },

  async verifyOtp() {
    this._clearErr()
    const phone = this.state._phone || UnifiedLogin.getPending()?.phone || Utils.normalizePhone(document.getElementById('login-identifier')?.value)
    const code = document.getElementById('login-otp')?.value
    if (!phone) { this.backToLogin(); return }

    this._setBtn(true, '')
    let result = await UnifiedLogin.verifyOtp(phone, code)

    // Fallback: If local verify failed or code wasn't matching local pending, check server-authoritative verify
    if (!result.ok) {
      try {
        const srvRes = await fetch('/api/auth/verify-code', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone, code })
        })
        if (srvRes.ok) {
          const srvJson = await srvRes.json()
          if (srvJson.ok && srvJson.user) {
            if (srvJson.fullData && typeof DB !== 'undefined' && DB.importJSON) {
              await DB.importJSON(JSON.stringify(srvJson.fullData))
            }
            if (srvJson.tenantKey) {
              localStorage.setItem('crm_studio_id', srvJson.tenantKey)
              Utils?.storage?.set?.('talar_studio_id', srvJson.tenantKey)
              if (typeof window !== 'undefined' && window.ServerSync?.setStudioId) {
                window.ServerSync.setStudioId(srvJson.tenantKey)
              }
            }
            const csrf = Auth._regenerateCsrf ? Auth._regenerateCsrf() : 'csrf_' + Date.now()
            await Auth._sessionSetSigned?.(Auth.SESSION_KEY, {
              userId: srvJson.user.id,
              loginAt: Date.now(),
              expiresAt: Date.now() + Auth.SESSION_TIMEOUT_MS,
              csrf
            })
            try { sessionStorage.setItem(Auth.CSRF_KEY, csrf) } catch { /* */ }
            DB.log?.('login', srvJson.user.name)
            result = {
              ok: true,
              user: srvJson.user,
              url: srvJson.user.portalType === 'staff' ? 'index.html?view=portal' : (Access?.canAccessStudioM?.(srvJson.user) ? 'studio-m/' : 'index.html?view=portal')
            }
          }
        } else {
          const srvErr = await srvRes.json().catch(() => ({}))
          if (srvErr.error) {
            result = { ok: false, error: srvErr.error }
          }
        }
      } catch { /* ignore */ }
    }

    this._setBtn(false, '<i class="fas fa-check"></i> تأیید و ورود')

    if (!result.ok) { this._err(result.error || 'کد وارد‌شده نادرست است'); return }

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

Portal._appLoaded = true
window.Portal = Portal

function bootPortal() {
  try {
    const params = new URLSearchParams(location.search)
    const tabParam = params.get('tab')
    if (tabParam === 'register' || location.hash === '#register') {
      Portal.state.authTab = 'register'
    }
    // رندر بلادرنگ برای جلوگیری کامل از هرگونه صفحه خالی
    if (typeof Portal.renderAuth === 'function') {
      Portal.renderAuth()
    }
  } catch (err) {
    console.error('[Portal] Pre-render error:', err)
  }

  if (typeof Bootstrap !== 'undefined' && Bootstrap.start) {
    Bootstrap.start(async () => {
      if (typeof Studio !== 'undefined') Studio.ensureIdentity()
      await Portal.init()
    })
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootPortal)
} else {
  bootPortal()
}
