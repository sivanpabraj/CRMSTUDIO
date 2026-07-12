/**
 * Studio M Phase 3 — Bridge local Auth ↔ Supabase Cloud session
 */
const AuthBridge = {
  _lastAttemptAt: 0,

  _cloudPasswordKey() {
    const user = typeof Auth !== 'undefined' ? Auth.getUser() : null
    return user ? `sm_cloud_pw_hint_${user.id}` : null
  },

  rememberCloudPasswordAttempt(password) {
    const key = this._cloudPasswordKey()
    if (!key || !password) return
    try {
      sessionStorage.setItem(key, '1')
    } catch { /* */ }
  },

  _shouldUnify() {
    const info = typeof DB !== 'undefined' ? (DB.get('studioInfo') || {}) : {}
    return !!info.cloudEnabled && !!info.cloudUnifyPassword
  },

  async syncCloudSession({ phone, password, silent = true } = {}) {
    if (typeof Cloud === 'undefined' || !Cloud.isConfigured?.()) {
      return { ok: false, skipped: true, reason: 'cloud_not_configured' }
    }
    const info = typeof DB !== 'undefined' ? (DB.get('studioInfo') || {}) : {}
    if (!info.cloudEnabled) {
      return { ok: false, skipped: true, reason: 'cloud_disabled' }
    }

    const now = Date.now()
    if (now - this._lastAttemptAt < 5000) {
      return { ok: false, skipped: true, reason: 'debounce' }
    }
    this._lastAttemptAt = now

    const existing = await Cloud.session?.()
    if (existing) {
      await Cloud._loadMemberStudioId?.()
      return { ok: true, already: true }
    }

    const userPhone = phone || Auth.getUser?.()?.phone
    const pw = password || ''
    if (!userPhone || !pw) {
      return { ok: false, skipped: true, reason: 'no_credentials' }
    }

    const r = await Cloud.signIn({ phone: userPhone, password: pw })
    if (!r.ok) {
      if (!silent && typeof Utils !== 'undefined') {
        Utils.toast?.(`ابر: ${r.error || 'ورود ناموفق'}`, 'warning')
      }
      return r
    }
    this.rememberCloudPasswordAttempt(pw)
    return { ok: true }
  },

  async afterLocalLogin(user, password) {
    if (!user || !password) return
    if (typeof Cloud === 'undefined' || !Cloud.isConfigured?.()) return
    const info = typeof DB !== 'undefined' ? (DB.get('studioInfo') || {}) : {}
    if (!info.cloudEnabled) return
    await this.syncCloudSession({ phone: user.phone, password, silent: true })
  },

  async unifyPassword(newPassword) {
    if (!this._shouldUnify()) return { ok: true, skipped: true }
    if (typeof Cloud === 'undefined') return { ok: false, skipped: true }
    const sess = await Cloud.session?.()
    if (!sess) {
      const user = Auth.getUser?.()
      if (user && newPassword) {
        return this.syncCloudSession({ phone: user.phone, password: newPassword, silent: true })
      }
      return { ok: false, error: 'ابر: ابتدا وارد Supabase شوید' }
    }
    return Cloud.updateAuthPassword(newPassword)
  }
}

window.AuthBridge = AuthBridge
