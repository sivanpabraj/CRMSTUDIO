/* ══════════════════════════════════════════════
   Studio M — Utilities
   ══════════════════════════════════════════════ */

const Utils = {
  faToEn(v) {
    if (v == null) return ''
    const map = {
      '۰':'0','۱':'1','۲':'2','۳':'3','۴':'4','۵':'5','۶':'6','۷':'7','۸':'8','۹':'9',
      '٠':'0','١':'1','٢':'2','٣':'3','٤':'4','٥':'5','٦':'6','٧':'7','٨':'8','٩':'9'
    }
    return String(v).replace(/[۰-۹٠-٩]/g, c => map[c] || c)
  },

  normalizePassword(v) {
    if (v == null) return ''
    let s = String(v).trim()
    s = this.faToEn(s)
    s = s.replace(/[\u0660-\u0669]/g, c => String(c.charCodeAt(0) - 0x0660))
    s = s.replace(/[\u06F0-\u06F9]/g, c => String(c.charCodeAt(0) - 0x06F0))
    return s
  },

  hasPersianLetters(v) {
    if (!v) return false
    const s = String(v)
      .replace(/[۰-۹]/g, '')
      .replace(/[\u0660-\u0669\u06F0-\u06F9]/g, '')
    return /[\u0600-\u06FF\u0750-\u077F]/.test(s)
  },

  passwordsMatch(a, b) {
    return this.normalizePassword(a) === this.normalizePassword(b)
  },

  normalizePhone(phone) {
    if (!phone) return ''
    let p = this.faToEn(String(phone)).replace(/[\u0660-\u0669\u06F0-\u06F9]/g, c => {
      const code = c.charCodeAt(0)
      if (code >= 0x0660 && code <= 0x0669) return String(code - 0x0660)
      return String(code - 0x06F0)
    })
    p = p.replace(/[^0-9]/g, '')
    if (p.startsWith('98') && p.length === 12) p = '0' + p.slice(2)
    if (p.startsWith('9') && p.length === 10) p = '0' + p
    return p
  },

  isValidPhone(phone) {
    return /^09\d{9}$/.test(this.normalizePhone(phone))
  },

  /** مسیر redirect امن — فقط same-origin relative */
  safeRedirectPath(next) {
    const t = String(next || '').trim()
    if (!t || /^https?:\/\//i.test(t) || t.startsWith('//') || t.startsWith('\\') || !t.startsWith('/')) return null
    try {
      const u = new URL(t, location.origin)
      if (u.origin !== location.origin) return null
      return u.pathname + u.search + u.hash
    } catch { return null }
  },

  /** studio-m/ ، admin.html و مسیرهای نسبی امن */
  safeAppRedirect(url) {
    if (!url) return null
    const t = String(url).trim()
    if (!t || /^https?:\/\//i.test(t) || t.startsWith('//') || t.startsWith('\\')) return null
    return this.safeRedirectPath(t.startsWith('/') ? t : `/${t}`)
  },

  escapeHtml(v) {
    if (v == null) return ''
    return String(v)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
  },

  /** OTP امن ۶ رقمی */
  generateOtp6() {
    const n = crypto.getRandomValues(new Uint32Array(1))[0] % 1000000
    return String(n).padStart(6, '0')
  },

  /** رمز تصادفی برای راه‌اندازی اولیه */
  generateRandomPassword(len = 12) {
    const chars = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$'
    const bytes = crypto.getRandomValues(new Uint8Array(len))
    let out = ''
    for (let i = 0; i < len; i++) out += chars[bytes[i] % chars.length]
    return out
  },

  /** فقط data:image، blob و http(s) — جلوگیری از javascript: XSS */
  sanitizeImageUrl(url) {
    if (url == null || url === '') return ''
    const s = String(url).trim()
    if (s.startsWith('data:image/')) return s
    if (s.startsWith('blob:')) return s
    try {
      const u = new URL(s, location.origin)
      if (u.protocol === 'https:') return u.href
      if (u.protocol === 'http:' && AppConfig.isLocalDev()) return u.href
    } catch { /* invalid */ }
    return ''
  },

  safeImgHtml(url, attrs = '') {
    const safe = this.sanitizeImageUrl(url)
    if (!safe) return ''
    return `<img src="${this.escapeHtml(safe)}" alt="" ${attrs}/>`
  },

  fmtNum(n) {
    const num = Number(n) || 0
    try {
      return num.toLocaleString('fa-IR')
    } catch {
      return String(num).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
    }
  },

  _gregorianToJalali(gy, gm, gd) {
    const gdm = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334]
    let jy = gy <= 1600 ? 0 : 979
    gy -= gy <= 1600 ? 621 : 1600
    const gy2 = gm > 2 ? gy + 1 : gy
    let days = 365 * gy + Math.floor((gy2 + 3) / 4) - Math.floor((gy2 + 99) / 100) +
      Math.floor((gy2 + 399) / 400) - 80 + gd + gdm[gm - 1]
    jy += 33 * Math.floor(days / 12053)
    days %= 12053
    jy += 4 * Math.floor(days / 1461)
    days %= 1461
    jy += Math.floor((days - 1) / 365)
    if (days > 365) days = (days - 1) % 365
    const jm = days < 186 ? 1 + Math.floor(days / 31) : 7 + Math.floor((days - 186) / 30)
    const jd = 1 + (days < 186 ? days % 31 : (days - 186) % 30)
    return [jy, jm, jd]
  },

  todayJalali() {
    const d = new Date()
    const [jy, jm, jd] = this._gregorianToJalali(d.getFullYear(), d.getMonth() + 1, d.getDate())
    const pad = n => String(n).padStart(2, '0')
    return `${jy}/${pad(jm)}/${pad(jd)}`
  },

  /** تاریخ و ساعت شمسی — مثلاً 1404/04/05 — ساعت 14:30 */
  formatJalaliDateTime(isoOrMs) {
    const d = typeof isoOrMs === 'number' ? new Date(isoOrMs) : new Date(isoOrMs)
    if (Number.isNaN(d.getTime())) return '—'
    const [jy, jm, jd] = this._gregorianToJalali(d.getFullYear(), d.getMonth() + 1, d.getDate())
    const pad = n => String(n).padStart(2, '0')
    return `${jy}/${pad(jm)}/${pad(jd)} — ساعت ${pad(d.getHours())}:${pad(d.getMinutes())}`
  },

  /** نام فایل پشتیبان با تاریخ و ساعت شمسی */
  backupFileName(label = 'manual') {
    const d = new Date()
    const [jy, jm, jd] = this._gregorianToJalali(d.getFullYear(), d.getMonth() + 1, d.getDate())
    const pad = n => String(n).padStart(2, '0')
    const safe = String(label || 'manual').replace(/[^\w\u0600-\u06FF-]/g, '-')
    return `studio-m-${jy}${pad(jm)}${pad(jd)}-${pad(d.getHours())}${pad(d.getMinutes())}-${safe}.json`
  },

  parseBackupKey(key) {
    const m = String(key || '').match(/(\d{10,13})$/)
    if (m) return this.formatJalaliDateTime(Number(m[1]))
    return String(key || '—')
  },

  isDemoOtpMode() {
    if (typeof AppConfig !== 'undefined' && AppConfig.SHOW_DEMO_OTP) return true
    try {
      const h = location.hostname
      return h === 'localhost' || h === '127.0.0.1'
    } catch { return false }
  },

  applyStudioTitle(pageLabel) {
    const studio = (typeof DB !== 'undefined' && DB.get)
      ? (DB.get('studioInfo')?.name || AppConfig.DEFAULT_STUDIO_NAME)
      : AppConfig.DEFAULT_STUDIO_NAME
    const label = pageLabel || document.title.split('—')[0]?.trim() || AppConfig.APP_NAME
    document.title = `${label} — ${studio}`
  },

  storage: {
    get(key, fallback = null) {
      try {
        const raw = localStorage.getItem(key)
        if (raw == null) return fallback
        return JSON.parse(raw)
      } catch {
        return fallback
      }
    },
    set(key, value) {
      try { localStorage.setItem(key, JSON.stringify(value)) } catch { /* ignore quota */ }
    },
    remove(key) {
      try { localStorage.removeItem(key) } catch { /* */ }
    }
  },

  toast(msg, type = 'info', duration = 4000) {
    let stack = document.querySelector('.toast-container')
    if (!stack) {
      stack = document.createElement('div')
      stack.className = 'toast-container'
      stack.setAttribute('aria-live', 'polite')
      document.body.appendChild(stack)
    }
    const el = document.createElement('div')
    el.className = `toast toast-${type}`
    el.textContent = msg
    stack.appendChild(el)
    setTimeout(() => {
      el.classList.add('toast-out')
      setTimeout(() => el.remove(), 300)
    }, duration)
  },

  async copy(text) {
    try {
      await navigator.clipboard.writeText(String(text))
      return true
    } catch {
      const ta = document.createElement('textarea')
      ta.value = String(text)
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      try { document.execCommand('copy'); return true } catch { return false }
      finally { ta.remove() }
    }
  },

  copyText(text) {
    this.copy(text)
    this.toast('کپی شد', 'success')
  },

  isPbkdf2Password(stored) {
    return String(stored || '').startsWith('pbkdf2$')
  },

  _sha256Bytes(bytes) {
    const K = [
      0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
      0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
      0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
      0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
      0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
      0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
      0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
      0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
    ]
    const H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]
    const l = bytes.length
    const bitLen = l * 8
    const padLen = ((l + 9 + 63) >> 6) << 6
    const msg = new Uint8Array(padLen)
    msg.set(bytes)
    msg[l] = 0x80
    const view = new DataView(msg.buffer)
    view.setUint32(padLen - 4, bitLen >>> 0)
    view.setUint32(padLen - 8, Math.floor(bitLen / 0x100000000))
    const W = new Int32Array(64)
    const rotr = (x, n) => (x >>> n) | (x << (32 - n))
    for (let i = 0; i < padLen; i += 64) {
      for (let t = 0; t < 16; t++) W[t] = view.getInt32(i + t * 4)
      for (let t = 16; t < 64; t++) {
        const s0 = rotr(W[t - 15], 7) ^ rotr(W[t - 15], 18) ^ (W[t - 15] >>> 3)
        const s1 = rotr(W[t - 2], 17) ^ rotr(W[t - 2], 19) ^ (W[t - 2] >>> 10)
        W[t] = (W[t - 16] + s0 + W[t - 7] + s1) | 0
      }
      let [a, b, c, d, e, f, g, h] = H
      for (let t = 0; t < 64; t++) {
        const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)
        const ch = (e & f) ^ ((~e) & g)
        const temp1 = (h + S1 + ch + K[t] + W[t]) | 0
        const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)
        const maj = (a & b) ^ (a & c) ^ (b & c)
        const temp2 = (S0 + maj) | 0
        h = g; g = f; f = e; e = (d + temp1) | 0
        d = c; c = b; b = a; a = (temp1 + temp2) | 0
      }
      H[0] = (H[0] + a) | 0; H[1] = (H[1] + b) | 0; H[2] = (H[2] + c) | 0; H[3] = (H[3] + d) | 0
      H[4] = (H[4] + e) | 0; H[5] = (H[5] + f) | 0; H[6] = (H[6] + g) | 0; H[7] = (H[7] + h) | 0
    }
    const out = new Uint8Array(32)
    const outView = new DataView(out.buffer)
    for (let t = 0; t < 8; t++) outView.setInt32(t * 4, H[t])
    return out
  },

  _hmacBytes(keyBytes, msgBytes) {
    let k = keyBytes
    if (k.length > 64) k = this._sha256Bytes(k)
    const paddedKey = new Uint8Array(64)
    paddedKey.set(k)
    const iPad = new Uint8Array(64)
    const oPad = new Uint8Array(64)
    for (let i = 0; i < 64; i++) {
      iPad[i] = paddedKey[i] ^ 0x36
      oPad[i] = paddedKey[i] ^ 0x5c
    }
    const innerMsg = new Uint8Array(64 + msgBytes.length)
    innerMsg.set(iPad)
    innerMsg.set(msgBytes, 64)
    const innerHash = this._sha256Bytes(innerMsg)
    const outerMsg = new Uint8Array(64 + 32)
    outerMsg.set(oPad)
    outerMsg.set(innerHash, 64)
    return this._sha256Bytes(outerMsg)
  },

  jsSha256(str) {
    const enc = new TextEncoder()
    const bytes = this._sha256Bytes(enc.encode(String(str || '')))
    return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')
  },

  jsHmac(secret, data) {
    const enc = new TextEncoder()
    const bytes = this._hmacBytes(enc.encode(String(secret || '')), enc.encode(String(data || '')))
    return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')
  },

  jsPbkdf2(passwordStr, saltHex, iterations, keyLenBytes = 32) {
    const enc = new TextEncoder()
    const passBytes = enc.encode(String(passwordStr || ''))
    const hex = String(saltHex || '')
    const matches = hex.match(/.{2}/g) || []
    const saltBytes = new Uint8Array(matches.map(h => parseInt(h, 16)))
    const numBlocks = Math.ceil(keyLenBytes / 32)
    const result = new Uint8Array(numBlocks * 32)
    for (let block = 1; block <= numBlocks; block++) {
      const saltBlock = new Uint8Array(saltBytes.length + 4)
      saltBlock.set(saltBytes)
      const view = new DataView(saltBlock.buffer)
      view.setUint32(saltBytes.length, block)
      let u = this._hmacBytes(passBytes, saltBlock)
      const t = new Uint8Array(u)
      for (let c = 1; c < iterations; c++) {
        u = this._hmacBytes(passBytes, u)
        for (let j = 0; j < 32; j++) t[j] ^= u[j]
      }
      result.set(t, (block - 1) * 32)
    }
    const sliced = result.slice(0, keyLenBytes)
    return Array.from(sliced).map(b => b.toString(16).padStart(2, '0')).join('')
  },

  async legacyHashPassword(password, salt) {
    if (typeof crypto !== 'undefined' && crypto.subtle?.digest) {
      try {
        const enc = new TextEncoder()
        const data = enc.encode(String(salt) + String(password))
        const hash = await crypto.subtle.digest('SHA-256', data)
        return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('')
      } catch { /* fallback */ }
    }
    return this.jsSha256(String(salt) + String(password))
  },

  async hashPassword(password, salt) {
    return this.legacyHashPassword(password, salt)
  },

  async pbkdf2Hash(password, saltHex, iterations) {
    if (typeof crypto !== 'undefined' && crypto.subtle?.importKey && crypto.subtle?.deriveBits) {
      try {
        const enc = new TextEncoder()
        const keyMaterial = await crypto.subtle.importKey(
          'raw', enc.encode(String(password)), 'PBKDF2', false, ['deriveBits']
        )
        const saltBytes = new Uint8Array(String(saltHex).match(/.{2}/g).map(h => parseInt(h, 16)))
        const bits = await crypto.subtle.deriveBits(
          { name: 'PBKDF2', salt: saltBytes, iterations, hash: 'SHA-256' },
          keyMaterial,
          256
        )
        return Array.from(new Uint8Array(bits)).map(b => b.toString(16).padStart(2, '0')).join('')
      } catch { /* fallback */ }
    }
    return this.jsPbkdf2(password, saltHex, iterations)
  },

  async hashPasswordSecure(password) {
    let salt = ''
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
      try {
        salt = Array.from(crypto.getRandomValues(new Uint8Array(16)))
          .map(b => b.toString(16).padStart(2, '0')).join('')
      } catch { /* fallback */ }
    }
    if (!salt) {
      salt = Array.from({ length: 16 }, () => Math.floor(Math.random() * 256).toString(16).padStart(2, '0')).join('')
    }
    const isNative = typeof crypto !== 'undefined' && !!crypto.subtle?.importKey
    const iterations = isNative ? (AppConfig.PBKDF2_ITERATIONS || 120000) : 10000
    const hash = await this.pbkdf2Hash(password, salt, iterations)
    return { password: `pbkdf2$${iterations}$${hash}`, salt }
  },

  async verifyPassword(password, storedHash, salt) {
    const stored = String(storedHash || '')
    if (this.isPbkdf2Password(stored)) {
      const [, iterStr, hash] = stored.split('$')
      const derived = await this.pbkdf2Hash(password, salt || '', parseInt(iterStr, 10))
      return derived === hash
    }
    if (/^[a-f0-9]{64}$/i.test(stored)) {
      return (await this.legacyHashPassword(password, salt || '')) === stored
    }
    return false
  },

  isTxExpense(type) {
    return type === 'withdrawal' || type === 'withdraw'
  },

  isTxIncome(type) {
    return type === 'deposit'
  },

  txExpenseSum(transactions) {
    return (transactions || []).filter(t => this.isTxExpense(t.type)).reduce((s, t) => s + (t.amount || 0), 0)
  },

  txIncomeSum(transactions) {
    return (transactions || []).filter(t => this.isTxIncome(t.type)).reduce((s, t) => s + (t.amount || 0), 0)
  },

  daysUntil(jalaliDate) {
    if (!jalaliDate) return null
    const parts = String(jalaliDate).split(/[/-]/)
    if (parts.length < 3) return null
    const jy = +parts[0], jm = +parts[1], jd = +parts[2]
    const [gy, gm, gd] = this._jalaliToGregorian(jy, jm, jd)
    const target = new Date(gy, gm - 1, gd)
    const now = new Date()
    now.setHours(0, 0, 0, 0)
    target.setHours(0, 0, 0, 0)
    return Math.round((target - now) / 86400000)
  },

  parseJalali(str) {
    const parts = String(str || '').split(/[/-]/)
    if (parts.length < 3) return null
    const jy = +parts[0], jm = +parts[1], jd = +parts[2]
    if (!jy || !jm || !jd) return null
    return { jy, jm, jd }
  },

  formatJalali(jy, jm, jd) {
    const pad = n => String(n).padStart(2, '0')
    return `${jy}/${pad(jm)}/${pad(jd)}`
  },

  normJalali(str) {
    const p = this.parseJalali(str)
    return p ? this.formatJalali(p.jy, p.jm, p.jd) : ''
  },

  jalaliMonthName(jm) {
    return ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'][jm - 1] || ''
  },

  jalaliWeekdaysShort() {
    return ['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج']
  },

  isJalaliLeap(jy) {
    const r = jy % 33
    return [1, 5, 9, 13, 17, 22, 26, 30].includes(r)
  },

  jalaliMonthDays(jy, jm) {
    if (jm <= 6) return 31
    if (jm <= 11) return 30
    return this.isJalaliLeap(jy) ? 30 : 29
  },

  jalaliMonthStartWeekday(jy, jm) {
    const [gy, gm, gd] = this._jalaliToGregorian(jy, jm, 1)
    return (new Date(gy, gm - 1, gd).getDay() + 1) % 7
  },

  parseJalaliToday() {
    return this.parseJalali(this.todayJalali())
  },

  _jalaliToGregorian(jy, jm, jd) {
    // Jalaali.js algorithm (دقیق برای همه سال‌ها)
    const breaks = [-61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181, 1210, 1635, 2060, 2097, 2192, 2262, 2324, 2394, 2456, 3178]
    const g_d_m = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334, 365]
    const bl = breaks.length
    const gy = jy + 621
    let leapJ = -14
    let jp = breaks[0]
    let _jmLeap = 0
    for (let i = 1; i < bl; i++) {
      const jump = breaks[i] - jp
      if (jy < breaks[i]) break
      leapJ += Math.floor(jump / 33) * 8 + Math.floor((jump % 33) / 4)
      jp = breaks[i]
    }
    const n = jy - jp
    leapJ += Math.floor(n / 33) * 8 + Math.floor((n % 33 + 3) / 4)
    if (jumpMod33(jy, breaks) === 4 && jumpMod33(jy + 1, breaks) - jumpMod33(jy, breaks) === 4) leapJ += 1
    const leapG = Math.floor(gy / 4) - Math.floor((Math.floor((gy / 100) + 1) * 3) / 4) - 150
    const march = 20 + leapJ - leapG
    const jDayNo = 365 * n + Math.floor((n + 3) / 4) + jd + (jm <= 7 ? (jm - 1) * 31 : ((jm - 7) * 30 + 186)) + march - 1
    let gDayNo = jDayNo + 79
    let gy2 = 1600 + 400 * Math.floor(gDayNo / 146097)
    gDayNo %= 146097
    let leap = true
    if (gDayNo >= 36525) {
      gDayNo--
      gy2 += 100 * Math.floor(gDayNo / 36524)
      gDayNo %= 36524
      if (gDayNo >= 365) gDayNo++
      else leap = false
    }
    gy2 += 4 * Math.floor(gDayNo / 1461)
    gDayNo %= 1461
    if (gDayNo >= 366) {
      leap = false
      gDayNo--
      gy2 += Math.floor(gDayNo / 365)
      gDayNo %= 365
    }
    let gm = 0
    while (gm < 12 && gDayNo >= g_d_m[gm + 1] + (gm === 1 && leap ? 1 : 0)) gm++
    const gd = gDayNo - g_d_m[gm] - (gm > 1 && leap ? 1 : 0) + 1
    return [gy2, gm + 1, gd]

    function jumpMod33(y, brks) {
      let jp2 = brks[0]
      for (let i = 1; i < brks.length; i++) {
        const _jump = brks[i] - jp2
        if (y < brks[i]) return (y - jp2) % 33
        jp2 = brks[i]
      }
      return (y - jp2) % 33
    }
  }
}

window.Utils = Utils

// تبدیل خودکار اعداد فارسی و عربی به انگلیسی در کلیه فرم‌ها، پنجره‌ها و بخش‌ها
if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  const digitRegex = /[۰-۹٠-٩]/

  document.addEventListener('beforeinput', (e) => {
    if (e.data && digitRegex.test(e.data)) {
      e.preventDefault()
      const converted = Utils.faToEn(e.data)
      if (document.execCommand) {
        document.execCommand('insertText', false, converted)
      } else if (e.target && 'value' in e.target) {
        const t = e.target
        const start = t.selectionStart || 0
        const end = t.selectionEnd || 0
        t.value = t.value.slice(0, start) + converted + t.value.slice(end)
        if (t.setSelectionRange) {
          try { t.setSelectionRange(start + converted.length, start + converted.length) } catch { /* ignore */ }
        }
        t.dispatchEvent(new Event('input', { bubbles: true }))
      }
    }
  }, true)

  document.addEventListener('input', (e) => {
    const target = e.target
    if (!target || !('value' in target)) return
    const val = target.value
    if (typeof val === 'string' && digitRegex.test(val)) {
      const start = target.selectionStart
      const end = target.selectionEnd
      target.value = Utils.faToEn(val)
      if (start != null && end != null && target.setSelectionRange) {
        try { target.setSelectionRange(start, end) } catch { /* ignore */ }
      }
    }
  }, true)
}
