/* SMS is a server capability. Provider credentials and provider endpoints must
   never be configured or called by the browser. */
const SmsProvider = {
  isConfigured() {
    return !!(typeof Cloud !== 'undefined' && Cloud.isConfigured?.())
  },

  async sendStudio(phones, text, purpose = 'generic') {
    const list = (Array.isArray(phones) ? phones : [phones])
      .map(phone => Utils.normalizePhone(phone))
      .filter(phone => /^09\d{9}$/.test(phone))
    if (!list.length) return { ok: false, error: 'شماره موبایل معتبر نیست' }
    if (typeof Cloud === 'undefined') return { ok: false, error: 'اتصال ابری پیکربندی نشده است' }

    const cfg = Cloud.resolvedConfig?.() || {}
    const studioId = String(cfg.studioId || await Cloud._loadMemberStudioId?.() || '')
    const session = await Cloud.session?.()
    if (!cfg.url || !cfg.anonKey || !studioId || !session?.access_token) {
      return { ok: false, error: 'برای ارسال پیامک، ورود معتبر ابری لازم است' }
    }

    const idempotencyKey = `sms:${purpose}:${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`}`
    try {
      const response = await fetch(`${String(cfg.url).replace(/\/+$/, '')}/functions/v1/send-sms`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          apikey: cfg.anonKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ studioId, idempotencyKey, phones: list, text, purpose })
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) return { ok: false, error: data.error || `sms_http_${response.status}` }
      return data.ok ? { ok: true } : { ok: false, error: data.error || 'sms_proxy_failed' }
    } catch {
      return { ok: false, error: 'sms_network_failed' }
    }
  }
}

window.SmsProvider = SmsProvider
