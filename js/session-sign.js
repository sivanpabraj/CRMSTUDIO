/**
 * Studio M — HMAC-signed local session (anti-forgery) v2
 * Engineering upgrades:
 * - Fail closed on missing signature in production (not localhost)
 * - Meta marker for secret creation
 * - Rotate secret on explicit clear only
 */
const SessionSign = {
  SECRET_KEY: 'sm_session_secret',
  SECRET_KEY_META: 'sm_session_secret_meta',

  _isLocalHost() {
    try {
      const h = location.hostname
      return h === 'localhost' || h === '127.0.0.1' || h === '[::1]'
    } catch {
      return true
    }
  },

  async _getSecret() {
    try {
      let s = null
      try { s = localStorage.getItem(this.SECRET_KEY) } catch { /* */ }
      if (!s) {
        try { s = sessionStorage.getItem(this.SECRET_KEY) } catch { /* */ }
      }
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
        try { localStorage.setItem(this.SECRET_KEY, s) } catch { /* */ }
        try { sessionStorage.setItem(this.SECRET_KEY, s) } catch { /* */ }
        try {
          localStorage.setItem(this.SECRET_KEY_META, JSON.stringify({ createdAt: Date.now(), v: 2 }))
        } catch { /* */ }
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
    return { ...session, sig, v: 2 }
  },

  async verify(session) {
    if (!session?.userId) return false
    if (!session.sig) {
      return this._isLocalHost()
    }
    try {
      let secret = null
      try { secret = localStorage.getItem(this.SECRET_KEY) } catch { /* */ }
      if (!secret) {
        try { secret = sessionStorage.getItem(this.SECRET_KEY) } catch { /* */ }
      }
      if (!secret) {
        return this._isLocalHost()
      }
      const expected = await this._hmac(this._payload(session), secret)
      if (session.sig === expected) return true

      const altSecret = sessionStorage.getItem(this.SECRET_KEY)
      if (altSecret && altSecret !== secret) {
        const altExp = await this._hmac(this._payload(session), altSecret)
        if (session.sig === altExp) return true
      }
      return false
    } catch {
      return this._isLocalHost()
    }
  },

  clearSecret() {
    try { sessionStorage.removeItem(this.SECRET_KEY) } catch { /* */ }
    try { localStorage.removeItem(this.SECRET_KEY) } catch { /* */ }
    try { localStorage.removeItem(this.SECRET_KEY_META) } catch { /* */ }
  }
}

window.SessionSign = SessionSign
