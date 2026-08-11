/**
 * Studio M Phase 3 — Supabase Storage for fileAssets
 */
const FileStorage = {
  BUCKET: 'studio-files',
  MAX_BYTES: 5 * 1024 * 1024,
  ALLOWED_MIME: new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']),

  validate(file) {
    if (!file) return { ok: false, error: 'فایلی انتخاب نشده است' }
    if (file.size <= 0 || file.size > this.MAX_BYTES) return { ok: false, error: 'حجم فایل باید حداکثر ۵ مگابایت باشد' }
    if (!this.ALLOWED_MIME.has(file.type)) return { ok: false, error: 'فقط JPG، PNG، WebP و PDF مجاز است' }
    const ext = String(file.name || '').split('.').pop()?.toLowerCase()
    const allowedExt = {
      'image/jpeg': ['jpg', 'jpeg'], 'image/png': ['png'],
      'image/webp': ['webp'], 'application/pdf': ['pdf']
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

  async signedUrl(storagePath, expiresIn = 300) {
    if (!storagePath || !this.isAvailable()) return { ok: false, error: 'فایل ابری در دسترس نیست' }
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
  }
}

window.FileStorage = FileStorage
