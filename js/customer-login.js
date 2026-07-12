/* ══════════════════════════════════════════════
   MAN — ورود مشتری (کد استودیو + موبایل + پیامک)
   ═════════════════════════════════════════════════ */

const CustomerLogin = {
  _step: 'phone',
  _otpKey: 'talar_customer_otp',
  OTP_TTL_MS: 10 * 60 * 1000,

  init() {
    document.body.classList.add('auth-screen')
    const params = new URLSearchParams(location.search)
    if (params.get('logout')) CustomerSession?.clear?.()
    this._step = 'phone'
    this.render()
  },

  render() {
    const params = new URLSearchParams(location.search)
    const prefillCode = Studio.normalizeCode(params.get('code') || '')
    const studio = Studio.ensureIdentity()
    const app = document.getElementById('customer-login-app')
    if (!app) return

    if (this._step === 'code') {
      const pending = this._getOtp()
      app.innerHTML = `
        <div class="auth-page">
          <div class="auth-layout" style="max-width:440px;margin:0 auto">
            <div class="auth-card glass-panel">
              <div class="auth-logo">
                <div class="auth-logo-ring"><i class="fas fa-shield-halved"></i></div>
                <span class="auth-badge">تأیید پیامکی</span>
                <h1 class="auth-title">کد ورود</h1>
                <p class="auth-sub">کد ارسال‌شده به <span dir="ltr">${Utils.escapeHtml(pending?.phone || '')}</span> را وارد کنید</p>
              </div>
              <div class="auth-form">
                <div class="auth-field">
                  <label class="auth-label">کد ۶ رقمی</label>
                  <div class="auth-input-wrap"><i class="fas fa-key"></i><input type="text" id="cl-otp" class="ltr" dir="ltr" inputmode="numeric" maxlength="6" placeholder="۱۲۳۴۵۶" autofocus/></div>
                </div>
                <div class="auth-error" id="cl-error"></div>
                <button type="button" class="auth-btn auth-btn-primary" onclick="CustomerLogin.verifyOtp()"><i class="fas fa-check"></i> ورود به پورتال</button>
                <button type="button" class="auth-btn auth-btn-ghost" style="margin-top:10px" onclick="CustomerLogin.backToPhone()"><i class="fas fa-arrow-right"></i> تغییر شماره</button>
              </div>
            </div>
          </div>
        </div>`
      return
    }

    app.innerHTML = `
      <div class="auth-page">
        <div class="auth-layout" style="max-width:440px;margin:0 auto">
          <div class="auth-card glass-panel">
            <div class="auth-logo">
              <div class="auth-logo-ring"><i class="fas fa-heart"></i></div>
              <span class="auth-badge">پورتال مشتری</span>
              <h1 class="auth-title">${Utils.escapeHtml(studio.name || 'استودیو')}</h1>
              <p class="auth-sub">کد استودیو + موبایل ثبت‌شده در قرارداد — ورود با پیامک</p>
            </div>
            <div class="auth-form">
              <div class="auth-field">
                <label class="auth-label">کد استودیو</label>
                <div class="auth-input-wrap">
                  <i class="fas fa-hashtag"></i>
                  <input type="text" id="cl-code" class="ltr" dir="ltr" maxlength="8" placeholder="ABC-123" value="${prefillCode ? Studio.formatCode(prefillCode) : ''}"/>
                </div>
              </div>
              <div class="auth-field">
                <label class="auth-label">موبایل (داماد یا عروس)</label>
                <div class="auth-input-wrap"><i class="fas fa-mobile-alt"></i><input type="tel" id="cl-phone" class="ltr" dir="ltr" inputmode="numeric" placeholder="09121234567"/></div>
              </div>
              <div class="auth-error" id="cl-error"></div>
              <button type="button" class="auth-btn auth-btn-primary" onclick="CustomerLogin.sendOtp()"><i class="fas fa-paper-plane"></i> ارسال کد ورود</button>
              <p class="pw-hint">با شماره موبایل شما در دیتابیس استعلام می‌شود. در صورت وجود قرارداد، کد پیامک می‌شود.</p>
              <p class="pw-hint"><a href="site.html">← بازگشت به صفحه اصلی</a></p>
            </div>
          </div>
        </div>
      </div>`
  },

  _contractPhones(c) {
    return [c.groomPhone, c.bridePhone, c.phoneGroom, c.phoneBride, c.phone]
      .map(p => Utils.normalizePhone(p))
      .filter(Boolean)
  },

  _findByPhone(phone) {
    return DB.get('contracts').filter(c => {
      if (c.status === 'cancelled') return false
      return this._contractPhones(c).includes(phone)
    })
  },

  _pickContract(list) {
    if (!list.length) return null
    const sorted = list.slice().sort((a, b) => {
      const da = a.eventDate || a.date || ''
      const db = b.eventDate || b.date || ''
      const daysA = Utils.daysUntil(da)
      const daysB = Utils.daysUntil(db)
      if (daysA !== null && daysB !== null) {
        if (daysA >= 0 && daysB >= 0) return daysA - daysB
        if (daysA >= 0) return -1
        if (daysB >= 0) return 1
      }
      return db.localeCompare(da)
    })
    return sorted[0]
  },

  _getOtp() {
    try { return JSON.parse(sessionStorage.getItem(this._otpKey) || 'null') } catch { return null }
  },

  _setOtp(data) {
    sessionStorage.setItem(this._otpKey, JSON.stringify(data))
  },

  _clearOtp() {
    sessionStorage.removeItem(this._otpKey)
  },

  backToPhone() {
    this._clearOtp()
    this._step = 'phone'
    this.render()
  },

  async sendOtp() {
    const errEl = document.getElementById('cl-error')
    const showErr = m => { if (errEl) { errEl.textContent = m; errEl.style.display = 'block' } }
    if (errEl) errEl.style.display = 'none'

    const code = Studio.normalizeCode(document.getElementById('cl-code')?.value)
    const phone = Utils.normalizePhone(document.getElementById('cl-phone')?.value)

    if (!Studio.validateJoinCode(code)) {
      showErr('کد استودیو اشتباه است.')
      return
    }
    if (!Utils.isValidPhone(phone)) {
      showErr('شماره موبایل نامعتبر است.')
      return
    }

    const locked = CustomerSession?.isLocked?.(phone)
    if (locked) {
      showErr(`ورود موقتاً قفل شده. ${locked} دقیقه دیگر تلاش کنید.`)
      return
    }

    const contracts = this._findByPhone(phone)
    if (!contracts.length) {
      CustomerSession?.recordFailedAttempt?.(phone)
      showErr('قراردادی با این شماره موبایل یافت نشد.')
      return
    }

    const otp = Utils.generateOtp6()
    const studio = DB.get('studioInfo')?.name || 'استودیو'
    const couple = this._pickContract(contracts)?.couple || 'قرارداد شما'
    const text = `${studio}\nکد ورود پورتال مشتری: ${otp}\n${couple}\nاعتبار: ۱۰ دقیقه`

    this._setOtp({
      phone,
      code: otp,
      joinCode: code,
      contractIds: contracts.map(c => c.id),
      expires: Date.now() + this.OTP_TTL_MS
    })

    if (typeof SmsProvider !== 'undefined' && SmsProvider.isConfigured()) {
      const res = await SmsProvider.sendStudio(phone, text)
      if (!res.ok) {
        showErr(res.error || 'خطا در ارسال پیامک')
        return
      }
    } else {
      Utils.toast(`کد تست ورود: ${otp}`, 'info', 8000)
    }

    this._step = 'code'
    this.render()
  },

  async verifyOtp() {
    const errEl = document.getElementById('cl-error')
    const showErr = m => { if (errEl) { errEl.textContent = m; errEl.style.display = 'block' } }
    if (errEl) errEl.style.display = 'none'

    const pending = this._getOtp()
    if (!pending) {
      showErr('ابتدا کد ورود را درخواست کنید.')
      this.backToPhone()
      return
    }
    if (Date.now() > pending.expires) {
      showErr('کد منقضی شده — دوباره درخواست دهید.')
      this.backToPhone()
      return
    }

    const input = Utils.faToEn(document.getElementById('cl-otp')?.value || '').replace(/\D/g, '')
    if (input !== pending.code) {
      CustomerSession?.recordFailedAttempt?.(pending.phone)
      showErr('کد وارد‌شده نادرست است.')
      return
    }

    const contracts = pending.contractIds
      .map(id => DB.find('contracts', c => c.id === id))
      .filter(Boolean)
    const contract = this._pickContract(contracts)
    if (!contract) {
      showErr('قرارداد یافت نشد.')
      return
    }

    CustomerSession?.clearAttempts?.(pending.phone)
    const session = CustomerSession.create(contract, pending.phone)
    session.joinCode = pending.joinCode
    await CustomerSession.save(session)
    this._clearOtp()
    await DB.flush?.()
    window.location.href = 'customer.html'
  }
}

document.addEventListener('DOMContentLoaded', () => Bootstrap.start(() => CustomerLogin.init()))
window.CustomerLogin = CustomerLogin
