/**
 * Studio M Phase 2 — HMAC-signed local session (anti-forgery)
 */
const SessionSign = {
  SECRET_KEY: 'sm_session_secret',

  async _getSecret() {
    try {
      let s = sessionStorage.getItem(this.SECRET_KEY)
      if (!s) {
        if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
          try {
            s = Array.from(crypto.getRandomValues(new Uint8Array(32)))
              .map(b => b.toString(16).padStart(2, '0')).join('')
          } catch { /* fallback */ }
        }
        if (!s) {
          s = Array.from({ length: 32 }, () => Math.floor(Math.random() * 256).toString(16).padStart(2, '0')).join('')
        }
        sessionStorage.setItem(this.SECRET_KEY, s)
      }
      return s
    } catch {
      return null
    }
  },

  async _hmac(data, secret) {
    if (typeof crypto !== 'undefined' && crypto.subtle?.importKey && crypto.subtle?.sign) {
      try {
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
      } catch { /* fallback */ }
    }
    if (typeof Utils !== 'undefined' && Utils.jsHmac) {
      return Utils.jsHmac(secret, data)
    }
    return ''
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
    if (!session.sig) {
      return typeof AppConfig !== 'undefined' && AppConfig.isLocalDev?.()
    }
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
