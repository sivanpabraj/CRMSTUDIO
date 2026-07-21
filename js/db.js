/* ══════════════════════════════════════════════
   تالار — Database Layer v5
   IndexedDB + مهاجرت خودکار از localStorage
   ══════════════════════════════════════════════ */

const DB_KEY = AppConfig.DB_KEY
const DB_VERSION = 22
const DB_OBJECT_KEYS = new Set(['studioInfo', 'securityState'])
const SYNC_TOUCH_KEYS = new Set([
  'contracts', 'transactions', 'invoices', 'bookings', 'personnel', 'equipment',
  'workflows', 'packages', 'expenses', 'leads', 'banks', 'cheques',
  'appointments', 'customerRequests', 'fileAssets', 'salaryPayments',
  'attendance', 'notifications'
])

function createDefaultData() {
  return {
    _meta: { dbVersion: DB_VERSION, createdAt: '', lastBackup: '', storage: 'indexeddb' },
    users: [],
    studioInfo: {
      name: '',
      phone: '', address: '', manager: '', social: '', logo: '',
      joinCode: '', slug: '', setupCompleted: false, tagline: '',
      appBaseUrl: '', externalSiteUrl: '', siteLinks: {},
      autoBackup: false, backupInterval: 'weekly', lastBackup: '',
      licenseTier: 'trial', licenseExpiresAt: '', licenseKey: ''
    },
    contracts: [],
    transactions: [],
    banks: [],
    personnelProposals: [],
    persProjects: [],
    revisions: [],
    persContracts: [],
    notifications: [],
    smsTemplates: [],
    logs: [],
    leads: [],
    tasks: [],
    albums: [],
    messages: [],
    personnel: [],
    appointments: [],
    calendarReminders: [],
    printOrders: [],
    utilities: [],
    issues: [],
    customerRequests: [],
    customRoles: [],
    cheques: [],
    equipment: [],
    bookings: [],
    invoices: [],
    packages: [],
    attendance: [],
    expenses: [],
    galleries: [],
    signatures: [],
    timelines: [],
    workflows: [],
    fileAssets: [],
    commLogs: [],
    apiKeys: [],
    payrollRuns: [],
    salaryPayments: [],
    customerCustody: [],
    securityState: { loginAttempts: {}, otpSend: {}, otpVerify: {} }
  }
}

const DB_MIGRATIONS = {
  2(data) {
    if (!data._meta) data._meta = { dbVersion: 2 }
    if (!data.persContracts) data.persContracts = []
    if (!data.revisions) data.revisions = []
    if (!data.persProjects) data.persProjects = []
    if (!data.leads) data.leads = []
    if (!data.tasks) data.tasks = []
    if (!data.albums) data.albums = []
    if (!data.messages) data.messages = []
    return data
  },
  3(data) {
    if (!data.personnel) data.personnel = []
    if (!data.appointments) data.appointments = []
    if (!data.printOrders) data.printOrders = []
    if (!data.utilities) data.utilities = []
    if (!data.customRoles) data.customRoles = []
    data._meta.dbVersion = 3
    return data
  },
  4(data) {
    const legacyMap = {
      '📸 عکاس':'photographer','🎬 فیلم‌بردار مراسم':'vid_venue','🎥 فیلم‌بردار کلیپ':'vid_clip',
      '🚁 خلبان هلی‌شات و FPV':'helishot','✂️ ادیتور کلیپ':'editor_clip','💻 ادیتور تالار':'editor_venue',
      '🎨 طراح آلبوم دیجیتال':'album_designer','عکاس تالار':'photographer','عکاس کلیپ':'photographer_clip',
      'فیلم‌بردار تالار':'vid_venue','فیلم‌بردار کلیپ':'vid_clip','هلی شات و FPV':'helishot',
      'تدوین سر مجلسی':'editor_venue','تدوین کلیپ':'editor_clip','کرین کار تالار':'crane',
      'طراحی آلبوم':'album_designer','بازرسی':'inspector','مدیر استودیو':'studio_manager',
      '👑 مدیر سیستم':'studio_manager','💼 مدیر آتلیه':'studio_manager','ادمین':'studio_manager','سایر':'other'
    }
    const normalize = (r) => { const s = String(r).trim(); return legacyMap[s] || 'other' }
    if (data.personnel) {
      data.personnel.forEach(p => {
        p.roles = [...new Set((p.roles || []).map(normalize))]
        if (!p.roleAmounts) p.roleAmounts = {}
        if (p.roleAmounts && typeof p.roleAmounts === 'object') {
          const normalized = {}
          for (const [k, v] of Object.entries(p.roleAmounts)) normalized[normalize(k)] = v
          p.roleAmounts = normalized
        }
        if (p.roleRates && Object.keys(p.roleRates).length) {
          for (const [k, v] of Object.entries(p.roleRates)) {
            const nk = normalize(k)
            if (!p.roleAmounts[nk]) p.roleAmounts[nk] = v
          }
          delete p.roleRates
        }
        if (!p.jobs) p.jobs = 0
      })
    }
    if (data.users) data.users.forEach(u => { u.roles = [...new Set((u.roles || []).map(normalize))] })
    if (data.persProjects) {
      data.persProjects.forEach(p => {
        if (p.accepted === undefined) p.accepted = null
        if (!p.amount) p.amount = 0
        if (!p.roleId) p.roleId = p.role || ''
        p.roleId = normalize(p.roleId)
        if (!p.couple) p.couple = ''
        if (!p.venue) p.venue = ''
        if (!p.notes) p.notes = ''
        if (!p.respondedAt) p.respondedAt = ''
        if (!p.paid) p.paid = 0
      })
    }
    if (!data.customerRequests) data.customerRequests = []
    if (!data.customRoles) data.customRoles = []
    if (data.studioInfo && !data.studioInfo.name) data.studioInfo.name = 'مدیریت استودیو'
    if (data.users && data.personnel && data.persProjects) {
      data.persProjects.forEach(p => {
        if (data.personnel.some(per => per.id === p.personnelId)) return
        const user = data.users.find(u => u.id === p.personnelId)
        if (!user) return
        const person = data.personnel.find(per => per.phone === user.phone || per.userId === user.id)
        if (person) { p.personnelId = person.id; p.personnelName = person.name }
      })
    }
    data._meta.dbVersion = 4
    return data
  },
  5(data) {
    if (!data._meta) data._meta = {}
    data._meta.dbVersion = 5
    data._meta.storage = 'indexeddb'
    data._meta.upgradedAt = new Date().toISOString()
    return data
  },
  6(data) {
    if (data.studioInfo && (data.studioInfo.name === 'مدیریت استودیو' || !data.studioInfo.name)) {
      data.studioInfo.name = AppConfig.DEFAULT_STUDIO_NAME
    }
    data._meta.dbVersion = 6
    return data
  },
  7(data) {
    if (!data.printShops) data.printShops = []
    if (!data.photoSelections) data.photoSelections = []
    if (!data.albums) data.albums = []
    if (!data.printOrders) data.printOrders = []
    data._meta.dbVersion = 7
    return data
  },
  8(data) {
    if (!data.salaryPayments) data.salaryPayments = []
    if (!data.cheques) data.cheques = []
    data._meta.dbVersion = 8
    return data
  },
  9(data) {
    if (!data._meta) data._meta = {}
    if (!data._meta.appVersion) data._meta.appVersion = AppConfig.APP_VERSION
    data._meta.dbVersion = 9
    return data
  },
  10(data) {
    if (!data.cheques) data.cheques = []
    data._meta.dbVersion = 10
    return data
  },
  11(data) {
    const info = data.studioInfo || {}
    if (!info.id) info.id = 'studio_' + Date.now()
    if (!info.joinCode) {
      const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
      const bytes = crypto.getRandomValues(new Uint8Array(6))
      let code = ''
      for (let i = 0; i < 6; i++) code += chars[bytes[i] % chars.length]
      info.joinCode = code
    }
    if (!info.slug) info.slug = (info.name || 'studio').toString().replace(/\s+/g, '-').slice(0, 24)
    data.studioInfo = info
    data._meta.dbVersion = 11
    return data
  },
  12(data) {
    const fixRole = r => {
      const s = String(r).trim()
      if (s === 'manager' || s === 'admin' || s === 'مدیر') return 'studio_manager'
      return r
    }
    if (data.users) {
      data.users.forEach(u => {
        if (u.roles?.length) u.roles = [...new Set(u.roles.map(fixRole))]
      })
    }
    data._meta.dbVersion = 12
    return data
  },
  13(data) {
    const ensure = (k, v) => { if (!data[k]) data[k] = v }
    ensure('equipment', [])
    ensure('bookings', [])
    ensure('invoices', [])
    ensure('packages', [])
    ensure('attendance', [])
    ensure('expenses', [])
    ensure('galleries', [])
    ensure('signatures', [])
    if (data.studioInfo && !data.studioInfo.licenseTier) {
      data.studioInfo.licenseTier = 'trial'
      data.studioInfo.licenseExpiresAt = ''
    }
    data._meta.dbVersion = 13
    return data
  },
  14(data) {
    const ensure = (k, v) => { if (!data[k]) data[k] = v }
    ensure('timelines', [])
    ensure('workflows', [])
    ensure('fileAssets', [])
    ensure('commLogs', [])
    ensure('apiKeys', [])
    ensure('payrollRuns', [])
    if (data.studioInfo && !data.studioInfo.locale) data.studioInfo.locale = 'fa'
    if (data.studioInfo && !data.studioInfo.timezone) data.studioInfo.timezone = 'Asia/Tehran'
    data._meta.dbVersion = 14
    return data
  },
  15(data) {
    if (!data.calendarReminders) data.calendarReminders = []
    if (data.studioInfo && data.studioInfo.smsMorningReminders == null) {
      data.studioInfo.smsMorningReminders = true
    }
    data._meta.dbVersion = 15
    return data
  },
  16(data) {
    if (!data.packages) data.packages = []
    data._meta.dbVersion = 16
    return data
  },
  17(data) {
    ;(data.banks || []).forEach(b => {
      if (b.card == null) b.card = ''
      if (b.iban == null) b.iban = ''
      if (b.holder == null) b.holder = ''
    })
    data._meta.dbVersion = 17
    return data
  },
  18(data) {
    if (!data.customerCustody) data.customerCustody = []
    data._meta.dbVersion = 18
    return data
  },
  19(data) {
    if (!data.securityState || Array.isArray(data.securityState)) {
      data.securityState = { loginAttempts: {}, otpSend: {}, otpVerify: {} }
    }
    data._meta.dbVersion = 19
    return data
  },
  20(data) {
    const def = createDefaultData()
    if (!data.studioInfo || Array.isArray(data.studioInfo)) {
      data.studioInfo = { ...def.studioInfo, ...(data.studioInfo && !Array.isArray(data.studioInfo) ? data.studioInfo : {}) }
    }
    if (!data.securityState || Array.isArray(data.securityState)) {
      data.securityState = def.securityState
    }
    data._meta.dbVersion = 20
    return data
  },
  21(data) {
    ;(data.banks || []).forEach(b => {
      const account = b.account || b.accountNumber || ''
      const iban = b.iban || b.shaba || ''
      b.account = account
      b.accountNumber = account
      b.iban = iban
      b.shaba = iban
      if (b.card == null) b.card = ''
      if (b.holder == null) b.holder = ''
      b.balance = Number(b.balance) || 0
    })
    ;(data.cheques || []).forEach(c => {
      const type = c.type || c.direction || 'incoming'
      const number = c.number || c.chequeNumber || ''
      const client = c.client || c.drawer || c.party || ''
      c.type = type
      c.direction = type
      c.number = number
      c.chequeNumber = number
      c.client = client
      c.party = client
      if (!c.drawer) c.drawer = client
      if (!c.status) c.status = 'pending'
    })
    data._meta.dbVersion = 21
    return data
  },
  22(data) {
    if (!data.salaryPayments) data.salaryPayments = []
    if (!data.attendance) data.attendance = []
    if (!data.notifications) data.notifications = []
    data._meta.dbVersion = 22
    return data
  }
}

const DB = {
  _data: null,
  _ready: null,
  ready: null,

  init() {
    this._ready = this._initAsync()
    this.ready = this._ready
    return this
  },

  async _initAsync() {
    try {
      let data = await IdbStore.get(AppConfig.IDB_STORE, DB_KEY)

      if (!data) {
        const migrated = await IdbStore.migrateFromLocalStorage([DB_KEY, ...AppConfig.LEGACY_DB_KEYS])
        if (migrated) {
          data = migrated.data
          console.info(`[DB] مهاجرت از ${migrated.key} به IndexedDB`)
          for (const k of AppConfig.LEGACY_DB_KEYS) {
            try { localStorage.removeItem(k) } catch { /* */ }
          }
        }
      }

      if (data) {
        this._data = data
        await this._migrate()
      } else {
        this._data = createDefaultData()
        await this._persist()
      }

      await this._migrateBackupsFromLocalStorage()
      this._purgeLocalStorageMirror()
      this.syncAllPersonnel()
      this._bindUnloadFlush()
    } catch (e) {
      console.warn('DB init failed, using defaults:', e)
      this._data = createDefaultData()
      this._bindUnloadFlush()
    }
    return this
  },

  async _migrateBackupsFromLocalStorage() {
    try {
      const lsKeys = Object.keys(localStorage).filter(k => k.startsWith(AppConfig.BACKUP_PREFIX))
      for (const key of lsKeys) {
        const data = localStorage.getItem(key)
        if (data) {
          await IdbStore.saveBackup(key, data)
          localStorage.removeItem(key)
        }
      }
    } catch { /* non-critical */ }
  },

  _purgeLocalStorageMirror() {
    try {
      localStorage.removeItem(DB_KEY)
      for (const k of AppConfig.LEGACY_DB_KEYS || []) localStorage.removeItem(k)
    } catch { /* */ }
  },

  async _persist(opts = {}) {
    const run = async () => {
      try {
        await IdbStore.set(AppConfig.IDB_STORE, DB_KEY, this._data)
        this._dirty = false
        if (!opts.skipCloud && typeof Cloud !== 'undefined' && Cloud.schedulePush) Cloud.schedulePush()
      } catch (e) {
        console.error('DB persist failed:', e)
        this._dirty = true
        if (typeof Utils !== 'undefined') {
          Utils.toast('خطا در ذخیره‌سازی داده‌ها', 'error')
        }
        if (typeof SMObservability !== 'undefined') {
          // Do not DB.log here — that would re-dirty and reschedule persist
          SMObservability.captureError('db_persist', e, { noDbLog: true })
        }
      }
    }
    this._persistChain = (this._persistChain || Promise.resolve()).then(run, run)
    return this._persistChain
  },

  _dirty: false,
  _persistTimer: null,
  _pendingNeedCloud: false,
  _persistChain: Promise.resolve(),

  /**
   * Coalesce rapid writes. skipCloud only if EVERY pending op in the burst skipped cloud.
   * Any non-skip write forces cloud schedule on flush.
   */
  _schedulePersist(opts = {}) {
    this._dirty = true
    if (!opts.skipCloud) this._pendingNeedCloud = true

    clearTimeout(this._persistTimer)
    const delay = opts.delay ?? 120
    this._persistTimer = setTimeout(() => {
      this._persistTimer = null
      const skipCloud = !this._pendingNeedCloud
      this._pendingNeedCloud = false
      this._persist({ skipCloud }).catch(() => {})
    }, delay)
  },

  _scheduleLogPersist() {
    this._schedulePersist({ skipCloud: true, delay: 2000 })
  },

  _bindUnloadFlush() {
    if (this._unloadBound || typeof window === 'undefined') return
    this._unloadBound = true
    const flush = () => {
      try {
        clearTimeout(this._persistTimer)
        this._persistTimer = null
        if (this._dirty) {
          // sync best-effort via keepalive is unavailable for IDB; fire async
          this._persist({ skipCloud: false }).catch(() => {})
        }
      } catch { /* */ }
    }
    window.addEventListener('pagehide', flush)
    window.addEventListener('beforeunload', flush)
  },
  _normalizePhone(phone) {
    if (!phone) return ''
    const map = { '۰':'0','۱':'1','۲':'2','۳':'3','۴':'4','۵':'5','۶':'6','۷':'7','۸':'8','۹':'9' }
    return String(phone).replace(/[۰-۹]/g, c => map[c] || c).replace(/[^0-9]/g, '')
  },

  /** ذخیره امن با CSRF (برای عملیات حساس در آینده) */
  async secureSet(collection, data, csrfToken) {
    const setupPhase = typeof SecureDB !== 'undefined' && SecureDB._isSetupPhase?.()
    if (!setupPhase && typeof Auth !== 'undefined' && !Auth.validateCsrf(csrfToken)) {
      throw new Error('CSRF token invalid')
    }
    this._data[collection] = data
    await this._persist()
  },

  findPersonnelByPhone(phone) {
    const norm = this._normalizePhone(phone)
    if (!norm) return null
    return this.active('personnel').find(p => this._normalizePhone(p.phone) === norm) ?? null
  },

  findPersonnelByUserId(userId) {
    const user = this.find('users', u => u.id === userId && !u._deleted)
    if (!user) return null
    return this.findPersonnelByPhone(user.phone) ||
      this.active('personnel').find(p => p.userId === userId) || null
  },

  /** Find active row by id (skips tombstones) */
  findActive(collection, predicate) {
    return this.active(collection).find(predicate) ?? null
  },

  syncPersonnelFromUser(user) {
    if (!user?.phone) return null
    const roles = typeof normalizeRoles === 'function' ? normalizeRoles(user.roles || []) : (user.roles || [])
    let person = this.findPersonnelByPhone(user.phone) || this.find('personnel', p => p.userId === user.id)
    if (!person) {
      person = this.insert('personnel', {
        name: user.name, phone: user.phone, userId: user.id, roles,
        status: user.status === 'active' ? 'active' : 'inactive',
        salaryType: 'project', salary: 0, roleAmounts: {}, jobs: 0
      })
    } else {
      this.update('personnel', person.id, {
        name: user.name, userId: user.id,
        roles: roles.length ? roles : person.roles,
        status: user.status === 'active' ? 'active' : person.status
      })
      person = this.find('personnel', p => p.id === person.id)
    }
    return person
  },

  fixPersProjectPersonnelIds() {
    const persProjects = this.get('persProjects')
    let changed = false
    persProjects.forEach(p => {
      if (this.find('personnel', per => per.id === p.personnelId)) return
      const user = this.find('users', u => u.id === p.personnelId)
      if (!user) return
      const person = this.syncPersonnelFromUser(user)
      if (person && p.personnelId !== person.id) {
        p.personnelId = person.id
        p.personnelName = person.name
        changed = true
      }
    })
    if (changed) this.set('persProjects', persProjects)
  },

  syncAllPersonnel() {
    this.get('users').filter(u => u.status === 'active').forEach(u => this.syncPersonnelFromUser(u))
    this.fixPersProjectPersonnelIds()
  },

  save() {
    return this.flush()
  },

  async exportData() {
    return this.exportJSON()
  },

  async importData(json) {
    return this.importJSON(json)
  },

  async deleteBackup(key) {
    await IdbStore.deleteBackup(key)
  },

  async _migrate() {
    const currentVersion = this._data._meta?.dbVersion || 1
    if (currentVersion >= DB_VERSION) return

    for (let v = currentVersion + 1; v <= DB_VERSION; v++) {
      if (DB_MIGRATIONS[v]) {
        try {
          DB_MIGRATIONS[v](this._data)
          this._data._meta.dbVersion = v
          await this._persist()
        } catch (e) {
          console.error(`DB migration v${v} failed:`, e)
        }
      }
    }

    const def = createDefaultData()
    let changed = false
    for (const key of Object.keys(def)) {
      if (key === '_meta') continue
      if (!(key in this._data)) { this._data[key] = def[key]; changed = true }
    }
    if (changed) await this._persist()
  },

  _defaultFor(collection) {
    const def = createDefaultData()
    if (collection === '_meta') return def._meta
    if (DB_OBJECT_KEYS.has(collection)) return def[collection]
    return []
  },

  get(collection) {
    if (!this._data) return this._defaultFor(collection)
    if (collection === '_meta') return this._data._meta ?? this._defaultFor('_meta')
    const val = this._data[collection]
    if (DB_OBJECT_KEYS.has(collection)) {
      if (val == null || Array.isArray(val)) return this._defaultFor(collection)
      return val
    }
    return val ?? []
  },

  /** Active rows only (excludes soft-deleted) */
  active(collection) {
    return this.get(collection).filter(i => i && !i._deleted)
  },

  set(collection, data) {
    this._data[collection] = data
    const skipCloud = collection === 'logs'
    this._schedulePersist({ skipCloud })
    return Promise.resolve(true)
  },

  async flush() {
    clearTimeout(this._persistTimer)
    this._persistTimer = null
    if (this._data) await this._persist({ skipCloud: false, force: true })
  },

  find(collection, predicate) {
    return this.get(collection).find(predicate) ?? null
  },

  filter(collection, predicate) {
    return this.get(collection).filter(predicate)
  },

  insert(collection, item) {
    const col = this.get(collection)
    item.id = item.id || crypto.randomUUID?.() || `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    item.createdAt = item.createdAt || this._today()
    this._touchSyncMeta(collection, item)
    col.push(item)
    this.set(collection, col)
    return item
  },

  update(collection, id, changes) {
    const col = this.get(collection)
    const idx = col.findIndex(i => i.id === id)
    if (idx === -1) return null
    const merged = { ...col[idx], ...changes, updatedAt: this._today() }
    this._touchSyncMeta(collection, merged)
    col[idx] = merged
    this.set(collection, col)
    return col[idx]
  },

  delete(collection, id) {
    const col = this.get(collection)
    const idx = col.findIndex(i => i.id === id)
    if (idx === -1) return false
    col.splice(idx, 1)
    this.set(collection, col)
    return true
  },

  count(collection) {
    return this.get(collection).length
  },

  log(action, detail) {
    const MAX_LOGS = 500
    if (!this._data) return
    if (!Array.isArray(this._data.logs)) this._data.logs = []
    if (this._data.logs.length >= MAX_LOGS) {
      this._data.logs = this._data.logs.slice(-MAX_LOGS + 1)
    }
    // Direct push — avoid insert()→set()→full cloud schedule on every log
    this._data.logs.push({
      id: crypto.randomUUID?.() || `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      action,
      detail: typeof detail === 'object' ? JSON.stringify(detail) : String(detail),
      timestamp: new Date().toISOString(),
      createdAt: this._today()
    })
    this._scheduleLogPersist()
  },

  _today() {
    return Utils.todayJalali()
  },

  _touchSyncMeta(collection, item) {
    if (!item || DB_OBJECT_KEYS.has(collection) || collection === 'logs') return
    if (!SYNC_TOUCH_KEYS.has(collection)) return
    item.updatedAtIso = new Date().toISOString()
    item._syncRev = (Number(item._syncRev) || 0) + 1
  },

  async reset() {
    try { await IdbStore.remove(AppConfig.IDB_STORE, DB_KEY) } catch { /* */ }
    try { localStorage.removeItem(DB_KEY) } catch { /* */ }
    this._data = createDefaultData()
    await this._persist()
  },

  exportJSON() {
    return JSON.stringify(this._data, null, 2)
  },

  async importJSON(json) {
    try {
      const data = JSON.parse(json)
      if (!data || typeof data !== 'object') throw new Error('Invalid format')
      const def = createDefaultData()
      const validKeys = new Set(Object.keys(def))
      const objectKeys = new Set(['_meta', 'studioInfo'])
      for (const key of Object.keys(data)) {
        if (key === '_meta') continue
        if (!validKeys.has(key)) throw new Error(`کلید ناشناخته: ${key}`)
        if (!objectKeys.has(key) && !Array.isArray(data[key]))
          throw new Error(`کلید ${key} باید آرایه باشد`)
      }
      const requiredKeys = ['users', 'contracts', 'studioInfo']
      for (const k of requiredKeys) {
        if (!(k in data)) throw new Error(`کلید اجباری ${k} وجود ندارد`)
      }
      this._data = data
      await this._migrate()
      this.syncAllPersonnel()
      await this._persist()
      return { ok: true }
    } catch (e) {
      return { ok: false, error: e.message }
    }
  },

  /* پشتیبان‌گیری در IndexedDB */
  async saveBackup(key, json) {
    await IdbStore.saveBackup(key, json)
    const keys = await IdbStore.listBackups()
    if (keys.length > 20) await IdbStore.deleteBackup(keys[0])
    return key
  },

  async listBackups() {
    return IdbStore.listBackups()
  },

  async getBackup(key) {
    return IdbStore.getBackup(key)
  },

  getStorageInfo() {
    const meta = this.get('_meta')
    return {
      version: meta.dbVersion || DB_VERSION,
      storage: meta.storage || 'indexeddb',
      appVersion: AppConfig.APP_VERSION
    }
  }
}

DB.init()
window.DB = DB
