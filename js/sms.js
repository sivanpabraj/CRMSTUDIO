const SmsProvider = {
  getStudioConfig() {
    const info = DB.get('studioInfo') || {}
    const def = (typeof AppConfig !== 'undefined' && AppConfig.DEFAULT_SMS) || {}
    return {
      provider: info.smsProvider || def.provider || 'melipayamak',
      apiKey: info.smsApiKey || def.apiKey || '09e58c2abb4a49188d3a1f5c4a53390f',
      username: info.smsUsername || def.username || '',
      lineNumber: info.smsLineNumber || def.lineNumber || '50004001004893',
      proxyUrl: info.smsProxyUrl || def.proxyUrl || ''
    }
  },

  isConfigured() {
    const cfg = this.getStudioConfig()
    if (cfg.proxyUrl) return true
    if (cfg.provider === 'melipayamak') {
      const hasUserPass = !!(cfg.username && cfg.apiKey)
      const hasCombined = typeof cfg.apiKey === 'string' && cfg.apiKey.includes(':')
      const hasConsoleToken = !!(cfg.apiKey && !hasCombined && !cfg.username)
      return !!(cfg.lineNumber && (hasUserPass || hasCombined || hasConsoleToken))
    }
    return !!(cfg.provider && cfg.apiKey)
  },

  async sendStudio(phones, text) {
    const cfg = this.getStudioConfig()
    const list = (Array.isArray(phones) ? phones : [phones])
      .map(p => Utils.normalizePhone(p))
      .filter(p => /^09\d{9}$/.test(p))
    if (!list.length) return { ok: false, error: 'شماره موبایل معتبر نیست' }

    // روش ۱: ارسال مستقیم از طریق سرور ایران (/api/sms/send)
    try {
      if (typeof window !== 'undefined' && location.protocol.startsWith('http')) {
        const srvRes = await fetch('/api/sms/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            phones: list,
            text,
            apiKey: cfg.apiKey,
            lineNumber: cfg.lineNumber,
            provider: cfg.provider
          })
        })
        if (srvRes.ok) {
          const j = await srvRes.json()
          if (j.ok) return { ok: true }
        }
      }
    } catch { /* ادامه با سایر روش‌ها */ }

    // روش ۲: پراکسی خارجی (در صورت تنظیم معتبر)
    if (cfg.proxyUrl && !cfg.proxyUrl.includes('supabase.co')) {
      return this._sendViaProxy(cfg.proxyUrl, list, text)
    }

    const secure = this._isSecureEnv()
    if (!secure) {
      return { ok: false, error: 'ارسال پیامک روی این دامنه غیرفعال است' }
    }
    if (!cfg.provider || !cfg.apiKey) {
      return { ok: false, error: 'تنظیمات پنل پیامک انجام نشده است' }
    }
    return this.send(cfg.provider, { apiKey: cfg.apiKey, lineNumber: cfg.lineNumber, username: cfg.username }, list, text)
  },

  async _sendViaProxy(proxyUrl, phones, text) {
    try {
      const headers = { 'Content-Type': 'application/json' }
      if (typeof Cloud !== 'undefined') {
        const sess = await Cloud.session?.()
        if (sess?.access_token) headers.Authorization = `Bearer ${sess.access_token}`
      }
      const res = await fetch(String(proxyUrl).replace(/\/+$/, ''), {
        method: 'POST',
        headers,
        body: JSON.stringify({ phones, text })
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) return { ok: false, error: data.error || `proxy ${res.status}` }
      return data.ok ? { ok: true } : { ok: false, error: data.error || 'proxy error' }
    } catch (e) {
      return { ok: false, error: String(e) }
    }
  },

  send(provider, config, phones, text) {
    if (!this._isSecureEnv()) {
      return Promise.resolve({ ok: false, error: 'ارسال پیامک در این محیط (HTTP/دامنه ناامن) غیرفعال است' })
    }
    switch (provider) {
      case 'melipayamak': return this._melipayamak(config, phones, text)
      case 'farazsms': return this._farazsms(config, phones, text)
      case 'kavenegar': return this._kavenegar(config, phones, text)
      case 'smsir': return this._smsir(config, phones, text)
      default: return Promise.resolve({ ok: false, error: 'ارائه‌دهنده پیامک نامعتبر است' })
    }
  },

  _meliCreds(config) {
    if (config.username && config.apiKey) return { user: config.username, pass: config.apiKey }
    const raw = String(config.apiKey || '')
    const idx = raw.indexOf(':')
    if (idx > 0) return { user: raw.slice(0, idx), pass: raw.slice(idx + 1) }
    return { user: '', pass: '' }
  },

  _melipayamak(config, phones, text) {
    const { user, pass } = this._meliCreds(config)
    const from = config.lineNumber || ''
    if (!from) {
      return Promise.resolve({ ok: false, error: 'شماره خط ملی پیامک الزامی است' })
    }
    // توکن کنسول (UUID) بدون username
    if (!user && config.apiKey && !String(config.apiKey).includes(':')) {
      return Promise.all(phones.map(phone =>
        fetch(`https://console.melipayamak.com/api/send/simple/${encodeURIComponent(config.apiKey)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ from, to: phone, text })
        }).then(r => r.json().then(data => ({ okHttp: r.ok, data }))).then(({ okHttp, data }) => {
          const errMsg = typeof data?.status === 'string' ? data.status.trim() : ''
          const recId = data?.recId
          const badRec = recId == null || recId === '' || Number(recId) < 0
          if (!okHttp || (errMsg && badRec) || badRec) {
            return Promise.reject(errMsg || 'خطای کنسول ملی پیامک')
          }
          return null
        })
      )).then(() => ({ ok: true })).catch(e => ({ ok: false, error: String(e) }))
    }
    if (!user || !pass) {
      return Promise.resolve({ ok: false, error: 'نام کاربری و رمز وب‌سرویس ملی پیامک الزامی است' })
    }
    return Promise.all(phones.map(phone => {
      const body = new URLSearchParams({
        username: user, password: pass, to: phone, from, text, isFlash: 'false'
      })
      return fetch('https://rest.payamak-panel.com/api/SendSMS/SendSMS', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body
      }).then(r => r.json()).then(data => {
        if (data?.RetStatus === 1) return null
        const code = data?.Value != null ? String(data.Value) : ''
        const msg = data?.StrRetStatus || 'خطای ملی پیامک'
        return Promise.reject(code ? `${msg} (${code})` : msg)
      })
    })).then(() => ({ ok: true })).catch(e => ({ ok: false, error: String(e) }))
  },

  _farazsms(config, phones, text) {
    return fetch('https://api.iranpayamak.com/ws/v1/sms/simple', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Api-Key': config.apiKey },
      body: JSON.stringify({ text, recipients: phones, line_number: config.lineNumber || '90008361', number_format: 'english' })
    }).then(r => r.json()).then(r => r.status === 'success' ? { ok: true } : { ok: false, error: r.message || 'خطا' })
      .catch(e => ({ ok: false, error: String(e) }))
  },

  _kavenegar(config, phones, text) {
    // توصیه امنیتی: استفاده از پراکسی سرور برای پنهان‌سازی apiKey
    const apiKey = config.apiKey
    const sender = config.lineNumber || ''
    return Promise.all(phones.map(phone =>
      fetch('https://api.kavenegar.com/v1/' + apiKey + '/sms/send.json', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `receptor=${encodeURIComponent(phone)}&sender=${encodeURIComponent(sender)}&message=${encodeURIComponent(text)}`
      })
      .then(r => r.json()).then(r => r.return && r.return.status === 200 ? null : Promise.reject(r.return?.message || 'خطا'))
    )).then(() => ({ ok: true })).catch(e => ({ ok: false, error: String(e) }))
  },

  _smsir(config, phones, text) {
    return fetch('https://api.sms.ir/v1/send/bulk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-KEY': config.apiKey, 'Accept': 'application/json' },
      body: JSON.stringify({ Message: text, MobileNumbers: phones, LineNumber: config.lineNumber || '', SendDate: '' })
    }).then(r => r.json()).then(r => r.IsSuccessful ? { ok: true } : { ok: false, error: r.Message || 'خطا' })
      .catch(e => ({ ok: false, error: String(e) }))
  },

  _isSecureEnv() {
    try {
      const host = location.hostname
      const proto = location.protocol
      const isLocal = ['localhost', '127.0.0.1', '::1'].includes(host)
      const isHttps = proto === 'https:'
      const isIp = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host)
      return isHttps || isLocal || isIp
    } catch {
      return false
    }
  }
}

window.SmsProvider = SmsProvider
