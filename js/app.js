/* Studio M — ورود واحد · شناسایی خودکار از DB */
const Portal = {
  state: { currentUser: null, currentSection: 'overview', authTab: 'login', step: 'login', loginMethod: 'password', regType: 'studio', _phone: '' },

  async init() {
    const params = new URLSearchParams(location.search)
    if (params.get('reset') === '1' || params.get('wipe') === '1') {
      try {
        localStorage.clear()
        sessionStorage.clear()
        if (typeof DB !== 'undefined' && DB.reset) await DB.reset()
      } catch { /* ignore */ }
      params.delete('reset')
      params.delete('wipe')
      window.location.replace(location.pathname + (params.toString() ? `?${params}` : ''))
      return
    }

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
        this.state.currentUser = u
        this.renderPortal()
        return
      }
      window.location.href = Auth.getLandingUrl()
      return
    }

    if (params.get('view') === 'portal') {
      this.state.loginPath = 'staff'
      setTimeout(() => {
        if (typeof Portal !== 'undefined' && Portal.setLoginPath) {
          Portal.setLoginPath('staff')
        }
      }, 0)
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

    const portalAppEl = document.getElementById('portal-app')
    if (!portalAppEl) return

    portalAppEl.innerHTML = `
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
    if (step === 'login' && authTab === 'login' && typeof PhoneFirstLogin !== 'undefined' && PhoneFirstLogin.attach) {
      PhoneFirstLogin.attach()
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
        if (typeof PhoneFirstLogin !== 'undefined' && PhoneFirstLogin.attach) {
          PhoneFirstLogin.attach()
        } else {
          document.getElementById('login-identifier')?.focus()
        }
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
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
          <label class="auth-label" for="login-password" style="margin-bottom:0">رمز عبور</label>
          <button type="button" class="auth-forgot-link" onclick="Portal.showForgotPassword()" style="background:none;border:none;color:#f59e0b;font-size:11.5px;cursor:pointer;padding:0">فراموشی رمز عبور؟</button>
        </div>
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

      <div style="display:flex;align-items:center;margin:14px 0 10px;gap:8px">
        <div style="flex:1;height:1px;background:rgba(255,255,255,0.08)"></div>
        <span style="font-size:11px;color:rgba(255,255,255,0.45)">یا ارسال خودکار کد ورود به:</span>
        <div style="flex:1;height:1px;background:rgba(255,255,255,0.08)"></div>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px">
        <button type="button" class="portal-btn" style="background:rgba(27,116,228,0.14);border:1px solid rgba(27,116,228,0.3);color:#60a5fa;padding:8px 6px;border-radius:9px;font-size:11.5px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px" onclick="Portal.requestMessengerOtp('bale')">
          <i class="fas fa-paper-plane"></i> دریافت کد در بله
        </button>
        <button type="button" class="portal-btn" style="background:rgba(37,211,102,0.14);border:1px solid rgba(37,211,102,0.3);color:#4ade80;padding:8px 6px;border-radius:9px;font-size:11.5px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px" onclick="Portal.requestMessengerOtp('whatsapp')">
          <i class="fab fa-whatsapp"></i> دریافت کد در واتساپ
        </button>
      </div>

      <div style="display:flex;justify-content:center;align-items:center;margin-top:12px;padding-top:10px;border-top:1px solid rgba(255,255,255,0.07)">
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
                <option value="photographer_kids" style="background:#1e1e24;color:#fff">عکاس کودک، نوزاد و بارداری</option>
                <option value="photographer_fashion" style="background:#1e1e24;color:#fff">عکاس مدلینگ و پرتره فشن</option>
                <option value="videographer" style="background:#1e1e24;color:#fff">تصویربردار / فیلمبردار مراسم</option>
                <option value="vid_commercial" style="background:#1e1e24;color:#fff">تصویربردار تیزر صنعتی و تبلیغاتی</option>
                <option value="social_media" style="background:#1e1e24;color:#fff">تولید محتوا و ریلز اینستاگرام</option>
                <option value="editor" style="background:#1e1e24;color:#fff">تدوین‌گر و ادیتور فیلم</option>
                <option value="album_designer" style="background:#1e1e24;color:#fff">طراح آلبوم ژورنال</option>
                <option value="colorist" style="background:#1e1e24;color:#fff">اصلاح رنگ و نور (داوینچی)</option>
                <option value="accountant" style="background:#1e1e24;color:#fff">حسابدار رسمی استودیو</option>
                <option value="office_secretary" style="background:#1e1e24;color:#fff">مسئول دفتر و پذیرش مراجعین</option>
              </select>
            </div>
          </div>
          <div class="auth-field">
            <label class="auth-label" for="reg-staff-email">ایمیل همکار (جهت بازیابی رمز و اعلانات)</label>
            <div class="auth-input-wrap">
              <i class="fas fa-envelope"></i>
              <input type="email" id="reg-staff-email" class="ltr" dir="ltr" placeholder="colleague@gmail.com"/>
            </div>
          </div>
        </div>

        <div class="auth-grid-2col">
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
              <input type="tel" id="reg-phone" class="ltr" dir="ltr" inputmode="numeric" placeholder="09121234567" oninput="Portal.onRegisterPhoneInput(this.value)"/>
            </div>
            <div id="reg-phone-hint" style="display:none;margin-top:4px"></div>
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
    const email = (document.getElementById('reg-staff-email')?.value || '').trim().toLowerCase()
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
        body: JSON.stringify({ name, phone, email, role, joinCode, password })
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

  _regPhoneTimer: null,
  onRegisterPhoneInput(val) {
    clearTimeout(this._regPhoneTimer)
    const hintEl = document.getElementById('reg-phone-hint')
    const raw = String(val || '').trim()
    const digits = raw.replace(/\D/g, '')
    if (digits.length < 10) {
      if (hintEl) { hintEl.style.display = 'none'; hintEl.innerHTML = '' }
      return
    }
    const phone = Utils.normalizePhone(raw)
    this._regPhoneTimer = setTimeout(async () => {
      const localUser = DB.find('users', u => (phone && Utils.normalizePhone(u.phone) === phone))
      const localStudio = DB.get('studioInfo')
      let foundStudioName = ''

      if (localUser && localUser.roles?.includes('studio_manager') && localStudio?.name) {
        foundStudioName = localStudio.name
      }

      if (!foundStudioName && phone.length === 11) {
        try {
          const res = await fetch(`/api/auth/lookup?phone=${encodeURIComponent(phone)}`, { cache: 'no-store' })
          if (res.ok) {
            const j = await res.json()
            if (j.ok && j.found && j.studioName) {
              foundStudioName = j.studioName
            }
          }
        } catch { /* ignore */ }
      }

      if (hintEl) {
        if (foundStudioName) {
          hintEl.innerHTML = `
            <div style="font-size:11.5px;color:#f59e0b;padding:6px 10px;background:rgba(245,158,11,0.12);border-radius:8px;border:1px solid rgba(245,158,11,0.3);display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:4px">
              <span><i class="fas fa-info-circle"></i> این شماره قبلاً برای استودیو <strong>«${Utils.escapeHtml(foundStudioName)}»</strong> ثبت شده است.</span>
              <button type="button" class="portal-btn portal-btn-sm" onclick="Portal.setAuthTab('login'); const el = document.getElementById('login-identifier'); if (el) { el.value = '${phone}'; Portal.onIdentifierInput('${phone}'); }" style="font-size:11px;padding:3px 8px;white-space:nowrap">
                ورود <i class="fas fa-arrow-left"></i>
              </button>
            </div>`
          hintEl.style.display = 'block'
        } else {
          hintEl.style.display = 'none'
          hintEl.innerHTML = ''
        }
      }
    }, 250)
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
      // بررسی وجود استودیو برای این شماره جهت جلوگیری از ایجاد استودیوهای متعدد و متناقض
      const existingStudio = DB.get('studioInfo')
      const existingUser = DB.find('users', u => (phone && Utils.normalizePhone(u.phone) === phone) || (email && u.email && u.email.toLowerCase() === email.toLowerCase()))

      let serverCheck = null
      try {
        const checkRes = await fetch(`/api/auth/lookup?phone=${encodeURIComponent(phone)}`, { cache: 'no-store' })
        if (checkRes.ok) {
          const cData = await checkRes.json()
          if (cData.ok && cData.found && cData.studioName) {
            serverCheck = cData
          }
        }
      } catch { /* ignore network check error */ }

      const hasExistingStudio = (existingStudio && existingStudio.name && existingUser && existingUser.roles?.includes('studio_manager')) || (serverCheck && serverCheck.userKind === 'manager')
      if (hasExistingStudio) {
        const foundName = serverCheck?.studioName || existingStudio?.name || studioName
        if (btn) {
          btn.disabled = false
          btn.innerHTML = '<i class="fas fa-rocket"></i> ساخت و ثبت استودیو'
        }
        if (errEl) {
          errEl.innerHTML = `
            <div style="font-size:12.5px;color:#f59e0b;padding:12px;background:rgba(245,158,11,0.1);border-radius:12px;border:1px solid rgba(245,158,11,0.3);line-height:1.7">
              <div><i class="fas fa-exclamation-triangle"></i> این شماره قبلاً به عنوان مدیر استودیو «<strong>${Utils.escapeHtml(foundName)}</strong>» ثبت شده است. نیازی به ساخت استودیو تکراری نیست.</div>
              <div style="margin-top:8px">
                <button type="button" class="portal-btn portal-btn-sm portal-btn-primary" onclick="Portal.setAuthTab('login'); const el = document.getElementById('login-identifier'); if (el) { el.value = '${phone}'; Portal.onIdentifierInput('${phone}'); }" style="font-size:12px">
                  <i class="fas fa-sign-in-alt"></i> ورود به پنل استودیو «${Utils.escapeHtml(foundName)}»
                </button>
              </div>
            </div>`
          errEl.style.display = 'block'
        }
        return
      }

      let joinCode
      const studioId = existingStudio?.id || serverCheck?.studioId || ('studio_' + Date.now())
      await SecureDB.runInternalAsync(async () => {
        joinCode = existingStudio?.joinCode || Studio.generateJoinCode()
        await SecureDB.merge('studioInfo', {
          id: studioId,
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
        const newRoles = [...new Set([...(existing?.roles || []), 'studio_manager'])]
        if (existing) {
          DB.update('users', existing.id, {
            name: managerName,
            phone,
            email,
            password: creds.password,
            salt: creds.salt,
            roles: newRoles,
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
            roles: newRoles,
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

      // ثبت مستقیم و تضمینی در سرور ابری استودیوها
      try {
        const srvRegRes = await fetch('/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ studioName, managerName, phone, email, password })
        })
        const srvRegJson = await srvRegRes.json().catch(() => ({}))
        if (srvRegRes.ok && srvRegJson.ok) {
          if (srvRegJson.tenantKey) {
            localStorage.setItem('crm_studio_id', srvRegJson.tenantKey)
            Utils?.storage?.set?.('talar_studio_id', srvRegJson.tenantKey)
            if (typeof ServerSync !== 'undefined' && ServerSync.setStudioId) {
              ServerSync.setStudioId(srvRegJson.tenantKey)
            }
          }
          if (srvRegJson.syncToken) {
            localStorage.setItem('crm_sync_token', srvRegJson.syncToken)
          }
        }
      } catch (srvRegErr) {
        console.warn('Server register network notice:', srvRegErr)
      }

      if (typeof ServerSync !== 'undefined' && ServerSync.push) {
        try {
          await ServerSync.push({ force: true })
        } catch (syncErr) {
          console.warn('Sync push after registration warning:', syncErr)
        }
      }

      const result = await Auth.login(email || phone, password)
      if (result.ok) {
        if (typeof AudioNotifier !== 'undefined') AudioNotifier.playContract()
        this.showRegistrationSuccess({ name: studioName, manager: managerName, phone, joinCode, slug: studioName.replace(/\s+/g, '-').slice(0, 24) })
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

  async copyDedicatedLink(url) {
    const link = url || this._lastRegisteredStudio?.dedicatedLink || document.getElementById('dedicated-studio-url')?.value || window.location.href
    const ok = await Utils.copy(link)
    if (ok) {
      Utils.toast('لینک اختصاصی استودیو با موفقیت کپی شد', 'success')
    } else {
      Utils.toast('خطا در کپی — لطفاً لینک را دستی کپی کنید', 'warning')
    }
  },

  async copyStudioPassport() {
    const s = this._lastRegisteredStudio || {}
    const lines = [
      `🎉 شناسنامه استودیو: ${s.name || ''}`,
      `👤 نام مدیر: ${s.manager || ''}`,
      `📱 شماره همراه مدیر: ${s.phone || ''}`,
      `🔑 کد اتصال پرسنل: ${s.joinCode || ''}`,
      `🌐 لینک ورود اختصاصی: ${s.dedicatedLink || ''}`
    ]
    const text = lines.filter(Boolean).join('\n')
    const ok = await Utils.copy(text)
    if (ok) {
      Utils.toast('شناسنامه کامل استودیو با موفقیت کپی شد', 'success')
    } else {
      Utils.toast('خطا در کپی — لطفاً متن را دستی کپی کنید', 'warning')
    }
  },

  showRegistrationSuccess(studioInfo) {
    const origin = window.location.origin
    const dedicatedLink = `${origin}/app/?studio=${encodeURIComponent(studioInfo.name)}`
    this._lastRegisteredStudio = { ...studioInfo, dedicatedLink }

    const overlay = document.createElement('div')
    overlay.className = 'portal-modal-overlay open'
    overlay.style.zIndex = '9999'
    overlay.style.display = 'flex'
    overlay.style.alignItems = 'center'
    overlay.style.justifyContent = 'center'
    overlay.style.background = 'rgba(0,0,0,0.85)'
    overlay.style.backdropFilter = 'blur(10px)'

    overlay.innerHTML = `
      <div class="portal-modal" style="max-width:540px;width:90%;background:#0b0f19;border:1px solid rgba(245,158,11,0.4);border-radius:24px;padding:26px;color:#fff;text-align:right;box-shadow:0 12px 40px rgba(0,0,0,0.8)">
        <div style="text-align:center;margin-bottom:18px">
          <div style="width:68px;height:68px;border-radius:22px;background:rgba(245,158,11,0.15);color:#f59e0b;font-size:32px;display:flex;align-items:center;justify-content:center;margin:0 auto 12px;border:1px solid rgba(245,158,11,0.3)">
            <i class="fas fa-crown"></i>
          </div>
          <h2 style="font-size:18px;margin:0 0 6px 0;color:#fff">🎉 استودیو شما با موفقیت راه‌اندازی شد!</h2>
          <p style="font-size:12.5px;color:rgba(255,255,255,0.6);margin:0">شناسنامه و مشخصات ورود به پنل اختصاصی ${Utils.escapeHtml(studioInfo.name)}</p>
        </div>

        <div style="background:rgba(255,255,255,0.035);border:1px solid rgba(255,255,255,0.08);border-radius:16px;padding:16px;margin-bottom:18px">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;padding-bottom:8px;border-bottom:1px solid rgba(255,255,255,0.06)">
            <span style="font-size:12px;color:rgba(255,255,255,0.5)">نام رسمی استودیو:</span>
            <strong style="color:#f59e0b;font-size:13.5px">${Utils.escapeHtml(studioInfo.name)}</strong>
          </div>
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;padding-bottom:8px;border-bottom:1px solid rgba(255,255,255,0.06)">
            <span style="font-size:12px;color:rgba(255,255,255,0.5)">کد اختصاصی اتصال پرسنل:</span>
            <strong style="font-size:16px;color:#38bdf8;letter-spacing:2px" dir="ltr">${Utils.escapeHtml(studioInfo.joinCode)}</strong>
          </div>
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;padding-bottom:8px;border-bottom:1px solid rgba(255,255,255,0.06)">
            <span style="font-size:12px;color:rgba(255,255,255,0.5)">نام کاربری (شماره همراه مدیر):</span>
            <strong dir="ltr">${Utils.escapeHtml(studioInfo.phone)}</strong>
          </div>
          <div style="margin-top:10px">
            <span style="font-size:11.5px;color:rgba(255,255,255,0.5);display:block;margin-bottom:6px">🌐 لینک صفحه ورود با نام و برند استودیو شما:</span>
            <div style="display:flex;gap:6px;align-items:center;background:rgba(0,0,0,0.4);padding:6px 10px;border-radius:8px;border:1px solid rgba(255,255,255,0.08)">
              <input type="text" readonly value="${dedicatedLink}" style="flex:1;background:transparent;border:none;color:#60a5fa;font-size:11px;direction:ltr" id="dedicated-studio-url" />
              <button type="button" class="portal-btn portal-btn-sm" onclick="Portal.copyDedicatedLink()" style="font-size:11px">کپی لینک</button>
            </div>
          </div>
        </div>

        <div style="display:flex;flex-direction:column;gap:8px">
          <button type="button" class="portal-btn portal-btn-primary" onclick="window.location.href='studio-m/'" style="padding:12px;font-size:13.5px;border-radius:12px">
            <i class="fas fa-arrow-left"></i> ورود به پنل مدیریت ${Utils.escapeHtml(studioInfo.name)}
          </button>
          <button type="button" class="portal-btn portal-btn-ghost" onclick="Portal.copyStudioPassport()" style="border-radius:12px;font-size:12px">
            <i class="fas fa-copy"></i> کپی کامل شناسنامه استودیو
          </button>
        </div>
      </div>`
    document.body.appendChild(overlay)
  },

  showForgotPassword() {
    const existing = document.getElementById('forgot-pw-modal')
    if (existing) existing.remove()
    if (this._forgotTimer) clearInterval(this._forgotTimer)

    const rawId = (document.getElementById('login-identifier')?.value || document.getElementById('login-phone')?.value || '').trim()
    const prefillEmail = rawId.includes('@') ? rawId : ''
    const prefillPhone = !rawId.includes('@') && /^\d+$/.test(rawId.replace(/^0/, '')) ? rawId : ''

    const overlay = document.createElement('div')
    overlay.id = 'forgot-pw-modal'
    overlay.className = 'portal-modal-overlay open'
    overlay.style.zIndex = '9999'
    overlay.style.display = 'flex'
    overlay.style.alignItems = 'center'
    overlay.style.justifyContent = 'center'
    overlay.style.background = 'rgba(0,0,0,0.85)'
    overlay.style.backdropFilter = 'blur(10px)'

    overlay.innerHTML = `
      <div class="portal-modal" style="max-width:500px;width:92%;background:#0b0f19;border:1px solid rgba(245,158,11,0.4);border-radius:24px;padding:24px;color:#fff;text-align:right;box-shadow:0 12px 40px rgba(0,0,0,0.85)">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;border-bottom:1px solid rgba(255,255,255,0.08);padding-bottom:10px">
          <div style="display:flex;align-items:center;gap:8px">
            <div style="width:36px;height:36px;border-radius:10px;background:rgba(245,158,11,0.15);color:#f59e0b;display:flex;align-items:center;justify-content:center;font-size:16px">
              <i class="fas fa-key"></i>
            </div>
            <h3 style="margin:0;font-size:15px;color:#fff">بازیابی و فراموشی رمز عبور</h3>
          </div>
          <button type="button" onclick="document.getElementById('forgot-pw-modal').remove()" style="background:none;border:none;color:rgba(255,255,255,0.5);font-size:18px;cursor:pointer">&times;</button>
        </div>

        <div style="display:flex;gap:4px;margin-bottom:16px;background:rgba(255,255,255,0.04);padding:4px;border-radius:12px;flex-wrap:wrap">
          <button type="button" id="forgot-tab-email" class="portal-btn portal-btn-sm portal-btn-primary" style="flex:1;font-size:11px;padding:8px 4px" onclick="Portal.setForgotTab('email')">
            <i class="fas fa-envelope"></i> ارسال به ایمیل
          </button>
          <button type="button" id="forgot-tab-mgr" class="portal-btn portal-btn-sm portal-btn-ghost" style="flex:1;font-size:11px;padding:8px 4px" onclick="Portal.setForgotTab('mgr')">
            <i class="fas fa-shield-alt"></i> کد استودیو
          </button>
          <button type="button" id="forgot-tab-staff" class="portal-btn portal-btn-sm portal-btn-ghost" style="flex:1;font-size:11px;padding:8px 4px" onclick="Portal.setForgotTab('staff')">
            <i class="fas fa-user-gear"></i> پرسنل
          </button>
          <button type="button" id="forgot-tab-cust" class="portal-btn portal-btn-sm portal-btn-ghost" style="flex:1;font-size:11px;padding:8px 4px" onclick="Portal.setForgotTab('cust')">
            <i class="fas fa-heart"></i> مشتری
          </button>
        </div>

        <!-- تب ۱: بازیابی با ارسال کد به ایمیل -->
        <div id="forgot-content-email">
          <!-- گام ۱: وارد کردن ایمیل -->
          <div id="forgot-email-step1">
            <p style="font-size:12px;color:rgba(255,255,255,0.7);margin:0 0 12px;line-height:1.7">
              آدرس ایمیل متصل به حساب خود را وارد نمایید تا کد ۶ رقمی بازیابی رمز عبور برای شما ارسال شود:
            </p>
            <div class="auth-field" style="margin-bottom:12px">
              <label class="auth-label" style="font-size:11px">آدرس ایمیل کاربری یا استودیو</label>
              <div class="auth-input-wrap">
                <i class="fas fa-envelope"></i>
                <input type="email" id="forgot-email-inp" class="ltr" dir="ltr" value="${Utils.escapeHtml(prefillEmail)}" placeholder="name@gmail.com" style="font-size:13px" autocomplete="email" />
              </div>
            </div>
            <div class="auth-error" id="forgot-email-err1" style="display:none;margin-bottom:10px"></div>
            <button type="button" class="portal-btn portal-btn-primary" id="forgot-email-send-btn" onclick="Portal.sendForgotPasswordEmail()" style="width:100%;padding:11px;font-size:13px">
              <i class="fas fa-paper-plane"></i> ارسال کد بازیابی به ایمیل
            </button>
          </div>

          <!-- گام ۲: تأیید کد ۶ رقمی و تعریف رمز جدید -->
          <div id="forgot-email-step2" style="display:none">
            <div style="background:rgba(74,222,128,0.1);border:1px solid rgba(74,222,128,0.3);border-radius:12px;padding:10px 14px;margin-bottom:14px;display:flex;align-items:center;gap:10px">
              <i class="fas fa-envelope-circle-check" style="color:#4ade80;font-size:18px"></i>
              <div style="font-size:12px;color:#e2e8f0;line-height:1.5">
                کد ۶ رقمی به <strong id="forgot-email-masked" dir="ltr" style="color:#4ade80"></strong> ارسال گردید.
              </div>
            </div>

            <div class="auth-field" style="margin-bottom:10px">
              <label class="auth-label" style="font-size:11px">کد ۶ رقمی دریافتی از ایمیل</label>
              <div class="auth-input-wrap">
                <i class="fas fa-key"></i>
                <input type="text" id="forgot-email-otp" class="ltr" dir="ltr" maxlength="6" placeholder="مثال: 582194" style="font-size:15px;letter-spacing:4px;font-weight:bold" />
              </div>
            </div>

            <div class="auth-field" style="margin-bottom:10px">
              <label class="auth-label" style="font-size:11px">رمز عبور جدید</label>
              <div class="auth-input-wrap">
                <i class="fas fa-lock"></i>
                <input type="password" id="forgot-email-newpw" class="ltr" dir="ltr" placeholder="حداقل ۴ کاراکتر" style="font-size:13px" />
                <button type="button" class="auth-pw-toggle" onclick="Portal.togglePasswordVisibility('forgot-email-newpw', 'forgot-pw-eye1')" title="نمایش/پنهان‌سازی" tabindex="-1">
                  <i class="fas fa-eye" id="forgot-pw-eye1"></i>
                </button>
              </div>
            </div>

            <div class="auth-field" style="margin-bottom:14px">
              <label class="auth-label" style="font-size:11px">تکرار رمز عبور جدید</label>
              <div class="auth-input-wrap">
                <i class="fas fa-shield-alt"></i>
                <input type="password" id="forgot-email-newpw-confirm" class="ltr" dir="ltr" placeholder="تکرار رمز عبور جدید" style="font-size:13px" />
              </div>
            </div>

            <div class="auth-error" id="forgot-email-err2" style="display:none;margin-bottom:10px"></div>

            <button type="button" class="portal-btn portal-btn-primary" id="forgot-email-reset-btn" onclick="Portal.submitResetPasswordEmail()" style="width:100%;padding:11px;font-size:13px;margin-bottom:8px">
              <i class="fas fa-check-circle"></i> تأیید کد و تغییر رمز عبور
            </button>

            <div style="display:flex;justify-content:space-between;align-items:center;margin-top:10px">
              <button type="button" class="portal-btn portal-btn-ghost" onclick="Portal.resetForgotEmailStep()" style="font-size:11px;padding:4px 8px">
                <i class="fas fa-arrow-right"></i> تغییر ایمیل
              </button>
              <button type="button" id="forgot-email-resend-btn" class="portal-btn portal-btn-ghost" onclick="Portal.sendForgotPasswordEmail()" style="font-size:11px;padding:4px 8px" disabled>
                ارسال مجدد کد (<span id="forgot-resend-timer">60</span>)
              </button>
            </div>
          </div>
        </div>

        <!-- تب ۲: بازیابی مدیر با Join Code -->
        <div id="forgot-content-mgr" style="display:none">
          <p style="font-size:12px;color:rgba(255,255,255,0.6);margin:0 0 12px;line-height:1.7">
            مدیر گرامی، برای بازیابی آنی رمز عبور بدون نیاز به ایمیل یا پیامک، شماره همراه خود و <strong>کد اختصاصی اتصال به استودیو (Join Code)</strong> را وارد کنید:
          </p>
          <div class="auth-field" style="margin-bottom:10px">
            <label class="auth-label" style="font-size:11px">شماره همراه مدیر</label>
            <div class="auth-input-wrap">
              <i class="fas fa-phone"></i>
              <input type="tel" id="reset-phone" class="ltr" dir="ltr" value="${Utils.escapeHtml(prefillPhone)}" placeholder="09121234567" style="font-size:13px" />
            </div>
          </div>
          <div class="auth-field" style="margin-bottom:10px">
            <label class="auth-label" style="font-size:11px">کد اختصاصی اتصال به استودیو (Studio Join Code)</label>
            <div class="auth-input-wrap">
              <i class="fas fa-fingerprint"></i>
              <input type="text" id="reset-joincode" class="ltr" dir="ltr" placeholder="مثال: R543WD" style="font-size:13px;text-transform:uppercase" />
            </div>
          </div>
          <div class="auth-field" style="margin-bottom:14px">
            <label class="auth-label" style="font-size:11px">رمز عبور جدید</label>
            <div class="auth-input-wrap">
              <i class="fas fa-lock"></i>
              <input type="password" id="reset-new-pw" class="ltr" dir="ltr" placeholder="حداقل ۴ کاراکتر" style="font-size:13px" />
            </div>
          </div>
          <div class="auth-error" id="reset-error" style="display:none;margin-bottom:10px"></div>
          <button type="button" class="portal-btn portal-btn-primary" id="reset-submit-btn" onclick="Portal.submitResetPassword()" style="width:100%;padding:11px;font-size:13px">
            <i class="fas fa-check-circle"></i> ثبت و ذخیره رمز عبور جدید
          </button>
        </div>

        <!-- تب ۳: راهنمای پرسنل -->
        <div id="forgot-content-staff" style="display:none;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:14px;padding:16px;line-height:1.8">
          <p style="font-size:12.5px;color:rgba(255,255,255,0.85);margin:0 0 10px">
            <strong style="color:#4ade80"><i class="fas fa-user-gear"></i> بازیابی رمز پرسنل و عکاسان:</strong>
          </p>
          <p style="font-size:12px;color:rgba(255,255,255,0.6);margin:0 0 12px">
            چنانچه ایمیل خود را در سیستم ثبت کرده‌اید، می‌توانید از برگه <strong>«ارسال به ایمیل»</strong> رمز خود را تغییر دهید. همچنین مدیریت استودیو می‌تواند در پنل در بخش <strong>«پرسنل»</strong>، در چند ثانیه رمز جدید یا کد ورود شما را بازنشانی فرماید.
          </p>
          <button type="button" class="portal-btn portal-btn-ghost" onclick="document.getElementById('forgot-pw-modal').remove()" style="width:100%;font-size:12px">متوجه شدم</button>
        </div>

        <!-- تب ۴: راهنمای مشتری -->
        <div id="forgot-content-cust" style="display:none;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:14px;padding:16px;line-height:1.8">
          <p style="font-size:12.5px;color:rgba(255,255,255,0.85);margin:0 0 10px">
            <strong style="color:#38bdf8"><i class="fas fa-heart"></i> ورود عروس و داماد:</strong>
          </p>
          <p style="font-size:12px;color:rgba(255,255,255,0.6);margin:0 0 12px">
            مشتریان گرامی نیازی به رمز عبور جداگانه ندارند! رمز عبور پیش‌فرض شما همان <strong>«شماره قرارداد»</strong> مندرج در نسخه قرارداد یا رسید شماست (مثلاً <code dir="ltr">1042</code>). کافیست شماره همراه خود و شماره قرارداد را در فرم ورود وارد نمایید.
          </p>
          <button type="button" class="portal-btn portal-btn-ghost" onclick="document.getElementById('forgot-pw-modal').remove()" style="width:100%;font-size:12px">بازگشت به فرم ورود</button>
        </div>
      </div>`
    document.body.appendChild(overlay)
  },

  setForgotTab(tab) {
    const emailContent = document.getElementById('forgot-content-email')
    const mgrContent = document.getElementById('forgot-content-mgr')
    const staffContent = document.getElementById('forgot-content-staff')
    const custContent = document.getElementById('forgot-content-cust')

    const tabEmail = document.getElementById('forgot-tab-email')
    const tabMgr = document.getElementById('forgot-tab-mgr')
    const tabStaff = document.getElementById('forgot-tab-staff')
    const tabCust = document.getElementById('forgot-tab-cust')

    if (emailContent) emailContent.style.display = tab === 'email' ? 'block' : 'none'
    if (mgrContent) mgrContent.style.display = tab === 'mgr' ? 'block' : 'none'
    if (staffContent) staffContent.style.display = tab === 'staff' ? 'block' : 'none'
    if (custContent) custContent.style.display = tab === 'cust' ? 'block' : 'none'

    if (tabEmail) tabEmail.className = `portal-btn portal-btn-sm ${tab === 'email' ? 'portal-btn-primary' : 'portal-btn-ghost'}`
    if (tabMgr) tabMgr.className = `portal-btn portal-btn-sm ${tab === 'mgr' ? 'portal-btn-primary' : 'portal-btn-ghost'}`
    if (tabStaff) tabStaff.className = `portal-btn portal-btn-sm ${tab === 'staff' ? 'portal-btn-primary' : 'portal-btn-ghost'}`
    if (tabCust) tabCust.className = `portal-btn portal-btn-sm ${tab === 'cust' ? 'portal-btn-primary' : 'portal-btn-ghost'}`
  },

  resetForgotEmailStep() {
    const s1 = document.getElementById('forgot-email-step1')
    const s2 = document.getElementById('forgot-email-step2')
    if (s1) s1.style.display = 'block'
    if (s2) s2.style.display = 'none'
    if (this._forgotTimer) clearInterval(this._forgotTimer)
  },

  async sendForgotPasswordEmail() {
    const emailInp = document.getElementById('forgot-email-inp')
    const email = (emailInp?.value || '').trim()

    const showErr = (m) => {
      const el = document.getElementById('forgot-email-step2')?.style.display === 'block'
        ? document.getElementById('forgot-email-err2')
        : document.getElementById('forgot-email-err1')
      if (el) { el.textContent = m; el.style.display = 'block' }
    }
    const hideErr = () => {
      const e1 = document.getElementById('forgot-email-err1')
      const e2 = document.getElementById('forgot-email-err2')
      if (e1) e1.style.display = 'none'
      if (e2) e2.style.display = 'none'
    }
    hideErr()

    if (!email || !email.includes('@') || !email.includes('.')) {
      showErr('لطفاً یک آدرس ایمیل معتبر (مثال: name@gmail.com) وارد کنید')
      return
    }

    const btn = document.getElementById('forgot-email-send-btn')
    const resendBtn = document.getElementById('forgot-email-resend-btn')
    if (btn) {
      btn.disabled = true
      btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> در حال ارسال کد به ایمیل...'
    }
    if (resendBtn) resendBtn.disabled = true

    try {
      const res = await fetch('/api/auth/forgot-password/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      })
      const data = await res.json().catch(() => ({}))

      if (!res.ok || !data.ok) {
        showErr(data.error || 'خطا در ارسال کد به ایمیل')
        if (btn) {
          btn.disabled = false
          btn.innerHTML = '<i class="fas fa-paper-plane"></i> ارسال کد بازیابی به ایمیل'
        }
        return
      }

      // Transition to Step 2
      const s1 = document.getElementById('forgot-email-step1')
      const s2 = document.getElementById('forgot-email-step2')
      const maskedEl = document.getElementById('forgot-email-masked')
      if (s1) s1.style.display = 'none'
      if (s2) s2.style.display = 'block'
      if (maskedEl) maskedEl.textContent = data.maskedEmail || email

      if (data.smtpConfigured === false) {
        Utils.toast('⚠️ کد تولید شد اما ارسال ایمیل پیکربندی نشده — با مدیر سیستم تماس بگیرید', 'warning', 8000)
        const errEl = document.getElementById('forgot-email-err2')
        if (errEl) {
          errEl.style.display = 'block'
          errEl.innerHTML = '⚠️ <strong>سرور ایمیل پیکربندی نشده است.</strong> مدیر استودیو باید از پنل مدیریت → تنظیمات → پیام‌رسان‌ها → SMTP را تنظیم کند. در حال حاضر می‌توانید از تب «پیامک مدیر» استفاده کنید.'
        }
      } else {
        Utils.toast(data.message || 'کد تأیید به ایمیل ارسال شد', 'success', 5000)
      }
      if (typeof AudioNotifier !== 'undefined') AudioNotifier.playPing()

      document.getElementById('forgot-email-otp')?.focus()

      // Start Resend Countdown
      let countdown = 60
      const timerSpan = document.getElementById('forgot-resend-timer')
      if (this._forgotTimer) clearInterval(this._forgotTimer)
      this._forgotTimer = setInterval(() => {
        countdown--
        if (timerSpan) timerSpan.textContent = countdown
        if (countdown <= 0) {
          clearInterval(this._forgotTimer)
          if (resendBtn) {
            resendBtn.disabled = false
            resendBtn.innerHTML = '<i class="fas fa-redo"></i> ارسال مجدد کد'
          }
        }
      }, 1000)
    } catch (e) {
      showErr('خطا در برقراری ارتباط با سرور: ' + e.message)
    } finally {
      if (btn) {
        btn.disabled = false
        btn.innerHTML = '<i class="fas fa-paper-plane"></i> ارسال کد بازیابی به ایمیل'
      }
    }
  },

  async submitResetPasswordEmail() {
    const errEl = document.getElementById('forgot-email-err2')
    const email = (document.getElementById('forgot-email-inp')?.value || '').trim()
    const otpCode = (document.getElementById('forgot-email-otp')?.value || '').trim()
    const newPassword = (document.getElementById('forgot-email-newpw')?.value || '').trim()
    const confirmPw = (document.getElementById('forgot-email-newpw-confirm')?.value || '').trim()

    const showErr = (m) => { if (errEl) { errEl.textContent = m; errEl.style.display = 'block' } }
    if (errEl) errEl.style.display = 'none'

    if (!email) return showErr('ایمیل معتبر الزامی است')
    if (!otpCode || otpCode.length < 5) return showErr('کد ۶ رقمی دریافتی از ایمیل را وارد کنید')
    if (!newPassword || newPassword.length < 4) return showErr('رمز عبور جدید باید حداقل ۴ کاراکتر باشد')
    if (newPassword !== confirmPw) return showErr('تکرار رمز عبور جدید مطابقت ندارد')

    const btn = document.getElementById('forgot-email-reset-btn')
    if (btn) {
      btn.disabled = true
      btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> در حال اعتبارسنجی و ثبت رمز...'
    }

    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, otpCode, newPassword })
      })
      const data = await res.json().catch(() => ({}))

      if (!res.ok || !data.ok) {
        showErr(data.error || 'خطا در بازنشانی رمز عبور')
        if (btn) {
          btn.disabled = false
          btn.innerHTML = '<i class="fas fa-check-circle"></i> تأیید کد و تغییر رمز عبور'
        }
        return
      }

      Utils.toast(data.message || 'رمز عبور با موفقیت به‌روزرسانی شد', 'success', 5000)
      if (typeof AudioNotifier !== 'undefined') AudioNotifier.playContract()
      if (this._forgotTimer) clearInterval(this._forgotTimer)
      document.getElementById('forgot-pw-modal')?.remove()

      // Fill login fields
      const idInp = document.getElementById('login-identifier')
      const pwInp = document.getElementById('login-password')
      if (idInp) idInp.value = email
      if (pwInp) {
        pwInp.value = newPassword
        pwInp.focus()
      }
    } catch (e) {
      showErr('خطا در ارتباط با سرور: ' + e.message)
      if (btn) {
        btn.disabled = false
        btn.innerHTML = '<i class="fas fa-check-circle"></i> تأیید کد و تغییر رمز عبور'
      }
    }
  },

  async submitResetPassword() {
    const errEl = document.getElementById('reset-error')
    const phone = Utils.normalizePhone(document.getElementById('reset-phone')?.value)
    const joinCode = (document.getElementById('reset-joincode')?.value || '').trim().toUpperCase()
    const newPassword = document.getElementById('reset-new-pw')?.value?.trim()

    const showErr = (m) => { if (errEl) { errEl.textContent = m; errEl.style.display = 'block' } }
    if (errEl) errEl.style.display = 'none'

    if (!Utils.isValidPhone(phone)) return showErr('شماره موبایل مدیر نامعتبر است')
    if (!joinCode) return showErr('کد اختصاصی استودیو الزامی است')
    if (!newPassword || newPassword.length < 4) return showErr('رمز عبور جدید باید حداقل ۴ کاراکتر باشد')

    const btn = document.getElementById('reset-submit-btn')
    if (btn) {
      btn.disabled = true
      btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> در حال اعتبارسنجی...'
    }

    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, joinCode, newPassword })
      })
      const data = await res.json().catch(() => ({}))

      if (!res.ok || !data.ok) {
        showErr(data.error || 'خطا در بازنشانی رمز عبور')
        if (btn) {
          btn.disabled = false
          btn.innerHTML = '<i class="fas fa-check-circle"></i> ثبت و ذخیره رمز عبور جدید'
        }
        return
      }

      Utils.toast(data.message || 'رمز عبور با موفقیت به‌روزرسانی شد', 'success', 5000)
      if (typeof AudioNotifier !== 'undefined') AudioNotifier.playContract()
      document.getElementById('forgot-pw-modal')?.remove()

      // پر کردن خودکار فیلدهای لاگین
      const idInp = document.getElementById('login-identifier')
      const pwInp = document.getElementById('login-password')
      if (idInp) idInp.value = phone
      if (pwInp) {
        pwInp.value = newPassword
        pwInp.focus()
      }
    } catch (e) {
      showErr('خطا در ارتباط با سرور: ' + e.message)
      if (btn) {
        btn.disabled = false
        btn.innerHTML = '<i class="fas fa-check-circle"></i> ثبت و ذخیره رمز عبور جدید'
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
    const _pending = UnifiedLogin?.getPending?.()
    const channelName = this.state._otpChannel === 'bale' ? 'پیام‌رسان بله' : this.state._otpChannel === 'whatsapp' ? 'واتساپ' : 'پیامک'
    return `
      <div class="auth-form">
        <p class="auth-otp-meta">
          کد ورود به <strong dir="ltr">${Utils.escapeHtml(mask)}</strong> (${channelName}) ارسال شد.
        </p>

        ${this.state._otpChannel === 'bale' && this.state._baleBotUrl ? `
          <div style="text-align:center;margin-bottom:12px">
            <a href="${this.state._baleBotUrl}" target="_blank" style="display:inline-flex;align-items:center;gap:6px;font-size:11.5px;color:#60a5fa;text-decoration:none;padding:6px 14px;background:rgba(27,116,228,0.15);border:1px solid rgba(27,116,228,0.3);border-radius:8px">
              <i class="fas fa-external-link-alt"></i> باز کردن ربات بله ${(typeof DB !== 'undefined' && DB.get ? DB.get('studioInfo')?.name : null) || 'استودیو'}
            </a>
          </div>
        ` : ''}

        ${this.state._otpChannel === 'whatsapp' && this.state._whatsAppUrl ? `
          <div style="text-align:center;margin-bottom:12px">
            <a href="${this.state._whatsAppUrl}" target="_blank" style="display:inline-flex;align-items:center;gap:6px;font-size:11.5px;color:#4ade80;text-decoration:none;padding:6px 14px;background:rgba(37,211,102,0.15);border:1px solid rgba(37,211,102,0.3);border-radius:8px">
              <i class="fab fa-whatsapp"></i> باز کردن واتساپ استودیو
            </a>
          </div>
        ` : ''}

        <div class="auth-field">
          <label class="auth-label" for="login-otp">کد ۶ رقمی دریافتی</label>
          <div class="auth-input-wrap">
            <i class="fas fa-key"></i>
            <input type="text" id="login-otp" class="ltr auth-otp-input" dir="ltr" inputmode="numeric" maxlength="6" placeholder="123456" autofocus oninput="if(this.value.length===6)Portal.verifyOtp()"/>
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
      const descText = resolved.extraTitle ? `مدیریت استودیو • ${resolved.extraTitle}` : (resolved.roleTitle || 'مدیریت استودیو — پنل جامع سازمانی')
      chip.innerHTML = `
        <div class="auth-chip-icon"><i class="fas fa-crown"></i></div>
        <div class="auth-chip-info">
          <div class="auth-chip-title">خوش آمدید، ${Utils.escapeHtml(resolved.label)}</div>
          <div class="auth-chip-desc">${Utils.escapeHtml(descText)}</div>
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
          <div class="auth-chip-desc">داشبورد پیگیری مراسم و آلبوم عکس‌ها (${Utils.escapeHtml(resolved.eventDate || 'ثبت‌شده')})</div>
        </div>
      `
      chip.style.display = 'flex'
      if (btnLabel) btnLabel.textContent = 'ورود با شماره قرارداد'
      const pwInput = document.getElementById('login-password')
      if (pwInput) pwInput.placeholder = 'شماره قرارداد (مثلاً ۱۰۰۱ یا کد پیگیری)'

      const errEl = document.getElementById('login-error')
      if (errEl) {
        errEl.innerHTML = `
          <div style="font-size:12px;color:rgba(255,255,255,0.75);display:flex;align-items:center;gap:6px">
            <i class="fas fa-info-circle" style="color:var(--glass-accent,#F59E0B)"></i>
            ورود با <strong>شماره قرارداد</strong> یا
            <a href="javascript:void(0)" onclick="Portal.setLoginMethod('sms')" style="color:var(--glass-accent,#F59E0B);text-decoration:underline;font-weight:700">ارسال کد پیامکی</a>
          </div>
        `
        errEl.style.display = 'block'
      }
      return
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

    if (resolved && resolved.kind === 'customer' && !password) {
      this.setLoginMethod('sms')
      const idInput = document.getElementById('login-identifier')
      if (idInput) idInput.value = identifier
      await this.sendOtp()
      return
    }

    let result = await UnifiedLogin.loginWithPassword(identifier, password)

    // Fallback: If client-side DB has no user or password was invite code or contract number, verify via server-authoritative API
    if (!result.ok) {
      try {
        const srvRes = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ identifier, password })
        })
        if (srvRes.ok) {
          const srvJson = await srvRes.json()
          if (srvJson.ok) {
            if (srvJson.fullData && typeof DB !== 'undefined' && DB.importJSON) {
              await DB.importJSON(JSON.stringify(srvJson.fullData))
            }
            if (srvJson.syncToken) {
              localStorage.setItem('crmstudio_sync_token', srvJson.syncToken)
              if (typeof DB !== 'undefined' && DB.get && DB.set) {
                const info = DB.get('studioInfo') || {}
                info.syncToken = srvJson.syncToken
                DB.set('studioInfo', info)
              }
            }
            if (srvJson.tenantKey) {
              localStorage.setItem('crm_studio_id', srvJson.tenantKey)
              Utils?.storage?.set?.('talar_studio_id', srvJson.tenantKey)
              if (typeof window !== 'undefined' && window.ServerSync?.setStudioId) {
                window.ServerSync.setStudioId(srvJson.tenantKey)
              }
            }

            if (srvJson.userKind === 'customer' || srvJson.contract) {
              if (typeof CustomerSession !== 'undefined' && srvJson.contract) {
                const session = CustomerSession.create(srvJson.contract, identifier)
                await CustomerSession.save(session)
              }
              result = {
                ok: true,
                userKind: 'customer',
                user: srvJson.user,
                url: 'customer.html'
              }
            } else if (srvJson.user) {
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
      const params = new URLSearchParams(window.location.search)
      const nextParam = params.get('next')
      let target = null
      if (nextParam) {
        try {
          const decoded = decodeURIComponent(nextParam)
          target = Utils.safeRedirectPath?.(decoded.startsWith('/') ? decoded : `/${decoded}`) || Utils.safeAppRedirect?.(decoded)
        } catch { /* ignore */ }
      }
      if (!target) {
        target = result.url || (resolved ? UnifiedLogin.landingUrl(resolved, nextParam) : 'index.html')
      }
      const safe = Utils.safeRedirectPath?.(target.startsWith('/') ? target : `/${target}`) || Utils.safeAppRedirect?.(target)
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

  async requestMessengerOtp(channel = 'bale') {
    this._clearErr()
    const rawId = (document.getElementById('login-identifier')?.value || '').trim()
    const phone = Utils.normalizePhone(rawId)
    if (!phone || !/^09\d{9}$/.test(phone)) {
      this._err('لطفاً ابتدا شماره موبایل معتبر ۱۱ رقمی خود را وارد فرمایید (مثال: 09121234567)')
      document.getElementById('login-identifier')?.focus()
      return
    }

    this._setBtn(true, '<i class="fas fa-spinner fa-spin"></i> در حال ارتباط با ' + (channel === 'bale' ? 'بله...' : 'واتساپ...'))

    try {
      const res = await fetch('/api/auth/otp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, channel })
      })
      const data = await res.json().catch(() => ({}))
      this._setBtn(false, '')

      if (!res.ok || !data.ok) {
        this._err(data.error || 'خطا در ارسال کد تایید')
        return
      }

      this.state.step = 'otp'
      this.state._phone = phone
      this.state._otpChannel = channel
      this.state._baleBotUrl = data.baleBotUrl
      this.state._whatsAppUrl = data.whatsAppUrl

      if (data.demoCode) {
        Utils.toast(`کد ورود: ${data.demoCode}`, 'info', 12000)
      } else {
        Utils.toast(data.message || 'کد تایید با موفقیت ارسال شد', 'success')
      }

      this.renderAuth()
    } catch (e) {
      this._setBtn(false, '')
      this._err('عدم اتصال به سرور: ' + e.message)
    }
  },

  async verifyOtp() {
    this._clearErr()
    const phone = this.state._phone || UnifiedLogin.getPending()?.phone || Utils.normalizePhone(document.getElementById('login-identifier')?.value)
    const code = document.getElementById('login-otp')?.value
    if (!phone) { this.backToLogin(); return }

    this._setBtn(true, '')
    let result = await UnifiedLogin.verifyOtp(phone, code)

    // Fallback: Check server-authoritative verify (via /api/auth/otp/verify or /api/auth/verify-code)
    if (!result.ok) {
      try {
        let srvRes = await fetch('/api/auth/otp/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone, code })
        })
        if (!srvRes.ok) {
          srvRes = await fetch('/api/auth/verify-code', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone, code })
          })
        }
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

            if (srvJson.userKind === 'customer' || srvJson.contract) {
              if (typeof CustomerSession !== 'undefined' && srvJson.contract) {
                const session = CustomerSession.create(srvJson.contract, phone)
                await CustomerSession.save(session)
              }
              result = {
                ok: true,
                userKind: 'customer',
                user: srvJson.user,
                url: 'customer.html'
              }
            } else {
              result = {
                ok: true,
                user: srvJson.user,
                url: srvJson.user.portalType === 'staff' ? 'index.html?view=portal' : (Access?.canAccessStudioM?.(srvJson.user) ? 'studio-m/' : 'index.html?view=portal')
              }
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

    const params = new URLSearchParams(window.location.search)
    const nextParam = params.get('next')
    let target = null
    if (nextParam) {
      try {
        const decoded = decodeURIComponent(nextParam)
        target = Utils.safeRedirectPath?.(decoded.startsWith('/') ? decoded : `/${decoded}`) || Utils.safeAppRedirect?.(decoded)
      } catch { /* ignore */ }
    }
    if (!target) target = result.url
    const safe = Utils.safeRedirectPath?.(target.startsWith('/') ? target : `/${target}`) || Utils.safeAppRedirect?.(target)
    window.location.href = safe || target || 'index.html'
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
