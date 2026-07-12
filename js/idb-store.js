/* ══════════════════════════════════════════════
   تالار — IndexedDB Storage Layer
   ══════════════════════════════════════════════ */

const IdbStore = {
  _db: null,

  open() {
    if (this._db) return Promise.resolve(this._db)
    const { IDB_NAME, IDB_STORE, IDB_BACKUP_STORE } = AppConfig
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(IDB_NAME, 1)
      req.onupgradeneeded = () => {
        const db = req.result
        if (!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE)
        if (!db.objectStoreNames.contains(IDB_BACKUP_STORE)) db.createObjectStore(IDB_BACKUP_STORE)
      }
      req.onsuccess = () => { this._db = req.result; resolve(this._db) }
      req.onerror = () => reject(req.error)
    })
  },

  async get(store, key) {
    const db = await this.open()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, 'readonly')
      const req = tx.objectStore(store).get(key)
      req.onsuccess = () => resolve(req.result ?? null)
      req.onerror = () => reject(req.error)
    })
  },

  async set(store, key, value) {
    const db = await this.open()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, 'readwrite')
      tx.objectStore(store).put(value, key)
      tx.oncomplete = () => resolve(true)
      tx.onerror = () => reject(tx.error)
    })
  },

  async remove(store, key) {
    const db = await this.open()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, 'readwrite')
      tx.objectStore(store).delete(key)
      tx.oncomplete = () => resolve(true)
      tx.onerror = () => reject(tx.error)
    })
  },

  async keys(store) {
    const db = await this.open()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, 'readonly')
      const req = tx.objectStore(store).getAllKeys()
      req.onsuccess = () => resolve(req.result || [])
      req.onerror = () => reject(req.error)
    })
  },

  async clear(store) {
    const db = await this.open()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, 'readwrite')
      tx.objectStore(store).clear()
      tx.oncomplete = () => resolve(true)
      tx.onerror = () => reject(tx.error)
    })
  },

  /* مهاجرت از localStorage */
  async migrateFromLocalStorage(keys) {
    for (const key of keys) {
      try {
        const raw = localStorage.getItem(key)
        if (raw) return { key, data: JSON.parse(raw) }
      } catch { /* skip */ }
    }
    return null
  },

  /* پشتیبان‌ها */
  async saveBackup(key, json) {
    await this.set(AppConfig.IDB_BACKUP_STORE, key, json)
    return key
  },

  async getBackup(key) {
    return this.get(AppConfig.IDB_BACKUP_STORE, key)
  },

  async listBackups() {
    const keys = await this.keys(AppConfig.IDB_BACKUP_STORE)
    return keys.filter(k => String(k).startsWith(AppConfig.BACKUP_PREFIX)).sort()
  },

  async deleteBackup(key) {
    return this.remove(AppConfig.IDB_BACKUP_STORE, key)
  }
}

window.IdbStore = IdbStore
