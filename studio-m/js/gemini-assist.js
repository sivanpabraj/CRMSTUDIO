/**
 * Gemini Assist — client helper for Google Generative Language API
 * API key is stored ONLY in localStorage (sm_gemini_api_key) — never commit secrets.
 */
const SMGemini = {
  STORAGE_KEY: 'sm_gemini_api_key',
  MODEL: 'gemini-2.0-flash',

  getApiKey() {
    try {
      const fromLs = localStorage.getItem(this.STORAGE_KEY)
      if (fromLs) return fromLs.trim()
      const info = typeof DB !== 'undefined' ? DB.get('studioInfo') : null
      if (info?.geminiApiKey) return String(info.geminiApiKey).trim()
    } catch { /* */ }
    return ''
  },

  setApiKey(key) {
    const k = String(key || '').trim()
    localStorage.setItem(this.STORAGE_KEY, k)
    try {
      if (typeof DB !== 'undefined' && DB.get) {
        // Local only storage preferred without cloud sync of secret
      }
    } catch { /* */ }
    return !!k
  },

  clearApiKey() {
    localStorage.removeItem(this.STORAGE_KEY)
  },

  /** Compact studio context for the model (no PII dump beyond operational fields) */
  buildContext() {
    const contracts = (typeof DB !== 'undefined' && DB.get('contracts')) || []
    const tx = (typeof DB !== 'undefined' && DB.get('transactions')) || []
    const personnel = (typeof DB !== 'undefined' && DB.get('personnel')) || []
    const cheques = (typeof DB !== 'undefined' && DB.get('cheques')) || []
    const income = tx.filter((t) => t.type === 'deposit').reduce((s, t) => s + (t.amount || 0), 0)
    const expense = tx.filter((t) => t.type === 'withdrawal').reduce((s, t) => s + (t.amount || 0), 0)
    const active = contracts.filter((c) => c.status !== 'cancelled').length
    const sample = contracts.slice(-5).map((c) => ({
      couple: c.couple || `${c.bride || ''} و ${c.groom || ''}`.trim(),
      date: c.eventDate || c.date,
      remaining: Math.max(0, (c.total || 0) - (c.deposit || 0) - (c.paid || 0))
    }))
    return {
      studio: (typeof SM !== 'undefined' && SM.studio?.()) || {},
      stats: {
        contracts: contracts.length,
        activeContracts: active,
        personnel: personnel.filter((p) => p.status === 'active').length,
        income,
        expense,
        net: income - expense,
        pendingCheques: cheques.filter((c) => c.status === 'pending' || !c.status).length
      },
      recentContracts: sample
    }
  },

  async askStudio(userQuestion) {
    const key = this.getApiKey()
    if (!key) throw new Error('کلید API تنظیم نشده')

    const ctx = this.buildContext()
    const system = `تو دستیار فارسی استودیو فیلم و عکس هستی. فقط بر اساس داده JSON زیر پاسخ بده.
پاسخ کوتاه، عملی و به تومان/تاریخ جلالی باشد. اگر داده کافی نیست بگو.
داده:\n${JSON.stringify(ctx)}`

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.MODEL}:generateContent?key=${encodeURIComponent(key)}`
    const body = {
      contents: [
        {
          role: 'user',
          parts: [{ text: system + '\n\nسؤال کاربر: ' + userQuestion }]
        }
      ],
      generationConfig: {
        temperature: 0.4,
        maxOutputTokens: 512
      }
    }

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })

    if (!res.ok) {
      const errText = await res.text().catch(() => '')
      if (res.status === 400) throw new Error('کلید یا درخواست نامعتبر است')
      if (res.status === 403) throw new Error('دسترسی API رد شد — کلید یا محدودیت دامنه را چک کنید')
      throw new Error(`Gemini ${res.status}: ${errText.slice(0, 120)}`)
    }

    const data = await res.json()
    const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text).join('\n') || ''
    return text.trim()
  }
}

window.SMGemini = SMGemini
