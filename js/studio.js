/* ══════════════════════════════════════════════
   MAN — Studio identity & join code
   ══════════════════════════════════════════════ */

const Studio = {
  CODE_CHARS: 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789',

  get() {
    return DB.get('studioInfo') || {}
  },

  normalizeCode(code) {
    if (!code) return ''
    return Utils.faToEn(String(code)).trim().toUpperCase().replace(/[^A-Z0-9]/g, '')
  },

  generateJoinCode() {
    const chars = this.CODE_CHARS
    const bytes = crypto.getRandomValues(new Uint8Array(6))
    let out = ''
    for (let i = 0; i < 6; i++) out += chars[bytes[i] % chars.length]
    return out
  },

  /** اطمینان از وجود شناسه و کد عضویت استودیو */
  ensureIdentity() {
    const info = this.get()
    const patch = {}
    if (!info.id) patch.id = 'studio_' + Date.now()
    if (!info.joinCode) patch.joinCode = this.generateJoinCode()
    if (!info.slug && info.name) {
      patch.slug = String(info.name).replace(/\s+/g, '-').slice(0, 24) || 'studio'
    }
    if (Object.keys(patch).length) {
    SecureDB.merge('studioInfo', { ...info, ...patch })
    }
    return { ...info, ...patch }
  },

  validateJoinCode(code) {
    const expected = this.normalizeCode(this.get().joinCode)
    const given = this.normalizeCode(code)
    return !!(expected && given && expected === given)
  },

  formatCode(code) {
    const c = this.normalizeCode(code)
    return c.length === 6 ? `${c.slice(0, 3)}-${c.slice(3)}` : c
  },

  getCustomerLoginUrl() {
    const _code = this.get().joinCode || ''
    const base = location.origin + location.pathname.replace(/[^/]*$/, '')
    return `${base}index.html`
  },

  getJoinUrl() {
    const code = this.get().joinCode || ''
    const base = location.origin + location.pathname.replace(/[^/]*$/, '')
    return `${base}join.html${code ? `?code=${encodeURIComponent(code)}` : ''}`
  },

  regenerateJoinCode() {
    const code = this.generateJoinCode()
    const info = this.get()
    SecureDB.merge('studioInfo', { ...info, joinCode: code })
    return code
  }
}

window.Studio = Studio
