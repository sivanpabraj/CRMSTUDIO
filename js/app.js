/* Studio M — ورود واحد · شناسایی خودکار از DB */
const Portal = {
  state: { currentUser: null, currentSection: 'overview', authTab: 'login', step: 'login', loginMethod: 'password', _phone: '' },

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
          <input type="text" id="login-identifier" class="ltr" dir="ltr" autocomplete="username" placeholder="0912... یا name@gmail.com" autofocus/>
        </div>
      </div>
      ${isPw ? `
      <div class="auth-field">
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
        <i class="fas fa-${isPw ? 'sign-in-alt' : 'paper-plane'}"></i> ${isPw ? 'ورود به پنل استودیو' : 'ارسال کد پیامکی'}
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

  _registerFields() {
    return `
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

      <div style="margin-top:14px;padding-top:10px;border-top:1px solid rgba(255,255,255,0.07);text-align:center;font-size:13px">
        <span style="color:rgba(255,255,255,0.65)">قبلاً استودیو ساخته‌اید؟ </span>
        <a href="javascript:void(0)" onclick="Portal.setAuthTab('login')" style="color:var(--glass-accent, #F59E0B);font-weight:800;text-decoration:none">
          <i class="fas fa-sign-in-alt"></i> ورود به سیستم
        </a>
      </div>`
  },

  _registerStep() {
    return `<div class="auth-form">${this._registerFields()}</div>`
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
          smsProxyUrl: 'https://gfzfmecglamyxevvttji.supabase.co/functions/v1/send-sms'
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

  setLoginMethod(method) {
    this.state.loginMethod = method
    const loginView = document.getElementById('auth-login-view')
    if (loginView) {
      loginView.innerHTML = this._loginFields()
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
        const pullUrl = `/api/sync/pull?phone=${encodeURIComponent(identifier)}`
        const res = await fetch(pullUrl, { cache: 'no-store' })
        if (res.ok) {
          const j = await res.json()
          if (j.data && typeof DB !== 'undefined' && DB.importJSON) {
            await DB.importJSON(JSON.stringify(j.data))
            if (typeof ServerSync !== 'undefined' && j.tenant) {
              ServerSync._localRevision = Number(j.revision) || ServerSync._localRevision
            }
          }
        }
        resolved = isEmail ? null : UnifiedLogin.resolvePhone(identifier)
      } catch { /* ignore */ }
    }

    if (resolved && resolved.kind === 'customer') {
      this._setBtn(false, '<i class="fas fa-sign-in-alt"></i> ورود به پنل استودیو')
      this._err('حساب‌های مشتریان با پیامک وارد می‌شوند — تب «ورود با پیامک» را انتخاب کنید')
      return
    }

    const result = await UnifiedLogin.loginWithPassword(identifier, password)
    this._setBtn(false, '<i class="fas fa-sign-in-alt"></i> ورود به پنل استودیو')

    if (!result.ok) {
      this._err(result.error || 'اطلاعات ورود یا رمز عبور اشتباه است')
      return
    }

    const finish = () => {
      const safe = Utils.safeAppRedirect?.(result.url)
      window.location.href = safe || result.url || 'studio-m/'
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
        const pullUrl = `/api/sync/pull?phone=${encodeURIComponent(phone)}`
        const res = await fetch(pullUrl, { cache: 'no-store' })
        if (res.ok) {
          const j = await res.json()
          if (j.data && typeof DB !== 'undefined' && DB.importJSON) {
            await DB.importJSON(JSON.stringify(j.data))
            if (typeof ServerSync !== 'undefined' && j.tenant) {
              ServerSync._localRevision = Number(j.revision) || ServerSync._localRevision
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
