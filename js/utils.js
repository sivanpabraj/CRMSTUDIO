/* ══════════════════════════════════════════════
   Studio M — Utilities
   ══════════════════════════════════════════════ */

const Utils = {
  faToEn(v) {
    if (v == null) return ''
    const map = { '۰':'0','۱':'1','۲':'2','۳':'3','۴':'4','۵':'5','۶':'6','۷':'7','۸':'8','۹':'9' }
    return String(v).replace(/[۰-۹]/g, c => map[c] || c)
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

  _tehranParts(value = new Date()) {
    const date = value instanceof Date ? value : new Date(value)
    if (Number.isNaN(date.getTime())) return null
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Tehran', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
    }).formatToParts(date)
    const get = type => Number(parts.find(part => part.type === type)?.value)
    return { year: get('year'), month: get('month'), day: get('day'), hour: get('hour'), minute: get('minute') }
  },

  todayJalali() {
    const p = this._tehranParts()
    const [jy, jm, jd] = this._gregorianToJalali(p.year, p.month, p.day)
    const pad = n => String(n).padStart(2, '0')
    return `${jy}/${pad(jm)}/${pad(jd)}`
  },

  /** تاریخ و ساعت شمسی — مثلاً 1404/04/05 — ساعت 14:30 */
  formatJalaliDateTime(isoOrMs) {
    const d = typeof isoOrMs === 'number' ? new Date(isoOrMs) : new Date(isoOrMs)
    if (Number.isNaN(d.getTime())) return '—'
    const p = this._tehranParts(d)
    const [jy, jm, jd] = this._gregorianToJalali(p.year, p.month, p.day)
    const pad = n => String(n).padStart(2, '0')
    return `${jy}/${pad(jm)}/${pad(jd)} — ساعت ${pad(p.hour)}:${pad(p.minute)}`
  },

  /** نام فایل پشتیبان با تاریخ و ساعت شمسی */
  backupFileName(label = 'manual') {
    const d = new Date()
    const p = this._tehranParts(d)
    const [jy, jm, jd] = this._gregorianToJalali(p.year, p.month, p.day)
    const pad = n => String(n).padStart(2, '0')
    const safe = String(label || 'manual').replace(/[^\w\u0600-\u06FF-]/g, '-')
    return `studio-m-${jy}${pad(jm)}${pad(jd)}-${pad(p.hour)}${pad(p.minute)}-${safe}.json`
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

  async legacyHashPassword(password, salt) {
    const enc = new TextEncoder()
    const data = enc.encode(String(salt) + String(password))
    const hash = await crypto.subtle.digest('SHA-256', data)
    return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('')
  },

  async hashPassword(password, salt) {
    return this.legacyHashPassword(password, salt)
  },

  async pbkdf2Hash(password, saltHex, iterations) {
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
  },

  async hashPasswordSecure(password) {
    const salt = Array.from(crypto.getRandomValues(new Uint8Array(16)))
      .map(b => b.toString(16).padStart(2, '0')).join('')
    const iterations = AppConfig.PBKDF2_ITERATIONS || 120000
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
    const today = this._tehranParts()
    const targetDay = Date.UTC(gy, gm - 1, gd)
    const todayDay = Date.UTC(today.year, today.month - 1, today.day)
    return Math.round((targetDay - todayDay) / 86400000)
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
    const div = (a, b) => Math.trunc(a / b)
    const mod = (a, b) => a - Math.trunc(a / b) * b
    const breaks = [-61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181, 1210, 1635, 2060, 2097, 2192, 2262, 2324, 2394, 2456, 3178]
    if (jy < breaks[0] || jy >= breaks[breaks.length - 1]) throw new Error('Jalali year out of range')

    const gy = jy + 621
    let leapJ = -14
    let jp = breaks[0]
    let jump = 0
    for (let index = 1; index < breaks.length; index++) {
      const next = breaks[index]
      jump = next - jp
      if (jy < next) break
      leapJ += div(jump, 33) * 8 + div(mod(jump, 33), 4)
      jp = next
    }
    const n = jy - jp
    leapJ += div(n, 33) * 8 + div(mod(n, 33) + 3, 4)
    if (mod(jump, 33) === 4 && jump - n === 4) leapJ += 1
    const leapG = div(gy, 4) - div((div(gy, 100) + 1) * 3, 4) - 150
    const march = 20 + leapJ - leapG

    const g2d = (year, month, day) => {
      let value = div((year + div(month - 8, 6) + 100100) * 1461, 4)
      value += div(153 * mod(month + 9, 12) + 2, 5) + day - 34840408
      return value - div(div(year + 100100 + div(month - 8, 6), 100) * 3, 4) + 752
    }
    const d2g = dayNumber => {
      let j = 4 * dayNumber + 139361631
      j += div(div(4 * dayNumber + 183187720, 146097) * 3, 4) * 4 - 3908
      const i = div(mod(j, 1461), 4) * 5 + 308
      const day = div(mod(i, 153), 5) + 1
      const month = mod(div(i, 153), 12) + 1
      const year = div(j, 1461) - 100100 + div(8 - month, 6)
      return [year, month, day]
    }
    const jalaliDayNumber = g2d(gy, 3, march) + (jm - 1) * 31 - div(jm, 7) * (jm - 7) + jd - 1
    return d2g(jalaliDayNumber)
  }
}

window.Utils = Utils
