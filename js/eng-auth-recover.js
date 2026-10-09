/**
 * بازیابی کاربر مدیر + یکسان‌سازی شماره در users
 * سناریو: ثبت‌نام OK → شناسایی استودیو OK → رمز → «ثبت نشده»
 */
(function () {
  'use strict'

  function digits(s) {
    s = String(s || '')
    s = s.replace(/[۰-۹]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d))
    s = s.replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d))
    return s.replace(/\D/g, '')
  }

  function norm(raw) {
    let d = digits(raw)
    if (d.startsWith('98') && d.length === 12) d = '0' + d.slice(2)
    if (d.startsWith('9') && d.length === 10) d = '0' + d
    try {
      if (typeof Utils !== 'undefined' && Utils.normalizePhone) {
        const u = Utils.normalizePhone(d || raw)
        if (u) return u
      }
    } catch { /* */ }
    return d
  }

  function normalizeAllUsers() {
    if (typeof DB === 'undefined') return
    const list = DB.get('users') || []
    let changed = false
    list.forEach((u) => {
      if (!u) return
      const n = norm(u.phone)
      if (n && n !== u.phone) {
        u.phone = n
        changed = true
      }
      if (u.email) u.email = String(u.email).trim().toLowerCase()
    })
    if (changed) {
      DB.set('users', list)
      try {
        DB.flush?.()
      } catch { /* */ }
    }
  }

  /** اگر studioInfo هست ولی users خالی است — از آنبوردینگ بساز */
  function recoverManagerFromStudio() {
    if (typeof DB === 'undefined') return
    const users = DB.get('users') || []
    const info = DB.get('studioInfo') || {}
    const phone = norm(info.phone || info.managerPhone || info.adminPhone || '')
    if (!phone) return
    if (users.some((u) => norm(u.phone) === phone)) return

    // پرسنل با نقش مدیر؟
    const pers = (DB.get('personnel') || []).find((p) => norm(p.phone) === phone)
    const name = info.managerName || pers?.name || info.name || 'مدیر استودیو'

    // بدون رمز نمی‌توان وارد شد — فقط اگر temp password در session باشد
    let tempPw = ''
    try {
      tempPw = sessionStorage.getItem('talar_reg_temp_pw') || ''
    } catch { /* */ }

    const row = {
      id: 'u_recover_' + Date.now(),
      name,
      phone,
      email: (info.email || '').toLowerCase() || '',
      roles: ['studio_manager'],
      status: 'active',
      portalType: 'manager',
      isDefaultPassword: !tempPw,
      mustChangePassword: !tempPw,
      createdAt: new Date().toISOString()
    }

    // اگر رمز موقت از ثبت‌نام هست هش کن
    const finish = async () => {
      if (tempPw && typeof Auth !== 'undefined' && Auth.hashCredentials) {
        try {
          const creds = await Auth.hashCredentials(
            typeof Utils !== 'undefined' && Utils.normalizePassword
              ? Utils.normalizePassword(tempPw)
              : tempPw
          )
          row.password = creds.password
          row.salt = creds.salt
          row.isDefaultPassword = false
          row.mustChangePassword = false
        } catch { /* */ }
      } else if (!row.password) {
        // بدون رمز — isDefaultPassword تا اولین رمز هرچه باشد پذیرفته شود (مسیر auth.js)
        row.password = ''
        row.salt = ''
        row.isDefaultPassword = true
      }
      const list = DB.get('users') || []
      list.push(row)
      DB.set('users', list)
      try {
        await DB.flush?.()
      } catch { /* */ }
      console.info('[eng-auth-recover] manager user restored', phone)
    }
    finish()
  }

  /** هنگام ثبت‌نام رمز را موقت نگه دار تا recover کار کند */
  function captureRegPassword() {
    const bind = () => {
      const btn = document.getElementById('reg-btn')
      const form = document.getElementById('auth-register-view')
      const handler = () => {
        const pw = document.getElementById('reg-password')?.value || ''
        const phone = norm(document.getElementById('reg-phone')?.value)
        if (pw) {
          try {
            sessionStorage.setItem('talar_reg_temp_pw', pw)
            sessionStorage.setItem('talar_reg_temp_phone', phone)
          } catch { /* */ }
        }
      }
      if (btn && !btn.__recoverCapture) {
        btn.__recoverCapture = true
        btn.addEventListener('click', handler, true)
      }
      if (form && !form.__recoverCapture) {
        form.__recoverCapture = true
        form.addEventListener('submit', handler, true)
      }
    }
    bind()
    setInterval(bind, 2000)
  }

  function boot() {
    normalizeAllUsers()
    recoverManagerFromStudio()
    captureRegPassword()
    // بعد از لود DB دوباره
    setTimeout(normalizeAllUsers, 2000)
    setTimeout(recoverManagerFromStudio, 2500)
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(boot, 400))
  } else setTimeout(boot, 400)

  window.EngAuthRecover = { norm, normalizeAllUsers, recoverManagerFromStudio }
})()
