/* global EventSource */
/**
 * CRMSTUDIO — Server Live Sync Engine
 * همگام‌سازی بلادرنگ و خودکار بین تمامی دیوایس‌ها (موبایل، کامپیوتر، تبلت)
 */

export const ServerSync = {
  _eventSource: null,
  _pushTimer: null,
  _isPushing: false,
  _isPulling: false,
  _status: 'disconnected', // 'connected' | 'syncing' | 'offline'
  _localRevision: 0,
  _enabled: true,

  status() {
    return this._status
  },

  async init() {
    if (typeof window === 'undefined' || typeof DB === 'undefined') return

    // خواندن آخرین revision ذخیره شده
    const meta = DB.get('_meta') || {}
    this._localRevision = Number(meta.serverRevision) || 0

    // تست دسترسی به سرور و اولین pull
    await this.pull({ initial: true })

    // اتصال به کانال زنده SSE
    this._connectStream()

    // هوک زدن به تغییرات دیتابیس برای push خودکار
    this._hookDbPersist()

    console.info('[ServerSync] موتور همگام‌سازی زنده فعال شد. ویرایش محلی:', this._localRevision)
  },

  _getStudioId() {
    try {
      if (typeof DB === 'undefined' || !DB.get) return ''
      const info = DB.get('studioInfo') || {}
      return info.id || info.slug || ''
    } catch {
      return ''
    }
  },

  _connectStream() {
    if (typeof EventSource === 'undefined') return

    try {
      if (this._eventSource) {
        this._eventSource.close()
      }

      const studioId = this._getStudioId()
      const streamUrl = studioId
        ? `/api/sync/stream?studioId=${encodeURIComponent(studioId)}`
        : '/api/sync/stream'
      this._eventSource = new EventSource(streamUrl)

      this._eventSource.onopen = () => {
        this._status = 'connected'
        this._updateStatusUi()
      }

      this._eventSource.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data)
          if (msg.type === 'update' && msg.revision > this._localRevision) {
            console.log('[ServerSync] سیگنال تغییر از دستگاه دیگر دریافت شد:', msg)
            this.pull({ remoteRevision: msg.revision })
          }
        } catch { /* ping or other data */ }
      }

      this._eventSource.onerror = () => {
        this._status = 'offline'
        this._updateStatusUi()
        // مرورگر خودکار مجدد متصل می‌شود
      }
    } catch (e) {
      console.warn('[ServerSync] خطا در اتصال استریم:', e)
    }
  },

  async pull({ remoteRevision = 0, initial = false } = {}) {
    if (this._isPulling || this._isPushing) return
    this._isPulling = true
    this._updateStatusUi('syncing')

    try {
      const studioId = this._getStudioId()
      const q = new URLSearchParams()
      if (this._localRevision) q.set('rev', String(this._localRevision))
      if (studioId) q.set('studioId', studioId)

      const res = await fetch(`/api/sync/pull?${q.toString()}`, {
        cache: 'no-store'
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)

      const json = await res.json()
      if (json.notModified) {
        this._status = 'connected'
        return
      }

      // اگر سرور برای این استودیو خالی است اما دیتای محلی وجود دارد -> مقداردهی اولیه سرور
      if (json.empty && initial && studioId) {
        const localContracts = DB.get('contracts') || []
        const localUsers = DB.get('users') || []
        if (localContracts.length > 0 || localUsers.length > 0) {
          console.log('[ServerSync] سرور خالی است، ارسال دیتای محلی اولیه به سرور...')
          await this.push({ force: true })
          return
        }
      }

      // اعمال دیتای دریافتی از سرور
      if (json.data && typeof json.data === 'object') {
        const serverRev = Number(json.revision) || remoteRevision || (this._localRevision + 1)
        
        // به‌روزرسانی اطلاعات محلی بدون ایجاد حلقه push
        this._suppressPush = true
        try {
          const raw = json.data
          if (raw._meta) raw._meta.serverRevision = serverRev
          
          await DB.importJSON(JSON.stringify(raw))
          this._localRevision = serverRev
          
          if (!initial && typeof Utils !== 'undefined' && Utils.toast) {
            Utils.toast('اطلاعات زنده از سایر دستگاه‌ها به‌روزرسانی شد', 'info')
          }
          
          // بازخوانی صفحات و ماژول‌ها
          window.dispatchEvent(new CustomEvent('sm-server-sync', { detail: { revision: serverRev } }))
          if (typeof SM !== 'undefined' && typeof SM.renderCurrentView === 'function') {
            SM.renderCurrentView()
          }
        } finally {
          this._suppressPush = false
        }
      }

      this._status = 'connected'
    } catch (err) {
      console.warn('[ServerSync] خطا در دریافت از سرور:', err.message)
      this._status = 'offline'
    } finally {
      this._isPulling = false
      this._updateStatusUi()
    }
  },

  schedulePush() {
    if (this._suppressPush || !this._enabled) return
    clearTimeout(this._pushTimer)
    this._pushTimer = setTimeout(() => {
      this.push().catch(err => console.warn('[ServerSync] خطای ارسال:', err))
    }, 1800)
  },

  async push({ force = false } = {}) {
    if (this._isPushing) return

    const studioId = this._getStudioId()
    const localUsers = DB.get('users') || []
    const localStudio = DB.get('studioInfo') || {}
    if (!localUsers.length && !localStudio.setupCompleted && !force) {
      return
    }

    this._isPushing = true
    this._updateStatusUi('syncing')

    try {
      const dataStr = DB.exportJSON()
      const data = JSON.parse(dataStr)

      const res = await fetch('/api/sync/push', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(studioId ? { 'X-Studio-Id': studioId } : {})
        },
        body: JSON.stringify({
          data,
          studioId,
          clientRev: this._localRevision
        })
      })

      if (!res.ok) {
        if (res.status === 409) {
          const conflictData = await res.json().catch(() => ({}))
          console.warn('[ServerSync] تداخل همزمان کشف شد. دریافت آخرین ویرایش از سرور:', conflictData)
          if (typeof Utils !== 'undefined' && Utils.toast) {
            Utils.toast('تغییرات جدیدتر از سایر دستگاه‌ها دریافت شد', 'info')
          }
          await this.pull({ remoteRevision: conflictData.serverRevision || (this._localRevision + 1) })
          return
        }
        throw new Error(`HTTP ${res.status}`)
      }

      const json = await res.json()
      if (json.ok) {
        this._localRevision = json.revision
        if (DB._data && DB._data._meta) {
          DB._data._meta.serverRevision = json.revision
        }
      }
      this._status = 'connected'
    } catch (err) {
      console.warn('[ServerSync] خطا در ارسال به سرور:', err.message)
      this._status = 'offline'
    } finally {
      this._isPushing = false
      this._updateStatusUi()
    }
  },

  _hookDbPersist() {
    const origPersist = DB._persist.bind(DB)
    DB._persist = async () => {
      const res = await origPersist()
      this.schedulePush()
      return res
    }
  },

  _updateStatusUi(overrideStatus) {
    const st = overrideStatus || this._status
    const badge = document.getElementById('server-sync-badge')
    if (!badge) return

    if (st === 'connected') {
      badge.innerHTML = '🟢 آنلاین و همگام'
      badge.title = `متصل به سرور ایران (ویرایش ${this._localRevision})`
      badge.className = 'sm-badge sm-badge-success'
    } else if (st === 'syncing') {
      badge.innerHTML = '🔄 در حال همگام‌سازی...'
      badge.className = 'sm-badge sm-badge-warning'
    } else {
      badge.innerHTML = '🟡 حالت آفلاین'
      badge.title = 'تغییرات به صورت محلی ذخیره می‌شوند و پس از اتصال ارسال خواهند شد'
      badge.className = 'sm-badge sm-badge-secondary'
    }
  }
}

// مقداردهی خودکار پس از آماده‌سازی دیتابیس محلی
if (typeof window !== 'undefined') {
  window.ServerSync = ServerSync
  window.addEventListener('DOMContentLoaded', () => {
    if (typeof DB !== 'undefined' && DB.ready) {
      DB.ready.then(() => ServerSync.init()).catch(() => ServerSync.init())
    }
  })
}

export default ServerSync
