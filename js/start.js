/* ══════════════════════════════════════════════
   MAN — راه‌اندازی اول استودیو + مدیر
   ══════════════════════════════════════════════ */

const StartPortal = {
  _pendingRegistration: null,

  _hasActiveManager() {
    if (!AppConfig.allowsLocalIdentity?.()) return !!Auth.getUser?.()
    return DB.get('users').some(u => {
      const roles = (u.roles || []).map(r => typeof normalizeRole === 'function' ? normalizeRole(r) : r)
      return u.status === 'active' && (roles.includes('studio_manager') || roles.includes('system_admin'))
    })
  },

  init() {
    if (this._hasActiveManager()) {
      window.location.replace('index.html')
      return
    }
    if (typeof Auth !== 'undefined') {
      Auth.logout?.()
      Auth.getCsrfToken?.()
    }
    document.body.classList.add('auth-screen')
    const app = document.getElementById('start-app')
    app.innerHTML = `
      <div class="auth-page">
        <div class="auth-layout" style="max-width:480px;margin:0 auto">
          <div class="auth-card glass-panel">
            <div class="auth-logo">
              <div class="auth-logo-ring"><i class="fas fa-crown"></i></div>
              <span class="auth-badge">راه‌اندازی استودیو</span>
              <h1 class="auth-title">استودیوی خود را بسازید</h1>
              <p class="auth-sub">نام استودیو، موبایل و رمز مدیر را وارد کنید — بعد وارد پنل می‌شوید</p>
            </div>
            <div class="auth-form">
              <div class="auth-field">
                <label class="auth-label">نام استودیو / آتلیه</label>
                <div class="auth-input-wrap"><i class="fas fa-store"></i><input type="text" id="st-studio-name" placeholder="مثلاً آتلیه مان"/></div>
              </div>
              <div class="auth-field">
                <label class="auth-label">نام مدیر</label>
                <div class="auth-input-wrap"><i class="fas fa-user-tie"></i><input type="text" id="st-manager-name"/></div>
              </div>
              <div class="auth-field">
                <label class="auth-label">موبایل مدیر</label>
                <div class="auth-input-wrap"><i class="fas fa-mobile-alt"></i><input type="tel" id="st-phone" class="ltr" dir="ltr" inputmode="numeric"/></div>
              </div>
              <div class="auth-field">
                <label class="auth-label">رمز عبور (انگلیسی، حداقل ۸ کاراکتر)</label>
                <div class="auth-input-wrap"><i class="fas fa-lock"></i><input type="password" id="st-pw" class="ltr" dir="ltr" lang="en" autocomplete="new-password"/></div>
              </div>
              ${PasswordSecurity.meterHtml('start')}
              <div class="auth-error" id="st-error"></div>
              <button type="button" class="auth-btn auth-btn-primary" onclick="StartPortal.submit()"><i class="fas fa-rocket"></i> ساخت استودیو</button>
              <p class="pw-hint"><a href="site.html">← بازگشت به صفحه اصلی</a></p>
            </div>
          </div>
        </div>
      </div>`
    PasswordSecurity.bind('st-pw', 'start')
  },

  showSuccess(joinCode, studioName, phone, password) {
    const app = document.getElementById('start-app')
    app.innerHTML = `
      <div class="auth-page">
        <div class="auth-layout" style="max-width:520px;margin:0 auto">
          <div class="auth-card glass-panel" style="text-align:center">
            <div style="font-size:3rem;margin:16px 0">✅</div>
            <h1 class="auth-title">${Utils.escapeHtml(studioName)}</h1>
            <p class="auth-sub">استودیو آماده است — مستقیم وارد پنل شوید</p>
            <button type="button" class="auth-btn auth-btn-primary" onclick="StartPortal.enterAdmin()"><i class="fas fa-cog"></i> ورود به پنل مدیر</button>
            <p class="pw-hint" style="margin-top:16px">پرسنل را بعداً از پنل اضافه کنید: نام + موبایل → یک کد ورود بگیرید.</p>
          </div>
        </div>
      </div>`
    this._pendingLogin = AppConfig.allowsLocalIdentity?.() ? { phone, password } : null
  },

  showCloudOtp(phone) {
    const app = document.getElementById('start-app')
    app.innerHTML = `
      <div class="auth-page">
        <div class="auth-layout" style="max-width:480px;margin:0 auto">
          <div class="auth-card glass-panel">
            <div class="auth-logo">
              <div class="auth-logo-ring"><i class="fas fa-shield-halved"></i></div>
              <span class="auth-badge">تأیید هویت سرور</span>
              <h1 class="auth-title">کد پیامکی را وارد کنید</h1>
              <p class="auth-sub">کد ارسال‌شده به <span dir="ltr">${Utils.escapeHtml(phone)}</span> فقط در Supabase بررسی می‌شود.</p>
            </div>
            <div class="auth-form">
              <div class="auth-field">
                <label class="auth-label" for="st-otp">کد ۶ رقمی</label>
                <div class="auth-input-wrap"><i class="fas fa-key"></i><input type="text" id="st-otp" class="ltr" dir="ltr" inputmode="numeric" maxlength="6" autocomplete="one-time-code"/></div>
              </div>
              <div class="auth-error" id="st-error"></div>
              <button type="button" class="auth-btn auth-btn-primary" id="st-verify-btn"><i class="fas fa-check"></i> تأیید و ساخت استودیو</button>
            </div>
          </div>
        </div>
      </div>`
    document.getElementById('st-verify-btn')?.addEventListener('click', () => this.verifyCloudSetup())
    document.getElementById('st-otp')?.focus()
  },

  async verifyCloudSetup() {
    const pending = this._pendingRegistration
    const errEl = document.getElementById('st-error')
    const showErr = message => {
      if (errEl) { errEl.textContent = message; errEl.style.display = 'block' }
    }
    if (!pending || !Cloud?.isConfigured?.()) {
      showErr('درخواست راه‌اندازی معتبر نیست؛ صفحه را دوباره باز کنید')
      return
    }
    const otp = Utils.faToEn(String(document.getElementById('st-otp')?.value || '')).replace(/\D/g, '')
    if (!/^\d{6}$/.test(otp)) { showErr('کد ۶ رقمی معتبر وارد کنید'); return }

    const verified = await Cloud.verifyPhoneOtp(pending.phone, otp)
    if (!verified.ok) { showErr('کد نامعتبر یا منقضی است'); return }
    const password = await Cloud.updateAuthPassword(pending.password)
    if (!password.ok) { showErr(password.error || 'ثبت رمز در سرور شکست خورد'); return }
    const registered = await Cloud.registerCurrentStudio({
      studioName: pending.studioName,
      phone: pending.phone,
      name: pending.managerName
    })
    if (!registered.ok) { showErr(registered.error || 'ساخت استودیو در سرور شکست خورد'); return }

    const { studioName, phone } = pending
    this._pendingRegistration = null
    this.showSuccess('', studioName, phone, '')
  },

  async enterAdmin() {
    if (!AppConfig.allowsLocalIdentity?.()) {
      if (Auth.getUser?.()?.cloudAuthoritative) window.location.href = 'studio-m/'
      else Utils.toast('نشست معتبر سرور یافت نشد', 'error')
      return
    }
    const creds = this._pendingLogin
    if (!creds?.phone) { window.location.href = 'index.html'; return }
    const result = await Auth.login(creds.phone, creds.password)
    if (result.ok) window.location.href = 'studio-m/'
    else Utils.toast(result.error || 'خطا در ورود', 'error')
  },

  async submit() {
    const errEl = document.getElementById('st-error')
    const showErr = m => { if (errEl) { errEl.textContent = m; errEl.style.display = 'block' } }
    if (errEl) errEl.style.display = 'none'

    const studioName = document.getElementById('st-studio-name')?.value?.trim()
    const managerName = document.getElementById('st-manager-name')?.value?.trim()
    const phone = Utils.normalizePhone(document.getElementById('st-phone')?.value)
    const password = Utils.normalizePassword(document.getElementById('st-pw')?.value)

    if (!studioName) { showErr('نام استودیو الزامی است'); return }
    if (!managerName) { showErr('نام مدیر الزامی است'); return }
    if (!Utils.isValidPhone(phone)) { showErr('شماره موبایل نامعتبر است'); return }
    const pwErr = Auth.validatePassword(password)
    if (pwErr) { showErr(pwErr); return }

    if (!AppConfig.allowsLocalIdentity?.()) {
      if (typeof Cloud === 'undefined' || !Cloud.isConfigured?.()) {
        showErr('پیکربندی Supabase در build وجود ندارد؛ راه‌اندازی محلی در production ممنوع است')
        return
      }
      const sent = await Cloud.sendPhoneOtp(phone)
      if (!sent.ok) { showErr(sent.error || 'ارسال کد تأیید ممکن نشد'); return }
      // Credentials remain in memory for the short verification step. They are
      // never written to localStorage, sessionStorage or IndexedDB.
      this._pendingRegistration = { studioName, managerName, phone, password }
      this.showCloudOtp(phone)
      return
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
      joinCode,
      slug: studioName.replace(/\s+/g, '-').slice(0, 24),
      address: '', social: '', logo: '',
      setupCompleted: true
    })

    if (!DB.get('banks').length) {
      DB.insert('banks', {
        id: 'bank_cash_' + Date.now(),
        name: 'صندوق نقدی',
        account: '', accountNumber: '', iban: '', shaba: '', card: '',
        balance: 0, color: '#22C55E', icon: '💰'
      })
    }

    const creds = await Auth.hashCredentials(password)
    const user = DB.insert('users', {
      name: managerName,
      phone,
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
    this._pendingLogin = { phone, password }
    this.showSuccess(joinCode, studioName, phone, password)
    } catch (e) {
      console.error('StartPortal.submit', e)
      showErr(e?.message || 'خطا در ساخت استودیو')
    }
  }
}

document.addEventListener('DOMContentLoaded', () => Bootstrap.start(() => StartPortal.init()))
window.StartPortal = StartPortal
