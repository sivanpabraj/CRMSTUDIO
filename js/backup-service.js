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

  async run(label = 'manual') {
    try {
      const json = DB.exportJSON()
      const ts = Date.now()
      const key = `${AppConfig.BACKUP_PREFIX}${ts}`
      await DB.saveBackup(key, json)
      const now = new Date().toISOString()
      const prev = this.settings()
      const jalaliAt = typeof Utils !== 'undefined' ? Utils.formatJalaliDateTime(ts) : Utils.todayJalali()
      await SecureDB.merge('studioInfo', {
        lastBackup: Utils.todayJalali(),
        backupLastAt: now,
        backupLastKey: key,
        backupLastLabel: label,
        backupLastDisplay: jalaliAt
      })
      await DB.flush?.()

      // ذخیره در دیتابیس همیشه انجام می‌شود، اما دانلود فایل در مرورگر فقط با درخواست دستی کاربر
      if (label === 'manual') {
        this._download(json, key, label)
      }

      if (typeof SM !== 'undefined' && SM.log) SM.log('backup_auto', `${label} — ${key}`)
      return { ok: true, key, at: now }
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

  async saveToFolderPicker(label = 'manual') {
    const json = DB.exportJSON()
    const fileName = typeof Utils !== 'undefined' && Utils.backupFileName
      ? Utils.backupFileName(label)
      : `crmstudio-backup-${Date.now()}.json`

    if (typeof window !== 'undefined' && window.showSaveFilePicker) {
      try {
        const handle = await window.showSaveFilePicker({
          suggestedName: fileName,
          types: [{
            description: 'CRMSTUDIO Database Backup',
            accept: { 'application/json': ['.json'] }
          }]
        })
        const writable = await handle.createWritable()
        await writable.write(json)
        await writable.close()
        return { ok: true, savedToFile: true, fileName }
      } catch (err) {
        if (err.name === 'AbortError') return { ok: false, cancelled: true }
      }
    }
    this._download(json, `${AppConfig.BACKUP_PREFIX}${Date.now()}`, label)
    return { ok: true, savedToFile: false, fileName }
  },

  async sendToEmail(targetEmail) {
    const s = this.settings()
    const email = targetEmail || s.backupEmail || s.email || ''
    if (!email) {
      return { ok: false, error: 'آدرس ایمیل یا جیمیل تنظیم نشده است' }
    }
    const json = DB.exportJSON()
    const fileName = typeof Utils !== 'undefined' && Utils.backupFileName
      ? Utils.backupFileName('email')
      : `crmstudio-backup-${Date.now()}.json`

    const prefix = (typeof AppConfig !== 'undefined' && AppConfig.BACKUP_PREFIX) ? AppConfig.BACKUP_PREFIX : 'crmstudio_backup_'
    this._download(json, `${prefix}${Date.now()}`, 'email')

    const studioName = s.name || 'استودیو'
    const today = typeof Utils !== 'undefined' ? Utils.todayJalali() : new Date().toLocaleDateString('fa-IR')
    const subject = `نسخه پشتیبان پایگاه داده ${studioName} — ${today}`
    const body = `سلام\n\nنسخه پشتیبان پایگاه داده سامانه مدیریت ${studioName} در تاریخ ${today} با نام «${fileName}» صادر گردید.\nفایل پشتیبان به صورت خودکار در سیستم شما دانلود شد؛ لطفاً آن را به این ایمیل پیوست کرده و برای آرشیو امن خود نگه‌داری نمایید.\n\nبا احترام\nسامانه CRMSTUDIO`

    const gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(email)}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
    window.open(gmailUrl, '_blank')
    return { ok: true, email, fileName }
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
