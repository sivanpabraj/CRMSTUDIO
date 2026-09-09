/* Studio M — راه‌اندازی اول · پروفایل · امنیت */

const SMOnboarding = {
  needs(user) {
    user = user || (typeof SM !== 'undefined' ? SM.user() : Auth.getUser())
    if (!user) return false
    if (typeof Access !== 'undefined' && !Access.isStudioManager(user) && !Access.isSystemAdmin(user)) return false
    const info = DB.get('studioInfo') || {}
    return !info.setupCompleted || !user.profileCompleted || user.mustChangePassword
  },

  show() {
    document.getElementById('sm-onboarding-overlay')?.remove()
    const user = SM.user()
    const info = SM.studio()
    const overlay = document.createElement('div')
    overlay.id = 'sm-onboarding-overlay'
    overlay.className = 'sm-onboarding-overlay'
    overlay.innerHTML = `
      <div class="sm-onboarding-modal" role="dialog" aria-modal="true">
        <div class="sm-onboarding-icon"><i class="fas fa-shield-halved"></i></div>
        <h2>خوش آمدید — تکمیل تنظیمات</h2>
        <p class="sm-onboarding-lead">قبل از استفاده، اطلاعات خود و استودیو را تکمیل کنید. در صورت نیاز رمز ورود را تغییر دهید.</p>
        <div class="sm-onboarding-grid">
          ${SMUI.formField('نام و نام خانوادگی مدیر', 'onb-name', { value: user?.name || '' })}
          ${SMUI.formField('نام استودیو', 'onb-studio', { value: info.name || '' })}
          ${SMUI.formField('موبایل استودیو', 'onb-phone', { value: info.phone || user?.phone || '', dir: 'ltr' })}
          ${SMUI.formField('آدرس', 'onb-address', { type: 'textarea', value: info.address || '' })}
        </div>
        <div class="sm-onboarding-logo">
          <label>لوگو (اختیاری)</label>
          <input type="file" id="onb-logo" accept="image/*"/>
          <div id="onb-logo-preview" class="sm-logo-preview" style="margin-top:8px;width:80px;height:80px">${info.logo ? Utils.safeImgHtml(info.logo, '') : ''}</div>
        </div>
        <details class="sm-onboarding-pw-details">
          <summary>تغییر رمز (اختیاری — برای تست می‌توانید رد کنید)</summary>
          <div style="margin-top:10px">
            ${SMUI.formField('رمز فعلی', 'onb-pw-old', { type: 'password', dir: 'ltr' })}
            ${SMUI.formField('رمز جدید', 'onb-pw-new', { type: 'password', dir: 'ltr' })}
            ${SMUI.formField('تکرار رمز', 'onb-pw2', { type: 'password', dir: 'ltr' })}
          </div>
        </details>
        <label class="sm-check-row" style="margin:12px 0"><input type="checkbox" id="onb-keep-pw" checked/> فعلاً همان رمز فعلی بماند (تغییر رمز اختیاری است)</label>
        <p class="sm-onboarding-error" id="onb-error"></p>
        <button type="button" class="sm-btn sm-btn-primary sm-onboarding-submit" onclick="SMOnboarding.complete()">
          <i class="fas fa-check"></i> ذخیره و ورود به پنل
        </button>
      </div>`
    document.body.appendChild(overlay)
    overlay.querySelector('#onb-logo')?.addEventListener('change', e => {
      const f = e.target.files?.[0]
      if (!f) return
      const r = new FileReader()
      r.onload = () => {
        SMOnboarding._logoData = r.result
        const p = document.getElementById('onb-logo-preview')
        if (p) p.innerHTML = `<img src="${r.result}" alt=""/>`
      }
      r.readAsDataURL(f)
    })
    document.getElementById('onb-name')?.focus()
  },

  async complete() {
    const user = SM.user()
    if (!user) return
    const errEl = document.getElementById('onb-error')
    const err = msg => { if (errEl) { errEl.textContent = msg; errEl.style.display = 'block' } }

    const name = document.getElementById('onb-name')?.value?.trim()
    const studioName = document.getElementById('onb-studio')?.value?.trim()
    const phone = document.getElementById('onb-phone')?.value?.trim()
    const address = document.getElementById('onb-address')?.value?.trim()
    const keepPw = document.getElementById('onb-keep-pw')?.checked

    if (!name) return err('نام مدیر الزامی است')
    if (!studioName) return err('نام استودیو الزامی است')
    if (!phone) return err('موبایل استودیو الزامی است')

    if (!keepPw) {
      const oldPw = Utils.normalizePassword(document.getElementById('onb-pw-old')?.value || '')
      const newPw = Utils.normalizePassword(document.getElementById('onb-pw-new')?.value || '')
      const pw2 = Utils.normalizePassword(document.getElementById('onb-pw2')?.value || '')
      if (!oldPw) return err('رمز فعلی را وارد کنید')
      if (newPw !== pw2) return err('رمز جدید یکسان نیست')
      const pwErr = Auth.validatePassword(newPw)
      if (pwErr) return err(pwErr)
      const res = await Auth.updatePassword(user.id, oldPw, newPw)
      if (!res.ok) return err(res.error || 'خطا در تغییر رمز')
    }

    const prev = SM.studio()
    const patch = {
      ...prev,
      name: studioName,
      phone,
      address,
      manager: name,
      setupCompleted: true
    }
    if (typeof SiteBridge !== 'undefined') {
      patch.siteLinks = SiteBridge.defaultSiteLinksForStudio(studioName)
    }
    if (SMOnboarding._logoData) patch.logo = SMOnboarding._logoData

    try {
      Auth.getCsrfToken?.()
      await SecureDB.update('users', user.id, {
        name,
        profileCompleted: true,
        mustChangePassword: false
      })
      await SecureDB.merge('studioInfo', patch)
      DB.syncPersonnelFromUser(DB.find('users', u => u.id === user.id))
      if (typeof FirstSetup !== 'undefined') FirstSetup.clearLoginHint()
      DB.log('studio_onboarding', name)
      await DB.flush()
    } catch (e) {
      const msg = e?.message || ''
      if (/csrf/i.test(msg)) {
        Auth.getCsrfToken?.()
        return err('نشست منقضی شده — صفحه را رفرش کنید و دوباره تلاش کنید')
      }
      return err(msg || 'خطا در ذخیره تنظیمات')
    }

    document.getElementById('sm-onboarding-overlay')?.remove()
    SM.renderShell()
    document.title = `Studio M Pro — ${studioName}`
    SM.toast('تنظیمات ذخیره شد — خوش آمدید', 'success')
    SM.navigate('dashboard')
  },

  securityAudit() {
    const user = SM.user()
    const info = SM.studio()
    const checks = []

    checks.push({
      ok: !!(user?.password && (Utils.isPbkdf2Password?.(user.password) || /^pbkdf2\$/i.test(user.password))),
      label: 'رمز عبور با PBKDF2-SHA256 ذخیره شده'
    })
    checks.push({
      ok: !user?.mustChangePassword,
      label: 'رمز از حالت اولیه تغییر کرده (یا عمداً نگه داشته شده)'
    })
    checks.push({ ok: !!info.setupCompleted, label: 'راه‌اندازی اولیه تکمیل شده' })
    checks.push({
      ok: typeof SmsProvider !== 'undefined' && SmsProvider.isConfigured(),
      label: 'API پیامک متصل است',
      hint: 'تنظیمات → پیامک'
    })
    checks.push({
      ok: location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1',
      label: 'اتصال امن (HTTPS یا localhost)'
    })
    checks.push({
      ok: !!(info.autoBackup && (info.backupHourly || info.backupDaily)),
      label: 'پشتیبان خودکار فعال',
      optional: true
    })
    checks.push({
      ok: (DB.get('users') || []).filter(u => u.status === 'active').length <= 5,
      label: 'تعداد کاربر فعال معقول',
      optional: true
    })

    const required = checks.filter(c => !c.optional)
    const passed = required.filter(c => c.ok).length
    return { checks, passed, total: required.length, score: Math.round((passed / required.length) * 100) }
  }
}

window.SMOnboarding = SMOnboarding
