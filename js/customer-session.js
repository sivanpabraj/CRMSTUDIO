/* ══════════════════════════════════════════════
   MAN — نشست امن پورتال مشتری
   ══════════════════════════════════════════════ */

const CustomerSession = {
  KEY: 'customer_session',

  _sessionPayload(session) {
    return `${session.contractId}|${session.cloudContractId || ''}|${session.studioId || ''}|${session.phone}|${session.token}|${session.expiresAt}`
  },

  _contractPhones(contract) {
    return [contract.groomPhone, contract.bridePhone, contract.phoneGroom, contract.phoneBride, contract.phone]
      .map(p => Utils.normalizePhone(p))
      .filter(Boolean)
  },

  create(contract, phone) {
    const norm = Utils.normalizePhone(phone)
    const token = Array.from(crypto.getRandomValues(new Uint8Array(16)))
      .map(b => b.toString(16).padStart(2, '0')).join('')
    return {
      contractId: contract.id,
      phone: norm,
      token,
      createdAt: Date.now(),
      expiresAt: Date.now() + AppConfig.CUSTOMER_SESSION_MS
    }
  },

  validate(raw) {
    if (!raw?.contractId) return { ok: false, reason: 'missing' }
    if (raw.expiresAt && Date.now() > raw.expiresAt) return { ok: false, reason: 'expired' }
    const contract = DB.find('contracts', c => c.id === raw.contractId)
    if (!contract) return { ok: false, reason: 'no_contract' }
    if (raw.phone) {
      const phones = this._contractPhones(contract)
      if (phones.length && !phones.includes(Utils.normalizePhone(raw.phone))) {
        return { ok: false, reason: 'phone_mismatch' }
      }
    }
    return { ok: true, contract }
  },

  _sessionGet(key, fallback) {
    try {
      const raw = sessionStorage.getItem(key)
      if (raw != null) return JSON.parse(raw)
    } catch { /* */ }
    const legacy = Utils.storage.get(key, fallback)
    if (legacy !== fallback && key === this.KEY) {
      try {
        sessionStorage.setItem(key, JSON.stringify(legacy))
        Utils.storage.remove(key)
      } catch { /* */ }
    }
    return legacy
  },

  _sessionSet(key, value) {
    try {
      sessionStorage.setItem(key, JSON.stringify(value))
    } catch {
      Utils.storage.set(key, value)
    }
  },

  _sessionRemove(key) {
    try { sessionStorage.removeItem(key) } catch { /* */ }
    Utils.storage.remove(key)
  },

  async get() {
    const raw = this._sessionGet(this.KEY, null)
    if (!raw) return null
    if (typeof SignedProof !== 'undefined' && SignedProof.verifyObject) {
      const sigOk = await SignedProof.verifyObject(raw, s => this._sessionPayload(s))
      if (!sigOk) {
        this.clear()
        return null
      }
    }
    const result = this.validate(raw)
    if (!result.ok) {
      this.clear()
      return null
    }
    return { ...raw, contract: result.contract }
  },

  async save(session) {
    let payload = session
    if (typeof SignedProof !== 'undefined' && SignedProof.signObject) {
      payload = await SignedProof.signObject(session, s => this._sessionPayload(s))
    }
    this._sessionSet(this.KEY, payload)
  },

  clear() {
    this._sessionRemove(this.KEY)
  },

  getAttempts(phoneOrLegacy, phone) {
    const p = Utils.normalizePhone(phone != null ? phone : phoneOrLegacy)
    if (typeof Auth !== 'undefined') return Auth._getAttempts(p)
    return { count: 0, lockedUntil: null }
  },

  recordFailedAttempt(phoneOrLegacy, phone) {
    const p = Utils.normalizePhone(phone != null ? phone : phoneOrLegacy)
    if (typeof Auth !== 'undefined') Auth._recordFailedAttempt(p)
    return Auth?._getAttempts?.(p) || { count: 0, lockedUntil: null }
  },

  clearAttempts(phoneOrLegacy, phone) {
    const p = Utils.normalizePhone(phone != null ? phone : phoneOrLegacy)
    if (typeof Auth !== 'undefined') Auth._clearAttempts(p)
  },

  isLocked(phoneOrLegacy, phone) {
    const p = Utils.normalizePhone(phone != null ? phone : phoneOrLegacy)
    if (typeof Auth !== 'undefined') {
      const mins = Auth.isLocked(p)
      return mins > 0 ? mins : null
    }
    return null
  }
}

window.CustomerSession = CustomerSession
