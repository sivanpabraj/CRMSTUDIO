/**
 * Studio M Phase 3 — Supabase Storage for fileAssets
 */
const FileStorage = {
  BUCKET: 'studio-files',
  MAX_BYTES: 5 * 1024 * 1024,

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
    if (!file || file.size > this.MAX_BYTES) {
      return { ok: false, error: 'حداکثر ۵ مگابایت' }
    }

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

    let fileUrl = ''
    try {
      const { data: signedData } = await c.storage.from(this.BUCKET).createSignedUrl(path, 86400)
      if (signedData?.signedUrl) fileUrl = signedData.signedUrl
    } catch { /* fallback to public */ }

    if (!fileUrl) {
      const { data: urlData } = c.storage.from(this.BUCKET).getPublicUrl(path)
      fileUrl = urlData?.publicUrl || ''
    }

    return {
      ok: true,
      path,
      storagePath: path,
      mime: file.type,
      size: file.size,
      url: fileUrl
    }
  },

  async getSignedUrl(storagePath, expiresIn = 3600) {
    if (!storagePath || !this.isAvailable()) return ''
    try {
      const c = await Cloud.client()
      if (!c) return ''
      const { data, error } = await c.storage.from(this.BUCKET).createSignedUrl(storagePath, expiresIn)
      if (!error && data?.signedUrl) return data.signedUrl
      const { data: pub } = c.storage.from(this.BUCKET).getPublicUrl(storagePath)
      return pub?.publicUrl || ''
    } catch {
      return ''
    }
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
