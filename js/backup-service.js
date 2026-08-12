/* ══════════════════════════════════════════════
   BackupService — پشتیبان خودکار · ساعتی · روزانه
   ══════════════════════════════════════════════ */

const BackupService = {
  _timer: null,
  _hourlyTimer: null,

  settings() {
    return DB.get('studioInfo') || {}
  },

  isEnabled() {
    const s = this.settings()
    return !!(s.autoBackup && (s.backupHourly || s.backupDaily))
  },

  async checksum(json) {
    const bytes = new TextEncoder().encode(String(json || ''))
    const hash = await crypto.subtle.digest('SHA-256', bytes)
    return [...new Uint8Array(hash)].map(byte => byte.toString(16).padStart(2, '0')).join('')
  },

  async verify(json, expectedChecksum) {
    if (!json || !expectedChecksum) return false
    return (await this.checksum(json)) === String(expectedChecksum).toLowerCase()
  },

  async envelope(json) {
    return JSON.stringify({
      format: 'studio-m-backup-v1',
      createdAt: new Date().toISOString(),
      checksum: await this.checksum(json),
      payload: String(json || '')
    })
  },

  async decode(text) {
    let parsed
    try { parsed = JSON.parse(text) } catch { return { ok: false, error: 'فایل JSON معتبر نیست' } }
    if (parsed?.format !== 'studio-m-backup-v1') {
      return { ok: true, payload: text, verified: false, legacy: true }
    }
    if (typeof parsed.payload !== 'string' || !await this.verify(parsed.payload, parsed.checksum)) {
      return { ok: false, error: 'صحت پشتیبان تأیید نشد؛ فایل ناقص یا دست‌کاری شده است' }
    }
    return { ok: true, payload: parsed.payload, verified: true, legacy: false }
  },

  async run(label = 'manual') {
    try {
      const json = DB.exportJSON()
      const ts = Date.now()
      const key = `${AppConfig.BACKUP_PREFIX}${ts}`
      const checksum = await this.checksum(json)
      const archive = await this.envelope(json)
      await DB.saveBackup(key, archive)
      const now = new Date().toISOString()
      const prev = this.settings()
      const jalaliAt = typeof Utils !== 'undefined' ? Utils.formatJalaliDateTime(ts) : Utils.todayJalali()
      await SecureDB.merge('studioInfo', {
        lastBackup: Utils.todayJalali(),
        backupLastAt: now,
        backupLastKey: key,
        backupLastLabel: label,
        backupLastDisplay: jalaliAt,
        backupLastChecksum: checksum
      })
      await DB.flush?.()

      let cloud = { ok: false, skipped: true }
      if (typeof Cloud !== 'undefined' && Cloud.isEnabled?.() && Cloud.createBackupArchive) {
        cloud = await Cloud.createBackupArchive(label)
        if (!cloud.ok && !cloud.skipped) {
          console.warn('Cloud backup failed:', cloud.error)
        }
      }

      if (prev.backupAutoDownload || label === 'manual') {
        this._download(archive, key, label)
      }

      if (typeof SM !== 'undefined' && SM.log) SM.log('backup_auto', `${label} — ${key}`)
      return { ok: true, key, at: now, checksum, cloud }
    } catch (e) {
      console.warn('Backup failed:', e)
      return { ok: false, error: String(e) }
    }
  },

  _download(json, key, label) {
    const blob = new Blob([json], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = typeof Utils !== 'undefined' && Utils.backupFileName
      ? Utils.backupFileName(label || 'auto')
      : `studio-m-backup-${Date.now()}.json`
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 5000)
  },

  async listRecent(limit = 10) {
    const keys = await DB.listBackups()
    return keys.slice(-limit).reverse()
  },

  shouldRunHourly() {
    const s = this.settings()
    if (!s.autoBackup || !s.backupHourly) return false
    const last = s.backupLastAt ? new Date(s.backupLastAt).getTime() : 0
    return Date.now() - last >= 3600000
  },

  shouldRunDaily() {
    const s = this.settings()
    if (!s.autoBackup || !s.backupDaily) return false
    const lastDate = s.lastBackup || ''
    return lastDate !== Utils.todayJalali()
  },

  async tick() {
    if (!this.isEnabled()) return
    if (this.shouldRunHourly()) return this.run('hourly')
    if (this.shouldRunDaily()) return this.run('daily')
  },

  init() {
    this.stop()
    if (!this.isEnabled()) return
    this.tick().catch(() => {})
    this._timer = setInterval(() => this.tick().catch(() => {}), 600000)
    this._hourlyTimer = setInterval(() => {
      if (this.shouldRunHourly()) this.run('hourly').catch(() => {})
    }, 3600000)
  },

  stop() {
    if (this._timer) clearInterval(this._timer)
    if (this._hourlyTimer) clearInterval(this._hourlyTimer)
    this._timer = null
    this._hourlyTimer = null
  },

  restart() {
    this.stop()
    this.init()
  },

  scheduleLabel(s) {
    s = s || this.settings()
    if (!s.autoBackup) return 'غیرفعال'
    const parts = []
    if (s.backupHourly) parts.push('ساعتی')
    if (s.backupDaily) parts.push('روزانه')
    return parts.length ? parts.join(' + ') : 'فعال — زمان‌بندی انتخاب نشده'
  }
}

window.BackupService = BackupService
