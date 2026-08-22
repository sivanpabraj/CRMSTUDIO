/**
 * Studio M Phase 2 — HMAC-signed local session (anti-forgery)
 */
const SessionSign = {
  SECRET_KEY: 'sm_session_secret',

  async _getSecret() {
    try {
      let s = sessionStorage.getItem(this.SECRET_KEY)
      if (!s) {
        s = Array.from(crypto.getRandomValues(new Uint8Array(32)))
          .map(b => b.toString(16).padStart(2, '0')).join('')
        sessionStorage.setItem(this.SECRET_KEY, s)
      }
      return s
    } catch {
      return null
    }
  },

  async _hmac(data, secret) {
    const enc = new TextEncoder()
    const key = await crypto.subtle.importKey(
      'raw',
      enc.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    )
    const sig = await crypto.subtle.sign('HMAC', key, enc.encode(data))
    return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('')
  },

  _payload(session) {
    return `${session.userId}|${session.expiresAt}|${session.csrf || ''}|${session.loginAt || 0}`
  },

  async sign(session) {
    if (!session?.userId) return session
    const secret = await this._getSecret()
    if (!secret) return session
    const sig = await this._hmac(this._payload(session), secret)
    return { ...session, sig, v: 1 }
  },

  async verify(session) {
    if (!session?.userId) return false
    /* Missing signature is always invalid — never trust unsigned session payloads. */
    if (!session.sig) return false
    try {
      const secret = sessionStorage.getItem(this.SECRET_KEY)
      if (!secret) return false
      const expected = await this._hmac(this._payload(session), secret)
      return session.sig === expected
    } catch {
      return false
    }
  },

  clearSecret() {
    try { sessionStorage.removeItem(this.SECRET_KEY) } catch { /* */ }
  }
}

window.SessionSign = SessionSign
