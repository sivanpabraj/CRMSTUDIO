/**
 * رفع خطای «وارد نشده‌اید» در تعویض رمز اجباری پرسنل (ورود با کد دعوت)
 *
 * علت: loginWithInviteCode گاهی فقط از personnel می‌سازد و users را upsert نمی‌کند
 *       یا session.userId با رکورد users هم‌خوان نیست → Auth.getUser() = null
 */
(function (w) {
  'use strict'

  function upsertUser(partial) {
    if (typeof DB === 'undefined' || !partial?.id) return partial
    const list = DB.get('users') || []
    const i = list.findIndex((u) => u.id === partial.id)
    if (i >= 0) {
      list[i] = { ...list[i], ...partial }
    } else {
      const byPhone = list.findIndex(
        (u) =>
          partial.phone &&
          typeof Utils !== 'undefined' &&
          Utils.normalizePhone(u.phone) === Utils.normalizePhone(partial.phone)
      )
      if (byPhone >= 0) {
        list[byPhone] = { ...list[byPhone], ...partial, id: list[byPhone].id }
        partial = list[byPhone]
      } else {
        list.push(partial)
      }
    }
    DB.set('users', list)
    try {
      DB.flush?.()
    } catch { /* */ }
    return partial
  }

  function sessionUserId() {
    try {
      const s = Auth.getSession?.()
      return s?.userId || null
    } catch {
      return null
    }
  }

  function resolveUserForForcePw() {
    if (typeof Auth === 'undefined') return null
    let user = Auth.getUser?.()
    if (user) return user
    const uid = sessionUserId()
    if (!uid || typeof DB === 'undefined') return null
    user = DB.find?.('users', (u) => u.id === uid) || (DB.get('users') || []).find((u) => u.id === uid)
    if (user) return user
    // از personnel بساز
    const p =
      DB.find?.('personnel', (x) => x.id === uid) ||
      (DB.get('personnel') || []).find((x) => x.id === uid)
    if (p) {
      return upsertUser({
        id: p.id,
        name: p.name || 'همکار',
        phone: p.phone || '',
        roles: p.roles || ['photographer'],
        portalType: 'staff',
        status: 'active',
        mustChangePassword: true
      })
    }
    // آخرین تلاش: کاربر از session cache
    try {
      const raw = sessionStorage.getItem('talar_force_pw_user')
      if (raw) return JSON.parse(raw)
    } catch { /* */ }
    return null
  }

  function patchChangeOwnPassword() {
    if (typeof Auth === 'undefined') return
    if (Auth.__forcePwFixed) return
    Auth.__forcePwFixed = true

    const orig = Auth.changeOwnPassword?.bind(Auth)
    Auth.changeOwnPassword = async function (currentPassword, newPassword) {
      return SecureDB.runInternalAsync(async () => {
        let user = resolveUserForForcePw()
        if (!user) {
          // اگر فلگ اجبار روشن است ولی user نیست — از session بساز اسکلت
          const uid = sessionUserId()
          if (uid) {
            user = upsertUser({
              id: uid,
              name: 'همکار',
              phone: '',
              roles: ['photographer'],
              portalType: 'staff',
              status: 'active',
              mustChangePassword: true
            })
          }
        }
        if (!user) return { ok: false, error: 'وارد نشده‌اید — لطفاً دوباره با کد دعوت وارد شوید' }

        // اطمینان از وجود در جدول users
        user = upsertUser(user)

        const pwErr =
          typeof this.validatePassword === 'function'
            ? this.validatePassword(newPassword)
            : String(newPassword || '').length < 6
              ? 'رمز حداقل ۶ کاراکتر باشد'
              : null
        if (pwErr) return { ok: false, error: pwErr }

        // در حالت force/invite، current خالی مجاز است
        const force =
          user.mustChangePassword ||
          this._getForcePwFlag?.() ||
          this.getSession?.()?.inviteLogin
        if (currentPassword && !force) {
          const match = await Utils.verifyPassword(
            Utils.normalizePassword(currentPassword),
            user.password,
            user.salt || ''
          )
          if (!match) return { ok: false, error: 'رمز فعلی اشتباه است' }
        }

        const creds = await this.hashCredentials(Utils.normalizePassword(newPassword))
        DB.update('users', user.id, {
          password: creds.password,
          salt: creds.salt,
          mustChangePassword: false,
          isDefaultPassword: false,
          portalStatus: 'active'
        })
        await DB.flush?.()

        // نشست را دوباره محکم کن تا getUser بعد از این کار کند
        const csrf =
          typeof this._regenerateCsrf === 'function'
            ? this._regenerateCsrf()
            : String(Date.now())
        await this._sessionSetSigned?.(this.SESSION_KEY, {
          userId: user.id,
          loginAt: Date.now(),
          expiresAt: Date.now() + (this.SESSION_TIMEOUT_MS || 8 * 3600 * 1000),
          csrf
        })
        try {
          sessionStorage.setItem(this.CSRF_KEY, csrf)
        } catch { /* */ }

        this._setForcePwFlag?.(false)
        try {
          sessionStorage.removeItem('talar_force_pw_user')
        } catch { /* */ }

        // همگام سرور (اختیاری)
        try {
          const phone = user.phone
          if (phone) {
            fetch('/api/auth/change-password', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ phone, newPassword })
            }).catch(() => {})
          }
        } catch { /* */ }

        return { ok: true, user: DB.find('users', (u) => u.id === user.id) || user }
      })
    }
  }

  function patchInviteLoginUpsert() {
    if (typeof Auth === 'undefined' || !Auth.loginWithInviteCode || Auth.__inviteUpsert) return
    Auth.__inviteUpsert = true
    const orig = Auth.loginWithInviteCode.bind(Auth)
    Auth.loginWithInviteCode = async function (phone, code) {
      const res = await orig(phone, code)
      if (res?.ok && res.user) {
        const u = upsertUser({
          ...res.user,
          mustChangePassword: res.mustChangePassword !== false
        })
        try {
          sessionStorage.setItem('talar_force_pw_user', JSON.stringify(u))
        } catch { /* */ }
        // اگر session خالی ماند دوباره بنویس
        if (!this.getSession?.()?.userId && u.id) {
          const csrf =
            typeof this._regenerateCsrf === 'function'
              ? this._regenerateCsrf()
              : String(Date.now())
          await this._sessionSetSigned?.(this.SESSION_KEY, {
            userId: u.id,
            loginAt: Date.now(),
            expiresAt: Date.now() + (this.SESSION_TIMEOUT_MS || 8 * 3600 * 1000),
            csrf,
            inviteLogin: true
          })
        }
        this._setForcePwFlag?.(true)
        res.user = u
      }
      return res
    }
  }

  function boot() {
    patchChangeOwnPassword()
    patchInviteLoginUpsert()
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      setTimeout(boot, 300)
      setTimeout(boot, 1200)
    })
  } else {
    setTimeout(boot, 300)
    setTimeout(boot, 1200)
  }

  w.EngForcePwFix = { boot, resolveUserForForcePw }
})(typeof window !== 'undefined' ? window : globalThis)
