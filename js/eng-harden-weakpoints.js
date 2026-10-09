/**
 * سفت‌کردن نقاط ضعف واقعی
 * 1) باگ Auth: _clearFailedAttempts / CURRENT_USER_KEY
 * 2) پیدا کردن user با چند فرم شماره (بدون پچ دوباره login)
 * 3) roleLabel در SM.renderShell
 * 4) جلوگیری از پچ‌های تکراری روی Auth.login
 */
(function (w) {
  'use strict'

  function normPhone(raw) {
    let s = String(raw || '')
    s = s.replace(/[۰-۹]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d))
    s = s.replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d))
    s = s.replace(/\D/g, '')
    if (s.startsWith('98') && s.length === 12) s = '0' + s.slice(2)
    if (s.startsWith('9') && s.length === 10) s = '0' + s
    try {
      if (typeof Utils !== 'undefined' && Utils.normalizePhone) {
        const u = Utils.normalizePhone(s)
        if (u) return u
      }
    } catch { /* */ }
    return s
  }

  function phonesMatch(a, b) {
    const x = normPhone(a)
    const y = normPhone(b)
    if (!x || !y) return false
    return x === y || x.slice(-10) === y.slice(-10)
  }

  function hardenAuth() {
    if (typeof Auth === 'undefined') return

    // Alias باگ سرور-مسیر login
    if (!Auth._clearFailedAttempts) {
      Auth._clearFailedAttempts = function (k) {
        return this._clearAttempts?.(k)
      }
    }
    if (!Auth.CURRENT_USER_KEY) {
      Auth.CURRENT_USER_KEY = 'talar_current_user_cache'
    }

    // نرمال‌سازی همه شماره‌های users یک‌بار
    try {
      if (typeof DB !== 'undefined') {
        const list = DB.get('users') || []
        let ch = false
        list.forEach((u) => {
          if (!u?.phone) return
          const n = normPhone(u.phone)
          if (n && n !== u.phone) {
            u.phone = n
            ch = true
          }
        })
        if (ch) {
          DB.set('users', list)
          DB.flush?.()
        }
      }
    } catch { /* */ }

    // اگر login هنوز فقط === روی phone دارد، یک لایه نازک فقط برای not_found
    if (Auth.__hardenLogin) return
    Auth.__hardenLogin = true
    const orig = Auth.login.bind(Auth)
    Auth.login = async function (identifier, password) {
      const raw = String(identifier || '').trim()
      if (!raw.includes('@')) {
        const phone = normPhone(raw)
        // پیش‌بارگذاری: اگر با فرمت دیگر در DB است پیدا کن
        if (typeof DB !== 'undefined' && phone) {
          const u = (DB.get('users') || []).find((x) => phonesMatch(x.phone, phone))
          if (u && u.phone && u.phone !== phone) {
            // با phone ذخیره‌شده تلاش کن
            const res = await orig(u.phone, password)
            if (res.ok || res.code === 'wrong_password' || res.code === 'locked') return res
          }
        }
        const res = await orig(phone || raw, password)
        return res
      }
      return orig(identifier, password)
    }
  }

  function hardenShell() {
    if (typeof SM === 'undefined' || !SM.renderShell || SM.__hardenShell) return
    SM.__hardenShell = true
    const orig = SM.renderShell.bind(SM)
    SM.renderShell = function () {
      // roleLabel دیگر undefined نباشد
      if (typeof w.roleLabel === 'undefined') {
        w.roleLabel =
          typeof Access !== 'undefined' && Access.getPrimaryRoleLabel
            ? Access.getPrimaryRoleLabel(this.user?.() || null)
            : 'مدیر'
      }
      try {
        return orig()
      } catch (e) {
        if (String(e.message || e).includes('roleLabel')) {
          w.roleLabel = 'مدیر'
          return orig()
        }
        throw e
      }
    }

    // پیام ماژول خالی در خود navigate
    if (SM.navigate && !SM.__hardenNav) {
      SM.__hardenNav = true
      const nav = SM.navigate.bind(SM)
      SM.navigate = function (route) {
        nav(route)
        const main = document.getElementById('sm-content')
        if (!main) return
        const mod = typeof SMModules !== 'undefined' ? SMModules[route] : null
        if (mod?.render) return
        if (main.querySelector('.fa-puzzle-piece')) {
          main.innerHTML =
            '<div class="sm-empty" style="padding:40px;text-align:center">' +
            '<i class="fas fa-triangle-exclamation" style="color:#f59e0b;font-size:28px"></i>' +
            '<div style="margin-top:12px;font-weight:700">بخش بارگذاری نشد</div>' +
            '<p style="opacity:.6;font-size:13px">صفحه را تازه کنید یا از داشبورد برگردید.</p>' +
            '<button type="button" class="sm-btn sm-btn-primary" onclick="location.reload()">بارگذاری مجدد</button>' +
            '</div>'
        }
      }
    }
  }

  /** علامت بزن تا bridgeهای قدیمی login را دوباره نپیچند */
  function stopStackedAuthPatches() {
    if (typeof Auth === 'undefined') return
    Auth.__serverBridge = true
    Auth.__dbFix = true
  }

  function boot() {
    stopStackedAuthPatches()
    hardenAuth()
    hardenShell()
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(boot, 200))
  } else setTimeout(boot, 200)
  setTimeout(boot, 800)

  w.EngHarden = { boot, normPhone, phonesMatch }
})(typeof window !== 'undefined' ? window : globalThis)
