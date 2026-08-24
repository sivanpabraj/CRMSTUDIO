/* ══════════════════════════════════════════════
   MAN — عضویت پرسنل با کد استودیو
   ══════════════════════════════════════════════ */

const JoinPortal = {
  init() {
    if (typeof Auth !== 'undefined') Auth.getCsrfToken?.()
    document.body.classList.add('auth-screen')
    const params = new URLSearchParams(location.search)
    const prefill = Studio.normalizeCode(params.get('code') || '')
    const app = document.getElementById('join-app')
    const studio = Studio.get()
    app.innerHTML = `
      <div class="auth-page">
        <div class="auth-layout" style="max-width:440px;margin:0 auto">
          <div class="auth-card glass-panel">
            <div class="auth-logo">
              <div class="auth-logo-ring"><i class="fas fa-users"></i></div>
              <span class="auth-badge">عضویت پرسنل</span>
              <h1 class="auth-title">${Utils.escapeHtml(studio.name || 'استودیو')}</h1>
              <p class="auth-sub">کد عضویت را از مدیر استودیو بگیرید — بدون کد نمی‌توانید به استودی دیگر وصل شوید</p>
            </div>
            <div class="auth-form">
              <div class="auth-field">
                <label class="auth-label">کد استودیو (۶ حرف)</label>
                <div class="auth-input-wrap">
                  <i class="fas fa-hashtag"></i>
                  <input type="text" id="join-code" class="ltr" dir="ltr" maxlength="8" placeholder="ABC-123" value="${prefill ? Studio.formatCode(prefill) : ''}" autocomplete="off"/>
                </div>
              </div>
              <div class="auth-field">
                <label class="auth-label">نام و نام‌خانوادگی</label>
                <div class="auth-input-wrap"><i class="fas fa-user"></i><input type="text" id="join-name" autocomplete="name"/></div>
              </div>
              <div class="auth-field">
                <label class="auth-label">شماره موبایل</label>
                <div class="auth-input-wrap"><i class="fas fa-mobile-alt"></i><input type="tel" id="join-phone" class="ltr" dir="ltr" inputmode="numeric" autocomplete="tel"/></div>
              </div>
              <div class="auth-field">
                <label class="auth-label">رمز عبور (انگلیسی)</label>
                <div class="auth-input-wrap"><i class="fas fa-lock"></i><input type="password" id="join-pw" class="ltr" dir="ltr" lang="en" autocomplete="new-password"/></div>
              </div>
              ${PasswordSecurity.meterHtml('join')}
              <div class="auth-error" id="join-error"></div>
              <button type="button" class="auth-btn auth-btn-primary" data-csp-action="JoinPortal.submit"><i class="fas fa-paper-plane"></i> ارسال درخواست عضویت</button>
              <p class="pw-hint">پس از تأیید مدیر می‌توانید از <a href="index.html">صفحه ورود</a> وارد شوید.</p>
              <p class="pw-hint"><a href="site.html">← بازگشت به صفحه اصلی</a></p>
            </div>
          </div>
        </div>
      </div>`
    PasswordSecurity.bind('join-pw', 'join')
  },

  async submit() {
    const errEl = document.getElementById('join-error')
    const showErr = m => { if (errEl) { errEl.textContent = m; errEl.style.display = 'block' } }
    if (errEl) errEl.style.display = 'none'

    const code = Studio.normalizeCode(document.getElementById('join-code')?.value)
    const name = document.getElementById('join-name')?.value?.trim()
    const phone = Utils.normalizePhone(document.getElementById('join-phone')?.value)
    const password = Utils.normalizePassword(document.getElementById('join-pw')?.value)

    if (!Studio.validateJoinCode(code)) {
      showErr('کد استودیو اشتباه است. از مدیر استودی خود کد صحیح را بگیرید.')
      return
    }
    if (!name) { showErr('نام الزامی است'); return }
    if (!Utils.isValidPhone(phone)) { showErr('شماره موبایل نامعتبر است'); return }
    const pwErr = Auth.validatePassword(password)
    if (pwErr) { showErr(pwErr); return }
    if (DB.find('users', u => Utils.normalizePhone(u.phone) === phone)) {
      showErr('این شماره قبلاً ثبت شده. از صفحه ورود استفاده کنید.')
      return
    }

    const creds = await Auth.hashCredentials(password)
    await SecureDB.insert('users', {
      name, phone,
      password: creds.password,
      salt: creds.salt,
      roles: [],
      status: 'pending',
      avatar: name.charAt(0),
      studioJoinCode: code,
      createdAt: Utils.todayJalali()
    })
    await SecureDB.insert('notifications', {
      type: 'alert',
      title: '👥 درخواست عضویت پرسنل',
      text: `${name} — ${phone} — کد استودیو: ${Studio.formatCode(code)}`,
      read: false,
      createdAt: Utils.todayJalali()
    })
    Utils.toast('درخواست ارسال شد. منتظر تأیید مدیر باشید.', 'success')
    setTimeout(() => { window.location.href = 'index.html' }, 1500)
  }
}

document.addEventListener('DOMContentLoaded', () => Bootstrap.start(() => {
  Studio.ensureIdentity()
  JoinPortal.init()
}))
window.JoinPortal = JoinPortal
