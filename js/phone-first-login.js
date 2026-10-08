/* ══════════════════════════════════════════════════════════════════════════
   CRMSTUDIO — Phone-First Smart Authentication Flow
   فلو هوشمند موبایل‌اول + تشخیص نقش خودکار + QR دعوت
   ══════════════════════════════════════════════════════════════════════════ */

(function () {
  'use strict'

  const PhoneFirstLogin = {
    state: {
      phone: '',
      step: 'phone', // 'phone' | 'password' | 'invite' | 'customer' | 'not_found'
      lookup: null,
      loading: false,
      error: ''
    },

    init() {
      if (typeof window === 'undefined' || typeof document === 'undefined') return
      if (typeof Auth !== 'undefined' && Auth.isLoggedIn && Auth.isLoggedIn()) return
      const params = new URLSearchParams(window.location.search || '')
      if (params.get('view') === 'portal' && typeof Auth !== 'undefined' && Auth.getUser && Auth.getUser()) return
      this.attach()
    },

    attach() {
      if (typeof Auth !== 'undefined' && Auth.isLoggedIn && Auth.isLoggedIn()) return
      const params = new URLSearchParams(window.location.search || '')
      if (params.get('view') === 'portal' && typeof Auth !== 'undefined' && Auth.getUser && Auth.getUser()) return
      if (document.querySelector('.portal-shell') || document.body.classList.contains('portal-app')) return
      const container = document.getElementById('auth-login-view')
      if (!container) return
      // Render the Phone-First interface
      this.render(container)
    },

    render(container) {
      if (!container) container = document.getElementById('auth-login-view')
      if (!container) return

      const { step, phone, lookup, loading, error } = this.state

      let bodyHtml = ''

      if (step === 'phone') {
        bodyHtml = `
          <div class="pfl-step pfl-step-phone">
            <div class="auth-field">
              <label class="auth-label" for="pfl-phone-input">شماره موبایل</label>
              <div class="auth-input-wrap">
                <i class="fas fa-mobile-screen"></i>
                <input type="tel" id="pfl-phone-input" class="ltr" dir="ltr" inputmode="tel"
                  placeholder="۰۹۱۲۳۴۵۶۷۸۹" value="${Utils?.escapeHtml?.(phone) || ''}"
                  autocomplete="tel" autofocus />
              </div>
              <p style="font-size:11.5px;color:rgba(255,255,255,0.55);margin:6px 0 0;line-height:1.6">
                شماره همراه خود را وارد کنید تا به صورت خودکار به پنل اختصاصی خود متصل شوید.
              </p>
            </div>

            ${error ? `<div class="auth-error" style="display:block;margin-bottom:12px">${Utils?.escapeHtml?.(error)}</div>` : ''}

            <button type="button" class="auth-btn auth-btn-primary" id="pfl-submit-btn" style="width:100%;margin-top:8px" ${loading ? 'disabled' : ''}>
              ${loading ? '<i class="fas fa-spinner fa-spin"></i> در حال بررسی...' : 'ادامه <i class="fas fa-arrow-left"></i>'}
            </button>

            <!-- بخش QR و عضویت پرسنل در پایین صفحه -->
            <div style="margin-top:24px;padding-top:16px;border-top:1px solid rgba(255,255,255,0.08);text-align:center">
              <div style="display:flex;align-items:center;justify-content:center;gap:12px;margin-bottom:10px">
                <a href="join.html" class="sm-btn-link" style="font-size:12px;color:#38bdf8;text-decoration:none">
                  <i class="fas fa-id-card"></i> عضویت پرسنل با کد استودیو
                </a>
                <span style="color:rgba(255,255,255,0.2)">•</span>
                <button type="button" onclick="PhoneFirstLogin.showQrModal()" class="sm-btn-link" style="font-size:12px;color:#f59e0b;background:none;border:none;cursor:pointer">
                  <i class="fas fa-qrcode"></i> نمایش QR ورود
                </button>
              </div>
            </div>
          </div>
        `
      } else if (step === 'password') {
        const studioName = lookup?.studioName || 'استودیو'
        const roleLabel = lookup?.roleTitle || (lookup?.userKind === 'manager' ? 'مدیر استودیو' : 'همکار')
        bodyHtml = `
          <div class="pfl-step pfl-step-pw">
            <div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.1);border-radius:12px;padding:12px 14px;margin-bottom:16px;display:flex;justify-content:space-between;align-items:center">
              <div>
                <div style="font-size:11px;color:rgba(255,255,255,0.5)">ورود به:</div>
                <strong style="font-size:13px;color:#f59e0b">${Utils?.escapeHtml?.(studioName)}</strong>
                <span style="font-size:11px;color:#38bdf8;margin-right:6px">(${Utils?.escapeHtml?.(roleLabel)})</span>
              </div>
              <button type="button" class="sm-btn-link" onclick="PhoneFirstLogin.backToPhone()" style="font-size:11px;color:rgba(255,255,255,0.7);background:none;border:none;cursor:pointer">
                تغییر شماره <i class="fas fa-pen"></i>
              </button>
            </div>

            <div class="auth-field" id="login-pw-field">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
                <label class="auth-label" for="pfl-password-input" style="margin:0">رمز عبور شخصی</label>
                <button type="button" onclick="Portal?.showForgotPassword?.()" style="background:none;border:none;color:#f59e0b;font-size:11.5px;cursor:pointer">فراموشی رمز؟</button>
              </div>
              <div class="auth-input-wrap">
                <i class="fas fa-lock"></i>
                <input type="password" id="pfl-password-input" class="ltr" dir="ltr" placeholder="••••••••" autocomplete="current-password" autofocus />
              </div>
            </div>

            ${error ? `<div class="auth-error" style="display:block;margin-bottom:12px">${Utils?.escapeHtml?.(error)}</div>` : ''}

            <button type="button" class="auth-btn auth-btn-primary" id="pfl-pw-submit" style="width:100%;margin-top:8px" ${loading ? 'disabled' : ''}>
              ${loading ? '<i class="fas fa-spinner fa-spin"></i> در حال ورود...' : 'ورود به پنل <i class="fas fa-arrow-left"></i>'}
            </button>

            ${lookup?.hasInviteCode || lookup?.userKind === 'staff' ? `
              <div style="text-align:center;margin-top:14px">
                <button type="button" class="sm-btn-link" onclick="PhoneFirstLogin.switchToInvite()" style="font-size:12px;color:#38bdf8;background:none;border:none;cursor:pointer">
                  <i class="fas fa-ticket-alt"></i> ورود با کد ۶ رقمی پرسنل
                </button>
              </div>` : ''}
          </div>
        `
      } else if (step === 'invite') {
        const studioName = lookup?.studioName || 'استودیو'
        const roleLabel = lookup?.roleTitle || 'همکار استودیو'
        bodyHtml = `
          <div class="pfl-step pfl-step-invite">
            <div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.1);border-radius:12px;padding:12px 14px;margin-bottom:16px;display:flex;justify-content:space-between;align-items:center">
              <div>
                <div style="font-size:11px;color:rgba(255,255,255,0.5)">پورتال همکاران:</div>
                <strong style="font-size:13px;color:#38bdf8">${Utils?.escapeHtml?.(studioName)}</strong>
                <span style="font-size:11px;color:#f59e0b;margin-right:6px">(${Utils?.escapeHtml?.(roleLabel)})</span>
              </div>
              <button type="button" class="sm-btn-link" onclick="PhoneFirstLogin.backToPhone()" style="font-size:11px;color:rgba(255,255,255,0.7);background:none;border:none;cursor:pointer">
                تغییر شماره <i class="fas fa-pen"></i>
              </button>
            </div>

            <div class="auth-field">
              <label class="auth-label" for="pfl-invite-input">🔑 کد ورود اختصاصی ۶ رقمی (از مدیر استودیو)</label>
              <div class="auth-input-wrap">
                <i class="fas fa-ticket-alt"></i>
                <input type="text" id="pfl-invite-input" class="ltr" dir="ltr" inputmode="numeric"
                  placeholder="مثلاً ۱۲۳۴۵۶" style="font-size:16px;letter-spacing:3px;font-weight:700;color:#38bdf8;text-align:center" autocomplete="one-time-code" autofocus />
              </div>
              <p style="font-size:11.5px;color:rgba(255,255,255,0.55);margin:6px 0 0;line-height:1.6">
                کد ورود ۶ رقمی پیامک‌شده یا اعلام‌شده توسط مدیر استودیو را وارد کنید. پس از ورود، رمز شخصی دلخواه خود را تعیین خواهید کرد.
              </p>
            </div>

            ${error ? `<div class="auth-error" style="display:block;margin-bottom:12px">${Utils?.escapeHtml?.(error)}</div>` : ''}

            <button type="button" class="auth-btn auth-btn-primary" id="pfl-invite-submit" style="width:100%;margin-top:8px" ${loading ? 'disabled' : ''}>
              ${loading ? '<i class="fas fa-spinner fa-spin"></i> در حال اعتبارسنجی...' : 'ورود به کارتابل همکاران <i class="fas fa-arrow-left"></i>'}
            </button>

            ${lookup?.hasPassword ? `
              <div style="text-align:center;margin-top:14px">
                <button type="button" class="sm-btn-link" onclick="PhoneFirstLogin.switchToPassword()" style="font-size:12px;color:rgba(255,255,255,0.7);background:none;border:none;cursor:pointer">
                  ورود با رمز عبور شخصی
                </button>
              </div>` : ''}
          </div>
        `
      } else if (step === 'customer') {
        const studioName = lookup?.studioName || 'استودیو'
        bodyHtml = `
          <div class="pfl-step pfl-step-customer">
            <div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.1);border-radius:12px;padding:12px 14px;margin-bottom:16px;display:flex;justify-content:space-between;align-items:center">
              <div>
                <div style="font-size:11px;color:rgba(255,255,255,0.5)">پرتال مشتریان:</div>
                <strong style="font-size:13px;color:#10b981">${Utils?.escapeHtml?.(studioName)}</strong>
                <div style="font-size:11px;color:rgba(255,255,255,0.6)">پیگیری قرارداد و انتخاب عکس</div>
              </div>
              <button type="button" class="sm-btn-link" onclick="PhoneFirstLogin.backToPhone()" style="font-size:11px;color:rgba(255,255,255,0.7);background:none;border:none;cursor:pointer">
                تغییر شماره <i class="fas fa-pen"></i>
              </button>
            </div>

            <div class="auth-field">
              <label class="auth-label" for="pfl-customer-pw">کد پیگیری قرارداد یا رمز عبور</label>
              <div class="auth-input-wrap">
                <i class="fas fa-key"></i>
                <input type="text" id="pfl-customer-pw" class="ltr" dir="ltr" placeholder="کد پیگیری / رمز" autofocus />
              </div>
            </div>

            ${error ? `<div class="auth-error" style="display:block;margin-bottom:12px">${Utils?.escapeHtml?.(error)}</div>` : ''}

            <button type="button" class="auth-btn auth-btn-primary" id="pfl-cust-submit" style="width:100%;margin-top:8px" ${loading ? 'disabled' : ''}>
              ${loading ? '<i class="fas fa-spinner fa-spin"></i> ورود...' : 'مشاهده وضعیت سفارش و عکس‌ها <i class="fas fa-arrow-left"></i>'}
            </button>
          </div>
        `
      } else if (step === 'not_found') {
        bodyHtml = `
          <div class="pfl-step pfl-step-notfound">
            <div style="text-align:center;margin-bottom:16px">
              <div style="width:48px;height:48px;border-radius:16px;background:rgba(245,158,11,0.12);color:#f59e0b;font-size:20px;display:flex;align-items:center;justify-content:center;margin:0 auto 10px;border:1px solid rgba(245,158,11,0.25)">
                <i class="fas fa-user-plus"></i>
              </div>
              <h3 style="font-size:15px;margin:0 0 4px;color:#fff">شماره در سیستم یافت نشد</h3>
              <p style="font-size:12px;color:rgba(255,255,255,0.6);margin:0">شماره <strong dir="ltr">${Utils?.escapeHtml?.(phone)}</strong> تا کنون ثبت نشده است. نقش خود را انتخاب کنید:</p>
            </div>

            <div style="display:flex;flex-direction:column;gap:10px;margin-bottom:16px">
              <!-- کارت ۱: مدیر استودیو -->
              <div onclick="PhoneFirstLogin.chooseRole('manager')" style="background:rgba(255,255,255,0.035);border:1px solid rgba(255,255,255,0.1);border-radius:14px;padding:12px 14px;cursor:pointer;display:flex;align-items:center;gap:12px;transition:all 0.2s" onmouseover="this.style.borderColor='#f59e0b'" onmouseout="this.style.borderColor='rgba(255,255,255,0.1)'">
                <div style="width:38px;height:38px;border-radius:12px;background:rgba(245,158,11,0.15);color:#f59e0b;font-size:18px;display:flex;align-items:center;justify-content:center">
                  🎬
                </div>
                <div style="flex:1">
                  <strong style="display:block;font-size:13px;color:#fff;margin-bottom:2px">مدیر استودیو هستم</strong>
                  <span style="font-size:11px;color:rgba(255,255,255,0.55)">ثبت‌نام استودیو جدید و راه‌اندازی پنل ابری</span>
                </div>
                <i class="fas fa-chevron-left" style="color:rgba(255,255,255,0.4);font-size:12px"></i>
              </div>

              <!-- کارت ۲: پرسنل استودیو -->
              <div onclick="PhoneFirstLogin.chooseRole('staff')" style="background:rgba(255,255,255,0.035);border:1px solid rgba(255,255,255,0.1);border-radius:14px;padding:12px 14px;cursor:pointer;display:flex;align-items:center;gap:12px;transition:all 0.2s" onmouseover="this.style.borderColor='#38bdf8'" onmouseout="this.style.borderColor='rgba(255,255,255,0.1)'">
                <div style="width:38px;height:38px;border-radius:12px;background:rgba(56,189,248,0.15);color:#38bdf8;font-size:18px;display:flex;align-items:center;justify-content:center">
                  👥
                </div>
                <div style="flex:1">
                  <strong style="display:block;font-size:13px;color:#fff;margin-bottom:2px">پرسنل و همکار استودیو</strong>
                  <span style="font-size:11px;color:rgba(255,255,255,0.55)">ورود با کد دعوت یا اتصال با کد استودیو</span>
                </div>
                <i class="fas fa-chevron-left" style="color:rgba(255,255,255,0.4);font-size:12px"></i>
              </div>

              <!-- کارت ۳: مشتری استودیو -->
              <div onclick="PhoneFirstLogin.chooseRole('customer')" style="background:rgba(255,255,255,0.035);border:1px solid rgba(255,255,255,0.1);border-radius:14px;padding:12px 14px;cursor:pointer;display:flex;align-items:center;gap:12px;transition:all 0.2s" onmouseover="this.style.borderColor='#10b981'" onmouseout="this.style.borderColor='rgba(255,255,255,0.1)'">
                <div style="width:38px;height:38px;border-radius:12px;background:rgba(16,185,129,0.15);color:#10b981;font-size:18px;display:flex;align-items:center;justify-content:center">
                  💒
                </div>
                <div style="flex:1">
                  <strong style="display:block;font-size:13px;color:#fff;margin-bottom:2px">عروس و داماد / مشتری</strong>
                  <span style="font-size:11px;color:rgba(255,255,255,0.55)">رزرو وقت مشاوره، پیگیری قرارداد و تحویل کار</span>
                </div>
                <i class="fas fa-chevron-left" style="color:rgba(255,255,255,0.4);font-size:12px"></i>
              </div>
            </div>

            <div style="text-align:center">
              <button type="button" class="sm-btn-link" onclick="PhoneFirstLogin.backToPhone()" style="font-size:12px;color:rgba(255,255,255,0.6);background:none;border:none;cursor:pointer">
                <i class="fas fa-arrow-right"></i> ویرایش شماره موبایل
              </button>
            </div>
          </div>
        `
      }

      container.innerHTML = bodyHtml
      this.bindEvents()
    },

    bindEvents() {
      // Step: phone
      const phoneInput = document.getElementById('pfl-phone-input')
      const submitBtn = document.getElementById('pfl-submit-btn')
      if (phoneInput && submitBtn) {
        phoneInput.onkeydown = (e) => {
          if (e.key === 'Enter') submitBtn.click()
        }
        submitBtn.onclick = () => this.handlePhoneSubmit()
      }

      // Step: password
      const pwInput = document.getElementById('pfl-password-input')
      const pwSubmit = document.getElementById('pfl-pw-submit')
      if (pwInput && pwSubmit) {
        pwInput.onkeydown = (e) => {
          if (e.key === 'Enter') pwSubmit.click()
        }
        pwSubmit.onclick = () => this.handlePasswordSubmit()
      }

      // Step: invite
      const inviteInput = document.getElementById('pfl-invite-input')
      const inviteSubmit = document.getElementById('pfl-invite-submit')
      if (inviteInput && inviteSubmit) {
        inviteInput.onkeydown = (e) => {
          if (e.key === 'Enter') inviteSubmit.click()
        }
        inviteSubmit.onclick = () => this.handleInviteSubmit()
      }

      // Step: customer
      const custInput = document.getElementById('pfl-customer-pw')
      const custSubmit = document.getElementById('pfl-cust-submit')
      if (custInput && custSubmit) {
        custInput.onkeydown = (e) => {
          if (e.key === 'Enter') custSubmit.click()
        }
        custSubmit.onclick = () => this.handleCustomerSubmit()
      }
    },

    async handlePhoneSubmit() {
      const input = document.getElementById('pfl-phone-input')
      const raw = input ? input.value : this.state.phone
      const phone = Utils.normalizePhone(raw)

      if (!Utils.isValidPhone(phone)) {
        this.state.error = 'شماره موبایل واردشده نامعتبر است (مثال: 09181234567)'
        this.render()
        return
      }

      this.state.phone = phone
      this.state.loading = true
      this.state.error = ''
      this.render()

      try {
        // Query server pre-auth lookup
        let lookupData = null
        try {
          const res = await fetch(`/api/auth/lookup?phone=${encodeURIComponent(phone)}`, { cache: 'no-store' })
          if (res.ok) {
            lookupData = await res.json()
          }
        } catch { /* network err */ }

        // Local DB fallback check
        if (!lookupData?.found && typeof DB !== 'undefined') {
          const localUser = DB.find('users', u => u.phone && Utils.normalizePhone(u.phone) === phone)
          const localPersonnel = DB.find('personnel', p => p.phone && Utils.normalizePhone(p.phone) === phone)
          const localStudio = DB.get('studioInfo') || {}
          if (localUser || localPersonnel) {
            const isMgr = localUser?.roles?.includes('studio_manager')
            lookupData = {
              ok: true,
              found: true,
              studioName: localStudio.name || 'استودیو',
              userKind: isMgr ? 'manager' : 'staff',
              roleTitle: isMgr ? 'مدیر استودیو' : 'همکار',
              hasPassword: Boolean(localUser?.password),
              hasInviteCode: Boolean(localPersonnel?.inviteCode || localUser?.inviteCode)
            }
          }
        }

        this.state.loading = false
        this.state.lookup = lookupData

        if (lookupData && lookupData.found) {
          if (lookupData.userKind === 'manager') {
            this.state.step = 'password'
          } else if (lookupData.userKind === 'staff') {
            if (lookupData.hasPassword && !lookupData.hasInviteCode) {
              this.state.step = 'password'
            } else {
              this.state.step = 'invite'
            }
          } else if (lookupData.userKind === 'customer') {
            this.state.step = 'customer'
          } else {
            this.state.step = lookupData.hasPassword ? 'password' : 'invite'
          }
        } else {
          this.state.step = 'not_found'
        }
      } catch (e) {
        this.state.loading = false
        this.state.error = e?.message || 'خطا در بررسی شماره'
      }

      this.render()
    },

    async handlePasswordSubmit() {
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
        const res = await Auth.login(this.state.phone, pw)
        if (!res.ok) {
          this.state.loading = false
          this.state.error = res.error || 'رمز عبور نادرست است'
          this.render()
          return
        }

        if (res.mustChangePassword) {
          Portal.showForcePasswordChange?.()
          return
        }

        window.location.href = res.url || Auth.getLandingUrl()
      } catch (err) {
        this.state.loading = false
        this.state.error = err.message || 'خطا در ورود'
        this.render()
      }
    },

    async handleInviteSubmit() {
      const codeInput = document.getElementById('pfl-invite-input')
      const code = codeInput?.value || ''
      if (!code) {
        this.state.error = 'کد ورود را وارد کنید'
        this.render()
        return
      }

      this.state.loading = true
      this.state.error = ''
      this.render()

      try {
        const res = await Auth.loginWithInviteCode(this.state.phone, code)
        if (!res.ok) {
          this.state.loading = false
          this.state.error = res.error || 'کد ورود نامعتبر است'
          this.render()
          return
        }

        if (res.mustChangePassword) {
          Portal.showForcePasswordChange?.()
          return
        }

        window.location.href = res.url || Auth.getLandingUrl()
      } catch (err) {
        this.state.loading = false
        this.state.error = err.message || 'خطا در ورود'
        this.render()
      }
    },

    async handleCustomerSubmit() {
      const pwInput = document.getElementById('pfl-customer-pw')
      const pw = pwInput?.value || ''
      this.state.loading = true
      this.state.error = ''
      this.render()

      try {
        const res = await Auth.login(this.state.phone, pw)
        if (res.ok) {
          window.location.href = res.url || 'customer.html'
        } else {
          this.state.loading = false
          this.state.error = res.error || 'کد پیگیری یافت نشد'
          this.render()
        }
      } catch (err) {
        this.state.loading = false
        this.state.error = err.message || 'خطا در ورود'
        this.render()
      }
    },

    backToPhone() {
      this.state.step = 'phone'
      this.state.error = ''
      this.render()
    },

    switchToInvite() {
      this.state.step = 'invite'
      this.state.error = ''
      this.render()
    },

    switchToPassword() {
      this.state.step = 'password'
      this.state.error = ''
      this.render()
    },

    chooseRole(role) {
      if (role === 'manager') {
        Portal.setAuthTab('register')
        const regPhone = document.getElementById('reg-phone')
        if (regPhone) regPhone.value = this.state.phone
      } else if (role === 'staff') {
        window.location.href = `join.html?phone=${encodeURIComponent(this.state.phone)}`
      } else if (role === 'customer') {
        Portal.setAuthTab('login')
        Utils.toast('جهت پیگیری یا ثبت رزرو، لطفاً با استودیو هماهنگ نمایید', 'info')
      }
    },

    showQrModal() {
      const joinUrl = `${window.location.origin}/app/join.html`
      const studioName = (typeof DB !== 'undefined' && DB.get('studioInfo')?.name) || 'استودیو'
      const qrApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(joinUrl)}`

      const overlay = document.createElement('div')
      overlay.className = 'portal-modal-overlay open'
      overlay.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.85);display:flex;align-items:center;justify-content:center;padding:16px'
      overlay.innerHTML = `
        <div class="auth-card glass-panel" style="max-width:380px;width:100%;padding:24px;border-radius:20px;text-align:center;color:#fff">
          <h3 style="margin:0 0 6px;font-size:16px">📱 بارکد (QR) دعوت پرسنل و مراجعین</h3>
          <p style="font-size:12px;color:rgba(255,255,255,0.6);margin:0 0 16px">${Utils.escapeHtml(studioName)}</p>
          <div style="background:#fff;padding:12px;border-radius:14px;display:inline-block;margin-bottom:16px">
            <img src="${qrApiUrl}" alt="QR Code" style="display:block;width:200px;height:200px" />
          </div>
          <div style="display:flex;flex-direction:column;gap:8px">
            <button type="button" class="auth-btn auth-btn-primary" onclick="Utils.copyText('${joinUrl}'); Utils.toast('لینک کپی شد','success'); this.closest('.portal-modal-overlay').remove()">
              <i class="fas fa-copy"></i> کپی لینک دعوت همکاران
            </button>
            <button type="button" class="auth-btn auth-btn-ghost" onclick="this.closest('.portal-modal-overlay').remove()">
              بستن
            </button>
          </div>
        </div>
      `
      document.body.appendChild(overlay)
    }
  }

  window.PhoneFirstLogin = PhoneFirstLogin

  // Auto-boot when DOM ready
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => setTimeout(() => PhoneFirstLogin.init(), 100))
    } else {
      setTimeout(() => PhoneFirstLogin.init(), 100)
    }
  }
})()
