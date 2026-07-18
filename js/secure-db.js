/* SecureDB — لایه نوشتن امن با CSRF + RBAC مالی + soft-delete */
const SecureDB = {
  _wrapped: false,
  _authInternal: false,
  _systemSync: false,
  _origSet: null,
  _origInsert: null,
  _origUpdate: null,
  _origDelete: null,

  /** Collections requiring manage_finance (or manager) to mutate */
  FINANCE_COLLECTIONS: new Set([
    'transactions', 'banks', 'cheques', 'invoices', 'expenses', 'salaryPayments'
  ]),

  /** Soft-delete instead of hard splice (must match sync TOMBSTONE_ENTITIES) */
  TOMBSTONE_COLLECTIONS: new Set([
    'contracts', 'transactions', 'invoices', 'bookings', 'personnel', 'equipment',
    'workflows', 'packages', 'expenses', 'leads', 'banks', 'cheques',
    'appointments', 'customerRequests', 'fileAssets', 'salaryPayments',
    'attendance', 'notifications'
  ]),

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

  _isManagerUser() {
    const user = typeof Auth !== 'undefined' ? Auth.getUser?.() : null
    if (!user) return false
    if (typeof Access !== 'undefined') {
      return Access.isStudioManager?.(user) || Access.isSystemAdmin?.(user)
    }
    const roles = (user.roles || []).map(r => typeof normalizeRole === 'function' ? normalizeRole(r) : r)
    return roles.includes('studio_manager') || roles.includes('system_admin')
  },

  _canWriteFinance(collection) {
    if (!this.FINANCE_COLLECTIONS.has(collection)) return true
    if (this._authInternal || this._systemSync || this._isSetupPhase()) return true
    if (typeof Auth === 'undefined') return false
    if (Auth.userHasPermission?.('manage_finance') || Auth.userHasPermission?.('all')) return true
    return this._isManagerUser()
  },

  /** @param {string} [collection] */
  _canWrite(collection) {
    if (this._authInternal || this._systemSync) return true
    if (collection === 'securityState' || collection === 'logs') return true
    if (this._isSetupPhase()) return true
    if (typeof Auth === 'undefined' || !Auth.validateCsrf) return false
    const t = this._token()
    if (!(!!t && Auth.validateCsrf(t))) return false
    return this._canWriteFinance(collection)
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
    if (!this._canWrite(collection)) throw new Error(this._denyMsg(collection))
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
    if (!this._canWrite(collection)) throw new Error(this._denyMsg(collection))
    const res = DB.insert(collection, item)
    await DB.flush?.()
    return res
  },

  async update(collection, id, patch) {
    if (!this._canWrite(collection)) throw new Error(this._denyMsg(collection))
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

  _denyMsg(collection) {
    if (this.FINANCE_COLLECTIONS.has(collection) && this._token() && Auth.validateCsrf?.(this._token())) {
      return 'مجوز مالی ندارید'
    }
    return 'CSRF token invalid'
  },

  /** Soft-delete (tombstone) for sync entities; hard-delete otherwise */
  async delete(collection, id) {
    if (!this._canWrite(collection)) throw new Error(this._denyMsg(collection))
    if (this.TOMBSTONE_COLLECTIONS.has(collection)) {
      const row = DB.find(collection, x => x.id === id)
      if (!row) return false
      DB.update(collection, id, {
        _deleted: true,
        deletedAtIso: new Date().toISOString()
      })
      await DB.flush?.()
      return true
    }
    const res = this._origDelete ? this._origDelete(collection, id) : DB.delete(collection, id)
    await DB.flush?.()
    return res
  },

  /** Permanent remove (admin/purge only) */
  async hardDelete(collection, id) {
    if (!this._canWrite(collection)) throw new Error(this._denyMsg(collection))
    const res = this._origDelete ? this._origDelete(collection, id) : DB.delete(collection, id)
    await DB.flush?.()
    return res
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
      if (!SecureDB._canWrite(collection)) throw new Error(SecureDB._denyMsg(collection))
      return origSet(collection, data)
    }
    DB.insert = (collection, item) => {
      if (!SecureDB._canWrite(collection)) throw new Error(SecureDB._denyMsg(collection))
      return origInsert(collection, item)
    }
    DB.update = (collection, id, patch) => {
      if (!SecureDB._canWrite(collection)) throw new Error(SecureDB._denyMsg(collection))
      return origUpdate(collection, id, patch)
    }
    DB.delete = (collection, id) => {
      if (!SecureDB._canWrite(collection)) throw new Error(SecureDB._denyMsg(collection))
      if (SecureDB.TOMBSTONE_COLLECTIONS.has(collection)) {
        return origUpdate(collection, id, {
          _deleted: true,
          deletedAtIso: new Date().toISOString()
        })
      }
      return origDelete(collection, id)
    }
  }
}

SecureDB.hardenDbWrites()

window.SecureDB = SecureDB
