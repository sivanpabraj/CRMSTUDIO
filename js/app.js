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
    const authTab = this.state.authTab || 'login'
    const step = this.state.step || 'login'
    const phone = this.state._phone || UnifiedLogin?.getPending?.()?.phone || ''
    const title = this._authTitle(studio)

    document.title = title === 'ورود' ? 'ورود و ثبت‌نام استودیو' : `${title} — ورود و ثبت‌نام`

    const body = step === 'otp' ? this._otpStep(phone)
      : step === 'portal_verify' ? this._portalVerifyStep(phone)
        : step === 'consultation' ? this._consultationStep(phone)
          : step === 'done' ? this._doneStep()
            : (authTab === 'register' ? this._registerStep() : this._loginStep())

    const subText = step === 'otp' ? 'کد ۶ رقمی را وارد کنید'
      : step === 'portal_verify' ? 'کد دعوت پرتال'
      : step === 'consultation' ? 'رزرو وقت مشاوره'
      : step === 'done' ? 'ثبت شد'
      : (authTab === 'register' ? 'اطلاعات استودیو و مدیر را برای ساخت پنل وارد کنید' : (this.state.loginMethod === 'password' ? 'شماره موبایل و رمز عبور خود را وارد کنید' : 'با شماره موبایل و کد پیامک وارد شوید'))

    document.getElementById('portal-app').innerHTML = `
      <div class="auth-page auth-page--unified">
        <canvas class="auth-ambient" data-auth-ambient aria-hidden="true"></canvas>
        <div class="auth-ambient-fallback" aria-hidden="true"></div>
        <div class="auth-unified-wrap">
          <div class="auth-card glass-panel auth-unified-card">
            <div class="auth-unified-head">
              <div class="auth-unified-logo">${this._logoHtml(studio)}</div>
              <h1 class="auth-title">${Utils.escapeHtml(title === 'ورود' ? 'ورود به مدیریت استودیو' : title)}</h1>
              <p class="auth-sub">${subText}</p>
            </div>
            ${step === 'login' ? `
            <div class="auth-method-tabs" style="margin-bottom:18px">
              <button type="button" class="auth-method-tab ${authTab === 'login' ? 'auth-method-tab--active' : ''}" onclick="Portal.setAuthTab('login')">
                <i class="fas fa-sign-in-alt"></i> ورود به سیستم
              </button>
              <button type="button" class="auth-method-tab ${authTab === 'register' ? 'auth-method-tab--active' : ''}" onclick="Portal.setAuthTab('register')">
                <i class="fas fa-user-plus"></i> ثبت‌نام استودیو
              </button>
            </div>` : ''}
            ${body}
            <p class="auth-unified-foot"><a href="site.html">صفحه اصلی</a></p>
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
    this.state.authTab = tab
    this.state.step = 'login'
    this.renderAuth()
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

  _loginStep() {
    const isPw = this.state.loginMethod === 'password'
    const params = new URLSearchParams(location.search)
    const showHint = params.get('fresh') === '1' ? this._firstSetupHintHtml() : ''
    return `
      ${showHint}
      <div class="auth-form">
        <div class="auth-field">
          <label class="auth-label" for="login-identifier">شماره موبایل یا ایمیل</label>
          <div class="auth-input-wrap">
            <i class="fas fa-user-circle"></i>
            <input type="text" id="login-identifier" class="ltr" dir="ltr" autocomplete="username" placeholder="0912... یا name@gmail.com" autofocus/>
          </div>
        </div>
        ${isPw ? `
        <div class="auth-field">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
            <label class="auth-label" for="login-password" style="margin:0">رمز عبور</label>
            <button type="button" onclick="Portal.togglePasswordVisibility('login-password', 'pw-eye-icon')" title="نمایش/پنهان‌سازی رمز" style="background:none;border:none;color:rgba(255,255,255,0.65);cursor:pointer;font-size:13px;padding:2px 6px">
              <i class="fas fa-eye" id="pw-eye-icon"></i>
            </button>
          </div>
          <div class="auth-input-wrap">
            <i class="fas fa-key"></i>
            <input type="password" id="login-password" class="ltr" dir="ltr" autocomplete="current-password" placeholder="رمز عبور خود را وارد کنید"/>
          </div>
        </div>` : ''}
        <div class="auth-error" id="login-error"></div>
        <button type="button" class="auth-btn auth-btn-primary" id="login-btn" onclick="Portal.${isPw ? 'loginPassword' : 'sendOtp'}()">
          <i class="fas fa-${isPw ? 'sign-in-alt' : 'paper-plane'}"></i> ${isPw ? 'ورود به پنل استودیو' : 'ارسال کد پیامکی'}
        </button>

        <div style="display:flex;justify-content:space-between;align-items:center;margin-top:16px;padding-top:12px;border-top:1px solid rgba(255,255,255,0.08);font-size:12px">
          <button type="button" onclick="Portal.setLoginMethod('${isPw ? 'sms' : 'password'}')" style="background:none;border:none;color:rgba(255,255,255,0.75);cursor:pointer;padding:0;font-family:inherit;font-size:12px;text-decoration:underline">
            ${isPw ? '<i class="fas fa-sms"></i> ورود با پیامک یک‌بار مصرف' : '<i class="fas fa-lock"></i> ورود با رمز عبور'}
          </button>
          <a href="javascript:void(0)" onclick="Portal.setAuthTab('register')" style="color:var(--glass-accent, #F59E0B);font-weight:700;text-decoration:none">
            <i class="fas fa-user-plus"></i> ساخت استودیو جدید
          </a>
        </div>
      </div>`
  },

  _registerStep() {
    return `
      <div class="auth-form">
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
        <div class="auth-field">
          <label class="auth-label" for="reg-phone">شماره همراه مدیر (جهت ورود و پیامک)</label>
          <div class="auth-input-wrap">
            <i class="fas fa-mobile-alt"></i>
            <input type="tel" id="reg-phone" class="ltr" dir="ltr" inputmode="numeric" placeholder="09121234567"/>
          </div>
        </div>
        <div class="auth-field">
          <label class="auth-label" for="reg-email">ایمیل / جیمیل استودیو <small style="opacity:0.65;font-weight:normal">(جهت بکاپ و اعلانات)</small></label>
          <div class="auth-input-wrap">
            <i class="fas fa-envelope"></i>
            <input type="email" id="reg-email" class="ltr" dir="ltr" placeholder="example@gmail.com"/>
          </div>
        </div>
        <div class="auth-field">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
            <label class="auth-label" for="reg-password" style="margin:0">رمز عبور مدیر (انگلیسی، حداقل ۸ کاراکتر)</label>
            <button type="button" onclick="Portal.togglePasswordVisibility('reg-password', 'reg-pw-eye-icon')" title="نمایش/پنهان‌سازی رمز" style="background:none;border:none;color:rgba(255,255,255,0.65);cursor:pointer;font-size:13px;padding:2px 6px">
              <i class="fas fa-eye" id="reg-pw-eye-icon"></i>
            </button>
          </div>
          <div class="auth-input-wrap">
            <i class="fas fa-lock"></i>
            <input type="password" id="reg-password" class="ltr" dir="ltr" lang="en" autocomplete="new-password" placeholder="رمز عبور جدید"/>
          </div>
        </div>
        <div class="auth-field">
          <label class="auth-label" for="reg-password-confirm">تکرار رمز عبور</label>
          <div class="auth-input-wrap">
            <i class="fas fa-shield-alt"></i>
            <input type="password" id="reg-password-confirm" class="ltr" dir="ltr" lang="en" autocomplete="new-password" placeholder="تکرار رمز عبور"/>
          </div>
        </div>
        ${typeof PasswordSecurity !== 'undefined' && PasswordSecurity.meterHtml ? PasswordSecurity.meterHtml('reg') : ''}
        <div class="auth-error" id="reg-error"></div>
        <button type="button" class="auth-btn auth-btn-primary" id="reg-btn" onclick="Portal.submitRegister()">
          <i class="fas fa-rocket"></i> ساخت و ثبت استودیو
        </button>

        <div style="margin-top:16px;padding-top:12px;border-top:1px solid rgba(255,255,255,0.08);text-align:center;font-size:13px">
          <span style="color:rgba(255,255,255,0.65)">قبلاً استودیو ساخته‌اید؟ </span>
          <a href="javascript:void(0)" onclick="Portal.setAuthTab('login')" style="color:var(--glass-accent, #F59E0B);font-weight:800;text-decoration:none">
            <i class="fas fa-sign-in-alt"></i> ورود به سیستم
          </a>
        </div>
      </div>`
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
        const user = DB.insert('users', {
          name: managerName,
          phone,
          email,
          password: creds.password,
          salt: creds.salt,
          roles: ['studio_manager'],
          status: 'active',
          avatar: managerName.charAt(0),
          mustChangePassword: true,
          isDefaultPassword: true,
          profileCompleted: false,
          createdAt: Utils.todayJalali()
        })
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
    this.renderAuth()
  },

  _bindStepKeys(step, authTab = 'login') {
    if (step === 'login') {
      if (authTab === 'register') {
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
      } else {
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
    this.renderAuth()
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
        if (typeof ServerSync !== 'undefined' && ServerSync.pull) {
          await ServerSync.pull({ initial: true })
        } else {
          const res = await fetch('/api/sync/pull?rev=0', { cache: 'no-store' })
          if (res.ok) {
            const j = await res.json()
            if (j.data && typeof DB !== 'undefined' && DB.importJSON) {
              await DB.importJSON(JSON.stringify(j.data))
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
