/* SecureDB — لایه نازک برای نوشتن امن با CSRF */
const SecureDB = {
  _wrapped: false,
  _authInternal: false,
  _systemSync: false,
  _origSet: null,
  _origInsert: null,
  _origUpdate: null,
  _origDelete: null,

  _token() {
    return typeof Auth !== 'undefined' && Auth.getCsrfToken ? Auth.getCsrfToken() : ''
  },

  _isSetupPhase() {
    if (typeof DB === 'undefined' || !DB.get) return false
    const users = DB.get('users') || []
    return !users.some(u => {
      const roles = (u.roles || []).map(r => typeof normalizeRole === 'function' ? normalizeRole(r) : r)
      return u.status === 'active' && (roles.includes('studio_manager') || roles.includes('system_admin'))
    })
  },

  /** @param {string} [collection] */
  _canWrite(collection) {
    if (this._authInternal || this._systemSync) return true
    if (collection === 'securityState' || collection === 'logs' || collection === 'commLogs') return true
    if (this._isSetupPhase()) return true
    if (typeof Auth === 'undefined' || !Auth.validateCsrf) return false
    const t = this._token()
    return !!t && Auth.validateCsrf(t)
  },

  runInternal(fn) {
    this._authInternal = true
    try {
      return fn()
    } finally {
      this._authInternal = false
    }
  },

  async runInternalAsync(fn) {
    this._authInternal = true
    try {
      return await fn()
    } finally {
      this._authInternal = false
    }
  },

  systemSet(collection, data) {
    if (!this._origSet) return DB.set(collection, data)
    this._systemSync = true
    try {
      return this._origSet(collection, data)
    } finally {
      this._systemSync = false
    }
  },

  systemInsert(collection, item) {
    if (!this._origInsert) return DB.insert(collection, item)
    this._systemSync = true
    try {
      return this._origInsert(collection, item)
    } finally {
      this._systemSync = false
    }
  },

  async set(collection, data) {
    if (!this._canWrite(collection)) throw new Error('CSRF token invalid')
    if (this._isSetupPhase()) return DB.set(collection, data)
    if (typeof DB !== 'undefined' && DB.secureSet) {
      return DB.secureSet(collection, data, this._token())
    }
    return DB.set(collection, data)
  },

  async merge(collection, patch) {
    const cur = (typeof DB !== 'undefined' && DB.get) ? DB.get(collection) : {}
    const next = (cur && typeof cur === 'object' && !Array.isArray(cur)) ? { ...cur, ...patch } : patch
    return this.set(collection, next)
  },

  async insert(collection, item) {
    if (!this._canWrite(collection)) throw new Error('CSRF token invalid')
    const res = DB.insert(collection, item)
    await DB.flush?.()
    return res
  },

  async update(collection, id, patch) {
    if (!this._canWrite(collection)) throw new Error('CSRF token invalid')
    DB.update(collection, id, patch)
    await DB.flush?.()
    return true
  },

  systemUpdate(collection, id, patch) {
    if (!this._origUpdate) return DB.update(collection, id, patch)
    this._systemSync = true
    try {
      return this._origUpdate(collection, id, patch)
    } finally {
      this._systemSync = false
    }
  },

  systemDelete(collection, id) {
    if (!this._origDelete) return DB.delete(collection, id)
    this._systemSync = true
    try {
      return this._origDelete(collection, id)
    } finally {
      this._systemSync = false
    }
  },

  async delete(collection, id) {
    if (!this._canWrite(collection)) throw new Error('CSRF token invalid')
    const res = this._origDelete ? this._origDelete(collection, id) : DB.delete(collection, id)
    await DB.flush?.()
    return res
  },

  async hardDelete(collection, id) {
    return this.delete(collection, id)
  },

  hardenDbWrites() {
    if (this._wrapped || typeof DB === 'undefined') return
    this._wrapped = true
    this._origSet = DB.set.bind(DB)
    this._origInsert = DB.insert.bind(DB)
    this._origUpdate = DB.update.bind(DB)
    this._origDelete = DB.delete.bind(DB)
    const origSet = this._origSet
    const origInsert = this._origInsert
    const origUpdate = this._origUpdate
    const origDelete = this._origDelete
    DB.set = (collection, data) => {
      if (!SecureDB._canWrite(collection)) throw new Error('CSRF token invalid')
      return origSet(collection, data)
    }
    DB.insert = (collection, item) => {
      if (!SecureDB._canWrite(collection)) throw new Error('CSRF token invalid')
      return origInsert(collection, item)
    }
    DB.update = (collection, id, patch) => {
      if (!SecureDB._canWrite(collection)) throw new Error('CSRF token invalid')
      return origUpdate(collection, id, patch)
    }
    DB.delete = (collection, id) => {
      if (!SecureDB._canWrite(collection)) throw new Error('CSRF token invalid')
      return origDelete(collection, id)
    }
  }
}

SecureDB.hardenDbWrites()

window.SecureDB = SecureDB
