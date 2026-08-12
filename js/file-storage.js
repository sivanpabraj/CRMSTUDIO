/**
 * Studio M Phase 3 — Supabase Storage for fileAssets
 */
const FileStorage = {
  BUCKET: 'studio-files',
  MAX_BYTES: 50 * 1024 * 1024,
  CUSTOMER_MAX_BYTES: 5 * 1024 * 1024,
  ALLOWED_MIME: new Set([
    'image/jpeg', 'image/png', 'image/webp', 'image/gif',
    'video/mp4', 'video/quicktime', 'application/pdf', 'application/zip'
  ]),

  validate(file, { customer = false } = {}) {
    if (!file) return { ok: false, error: 'فایلی انتخاب نشده است' }
    const limit = customer ? this.CUSTOMER_MAX_BYTES : this.MAX_BYTES
    if (file.size <= 0 || file.size > limit) {
      return { ok: false, error: `حجم فایل باید حداکثر ${customer ? '۵' : '۵۰'} مگابایت باشد` }
    }
    if (!this.ALLOWED_MIME.has(file.type)) return { ok: false, error: 'نوع فایل مجاز نیست' }
    const ext = String(file.name || '').split('.').pop()?.toLowerCase()
    const allowedExt = {
      'image/jpeg': ['jpg', 'jpeg'], 'image/png': ['png'],
      'image/webp': ['webp'], 'image/gif': ['gif'],
      'video/mp4': ['mp4'], 'video/quicktime': ['mov'],
      'application/pdf': ['pdf'], 'application/zip': ['zip']
    }
    if (!allowedExt[file.type]?.includes(ext)) return { ok: false, error: 'پسوند فایل با نوع آن هم‌خوانی ندارد' }
    return { ok: true }
  },

  isAvailable() {
    return typeof Cloud !== 'undefined' && Cloud.isEnabled?.() && Cloud.isConfigured?.()
  },

  async _studioId() {
    if (typeof Cloud === 'undefined') return null
    let id = Cloud.studioCloudConfig?.().studioId
    if (!id) id = await Cloud._loadMemberStudioId?.()
    return id || null
  },

  _objectPath(studioId, assetId, fileName) {
    const safe = String(fileName || 'file').replace(/[^\w.\-()+]/g, '_')
    return `${studioId}/${assetId}/${safe}`
  },

  async upload(file, assetId) {
    if (!this.isAvailable()) return { ok: false, error: 'ابر فعال نیست' }
    const validation = this.validate(file)
    if (!validation.ok) return validation

    const sess = await Cloud.session?.()
    if (!sess) return { ok: false, error: 'ورود Supabase لازم است' }

    const studioId = await this._studioId()
    if (!studioId) return { ok: false, error: 'استودیوی ابری یافت نشد' }

    const c = await Cloud.client()
    const path = this._objectPath(studioId, assetId, file.name)
    const { error } = await c.storage.from(this.BUCKET).upload(path, file, {
      upsert: true,
      contentType: file.type || 'application/octet-stream'
    })
    if (error) return { ok: false, error: error.message }

    return {
      ok: true,
      path,
      storagePath: path,
      mime: file.type,
      size: file.size
    }
  },

  async uploadCustomer(file, { studioId, contractId, assetId }) {
    if (typeof Cloud === 'undefined' || !Cloud.isConfigured?.()) return { ok: false, error: 'ابر فعال نیست' }
    const validation = this.validate(file, { customer: true })
    if (!validation.ok) return validation
    if (!/^[0-9a-f-]{36}$/i.test(String(studioId || '')) || !/^[0-9a-f-]{36}$/i.test(String(contractId || ''))) {
      return { ok: false, error: 'دسترسی ابری قرارداد معتبر نیست' }
    }
    const sess = await Cloud.session?.()
    if (!sess) return { ok: false, error: 'ورود پیامکی Supabase لازم است' }
    const c = await Cloud.client()
    const safeId = String(assetId || crypto.randomUUID()).replace(/[^\w-]/g, '')
    const safeName = String(file.name || 'file').replace(/[^\w.\-()+]/g, '_')
    const path = `${studioId}/customer/${contractId}/${safeId}/${safeName}`
    const { error } = await c.storage.from(this.BUCKET).upload(path, file, {
      upsert: false,
      contentType: file.type,
      cacheControl: '3600'
    })
    if (error) return { ok: false, error: error.message }
    return { ok: true, path, storagePath: path, name: file.name, mime: file.type, size: file.size }
  },

  async signedUrl(storagePath, expiresIn = 300) {
    if (!storagePath || typeof Cloud === 'undefined' || !Cloud.isConfigured?.()) return { ok: false, error: 'فایل ابری در دسترس نیست' }
    const c = await Cloud.client()
    const ttl = Math.min(900, Math.max(60, Number(expiresIn) || 300))
    const { data, error } = await c.storage.from(this.BUCKET).createSignedUrl(storagePath, ttl)
    if (error || !data?.signedUrl) return { ok: false, error: error?.message || 'ساخت لینک امن ناموفق بود' }
    return { ok: true, url: data.signedUrl, expiresIn: ttl }
  },

  async remove(storagePath) {
    if (!storagePath || !this.isAvailable()) return { ok: true, skipped: true }
    const c = await Cloud.client()
    if (!c) return { ok: false, error: 'no client' }
    const { error } = await c.storage.from(this.BUCKET).remove([storagePath])
    if (error) return { ok: false, error: error.message }
    return { ok: true }
  },

  async removeCustomer(storagePath) {
    if (!storagePath || typeof Cloud === 'undefined' || !Cloud.isConfigured?.()) return { ok: true, skipped: true }
    const c = await Cloud.client()
    if (!c || !await Cloud.session?.()) return { ok: false, error: 'ورود Supabase لازم است' }
    const { error } = await c.storage.from(this.BUCKET).remove([storagePath])
    return error ? { ok: false, error: error.message } : { ok: true }
  }
}

window.FileStorage = FileStorage
