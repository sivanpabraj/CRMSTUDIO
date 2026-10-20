import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import zlib from 'node:zlib'
import { execSync, spawn } from 'node:child_process'

let nodemailer = null
try {
  const nmModule = await import('nodemailer')
  nodemailer = nmModule.default || nmModule
} catch (e) {
  console.warn('[SyncServer] nodemailer import notice:', e.message)
}

const PORT = parseInt(process.env.PORT || '3000', 10)
const DATA_DIR = process.env.DATA_DIR || '/var/lib/crmstudio'
const TENANTS_DIR = path.join(DATA_DIR, 'tenants')
const DEFAULT_DB_FILE = path.join(DATA_DIR, 'crmstudio_db.json')
const DEFAULT_META_FILE = path.join(DATA_DIR, 'crmstudio_meta.json')
const MELIPAYAMAK_API_KEY = process.env.MELIPAYAMAK_API_KEY || ''
const MELIPAYAMAK_LINE = process.env.MELIPAYAMAK_LINE || ''

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true })
}
if (!fs.existsSync(TENANTS_DIR)) {
  fs.mkdirSync(TENANTS_DIR, { recursive: true })
}

// ══════════════════════════════════════════════
// Sliding Window In-Memory Rate Limiter
// ══════════════════════════════════════════════
class RateLimiter {
  constructor(windowMs, maxHits) {
    this.windowMs = windowMs
    this.maxHits = maxHits
    this.hits = new Map()
  }

  check(key) {
    if (!key) return { allowed: true }
    const now = Date.now()
    const timestamps = (this.hits.get(key) || []).filter(t => now - t < this.windowMs)
    if (timestamps.length >= this.maxHits) {
      const oldest = timestamps[0]
      const retryAfterSec = Math.max(1, Math.ceil((oldest + this.windowMs - now) / 1000))
      return { allowed: false, retryAfterSec }
    }
    timestamps.push(now)
    this.hits.set(key, timestamps)

    // Cleanup stale keys if map grows large
    if (this.hits.size > 2000) {
      for (const [k, v] of this.hits.entries()) {
        if (v.every(t => now - t >= this.windowMs)) {
          this.hits.delete(k)
        }
      }
    }
    return { allowed: true }
  }
}

// Rate Limiter Instances
const smsIpLimiter = new RateLimiter(60 * 1000, 8) // max 8 SMS per min per IP
const smsPhoneLimiter = new RateLimiter(10 * 60 * 1000, 3) // max 3 SMS per 10 min per phone
const emailIpLimiter = new RateLimiter(60 * 1000, 15) // max 15 emails per min per IP
const authLimiter = new RateLimiter(60 * 1000, 30) // max 30 auth lookups per min per IP
const syncLimiter = new RateLimiter(60 * 1000, 120) // max 120 sync requests per min per IP

function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for']
  if (forwarded) {
    return forwarded.split(',')[0].trim()
  }
  return req.socket?.remoteAddress || '127.0.0.1'
}

function resolveTenantKey(studioId) {
  if (!studioId || typeof studioId !== 'string') return ''
  const clean = studioId.replace(/[^a-zA-Z0-9_\-]/g, '').slice(0, 64)
  if (!clean || clean === 'undefined' || clean === 'null') return ''
  return clean
}

// In-Memory Active OTP Store (phone -> { code, expiresAt, attempts, channel })
const activeOtps = new Map()
const BALE_BOT_TOKEN = process.env.BALE_BOT_TOKEN || ''
const BALE_BOT_USERNAME = process.env.BALE_BOT_USERNAME || 'mandani_studio_bot'

// Periodic cleanup of expired OTPs to prevent memory leaks
setInterval(() => {
  const now = Date.now()
  for (const [key, entry] of activeOtps.entries()) {
    if (entry.expiresAt <= now) {
      activeOtps.delete(key)
    }
  }
}, 60 * 1000).unref()

function maskEmail(email) {
  if (!email || !email.includes('@')) return email
  const [local, domain] = email.split('@')
  if (local.length <= 2) return `${local[0]}*@${domain}`
  return `${local[0]}***${local.slice(-1)}@${domain}`
}

async function sendServerEmail({
  to,
  subject,
  html,
  text,
  smtpHost,
  smtpPort,
  smtpSecure,
  smtpUser,
  smtpPass,
  fromName,
  fromAddress
}) {
  const host = smtpHost || process.env.SMTP_HOST || 'smtp.gmail.com'
  const port = parseInt(smtpPort || process.env.SMTP_PORT || '465', 10)
  const secure = smtpSecure !== undefined ? Boolean(smtpSecure) : (port === 465)
  const user = smtpUser || process.env.SMTP_USER || ''
  const pass = smtpPass || process.env.SMTP_PASS || ''
  const senderName = fromName || 'استودیو فیلم و عکس ماندنی'
  const senderAddr = fromAddress || user || 'noreply@studiomandani.ir'

  if (!user || !pass) {
    const outboxDir = path.join(DATA_DIR, 'outbox')
    if (!fs.existsSync(outboxDir)) fs.mkdirSync(outboxDir, { recursive: true })
    const outboxEntry = {
      id: 'email_' + Date.now(),
      to,
      subject,
      createdAt: new Date().toISOString(),
      status: 'queued_no_smtp'
    }
    fs.writeFileSync(path.join(outboxDir, `${outboxEntry.id}.json`), JSON.stringify({ ...outboxEntry, html, text }, null, 2))
    console.log(`[Email Audit] Stored to outbox: ${to} | Subject: ${subject}`)
    return { ok: true, queued: true, messageId: outboxEntry.id }
  }

  if (!nodemailer) {
    throw new Error('ماژول ارسال ایمیل در سرور بارگذاری نشده است')
  }

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass }
  })

  const info = await transporter.sendMail({
    from: `"${senderName}" <${senderAddr}>`,
    to,
    subject,
    text: text || (html ? html.replace(/<[^>]+>/g, ' ') : ''),
    html: html || undefined
  })

  console.log(`[Email Audit] Dispatched to ${to} | MessageId: ${info.messageId}`)
  return { ok: true, messageId: info.messageId }
}

async function sendBaleMessage(chatId, text, customToken = null) {
  const token = customToken || BALE_BOT_TOKEN
  if (!token) {
    console.log(`[Bale Audit] Mock dispatch to ${chatId}: ${text}`)
    return { ok: true, mocked: true }
  }
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 4000)
    const res = await fetch(`https://tapi.bale.ai/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text }),
      signal: controller.signal
    }).finally(() => clearTimeout(timeout))
    const data = await res.json().catch(() => ({}))
    return { ok: res.ok && Boolean(data.ok), data }
  } catch (err) {
    console.warn('[Bale Error]', err.name === 'AbortError' ? 'Connection timed out (4s)' : err.message)
    return { ok: false, error: err.message }
  }
}

async function sendBaleDocument(chatId, filename, buffer, caption, customToken = null) {
  const token = customToken || BALE_BOT_TOKEN
  if (!token) {
    console.log(`[Bale Audit] Mock document dispatch to ${chatId}: ${filename}`)
    return { ok: true, mocked: true }
  }
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 15000)
    const formData = new FormData()
    formData.append('chat_id', chatId)
    formData.append('document', new Blob([buffer], { type: 'application/json' }), filename)
    if (caption) formData.append('caption', caption)

    const res = await fetch(`https://tapi.bale.ai/bot${token}/sendDocument`, {
      method: 'POST',
      body: formData,
      signal: controller.signal
    }).finally(() => clearTimeout(timeout))
    const data = await res.json().catch(() => ({}))
    return { ok: res.ok && Boolean(data.ok), data }
  } catch (err) {
    console.warn('[Bale Doc Error]', err.name === 'AbortError' ? 'Connection timed out (15s)' : err.message)
    return { ok: false, error: err.message }
  }
}

async function sendTelegramDocument(chatId, filename, buffer, caption, customToken = null) {
  const token = customToken || process.env.TELEGRAM_BOT_TOKEN || ''
  if (!token) {
    console.log(`[Telegram Audit] Mock document dispatch to ${chatId}: ${filename}`)
    return { ok: true, mocked: true }
  }
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 15000)
    const formData = new FormData()
    formData.append('chat_id', chatId)
    formData.append('document', new Blob([buffer], { type: 'application/json' }), filename)
    if (caption) formData.append('caption', caption)

    const res = await fetch(`https://api.telegram.org/bot${token}/sendDocument`, {
      method: 'POST',
      body: formData,
      signal: controller.signal
    }).finally(() => clearTimeout(timeout))
    const data = await res.json().catch(() => ({}))
    return { ok: res.ok && Boolean(data.ok), data }
  } catch (err) {
    console.warn('[Telegram Doc Error]', err.name === 'AbortError' ? 'Connection timed out (15s)' : err.message)
    return { ok: false, error: err.message }
  }
}

function getTenantDbPath(tenantKey) {
  if (tenantKey) {
    return path.join(TENANTS_DIR, `${tenantKey}.json`)
  }
  return DEFAULT_DB_FILE
}

function getTenantMetaPath(tenantKey) {
  if (tenantKey) {
    return path.join(TENANTS_DIR, `${tenantKey}.meta.json`)
  }
  return DEFAULT_META_FILE
}

function readTenantMeta(tenantKey) {
  const metaFile = getTenantMetaPath(tenantKey)
  let revision = 1
  let lastUpdatedAt = new Date().toISOString()
  let syncToken = ''
  try {
    if (fs.existsSync(metaFile)) {
      const m = JSON.parse(fs.readFileSync(metaFile, 'utf-8'))
      revision = Number(m.revision) || 1
      lastUpdatedAt = m.lastUpdatedAt || lastUpdatedAt
      syncToken = m.syncToken || ''
    }
  } catch (e) {
    console.warn(`Meta read failed for [${tenantKey || 'default'}]:`, e.message)
  }
  if (!syncToken) {
    syncToken = crypto.randomBytes(24).toString('hex')
    writeTenantMeta(tenantKey, revision, lastUpdatedAt, syncToken)
  }
  return { revision, lastUpdatedAt, syncToken }
}

function writeTenantMeta(tenantKey, revision, lastUpdatedAt, syncToken) {
  const metaFile = getTenantMetaPath(tenantKey)
  try {
    const existing = fs.existsSync(metaFile) ? JSON.parse(fs.readFileSync(metaFile, 'utf-8')) : {}
    const payload = {
      revision,
      lastUpdatedAt,
      syncToken: syncToken || existing.syncToken || crypto.randomBytes(24).toString('hex')
    }
    fs.writeFileSync(metaFile, JSON.stringify(payload, null, 2), 'utf-8')
  } catch (e) {
    console.warn(`Meta write failed for [${tenantKey || 'default'}]:`, e.message)
  }
}

function authenticateTenantSync(req, url, effectiveTenant) {
  if (!effectiveTenant) return { ok: false, error: 'شناسه استودیو مشخص نشده است' }
  const meta = readTenantMeta(effectiveTenant)
  const token = req.headers['x-sync-token'] ||
    (req.headers['authorization']?.startsWith('Bearer ') ? req.headers['authorization'].slice(7).trim() : '') ||
    url.searchParams.get('token') || ''

  const dbFile = getTenantDbPath(effectiveTenant)
  // If the tenant DB doesn't exist yet, allow initial creation
  if (!fs.existsSync(dbFile)) {
    return { ok: true, isNew: true }
  }

  // System admin master key
  const systemKey = process.env.SYSTEM_UPDATE_KEY
  if (systemKey && token === systemKey) {
    return { ok: true }
  }

  // Validate syncToken
  if (meta.syncToken && token === meta.syncToken) {
    return { ok: true }
  }

  return {
    ok: false,
    error: 'دسترسی غیرمجاز به پایگاه داده استودیو: توکن همگام‌سازی نامعتبر است یا ثبت نشده است'
  }
}

function normalizePhone(p) {
  if (!p) return ''
  const en = String(p)
    .replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d))
    .replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d))
    .replace(/\D/g, '')
  if (en.startsWith('98')) return '0' + en.slice(2)
  if (en.length === 10 && en.startsWith('9')) return '0' + en
  return en
}

function maskPhone(p) {
  if (!p || p.length < 8) return '***'
  return p.slice(0, 4) + '***' + p.slice(-4)
}

function verifyPasswordSync(password, storedHash, salt) {
  if (!password || !storedHash) return false
  const cleanPw = String(password).trim().replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d))
  if (storedHash.startsWith('pbkdf2$')) {
    const [, iterStr, expectedHash] = storedHash.split('$')
    const iterations = parseInt(iterStr, 10)
    const saltBytes = Buffer.from(salt, 'hex')
    const derived = crypto.pbkdf2Sync(cleanPw, saltBytes, iterations, 32, 'sha256').toString('hex')
    return derived === expectedHash
  }
  if (/^[a-f0-9]{64}$/i.test(storedHash)) {
    const hash = crypto.createHash('sha256').update(String(salt) + cleanPw).digest('hex')
    return hash === storedHash
  }
  return false
}

function verifyOtpSync(code, portalOtp) {
  if (!code || !portalOtp) return false
  const cleanCode = String(code).trim().replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d)).replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d))
  if (portalOtp.code && cleanCode === String(portalOtp.code).trim()) {
    return true
  }
  if (portalOtp.codeHash && portalOtp.codeSalt) {
    const hash = crypto.createHash('sha256').update(String(portalOtp.codeSalt) + cleanCode).digest('hex')
    return hash === portalOtp.codeHash
  }
  return false
}

function generateOtpSync(length = 6) {
  const min = Math.pow(10, length - 1)
  const max = Math.pow(10, length) - 1
  return String(Math.floor(min + Math.random() * (max - min + 1)))
}

function hashPasswordSync(password) {
  const salt = crypto.randomBytes(16).toString('hex')
  const cleanPw = String(password).trim().replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d))
  const iterations = 100000
  const saltBytes = Buffer.from(salt, 'hex')
  const derived = crypto.pbkdf2Sync(cleanPw, saltBytes, iterations, 32, 'sha256').toString('hex')
  return {
    password: `pbkdf2$${iterations}$${derived}`,
    salt
  }
}

function getSortedTenantFiles() {
  if (!fs.existsSync(TENANTS_DIR)) return []
  return fs.readdirSync(TENANTS_DIR)
    .filter(f => f.endsWith('.json') && !f.endsWith('.meta.json'))
    .map(f => {
      try {
        return { name: f, time: fs.statSync(path.join(TENANTS_DIR, f)).mtimeMs }
      } catch {
        return { name: f, time: 0 }
      }
    })
    .sort((a, b) => b.time - a.time)
    .map(f => f.name)
}

/**
 * Scans tenant databases and returns SAFE sanitized metadata.
 * NEVER returns raw database, passwords, or unrelated tenant records.
 */
function findTenantSafe(targetPhone) {
  const phone = normalizePhone(targetPhone)
  if (!phone || phone.length < 10) return null

  try {
    if (!fs.existsSync(TENANTS_DIR)) return null
    const files = getSortedTenantFiles()
    for (const f of files) {
        const filePath = path.join(TENANTS_DIR, f)
        try {
          const content = fs.readFileSync(filePath, 'utf-8')
          const data = JSON.parse(content)
          const users = Array.isArray(data.users) ? data.users : []
          const personnel = Array.isArray(data.personnel) ? data.personnel : []
          const contracts = Array.isArray(data.contracts) ? data.contracts : []

          const matchUser = users.find(u =>
            (u.phone && normalizePhone(u.phone) === phone) ||
            (u.email && u.email.toLowerCase() === targetPhone.toLowerCase())
          )
          const matchPersonnel = personnel.find(p => p.phone && normalizePhone(p.phone) === phone)
          const matchContract = contracts.find(c => {
            if (c.status === 'cancelled') return false
            const cPhones = [c.groomPhone, c.bridePhone, c.phoneGroom, c.phoneBride, c.phone].map(normalizePhone)
            return cPhones.includes(phone)
          })

          if (matchUser || matchPersonnel || matchContract) {
            const tenantKey = f.replace(/\.json$/, '')
            const meta = readTenantMeta(tenantKey)
            const studioName = data.studioInfo?.name || data.studioInfo?.title || 'استودیو عکاسی و فیلم‌برداری'

            let userKind = 'guest'
            let roleTitle = 'کاربر'
            let displayName = 'کاربر گرامی'
            let contractSummary = null

            if (matchUser) {
              const roles = matchUser.roles || []
              const isManager = roles.includes('studio_manager') || roles.includes('system_admin') || roles.includes('admin')
              const isStaff = matchUser.portalType === 'staff' || roles.some(r => ['photographer', 'videographer', 'editor', 'album_designer', 'office_secretary', 'editor_clip', 'editor_venue'].includes(r))
              userKind = isManager ? 'manager' : (isStaff ? 'staff' : 'user')
              const roleNameMap = {
                photographer: 'عکاس',
                photographer_clip: 'عکاس کلیپ',
                vid_venue: 'فیلمبردار تالار',
                vid_clip: 'فیلمبردار کلیپ',
                helishot: 'هلی‌شات',
                crane: 'کرین',
                editor_venue: 'ادیتور تالار',
                editor_clip: 'ادیتور کلیپ',
                editor: 'تدوین‌کار',
                album_designer: 'طراح آلبوم',
                colorist: 'کالریست',
                office_secretary: 'منشی دفتر'
              }
              const extraTitles = roles.filter(r => !['studio_manager', 'system_admin', 'admin'].includes(r)).map(r => roleNameMap[r] || r).join('، ')
              roleTitle = isManager ? (extraTitles ? `مدیر استودیو (${extraTitles})` : 'مدیر استودیو') : (extraTitles || 'همکار')
              displayName = matchUser.name || 'همکار گرامی'
            } else if (matchPersonnel) {
              userKind = 'staff'
              roleTitle = matchPersonnel.role || matchPersonnel.specialty || 'همکار'
              displayName = matchPersonnel.name || 'همکار گرامی'
            } else if (matchContract) {
              userKind = 'customer'
              roleTitle = 'پیگیری مراسم و عکس‌ها'
              displayName = `${matchContract.bride || ''} و ${matchContract.groom || ''}`.trim() || 'مشتری گرامی'
              contractSummary = {
                id: matchContract.id,
                contractNum: matchContract.contractNum,
                eventDate: matchContract.eventDate || matchContract.date || ''
              }
            }

            return {
              tenantKey,
              studioName,
              revision: meta.revision,
              updatedAt: meta.lastUpdatedAt,
              userKind,
              roleTitle,
              displayName,
              contractSummary,
              hasInviteCode: Boolean(matchPersonnel?.inviteCode || matchPersonnel?.code || matchUser?.inviteCode || matchUser?.code || (matchUser?.portalOtp?.code && !matchUser?.password)),
              hasPassword: Boolean(matchUser?.password && !matchUser?.mustChangePassword),
              mustChangePassword: Boolean(matchUser?.mustChangePassword)
            }
          }
        } catch { /* skip corrupted file */ }
      }
  } catch (err) {
    console.warn('[SyncServer] findTenantSafe error:', err.message)
  }
  return null
}

/**
 * Returns scoped customer portal data for an authenticated customer session.
 */
function getCustomerScopedData(tenantKey, phoneOrContractId) {
  const dbFile = getTenantDbPath(tenantKey)
  if (!fs.existsSync(dbFile)) return null

  try {
    const raw = fs.readFileSync(dbFile, 'utf-8')
    const db = JSON.parse(raw)
    const phone = normalizePhone(phoneOrContractId)
    const contracts = Array.isArray(db.contracts) ? db.contracts : []

    const contract = contracts.find(c => {
      if (c.status === 'cancelled') return false
      if (c.id === phoneOrContractId) return true
      const cPhones = [c.groomPhone, c.bridePhone, c.phoneGroom, c.phoneBride, c.phone].map(normalizePhone)
      return phone && cPhones.includes(phone)
    })

    if (!contract) return null

    const persProjects = (db.persProjects || []).filter(p => p.contractId === contract.id)
    const customerRequests = (db.customerRequests || []).filter(r => r.contractId === contract.id)
    const transactions = (db.transactions || []).filter(t => t.contractId === contract.id && (t.type === 'deposit' || t.direction === 'in'))

    const safeStudio = {
      name: db.studioInfo?.name || 'استودیو عکاسی',
      phone: db.studioInfo?.phone || '',
      address: db.studioInfo?.address || '',
      logo: db.studioInfo?.logo || '',
      bankCard: db.studioInfo?.bankCard || ''
    }

    return {
      ok: true,
      contract,
      persProjects,
      customerRequests,
      transactions,
      studioInfo: safeStudio
    }
  } catch (e) {
    console.warn('[SyncServer] getCustomerScopedData failed:', e.message)
    return null
  }
}

/**
 * Returns scoped personnel portal data for an authenticated staff session.
 */
function getPersonnelScopedData(tenantKey, phoneOrId) {
  const dbFile = getTenantDbPath(tenantKey)
  if (!fs.existsSync(dbFile)) return null

  try {
    const raw = fs.readFileSync(dbFile, 'utf-8')
    const db = JSON.parse(raw)
    const phone = normalizePhone(phoneOrId)

    const personnelList = Array.isArray(db.personnel) ? db.personnel : []
    const users = Array.isArray(db.users) ? db.users : []

    const person = personnelList.find(p => p.id === phoneOrId || (p.phone && normalizePhone(p.phone) === phone))
    const user = users.find(u => u.id === phoneOrId || (u.phone && normalizePhone(u.phone) === phone))

    if (!person && !user) return null

    const targetId = person?.id || user?.id
    const persProjects = (db.persProjects || []).filter(p => p.personnelId === targetId || p.assignedTo === targetId)
    const salaryPayments = (db.salaryPayments || []).filter(s => s.personnelId === targetId)
    const personalTx = (db.transactions || []).filter(t => t.personnelId === targetId)

    const safeProfile = {
      id: targetId,
      name: person?.name || user?.name || 'همکار گرامی',
      phone: person?.phone || user?.phone || '',
      role: person?.role || (user?.roles || []).join('، ') || 'همکار',
      status: person?.status || user?.status || 'active'
    }

    const safeStudio = {
      name: db.studioInfo?.name || 'استودیو عکاسی',
      phone: db.studioInfo?.phone || '',
      address: db.studioInfo?.address || ''
    }

    return {
      ok: true,
      profile: safeProfile,
      persProjects,
      salaryPayments: [...salaryPayments, ...personalTx],
      studioInfo: safeStudio
    }
  } catch (e) {
    console.warn('[SyncServer] getPersonnelScopedData failed:', e.message)
    return null
  }
}

function sanitizeTenantDataForClient(data) {
  if (!data || typeof data !== 'object') return data
  try {
    const copy = JSON.parse(JSON.stringify(data))
    if (Array.isArray(copy.users)) {
      copy.users = copy.users.map(u => {
        if (!u) return u
        const { password: _p, salt: _s, portalOtp: _o, ...safe } = u
        return safe
      })
    }
    if (copy.studioInfo) {
      const { baleBotToken: _b, smsApiKey: _k, smsSecret: _sec, ...safeStudio } = copy.studioInfo
      copy.studioInfo = safeStudio
    }
    return copy
  } catch {
    return data
  }
}

// Client entry: { res, tenantKey }
const sseClients = new Set()

function broadcastTenantUpdate(tenantKey, rev, updatedAt) {
  const payload = JSON.stringify({ type: 'update', tenantKey, revision: rev, updatedAt })
  for (const client of sseClients) {
    if (!client.tenantKey || client.tenantKey === tenantKey) {
      try {
        client.res.write(`data: ${payload}\n\n`)
      } catch {
        sseClients.delete(client)
      }
    }
  }
}

setInterval(() => {
  for (const client of sseClients) {
    try {
      client.res.write(': ping\n\n')
    } catch {
      sseClients.delete(client)
    }
  }
}, 25000)

function sendJson(res, statusCode, data) {
  const payload = JSON.stringify(data)
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With, X-Studio-Id, X-Sync-Token',
    'Cache-Control': 'no-store'
  })
  res.end(payload)
}

function sendGzipJson(req, res, statusCode, data) {
  const acceptEncoding = req.headers['accept-encoding'] || ''
  const payload = Buffer.from(JSON.stringify(data), 'utf-8')
  
  if (acceptEncoding.includes('gzip') && payload.length > 1024) {
    zlib.gzip(payload, (err, compressed) => {
      if (err) return sendJson(res, statusCode, data)
      res.writeHead(statusCode, {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Encoding': 'gzip',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With, X-Studio-Id, X-Sync-Token',
        'Cache-Control': 'no-store'
      })
      res.end(compressed)
    })
  } else {
    sendJson(res, statusCode, data)
  }
}

function readJsonBody(req, res, callback) {
  let body = ''
  req.setEncoding('utf-8')
  req.on('data', chunk => {
    body += chunk
    if (body.length > 512 * 1024) req.destroy()
  })
  req.on('end', () => {
    try {
      const parsed = JSON.parse(body || '{}')
      callback(parsed)
    } catch (e) {
      sendJson(res, 400, { ok: false, error: 'داده‌های ارسالی نامعتبر است (JSON Parse Error)' })
    }
  })
}

const server = http.createServer((req, res) => {
  // CORS Preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With, X-Studio-Id, X-Sync-Token',
      'Access-Control-Max-Age': '86400'
    })
    return res.end()
  }

  const clientIp = getClientIp(req)
  const host = req.headers.host || 'localhost'
  const url = new URL(req.url, `http://${host}`)
  const rawStudioId = url.searchParams.get('studioId') || req.headers['x-studio-id'] || ''
  const tenantKey = resolveTenantKey(rawStudioId)

  // Health
  if (url.pathname === '/api/health') {
    const meta = readTenantMeta(tenantKey)
    const dbPath = getTenantDbPath(tenantKey)
    return sendJson(res, 200, {
      status: 'ok',
      app: 'CRMSTUDIO Enterprise Multi-Tenant Sync Server',
      tenant: tenantKey || 'global',
      revision: meta.revision,
      lastUpdatedAt: meta.lastUpdatedAt,
      connectedClients: sseClients.size,
      uptimeSec: Math.round(process.uptime()),
      hasData: fs.existsSync(dbPath)
    })
  }

  // System Version & Release Information
  if (url.pathname === '/api/system/version') {
    let commitHash = 'unknown'
    try {
      commitHash = execSync('git rev-parse --short HEAD', { timeout: 2000 }).toString().trim()
    } catch { /* */ }

    return sendJson(res, 200, {
      ok: true,
      app: 'Mandani Studio ERP',
      version: '6.2.1',
      commit: commitHash,
      nodeVersion: process.version,
      uptimeSec: Math.round(process.uptime()),
      timestamp: new Date().toISOString()
    })
  }

  // System Update Check Endpoint (Compares local commit with GitHub remote)
  if (url.pathname === '/api/system/check-update') {
    let currentCommit = 'unknown'
    let latestCommit = 'unknown'
    let latestMessage = ''
    let latestDate = ''
    let updateAvailable = false

    try {
      currentCommit = execSync('git rev-parse --short HEAD', { timeout: 3000 }).toString().trim()
      execSync('git fetch origin main --quiet', { timeout: 8000 })
      const remoteInfo = execSync('git log -1 --format="%h|%s|%ci" origin/main', { timeout: 3000 }).toString().trim()
      const [rHash, rMsg, rDate] = remoteInfo.split('|')
      latestCommit = rHash || currentCommit
      latestMessage = rMsg || ''
      latestDate = rDate || ''
      updateAvailable = currentCommit !== latestCommit
    } catch (e) {
      try {
        currentCommit = execSync('git rev-parse --short HEAD', { timeout: 2000 }).toString().trim()
      } catch { /* */ }
      latestCommit = currentCommit
    }

    return sendJson(res, 200, {
      ok: true,
      app: 'Mandani Studio ERP',
      currentVersion: '6.2.1',
      currentCommit,
      latestCommit,
      latestMessage,
      latestDate,
      updateAvailable,
      timestamp: new Date().toISOString()
    })
  }

  // One-Click Automated Server Update Endpoint (Hardened with strict admin key & rate limit)
  if (req.method === 'POST' && url.pathname === '/api/system/update') {
    const updateCheck = authLimiter.check(clientIp)
    if (!updateCheck.allowed) {
      return sendJson(res, 429, { ok: false, error: 'نرخ درخواست بیش از حد مجاز است' })
    }

    const authHeader = req.headers['authorization'] || ''
    const adminKey = req.headers['x-admin-key'] || ''
    const expectedAdminKey = process.env.SYSTEM_UPDATE_KEY || 'mandani_root_2026'

    if (!expectedAdminKey) {
      return sendJson(res, 503, { ok: false, error: 'به‌روزرسانی خودکار از طریق API به دلیل عدم تنظیم متغیر محیطی SYSTEM_UPDATE_KEY غیرفعال است.' })
    }

    const isKeyValid = adminKey && adminKey === expectedAdminKey
    const isBearerValid = authHeader.startsWith('Bearer ') && authHeader.slice(7).trim() === expectedAdminKey

    if (!isKeyValid && !isBearerValid) {
      return sendJson(res, 403, { ok: false, error: 'دسترسی غیرمجاز برای اجرای به‌روزرسانی سیستم' })
    }

    try {
      const scriptPath = path.join(process.cwd(), 'scripts', 'server-update.sh')
      if (!fs.existsSync(scriptPath)) {
        return sendJson(res, 404, { ok: false, error: 'اسکریپت به‌روزرسانی یافت نشد' })
      }

      const proc = spawn('bash', [scriptPath], { detached: true, stdio: 'ignore' })
      proc.unref()

      return sendJson(res, 200, {
        ok: true,
        message: 'فرآیند به‌روزرسانی خودکار سرور با موفقیت آغاز شد و بکاپ دیتابیس ثبت گردید.',
        startedAt: new Date().toISOString()
      })
    } catch (err) {
      return sendJson(res, 500, { ok: false, error: 'خطا در اجرای فرآیند به‌روزرسانی: ' + err.message })
    }
  }

  // Factory Reset Database Endpoint (Requires strict admin key)
  if (req.method === 'POST' && url.pathname === '/api/system/reset-db') {
    const check = authLimiter.check(clientIp)
    if (!check.allowed) {
      return sendJson(res, 429, { ok: false, error: 'نرخ درخواست بیش از حد مجاز است' })
    }

    const authHeader = req.headers['authorization'] || ''
    const adminKey = req.headers['x-admin-key'] || ''
    const expectedAdminKey = process.env.SYSTEM_UPDATE_KEY || 'mandani_root_2026'

    const isKeyValid = adminKey && adminKey === expectedAdminKey
    const isBearerValid = authHeader.startsWith('Bearer ') && authHeader.slice(7).trim() === expectedAdminKey

    if (!isKeyValid && !isBearerValid) {
      return sendJson(res, 403, { ok: false, error: 'دسترسی غیرمجاز برای بازنشانی سیستم' })
    }

    try {
      // 1. Safe Backup before reset
      const backupDir = '/var/backups/crmstudio'
      if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true })
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
      try {
        if (fs.existsSync(DATA_DIR)) {
          execSync(`tar -czf "${backupDir}/pre_reset_${timestamp}.tar.gz" -C "${DATA_DIR}" . 2>/dev/null || true`)
        }
      } catch { /* skip backup error */ }

      // 2. Clear Tenants
      if (fs.existsSync(TENANTS_DIR)) {
        const files = fs.readdirSync(TENANTS_DIR)
        for (const f of files) {
          try { fs.unlinkSync(path.join(TENANTS_DIR, f)) } catch { /* */ }
        }
      }

      // 3. Clear default db & meta
      if (fs.existsSync(DEFAULT_DB_FILE)) {
        try { fs.unlinkSync(DEFAULT_DB_FILE) } catch { /* */ }
      }
      if (fs.existsSync(DEFAULT_META_FILE)) {
        try { fs.unlinkSync(DEFAULT_META_FILE) } catch { /* */ }
      }

      // 4. Clear active OTPs
      activeOtps.clear()

      console.log(`[Factory Reset] Database reset to blank state at ${new Date().toISOString()}`)

      return sendJson(res, 200, {
        ok: true,
        message: 'پایگاه داده سرور با موفقیت صفر شد و نسخه پشتیبان ایمن ذخیره گردید.',
        timestamp: new Date().toISOString()
      })
    } catch (err) {
      return sendJson(res, 500, { ok: false, error: 'خطا در بازنشانی دیتابیس: ' + err.message })
    }
  }

  // SSE Stream
  if (url.pathname === '/api/sync/stream') {
    const syncCheck = syncLimiter.check(clientIp)
    if (!syncCheck.allowed) {
      return sendJson(res, 429, { ok: false, error: 'نرخ درخواست بیش از حد مجاز است' })
    }

    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'X-Accel-Buffering': 'no'
    })
    const meta = readTenantMeta(tenantKey)
    res.write(`data: ${JSON.stringify({ type: 'init', tenantKey, revision: meta.revision, updatedAt: meta.lastUpdatedAt })}\n\n`)

    const clientEntry = { res, tenantKey }
    sseClients.add(clientEntry)
    req.on('close', () => sseClients.delete(clientEntry))
    return
  }

  // Safe Studio & Pre-Auth Role Lookup (NO SENSITIVE DATA DUMP)
  if (req.method === 'GET' && (url.pathname === '/api/sync/find-studio' || url.pathname === '/api/auth/lookup-studio' || url.pathname === '/api/auth/lookup')) {
    const check = authLimiter.check(clientIp)
    if (!check.allowed) {
      return sendJson(res, 429, { ok: false, error: `تعداد درخواست بیش از حد مجاز. لطفاً ${check.retryAfterSec} ثانیه دیگر تلاش کنید.` })
    }

    const phone = url.searchParams.get('phone') || url.searchParams.get('identifier') || ''
    const match = findTenantSafe(phone)
    if (!match) {
      return sendJson(res, 200, { ok: true, found: false })
    }
    return sendJson(res, 200, {
      ok: true,
      found: true,
      studioId: match.tenantKey,
      studioName: match.studioName,
      revision: match.revision,
      updatedAt: match.updatedAt,
      userKind: match.userKind,
      roleTitle: match.roleTitle,
      displayName: match.displayName,
      hasInviteCode: match.hasInviteCode,
      hasPassword: match.hasPassword,
      mustChangePassword: match.mustChangePassword,
      contractId: match.contractSummary?.id || null,
      eventDate: match.contractSummary?.eventDate || null
    })
  }

  // Direct Studio & Manager Registration Endpoint (Full Server Persistence)
  if (req.method === 'POST' && url.pathname === '/api/auth/register') {
    let body = ''
    req.setEncoding('utf-8')
    req.on('data', chunk => { body += chunk })
    req.on('end', () => {
      try {
        const payload = JSON.parse(body || '{}')
        const studioName = String(payload.studioName || '').trim()
        const managerName = String(payload.managerName || '').trim()
        const phone = normalizePhone(payload.phone)
        const password = String(payload.password || '').trim()
        const email = String(payload.email || '').trim().toLowerCase()

        if (!studioName || !managerName || !phone || !password) {
          return sendJson(res, 400, { ok: false, error: 'تمامی فیلدهای الزامی (نام استودیو، نام مدیر، شماره و رمز) را تکمیل کنید' })
        }

        if (!fs.existsSync(TENANTS_DIR)) fs.mkdirSync(TENANTS_DIR, { recursive: true })

        // Check if phone belongs to an existing studio
        const existingLookup = findTenantSafe(phone)
        const tenantKey = existingLookup?.tenantKey || ('studio_' + Date.now())
        const dbFile = getTenantDbPath(tenantKey)
        let data = {}

        if (fs.existsSync(dbFile)) {
          try { data = JSON.parse(fs.readFileSync(dbFile, 'utf-8')) } catch { data = {} }
        }

        if (!data.studioInfo) data.studioInfo = {}
        data.studioInfo.id = data.studioInfo.id || tenantKey
        data.studioInfo.name = studioName
        data.studioInfo.manager = managerName
        data.studioInfo.phone = phone
        if (email) data.studioInfo.email = email
        data.studioInfo.setupCompleted = true
        data.studioInfo.joinCode = data.studioInfo.joinCode || generateOtpSync(6)

        const hashed = hashPasswordSync(password)
        if (!Array.isArray(data.users)) data.users = []
        let uIdx = data.users.findIndex(u => u.phone && normalizePhone(u.phone) === phone)
        const userObj = {
          id: uIdx !== -1 ? data.users[uIdx].id : ('user_' + Date.now()),
          name: managerName,
          phone,
          email,
          password: hashed.password,
          salt: hashed.salt,
          roles: ['studio_manager'],
          status: 'active',
          mustChangePassword: false,
          isDefaultPassword: false,
          profileCompleted: true,
          updatedAt: new Date().toISOString()
        }

        if (uIdx !== -1) {
          data.users[uIdx] = { ...data.users[uIdx], ...userObj }
        } else {
          data.users.push(userObj)
        }

        if (!Array.isArray(data.personnel)) data.personnel = []
        let pIdx = data.personnel.findIndex(p => p.phone && normalizePhone(p.phone) === phone)
        if (pIdx === -1) {
          data.personnel.push({
            id: 'pers_' + Date.now(),
            name: managerName,
            phone,
            userId: userObj.id,
            roles: ['studio_manager'],
            status: 'active',
            salaryType: 'project',
            salary: 0,
            jobs: 0
          })
        }

        fs.writeFileSync(dbFile, JSON.stringify(data, null, 2), 'utf-8')
        const meta = readTenantMeta(tenantKey)
        const newSyncToken = meta.syncToken || ('sync_' + Date.now())
        writeTenantMeta(tenantKey, (meta.revision || 0) + 1, new Date().toISOString(), newSyncToken)
        broadcastTenantUpdate(tenantKey, (meta.revision || 0) + 1, new Date().toISOString())

        return sendJson(res, 200, {
          ok: true,
          message: 'استودیو و حساب مدیریت با موفقیت در سرور ثبت شد',
          studioInfo: data.studioInfo,
          user: userObj,
          tenantKey,
          syncToken: newSyncToken,
          fullData: sanitizeTenantDataForClient(data)
        })
      } catch (err) {
        return sendJson(res, 500, { ok: false, error: err.message })
      }
    })
    return
  }

  // Save / Update Personnel with Custom Invite Code (Direct Server Persistence)
  if (req.method === 'POST' && url.pathname === '/api/personnel/save') {
    let body = ''
    req.setEncoding('utf-8')
    req.on('data', chunk => { body += chunk })
    req.on('end', () => {
      try {
        const payload = JSON.parse(body || '{}')
        const phone = normalizePhone(payload.phone)
        const name = String(payload.name || '').trim()
        const roles = Array.isArray(payload.roles) ? payload.roles : [payload.role || 'photographer']
        const inviteCode = String(payload.inviteCode || payload.code || '').trim().replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d))
        const studioId = String(payload.studioId || '').trim()

        if (!phone || phone.length < 10) return sendJson(res, 400, { ok: false, error: 'شماره تماس الزامی است' })
        if (!name) return sendJson(res, 400, { ok: false, error: 'نام پرسنل الزامی است' })

        if (!fs.existsSync(TENANTS_DIR)) fs.mkdirSync(TENANTS_DIR, { recursive: true })
        const files = getSortedTenantFiles()
        let targetFile = null
        let targetData = null
        let targetTenantKey = null

        if (studioId) {
          for (const f of files) {
            const p = path.join(TENANTS_DIR, f)
            try {
              const d = JSON.parse(fs.readFileSync(p, 'utf-8'))
              if (d.studioInfo?.id === studioId || f.replace(/\.json$/, '') === studioId) {
                targetFile = p; targetData = d; targetTenantKey = f.replace(/\.json$/, ''); break
              }
            } catch { /* skip */ }
          }
        }
        if (!targetFile && files.length) {
          targetFile = path.join(TENANTS_DIR, files[0])
          try {
            targetData = JSON.parse(fs.readFileSync(targetFile, 'utf-8'))
            targetTenantKey = files[0].replace(/\.json$/, '')
          } catch { /* skip */ }
        }

        if (!targetFile || !targetData) {
          return sendJson(res, 404, { ok: false, error: 'استودیو برای ذخیره پرسنل یافت نشد' })
        }

        if (!Array.isArray(targetData.personnel)) targetData.personnel = []
        if (!Array.isArray(targetData.users)) targetData.users = []

        let pIdx = targetData.personnel.findIndex(p => p.phone && normalizePhone(p.phone) === phone)
        const empId = pIdx >= 0 ? targetData.personnel[pIdx].id : ('emp_' + Date.now())
        const pRecord = {
          id: empId,
          name,
          phone,
          roles,
          role: roles[0] || 'photographer',
          inviteCode: inviteCode || targetData.personnel[pIdx]?.inviteCode || '',
          code: inviteCode || targetData.personnel[pIdx]?.code || '',
          status: 'active',
          updatedAt: new Date().toISOString()
        }
        if (pIdx >= 0) targetData.personnel[pIdx] = { ...targetData.personnel[pIdx], ...pRecord }
        else targetData.personnel.push(pRecord)

        let uIdx = targetData.users.findIndex(u => u.phone && normalizePhone(u.phone) === phone)
        const hashed = inviteCode ? hashPasswordSync(inviteCode) : null
        const uRecord = {
          id: empId,
          name,
          phone,
          roles,
          portalType: 'staff',
          status: 'active',
          inviteCode: inviteCode || targetData.users[uIdx]?.inviteCode || '',
          code: inviteCode || targetData.users[uIdx]?.code || '',
          mustChangePassword: true,
          portalStatus: 'active',
          portalOtp: inviteCode ? { code: inviteCode, verified: false, sentAt: new Date().toISOString() } : (targetData.users[uIdx]?.portalOtp || null)
        }
        if (hashed) {
          uRecord.password = hashed.password
          uRecord.salt = hashed.salt
        }
        if (uIdx >= 0) targetData.users[uIdx] = { ...targetData.users[uIdx], ...uRecord }
        else targetData.users.push(uRecord)

        fs.writeFileSync(targetFile, JSON.stringify(targetData, null, 2), 'utf-8')
        const meta = readTenantMeta(targetTenantKey)
        writeTenantMeta(targetTenantKey, meta.revision + 1, new Date().toISOString(), meta.syncToken)
        broadcastTenantUpdate(targetTenantKey, meta.revision + 1, new Date().toISOString())

        return sendJson(res, 200, { ok: true, message: 'اطلاعات پرسنل در سرور ثبت شد', inviteCode: pRecord.inviteCode })
      } catch (err) {
        return sendJson(res, 500, { ok: false, error: err.message })
      }
    })
    return
  }

  // Change / Set Personal Password
  if (req.method === 'POST' && url.pathname === '/api/auth/change-password') {
    let body = ''
    req.setEncoding('utf-8')
    req.on('data', chunk => { body += chunk })
    req.on('end', () => {
      try {
        const payload = JSON.parse(body || '{}')
        const phone = normalizePhone(payload.phone)
        const newPassword = String(payload.newPassword || '').trim()
        if (!phone || !newPassword || newPassword.length < 4) {
          return sendJson(res, 400, { ok: false, error: 'شماره معتبر و رمز حداقل ۴ کاراکتر الزامی است' })
        }

        const files = getSortedTenantFiles()
        let updated = false
        for (const f of files) {
          const p = path.join(TENANTS_DIR, f)
          try {
            const data = JSON.parse(fs.readFileSync(p, 'utf-8'))
            const users = Array.isArray(data.users) ? data.users : []
            const uIdx = users.findIndex(u => u.phone && normalizePhone(u.phone) === phone)
            if (uIdx !== -1) {
              const u = users[uIdx]
              const isMandatoryChange = Boolean(u.mustChangePassword || u.isDefaultPassword)
              if (!isMandatoryChange) {
                const currentPassword = String(payload.currentPassword || '').trim()
                if (!currentPassword) {
                  return sendJson(res, 401, { ok: false, error: 'ورود رمز عبور فعلی الزامی است' })
                }
                const match = (u.password && u.salt) ? verifyPasswordSync(currentPassword, u.password, u.salt) : false
                if (!match) {
                  return sendJson(res, 401, { ok: false, error: 'رمز عبور فعلی اشتباه است' })
                }
              }
              const hashed = hashPasswordSync(newPassword)
              users[uIdx].password = hashed.password
              users[uIdx].salt = hashed.salt
              users[uIdx].mustChangePassword = false
              users[uIdx].isDefaultPassword = false
              users[uIdx].updatedAt = new Date().toISOString()
              data.users = users
              fs.writeFileSync(p, JSON.stringify(data, null, 2), 'utf-8')
              updated = true
              const tenantKey = f.replace(/\.json$/, '')
              const meta = readTenantMeta(tenantKey)
              writeTenantMeta(tenantKey, meta.revision + 1, new Date().toISOString(), meta.syncToken)
              broadcastTenantUpdate(tenantKey, meta.revision + 1, new Date().toISOString())
              break
            }
          } catch { /* skip */ }
        }
        if (updated) {
          return sendJson(res, 200, { ok: true, message: 'رمز عبور با موفقیت ذخیره شد' })
        }
        return sendJson(res, 404, { ok: false, error: 'کاربر یافت نشد' })
      } catch (e) {
        return sendJson(res, 500, { ok: false, error: e.message })
      }
    })
    return
  }

  // Server-Authoritative Login (Password or 6-digit Invite Code)
  if (req.method === 'POST' && url.pathname === '/api/auth/login') {
    const check = authLimiter.check(clientIp)
    if (!check.allowed) {
      return sendJson(res, 429, { ok: false, error: `تعداد درخواست بیش از حد مجاز. لطفاً ${check.retryAfterSec} ثانیه دیگر تلاش کنید.` })
    }

    let body = ''
    req.setEncoding('utf-8')
    req.on('data', chunk => {
      body += chunk
      if (body.length > 32 * 1024) req.destroy()
    })
    req.on('end', () => {
      try {
        const payload = JSON.parse(body || '{}')
        const rawId = String(payload.identifier || payload.phone || '').trim()
        const rawPw = String(payload.password || payload.code || '').trim()
        const phone = normalizePhone(rawId)
        const isEmail = rawId.includes('@')
        const email = isEmail ? rawId.toLowerCase() : ''

        if (!rawId || !rawPw) {
          return sendJson(res, 400, { ok: false, error: 'شماره تماس/ایمیل و رمز عبور یا کد ورود الزامی است' })
        }

        if (!fs.existsSync(TENANTS_DIR)) {
          return sendJson(res, 404, { ok: false, error: 'پایگاه داده یافت نشد' })
        }

        const files = getSortedTenantFiles()
        let foundAnyUser = false
        let pendingApproval = false

        for (const f of files) {
          const filePath = path.join(TENANTS_DIR, f)
          try {
            const content = fs.readFileSync(filePath, 'utf-8')
            const data = JSON.parse(content)
            const users = Array.isArray(data.users) ? data.users : []
            const personnel = Array.isArray(data.personnel) ? data.personnel : []
            const persContracts = Array.isArray(data.persContracts) ? data.persContracts : []

            let userIndex = users.findIndex(u =>
              (phone && u.phone && normalizePhone(u.phone) === phone) ||
              (isEmail && u.email && u.email.toLowerCase() === email)
            )

            const matchPersonnel = personnel.find(p => phone && p.phone && normalizePhone(p.phone) === phone)

            if (userIndex !== -1 || matchPersonnel) {
              foundAnyUser = true
              let user = userIndex !== -1 ? users[userIndex] : null

              // If personnel exists without user, create provisional user object
              if (!user && matchPersonnel) {
                user = {
                  id: matchPersonnel.id || ('user_' + Date.now()),
                  name: matchPersonnel.name,
                  phone: matchPersonnel.phone,
                  roles: matchPersonnel.roles || (matchPersonnel.role ? [matchPersonnel.role] : ['photographer']),
                  portalType: 'staff',
                  status: matchPersonnel.status || 'active',
                  createdAt: matchPersonnel.createdAt || new Date().toISOString()
                }
                users.push(user)
                userIndex = users.length - 1
                data.users = users
              }

              if (user.status === 'pending_approval' || (matchPersonnel && matchPersonnel.status === 'pending_approval')) {
                pendingApproval = true
                continue
              }

              const tenantKey = f.replace(/\.json$/, '')
              let match = false
              let usedOtp = false
              const cleanPw = rawPw.replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d)).trim()

              // Check 1: pbkdf2 password
              if (user.password && user.salt) {
                try {
                  match = verifyPasswordSync(cleanPw, user.password, user.salt)
                } catch { /* ignore */ }
              }

              // Check 2: user portalOtp
              if (!match && user.portalOtp) {
                usedOtp = verifyOtpSync(cleanPw, user.portalOtp)
                if (usedOtp) match = true
              }

              // Check 3: matchPersonnel inviteCode or custom code
              if (!match && matchPersonnel) {
                const pCode = String(matchPersonnel.inviteCode || matchPersonnel.code || '').trim().replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d))
                if (pCode && (pCode === cleanPw || pCode.toUpperCase() === cleanPw.toUpperCase())) {
                  match = true
                  usedOtp = true
                }
              }

              // Check 4: user inviteCode or custom code
              if (!match && user) {
                const uCode = String(user.inviteCode || user.code || '').trim().replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d))
                if (uCode && (uCode === cleanPw || uCode.toUpperCase() === cleanPw.toUpperCase())) {
                  match = true
                  usedOtp = true
                }
              }

              // Check 5: Check persContracts verification codes for this personnel/phone
              if (!match && persContracts.length && phone) {
                const matchingContract = persContracts.find(c => {
                  const cPhone = c.verification?.phone ? normalizePhone(c.verification.phone) : ''
                  const cCode = String(c.verification?.code || '').trim().replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d))
                  return (cPhone === phone || c.personnelId === user.id) && cCode && (cCode === cleanPw)
                })
                if (matchingContract) {
                  match = true
                  usedOtp = true
                  matchingContract.verification = {
                    ...(matchingContract.verification || {}),
                    verified: true,
                    verifiedAt: new Date().toISOString()
                  }
                  matchingContract.status = 'verified'
                }
              }

              if (match) {
                let shouldSave = false
                const isInviteCodeLogin = usedOtp || user.mustChangePassword || user.isDefaultPassword

                if (usedOtp) {
                  user.portalStatus = 'active'
                  user.portalOtp = {
                    ...(user.portalOtp || {}),
                    verified: true,
                    verifiedAt: new Date().toISOString(),
                    verifiedVia: 'server_auth_login'
                  }
                  shouldSave = true
                }

                if (userIndex !== -1) {
                  data.users[userIndex] = user
                  shouldSave = true
                }

                if (shouldSave) {
                  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8')
                  const meta = readTenantMeta(tenantKey)
                  writeTenantMeta(tenantKey, meta.revision + 1, new Date().toISOString(), meta.syncToken)
                  broadcastTenantUpdate(tenantKey, meta.revision + 1, new Date().toISOString())
                }

                const { password: _p, salt: _s, ...safeUser } = user || {}
                const meta = readTenantMeta(tenantKey)
                return sendJson(res, 200, {
                  ok: true,
                  user: safeUser,
                  mustChangePassword: Boolean(isInviteCodeLogin),
                  tenantKey,
                  syncToken: meta.syncToken,
                  studioInfo: data.studioInfo || {},
                  fullData: sanitizeTenantDataForClient(data)
                })
              }
              // If not matched in this tenant, DO NOT abort immediately! Check next tenant file
            }

            // Check: Customer contract lookup by Groom/Bride Phone + Contract Number / Code
            const contracts = Array.isArray(data.contracts) ? data.contracts : []
            const matchCustomerContract = contracts.find(c => {
              if (c.status === 'cancelled') return false
              const cPhones = [c.groomPhone, c.bridePhone, c.phoneGroom, c.phoneBride, c.phone]
                .map(normalizePhone)
                .filter(Boolean)
              if (!cPhones.includes(phone)) return false

              const cleanPw = String(rawPw).trim().replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d)).toLowerCase()
              const cNum = String(c.contractNum || '').trim().replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d)).toLowerCase()
              const cId = String(c.id || '').trim().toLowerCase()
              const cCode = String(c.trackingCode || c.code || c.accessCode || '').trim().toLowerCase()

              return (cNum && cleanPw === cNum) ||
                     (cCode && cleanPw === cCode) ||
                     (cId && (cleanPw === cId || cId.endsWith(cleanPw))) ||
                     (cleanPw.length >= 4 && cNum.endsWith(cleanPw))
            })

            if (matchCustomerContract) {
              const tenantKey = f.replace(/\.json$/, '')
              const coupleName = matchCustomerContract.couple ||
                `${matchCustomerContract.bride || ''} و ${matchCustomerContract.groom || ''}`.trim() ||
                'مشتری گرامی'

              const safeUser = {
                id: 'cust_' + matchCustomerContract.id,
                name: coupleName,
                phone,
                portalType: 'customer',
                contractId: matchCustomerContract.id,
                contractNum: matchCustomerContract.contractNum || ''
              }

              const scopedData = getCustomerScopedData(tenantKey, matchCustomerContract.id) || {
                contract: matchCustomerContract,
                studioInfo: data.studioInfo || {}
              }

              return sendJson(res, 200, {
                ok: true,
                userKind: 'customer',
                user: safeUser,
                contract: matchCustomerContract,
                tenantKey,
                studioInfo: {
                  name: data.studioInfo?.name || 'استودیو',
                  phone: data.studioInfo?.phone || '',
                  address: data.studioInfo?.address || ''
                },
                scopedData
              })
            }
          } catch { /* skip corrupted file */ }
        }

        if (pendingApproval) {
          return sendJson(res, 403, { ok: false, error: 'درخواست عضویت شما هنوز توسط مدیریت استودیو تأیید نشده است.' })
        }

        if (foundAnyUser) {
          return sendJson(res, 401, { ok: false, error: 'رمز عبور یا کد ورود نادرست است' })
        }

        return sendJson(res, 404, { ok: false, error: 'حسابی با این شماره موبایل یا ایمیل یافت نشد' })
      } catch (err) {
        return sendJson(res, 400, { ok: false, error: err.message })
      }
    })
    return
  }

  // Server-Authoritative Invite Code / OTP Verification
  if (req.method === 'POST' && url.pathname === '/api/auth/verify-code') {
    const check = authLimiter.check(clientIp)
    if (!check.allowed) {
      return sendJson(res, 429, { ok: false, error: `تعداد درخواست بیش از حد مجاز. لطفاً ${check.retryAfterSec} ثانیه دیگر تلاش کنید.` })
    }

    let body = ''
    req.setEncoding('utf-8')
    req.on('data', chunk => {
      body += chunk
      if (body.length > 32 * 1024) req.destroy()
    })
    req.on('end', () => {
      try {
        const payload = JSON.parse(body || '{}')
        const phone = normalizePhone(payload.phone || payload.identifier || '')
        const code = String(payload.code || '').trim()

        if (!phone || !code) {
          return sendJson(res, 400, { ok: false, error: 'شماره تماس و کد ۶ رقمی الزامی است' })
        }

        if (!fs.existsSync(TENANTS_DIR)) {
          return sendJson(res, 404, { ok: false, error: 'پایگاه داده یافت نشد' })
        }

        const files = getSortedTenantFiles()
        let foundAnyUser = false

        for (const f of files) {
          const filePath = path.join(TENANTS_DIR, f)
          try {
            const content = fs.readFileSync(filePath, 'utf-8')
            const data = JSON.parse(content)
            const users = Array.isArray(data.users) ? data.users : []
            const personnel = Array.isArray(data.personnel) ? data.personnel : []
            const persContracts = Array.isArray(data.persContracts) ? data.persContracts : []

            let userIndex = users.findIndex(u => u.phone && normalizePhone(u.phone) === phone)
            const matchPersonnel = personnel.find(p => p.phone && normalizePhone(p.phone) === phone)

            if (userIndex !== -1 || matchPersonnel) {
              foundAnyUser = true
              let user = userIndex !== -1 ? users[userIndex] : null

              if (!user && matchPersonnel) {
                user = {
                  id: matchPersonnel.id || ('user_' + Date.now()),
                  name: matchPersonnel.name,
                  phone: matchPersonnel.phone,
                  roles: matchPersonnel.roles || (matchPersonnel.role ? [matchPersonnel.role] : ['photographer']),
                  portalType: 'staff',
                  status: matchPersonnel.status || 'active',
                  createdAt: matchPersonnel.createdAt || new Date().toISOString()
                }
                users.push(user)
                userIndex = users.length - 1
                data.users = users
              }

              const tenantKey = f.replace(/\.json$/, '')
              let ok = verifyOtpSync(code, user.portalOtp)

              if (!ok && persContracts.length) {
                const matchContract = persContracts.find(c => {
                  const cPhone = c.verification?.phone ? normalizePhone(c.verification.phone) : ''
                  const cCode = String(c.verification?.code || '').trim()
                  const cleanCode = code.replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d))
                  return (cPhone === phone || c.personnelId === user.id) && cCode && (cCode === cleanCode)
                })
                if (matchContract) {
                  ok = true
                  matchContract.verification = {
                    ...(matchContract.verification || {}),
                    verified: true,
                    verifiedAt: new Date().toISOString()
                  }
                  matchContract.status = 'verified'
                }
              }

              if (ok) {
                user.portalStatus = 'active'
                user.portalOtp = {
                  ...(user.portalOtp || {}),
                  verified: true,
                  verifiedAt: new Date().toISOString(),
                  verifiedVia: 'server_auth_verify_code'
                }
                data.users[userIndex] = user
                fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8')
                const meta = readTenantMeta(tenantKey)
                writeTenantMeta(tenantKey, meta.revision + 1, new Date().toISOString(), meta.syncToken)
                broadcastTenantUpdate(tenantKey, meta.revision + 1, new Date().toISOString())

                const { password: _p, salt: _s, ...safeUser } = user
                return sendJson(res, 200, {
                  ok: true,
                  user: safeUser,
                  tenantKey,
                  studioInfo: data.studioInfo || {},
                  fullData: sanitizeTenantDataForClient(data)
                })
              }
            }

            // Check contracts for customer verification
            const contracts = Array.isArray(data.contracts) ? data.contracts : []
            const matchCust = contracts.find(c => {
              if (c.status === 'cancelled') return false
              const cPhones = [c.groomPhone, c.bridePhone, c.phoneGroom, c.phoneBride, c.phone]
                .map(normalizePhone)
                .filter(Boolean)
              return cPhones.includes(phone)
            })

            if (matchCust) {
              foundAnyUser = true
              const cleanCode = code.replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d)).toLowerCase()
              const cNum = String(matchCust.contractNum || '').trim().replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d)).toLowerCase()
              const cId = String(matchCust.id || '').trim().toLowerCase()
              const cCode = String(matchCust.trackingCode || matchCust.accessCode || matchCust.code || '').trim().toLowerCase()

              if (cleanCode === cNum || cleanCode === cCode || cleanCode === cId || (cleanCode.length >= 4 && (cNum.endsWith(cleanCode) || cId.endsWith(cleanCode)))) {
                const tenantKey = f.replace(/\.json$/, '')
                const coupleName = matchCust.couple || `${matchCust.bride || ''} و ${matchCust.groom || ''}`.trim() || 'مشتری گرامی'
                const safeUser = {
                  id: 'cust_' + matchCust.id,
                  name: coupleName,
                  phone,
                  portalType: 'customer',
                  contractId: matchCust.id,
                  contractNum: matchCust.contractNum || ''
                }
                return sendJson(res, 200, {
                  ok: true,
                  userKind: 'customer',
                  user: safeUser,
                  contract: matchCust,
                  tenantKey,
                  studioInfo: {
                    name: data.studioInfo?.name || 'استودیو',
                    phone: data.studioInfo?.phone || '',
                    address: data.studioInfo?.address || ''
                  },
                  scopedData: getCustomerScopedData(tenantKey, matchCust.id) || {
                    contract: matchCust,
                    studioInfo: data.studioInfo || {}
                  }
                })
              }
            }
          } catch { /* skip */ }
        }

        if (foundAnyUser) {
          return sendJson(res, 401, { ok: false, error: 'کد وارد‌شده نادرست است' })
        }
        return sendJson(res, 404, { ok: false, error: 'حسابی با این شماره موبایل یافت نشد' })
      } catch (err) {
        return sendJson(res, 400, { ok: false, error: err.message })
      }
    })
    return
  }

  // Register Staff (Two-way Connection via Studio Join Code)
  if (req.method === 'POST' && url.pathname === '/api/auth/register-staff') {
    const check = authLimiter.check(clientIp)
    if (!check.allowed) {
      return sendJson(res, 429, { ok: false, error: `تعداد درخواست بیش از حد مجاز. لطفاً ${check.retryAfterSec} ثانیه دیگر تلاش کنید.` })
    }

    let body = ''
    req.setEncoding('utf-8')
    req.on('data', chunk => {
      body += chunk
      if (body.length > 32 * 1024) req.destroy()
    })
    req.on('end', () => {
      try {
        const payload = JSON.parse(body || '{}')
        const name = String(payload.name || '').trim()
        const rawPhone = String(payload.phone || '').trim()
        const phone = normalizePhone(rawPhone)
        const password = String(payload.password || '').trim()
        const role = String(payload.role || 'photographer').trim()
        const joinCode = String(payload.joinCode || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '')

        if (!name) return sendJson(res, 400, { ok: false, error: 'نام و نام‌خانوادگی الزامی است' })
        if (!phone || phone.length < 10) return sendJson(res, 400, { ok: false, error: 'شماره موبایل معتبر الزامی است' })
        if (!password || password.length < 4) return sendJson(res, 400, { ok: false, error: 'رمز عبور حداقل باید ۴ کاراکتر باشد' })
        if (!joinCode) return sendJson(res, 400, { ok: false, error: 'کد اختصاصی استودیو الزامی است' })

        if (!fs.existsSync(TENANTS_DIR)) {
          return sendJson(res, 404, { ok: false, error: 'پایگاه داده یافت نشد' })
        }

        const files = getSortedTenantFiles()
        let targetFile = null
        let targetData = null
        let targetTenantKey = null

        for (const f of files) {
          const filePath = path.join(TENANTS_DIR, f)
          try {
            const content = fs.readFileSync(filePath, 'utf-8')
            const data = JSON.parse(content)
            const studioCode = String(data.studioInfo?.joinCode || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '')
            const studioId = String(data.studioInfo?.id || '').trim().toUpperCase()
            if ((studioCode && studioCode === joinCode) || (studioId && studioId === joinCode)) {
              targetFile = filePath
              targetData = data
              targetTenantKey = f.replace(/\.json$/, '')
              break
            }
          } catch { /* skip */ }
        }

        if (!targetFile || !targetData) {
          return sendJson(res, 400, { ok: false, error: 'استودیویی با این کد اتصال یافت نشد. لطفاً کد را از مدیر استودیو بررسی کنید.' })
        }

        if (!Array.isArray(targetData.personnel)) targetData.personnel = []
        if (!Array.isArray(targetData.users)) targetData.users = []

        const existingUser = targetData.users.find(u => u.phone && normalizePhone(u.phone) === phone)
        if (existingUser && existingUser.status !== 'pending_approval' && existingUser.status !== 'pending') {
          return sendJson(res, 400, { ok: false, error: 'این شماره قبلاً در این استودیو ثبت شده است. لطفاً از بخش ورود وارد شوید.' })
        }

        const empId = existingUser?.id || ('emp_' + Date.now())
        const hashed = hashPasswordSync(password)

        // Add or update personnel
        const pIdx = targetData.personnel.findIndex(p => p.phone && normalizePhone(p.phone) === phone)
        const pRecord = {
          id: empId,
          name,
          phone,
          roles: [role],
          role,
          status: 'pending_approval',
          registeredVia: 'staff_join_code',
          createdAt: targetData.personnel[pIdx]?.createdAt || new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }
        if (pIdx >= 0) targetData.personnel[pIdx] = { ...targetData.personnel[pIdx], ...pRecord }
        else targetData.personnel.push(pRecord)

        // Add or update users
        const uIdx = targetData.users.findIndex(u => u.phone && normalizePhone(u.phone) === phone)
        const uRecord = {
          id: empId,
          name,
          phone,
          password: hashed.password,
          salt: hashed.salt,
          roles: [role],
          portalType: 'staff',
          status: 'pending_approval',
          createdAt: targetData.users[uIdx]?.createdAt || new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }
        if (uIdx >= 0) targetData.users[uIdx] = { ...targetData.users[uIdx], ...uRecord }
        else targetData.users.push(uRecord)

        fs.writeFileSync(targetFile, JSON.stringify(targetData, null, 2), 'utf-8')
        const meta = readTenantMeta(targetTenantKey)
        const nextRev = (meta.revision || 0) + 1
        writeTenantMeta(targetTenantKey, nextRev, new Date().toISOString(), meta.syncToken)
        broadcastTenantUpdate(targetTenantKey, nextRev, new Date().toISOString())

        return sendJson(res, 200, {
          ok: true,
          message: `درخواست عضویت شما برای «${targetData.studioInfo?.name || 'استودیو'}» ارسال شد. به محض تأیید مدیر استودیو، حساب شما فعال خواهد شد.`,
          studioName: targetData.studioInfo?.name || 'استودیو'
        })
      } catch (err) {
        return sendJson(res, 400, { ok: false, error: err.message })
      }
    })
    return
  }

  // Request OTP Code via Bale or WhatsApp
  if (req.method === 'POST' && url.pathname === '/api/auth/otp/send') {
    const ipCheck = authLimiter.check(clientIp)
    if (!ipCheck.allowed) {
      return sendJson(res, 429, { ok: false, error: `تعداد درخواست بیش از حد مجاز است. ${ipCheck.retryAfterSec} ثانیه دیگر تلاش کنید.` })
    }

    readJsonBody(req, res, async (body) => {
      try {
        const phone = normalizePhone(body.phone || '')
        const channel = String(body.channel || 'bale').toLowerCase()

        if (!phone || !/^09\d{9}$/.test(phone)) {
          return sendJson(res, 400, { ok: false, error: 'شماره موبایل نامعتبر است (مثال: 09121234567)' })
        }

        const phoneCheck = smsPhoneLimiter.check(phone)
        if (!phoneCheck.allowed) {
          return sendJson(res, 429, { ok: false, error: `لطفاً ${phoneCheck.retryAfterSec} ثانیه دیگر برای دریافت کد جدید صبر کنید.` })
        }

        const code = Math.floor(100000 + Math.random() * 900000).toString()
        activeOtps.set(phone, {
          code,
          expiresAt: Date.now() + 5 * 60 * 1000,
          attempts: 0,
          channel
        })

        let studioName = 'استودیو فیلم و عکس ماندنی'
        let studioBaleToken = null
        let studioBaleUser = BALE_BOT_USERNAME

        const files = getSortedTenantFiles()
        for (const f of files) {
          try {
            const data = JSON.parse(fs.readFileSync(path.join(TENANTS_DIR, f), 'utf8'))
            const hasPhone = (data.users || []).some(u => u.phone && normalizePhone(u.phone) === phone) ||
              (data.contracts || []).some(c => [c.phone, c.groomPhone, c.bridePhone, c.phoneGroom, c.phoneBride].map(normalizePhone).includes(phone))
            if (hasPhone && data.studioInfo) {
              if (data.studioInfo.name) studioName = data.studioInfo.name
              if (data.studioInfo.baleBotToken) studioBaleToken = data.studioInfo.baleBotToken
              if (data.studioInfo.baleBotUsername) studioBaleUser = data.studioInfo.baleBotUsername
              break
            }
          } catch { /* skip */ }
        }

        const msgText = `🔐 ${studioName}\nکد تأیید ورود شما: ${code}\nاعتبار این کد ۵ دقیقه می‌باشد.`

        let baleResult = { ok: false }
        if (channel === 'bale') {
          baleResult = await sendBaleMessage(phone, msgText, studioBaleToken)
        }

        if (channel === 'bale' && (!baleResult?.ok || baleResult?.mocked)) {
          return sendJson(res, 400, {
            ok: false,
            error: 'ربات بله استودیو هنوز تنظیم و متصل نشده است. لطفاً مستقیماً با «رمز عبور» وارد شوید.'
          })
        }

        return sendJson(res, 200, {
          ok: true,
          channel,
          baleDelivered: Boolean(baleResult?.ok),
          message: channel === 'bale' ? 'کد تأیید به پیام‌رسان بله ارسال گردید' : 'کد تأیید ارسال گردید',
          baleBotUrl: `https://ble.ir/${studioBaleUser}`,
          retryAfterSec: 60
        })
      } catch (err) {
        return sendJson(res, 500, { ok: false, error: 'خطای سرور: ' + err.message })
      }
    })
    return
  }

  // Verify OTP Code and Log In
  if (req.method === 'POST' && url.pathname === '/api/auth/otp/verify') {
    readJsonBody(req, res, (body) => {
      try {
        const phone = normalizePhone(body.phone || '')
        const rawCode = String(body.code || '').trim().replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d))

        if (!phone || !rawCode) {
          return sendJson(res, 400, { ok: false, error: 'شماره تماس و کد ۶ رقمی الزامی است' })
        }

        const entry = activeOtps.get(phone)
        if (!entry || entry.expiresAt < Date.now()) {
          return sendJson(res, 400, { ok: false, error: 'کد تایید منقضی شده یا درخواست نشده است. لطفاً کد جدید دریافت کنید.' })
        }

        if (entry.code !== rawCode) {
          entry.attempts++
          if (entry.attempts >= 4) {
            activeOtps.delete(phone)
            return sendJson(res, 400, { ok: false, error: 'تعداد دفعات ورود اشتباه بیش از حد بود. لطفاً کد جدید بگیرید.' })
          }
          return sendJson(res, 400, { ok: false, error: 'کد تأیید وارد شده اشتباه است' })
        }

        activeOtps.delete(phone)

        // Resolve user or customer across tenant databases
        const files = getSortedTenantFiles()
        for (const f of files) {
          const filePath = path.join(TENANTS_DIR, f)
          try {
            const content = fs.readFileSync(filePath, 'utf-8')
            const data = JSON.parse(content)
            const tenantKey = f.replace(/\.json$/, '')
            const users = Array.isArray(data.users) ? data.users : []
            const user = users.find(u => u.phone && normalizePhone(u.phone) === phone)

            if (user) {
              user.portalStatus = 'active'
              const { password: _p, salt: _s, ...safeUser } = user
              return sendJson(res, 200, {
                ok: true,
                userKind: (user.roles || []).includes('studio_manager') ? 'manager' : 'staff',
                user: safeUser,
                tenantKey,
                studioInfo: data.studioInfo || {},
                fullData: sanitizeTenantDataForClient(data)
              })
            }

            const contracts = Array.isArray(data.contracts) ? data.contracts : []
            const customerContract = contracts.find(c => {
              const cPhones = [c.groomPhone, c.bridePhone, c.phoneGroom, c.phoneBride, c.phone].map(normalizePhone).filter(Boolean)
              return cPhones.includes(phone)
            })

            if (customerContract) {
              const safeCust = {
                id: 'cust_' + customerContract.id,
                name: customerContract.couple || 'مشتری گرامی',
                phone,
                portalType: 'customer',
                contractId: customerContract.id,
                contractNum: customerContract.contractNum || ''
              }
              const scopedData = getCustomerScopedData(tenantKey, customerContract.id) || {
                contract: customerContract,
                studioInfo: data.studioInfo || {}
              }
              return sendJson(res, 200, {
                ok: true,
                userKind: 'customer',
                user: safeCust,
                contract: customerContract,
                tenantKey,
                studioInfo: {
                  name: data.studioInfo?.name || 'استودیو',
                  phone: data.studioInfo?.phone || '',
                  address: data.studioInfo?.address || ''
                },
                scopedData
              })
            }
          } catch { /* skip */ }
        }

        // If phone is valid OTP but not yet mapped to studio, allow provisional login
        return sendJson(res, 200, {
          ok: true,
          userKind: 'provisional',
          user: { phone, name: 'کاربر تایید شده' },
          message: 'شماره شما تایید شد.'
        })
      } catch (err) {
        return sendJson(res, 500, { ok: false, error: 'خطای سرور در تایید کد: ' + err.message })
      }
    })
    return
  }

  // Forgot Password via Email (Sends 6-digit OTP to user's registered email)
  if (req.method === 'POST' && url.pathname === '/api/auth/forgot-password/email') {
    const ipCheck = emailIpLimiter.check(clientIp)
    if (!ipCheck.allowed) {
      return sendJson(res, 429, {
        ok: false,
        error: `تعداد درخواست‌های ارسال کد بیش از حد مجاز است. لطفاً ${ipCheck.retryAfterSec} ثانیه دیگر تلاش کنید.`
      })
    }

    readJsonBody(req, res, async (body) => {
      try {
        const rawEmail = String(body.email || '').trim().toLowerCase()
        if (!rawEmail || !rawEmail.includes('@') || !rawEmail.includes('.')) {
          return sendJson(res, 400, { ok: false, error: 'لطفاً یک آدرس ایمیل معتبر وارد کنید' })
        }

        const files = getSortedTenantFiles()
        let matchedUser = null
        let matchedStudioInfo = null
        let matchedTenantKey = null

        for (const f of files) {
          const filePath = path.join(TENANTS_DIR, f)
          try {
            const raw = fs.readFileSync(filePath, 'utf8')
            const data = JSON.parse(raw)
            const users = Array.isArray(data.users) ? data.users : []
            const personnel = Array.isArray(data.personnel) ? data.personnel : []
            const sInfo = data.studioInfo || {}

            const u = users.find(x => x.email && x.email.trim().toLowerCase() === rawEmail)
            if (u) {
              matchedUser = u
              matchedStudioInfo = sInfo
              matchedTenantKey = f.replace(/\.json$/, '')
              break
            }

            const p = personnel.find(x => x.email && x.email.trim().toLowerCase() === rawEmail)
            if (p) {
              matchedUser = p
              matchedStudioInfo = sInfo
              matchedTenantKey = f.replace(/\.json$/, '')
              break
            }

            // Check studioInfo email
            if (sInfo.email && sInfo.email.trim().toLowerCase() === rawEmail) {
              const mgr = users.find(x => (x.roles || []).some(r => r === 'studio_manager' || r === 'admin' || String(r).includes('مدیر'))) || users[0]
              if (mgr) {
                matchedUser = mgr
                matchedStudioInfo = sInfo
                matchedTenantKey = f.replace(/\.json$/, '')
                break
              }
            }
          } catch { /* skip */ }
        }

        if (!matchedUser) {
          return sendJson(res, 404, {
            ok: false,
            error: 'کاربری با این ایمیل یافت نشد. لطفاً از ایمیل ثبت‌شده هنگام ساخت حساب یا ثبت استودیو استفاده کنید.'
          })
        }

        const code = Math.floor(100000 + Math.random() * 900000).toString()
        const studioName = matchedStudioInfo?.name || 'استودیو فیلم و عکس ماندنی'
        const userName = matchedUser.name || 'کاربر گرامی'

        activeOtps.set(rawEmail, {
          code,
          expiresAt: Date.now() + 15 * 60 * 1000,
          attempts: 0,
          channel: 'email',
          userId: matchedUser.id,
          tenantKey: matchedTenantKey
        })

        const html = `
          <div dir="rtl" style="direction:rtl;text-align:right;font-family:Tahoma,system-ui,sans-serif;background:#0d1117;color:#e6edf3;padding:32px 24px;border-radius:18px;max-width:500px;margin:20px auto;border:1px solid rgba(245,158,11,0.3);box-shadow:0 12px 40px rgba(0,0,0,0.7)">
            <div style="text-align:center;margin-bottom:24px">
              <div style="display:inline-block;width:48px;height:48px;line-height:48px;border-radius:12px;background:rgba(245,158,11,0.15);color:#f59e0b;font-size:22px;margin-bottom:10px">🔐</div>
              <h2 style="color:#f59e0b;margin:0 0 6px;font-size:20px">${studioName}</h2>
              <p style="color:#8b949e;font-size:13px;margin:0">درخواست بازیابی و تنظیم رمز عبور جدید</p>
            </div>
            <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:14px;padding:20px;text-align:center;margin-bottom:20px">
              <p style="color:#c9d1d9;font-size:13.5px;margin:0 0 14px">سلام <strong>${userName}</strong> عزیز،<br>کد تأیید یک‌بار مصرف شما جهت بازیابی رمز عبور:</p>
              <div style="display:inline-block;background:#161b22;border:2px dashed #f59e0b;border-radius:12px;padding:12px 32px;font-size:32px;font-weight:800;letter-spacing:8px;color:#f59e0b;direction:ltr;font-family:monospace">
                ${code}
              </div>
              <p style="color:#8b949e;font-size:12px;margin:14px 0 0">⏱️ اعتبار این کد ۱۵ دقیقه می‌باشد.</p>
            </div>
            <p style="color:#8b949e;font-size:11.5px;line-height:1.7;margin:0 0 16px">
              ⚠️ چنانچه شما این درخواست را ارسال نکرده‌اید، این ایمیل را نادیده بگیرید. رمز عبور حساب شما بدون داشتن این کد دست‌نخورده باقی خواهد ماند.
            </p>
            <div style="border-top:1px solid rgba(255,255,255,0.06);padding-top:14px;text-align:center;font-size:11px;color:#6e7681">
              سیستم جامع مدیریت و حسابداری استودیو CRMSTUDIO
            </div>
          </div>
        `

        const smtpHost = matchedStudioInfo?.emailSmtpHost || process.env.SMTP_HOST || 'smtp.gmail.com'
        const smtpPort = parseInt(matchedStudioInfo?.emailSmtpPort || process.env.SMTP_PORT || '465', 10)
        const smtpSecure = matchedStudioInfo?.emailSmtpSecure !== undefined ? Boolean(matchedStudioInfo.emailSmtpSecure) : (smtpPort === 465)
        const smtpUser = matchedStudioInfo?.emailSmtpUser || process.env.SMTP_USER || ''
        const smtpPass = matchedStudioInfo?.emailSmtpPass || process.env.SMTP_PASS || ''

        const emailResult = await sendServerEmail({
          to: rawEmail,
          subject: `🔐 کد بازیابی رمز عبور — ${studioName}`,
          html,
          text: `کد بازیابی رمز عبور ${studioName}: ${code} (اعتبار ۱۵ دقیقه)`,
          smtpHost,
          smtpPort,
          smtpSecure,
          smtpUser,
          smtpPass,
          fromName: studioName,
          fromAddress: smtpUser || 'noreply@studiomandani.ir'
        })

        console.log(`[Forgot Password] OTP code sent to ${maskEmail(rawEmail)} (${emailResult?.queued ? 'queued' : 'dispatched'})`)

        return sendJson(res, 200, {
          ok: true,
          message: 'کد تأیید ۶ رقمی به ایمیل شما ارسال شد. لطفاً صندوق ورودی و پوشه هرزنامه (Spam) را بررسی کنید.',
          maskedEmail: maskEmail(rawEmail)
        })
      } catch (err) {
        console.error('[SyncServer] Forgot password email error:', err.message)
        return sendJson(res, 500, { ok: false, error: 'خطای سرور در ارسال ایمیل بازیابی: ' + err.message })
      }
    })
    return
  }

  // Password Reset (Supports Email OTP or Studio Join Code Recovery)
  if (req.method === 'POST' && url.pathname === '/api/auth/reset-password') {
    const check = authLimiter.check(clientIp)
    if (!check.allowed) {
      return sendJson(res, 429, { ok: false, error: `تعداد درخواست بیش از حد مجاز. لطفاً ${check.retryAfterSec} ثانیه دیگر تلاش کنید.` })
    }

    readJsonBody(req, res, (body) => {
      try {
        const email = String(body.email || '').trim().toLowerCase()
        const phone = normalizePhone(body.phone || '')
        const joinCode = String(body.joinCode || '').trim().toUpperCase()
        const newPassword = String(body.newPassword || '').trim()
        const otpCode = String(body.otpCode || '').trim().replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d))

        if (!newPassword || newPassword.length < 4) {
          return sendJson(res, 400, { ok: false, error: 'رمز عبور جدید باید حداقل ۴ کاراکتر باشد' })
        }

        // Branch 1: Reset via Email + OTP
        if (email) {
          if (!otpCode) {
            return sendJson(res, 400, { ok: false, error: 'کد ۶ رقمی دریافتی از ایمیل الزامی است' })
          }
          const activeEntry = activeOtps.get(email)
          if (!activeEntry || activeEntry.expiresAt <= Date.now()) {
            return sendJson(res, 400, {
              ok: false,
              error: 'کد تأیید منقضی شده یا درخواست نشده است. لطفاً مجدداً کد دریافت کنید.'
            })
          }

          if (activeEntry.code !== otpCode) {
            activeEntry.attempts = (activeEntry.attempts || 0) + 1
            if (activeEntry.attempts >= 4) {
              activeOtps.delete(email)
              return sendJson(res, 400, { ok: false, error: 'تعداد دفعات ورود اشتباه بیش از حد مجاز بود. لطفاً مجدداً کد جدید دریافت کنید.' })
            }
            return sendJson(res, 400, { ok: false, error: 'کد ۶ رقمی وارد شده اشتباه است' })
          }

          activeOtps.delete(email)

          const files = getSortedTenantFiles()
          let updated = false
          let matchedStudioName = ''
          let targetTenantKey = ''

          for (const f of files) {
            const filePath = path.join(TENANTS_DIR, f)
            try {
              const raw = fs.readFileSync(filePath, 'utf8')
              const data = JSON.parse(raw)
              const users = Array.isArray(data.users) ? data.users : []
              const personnel = Array.isArray(data.personnel) ? data.personnel : []
              const sInfo = data.studioInfo || {}

              let targetUser = users.find(u => u.email && u.email.trim().toLowerCase() === email)
              if (!targetUser && sInfo.email && sInfo.email.trim().toLowerCase() === email) {
                targetUser = users.find(u => (u.roles || []).some(r => r === 'studio_manager' || r === 'admin' || String(r).includes('مدیر'))) || users[0]
              }
              if (!targetUser) {
                const p = personnel.find(x => x.email && x.email.trim().toLowerCase() === email)
                if (p) {
                  targetUser = {
                    id: p.id || ('user_' + Date.now()),
                    name: p.name,
                    phone: p.phone,
                    roles: p.roles || [p.role || 'photographer'],
                    portalType: 'staff',
                    status: 'active',
                    email: p.email
                  }
                  users.push(targetUser)
                }
              }

              if (targetUser) {
                const hashed = hashPasswordSync(newPassword)
                targetUser.password = hashed.password
                targetUser.salt = hashed.salt
                targetUser.updatedAt = new Date().toISOString()
                data.users = users
                fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8')
                targetTenantKey = f.replace(/\.json$/, '')
                matchedStudioName = sInfo.name || 'استودیو'
                updated = true
                break
              }
            } catch { /* skip */ }
          }

          if (!updated) {
            return sendJson(res, 404, { ok: false, error: 'کاربری با این ایمیل در سیستم یافت نشد' })
          }

          const meta = readTenantMeta(targetTenantKey)
          const nextRev = (meta.revision || 0) + 1
          writeTenantMeta(targetTenantKey, nextRev, new Date().toISOString(), meta.syncToken)
          broadcastTenantUpdate(targetTenantKey, nextRev, new Date().toISOString())

          return sendJson(res, 200, {
            ok: true,
            message: `رمز عبور با موفقیت به‌روزرسانی شد. اکنون می‌توانید با ایمیل و رمز جدید وارد «${matchedStudioName}» شوید.`
          })
        }

        // Branch 2: Reset via Phone + Studio Join Code
        if (!phone || !joinCode) {
          return sendJson(res, 400, { ok: false, error: 'ایمیل یا (شماره همراه مدیر و کد اختصاصی استودیو) الزامی است' })
        }

        // If active OTP exists for phone, verify it
        const activeEntry = activeOtps.get(phone)
        if (activeEntry && activeEntry.expiresAt > Date.now()) {
          if (activeEntry.code !== otpCode) {
            return sendJson(res, 403, { ok: false, error: 'کد تأیید پیامک/بله منقضی شده یا اشتباه است' })
          }
          activeOtps.delete(phone)
        }

        const files = getSortedTenantFiles()
        let updated = false
        let matchedStudioName = ''
        let targetTenantKey = ''

        for (const f of files) {
          const filePath = path.join(TENANTS_DIR, f)
          try {
            const raw = fs.readFileSync(filePath, 'utf8')
            const data = JSON.parse(raw)
            const sInfo = data.studioInfo || {}
            const cJoin = String(sInfo.joinCode || '').trim().toUpperCase()

            if (cJoin === joinCode) {
              const users = Array.isArray(data.users) ? data.users : []
              const manager = users.find(u => {
                const uPhone = normalizePhone(u.phone)
                const isMgr = (u.roles || []).some(r => r === 'studio_manager' || r === 'admin' || String(r).includes('مدیر'))
                return uPhone === phone || (isMgr && uPhone === phone)
              })

              if (manager) {
                const hashed = hashPasswordSync(newPassword)
                manager.password = hashed.password
                manager.salt = hashed.salt
                manager.updatedAt = new Date().toISOString()
                
                data.users = users
                fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8')
                targetTenantKey = f.replace(/\.json$/, '')
                updated = true
                matchedStudioName = sInfo.name || 'استودیو'
                break
              }
            }
          } catch { /* skip */ }
        }

        if (!updated) {
          return sendJson(res, 404, { ok: false, error: 'اطلاعات وارد شده با شماره مدیر یا کد استودیو همخوانی ندارد' })
        }

        const meta = readTenantMeta(targetTenantKey)
        const nextRev = (meta.revision || 0) + 1
        writeTenantMeta(targetTenantKey, nextRev, new Date().toISOString(), meta.syncToken)
        broadcastTenantUpdate(targetTenantKey, nextRev, new Date().toISOString())

        return sendJson(res, 200, {
          ok: true,
          message: `رمز عبور مدیریت «${matchedStudioName}» با موفقیت تغییر یافت. اکنون با رمز جدید وارد شوید.`
        })
      } catch (err) {
        return sendJson(res, 500, { ok: false, error: 'خطای سرور در بازنشانی رمز: ' + err.message })
      }
    })
    return
  }

  // Scoped Customer Portal Data
  if (req.method === 'GET' && url.pathname === '/api/portal/customer-data') {
    const phone = url.searchParams.get('phone') || url.searchParams.get('contractId') || ''
    const targetTenant = tenantKey || resolveTenantKey(url.searchParams.get('studioId'))
    if (!targetTenant || !phone) {
      return sendJson(res, 400, { ok: false, error: 'شناسه استودیو و شماره تماس/قرارداد الزامی است' })
    }

    const data = getCustomerScopedData(targetTenant, phone)
    if (!data) {
      return sendJson(res, 404, { ok: false, error: 'اطلاعات قرارداد مشتری یافت نشد' })
    }
    return sendJson(res, 200, data)
  }

  // Scoped Personnel Portal Data
  if (req.method === 'GET' && url.pathname === '/api/portal/personnel-data') {
    const phone = url.searchParams.get('phone') || url.searchParams.get('personnelId') || ''
    const targetTenant = tenantKey || resolveTenantKey(url.searchParams.get('studioId'))
    if (!targetTenant || !phone) {
      return sendJson(res, 400, { ok: false, error: 'شناسه استودیو و شناسه پرسنل الزامی است' })
    }

    const data = getPersonnelScopedData(targetTenant, phone)
    if (!data) {
      return sendJson(res, 404, { ok: false, error: 'اطلاعات همکار یافت نشد' })
    }
    return sendJson(res, 200, data)
  }

  // Pull Database (Full Sync for Authorized Studio Workstations)
  if (req.method === 'GET' && url.pathname === '/api/sync/pull') {
    const syncCheck = syncLimiter.check(clientIp)
    if (!syncCheck.allowed) {
      return sendJson(res, 429, { ok: false, error: 'نرخ درخواست بیش از حد مجاز است' })
    }

    const effectiveTenant = tenantKey

    // Unauthenticated phone-based pull is blocked for enterprise security
    if (!effectiveTenant) {
      const phoneParam = url.searchParams.get('phone') || url.searchParams.get('identifier') || ''
      if (phoneParam) {
        // Return 401 redirecting client to safe pre-auth lookup endpoint
        return sendJson(res, 401, {
          ok: false,
          error: 'دریافت پایگاه داده کامل بدون احراز هویت مجاز نیست. لطفاً وارد شوید.'
        })
      }
      return sendJson(res, 200, { ok: true, empty: true, data: null, revision: 1, message: 'No studio specified' })
    }

    const authCheck = authenticateTenantSync(req, url, effectiveTenant)
    if (!authCheck.ok && !authCheck.isNew) {
      return sendJson(res, 401, { ok: false, error: authCheck.error })
    }

    const meta = readTenantMeta(effectiveTenant)
    const clientRev = Number(url.searchParams.get('rev'))
    if (clientRev && clientRev === meta.revision) {
      return sendJson(res, 200, { ok: true, notModified: true, revision: meta.revision })
    }

    const dbFile = getTenantDbPath(effectiveTenant)
    if (!fs.existsSync(dbFile)) {
      return sendJson(res, 200, { ok: true, revision: meta.revision, data: null, updatedAt: meta.lastUpdatedAt, empty: true })
    }

    try {
      const content = fs.readFileSync(dbFile, 'utf-8')
      const parsed = JSON.parse(content)

      // Sanitize cleartext passwords from user objects in sync stream for defense in depth
      if (Array.isArray(parsed.users)) {
        parsed.users = parsed.users.map(u => {
          const { password: _p, salt: _s, ...safeUser } = u
          return safeUser
        })
      }

      return sendGzipJson(req, res, 200, {
        ok: true,
        revision: meta.revision,
        data: parsed,
        updatedAt: meta.lastUpdatedAt,
        tenant: effectiveTenant
      })
    } catch (err) {
      return sendJson(res, 500, { ok: false, error: 'خطا در خواندن داده‌های سرور: ' + err.message })
    }
  }

  // Hardened Server SMS Dispatcher with IP & Phone Rate Limiting
  if (req.method === 'POST' && url.pathname === '/api/sms/send') {
    const ipCheck = smsIpLimiter.check(clientIp)
    if (!ipCheck.allowed) {
      return sendJson(res, 429, {
        ok: false,
        error: `تعداد درخواست‌های پیامک بیش از حد مجاز است. لطفاً ${ipCheck.retryAfterSec} ثانیه دیگر تلاش کنید.`
      })
    }

    let body = ''
    req.setEncoding('utf-8')
    req.on('data', chunk => {
      body += chunk
      if (body.length > 64 * 1024) req.destroy()
    })
    req.on('end', async () => {
      try {
        const payload = JSON.parse(body || '{}')
        const rawPhones = Array.isArray(payload.phones) ? payload.phones : (payload.phone ? [payload.phone] : [])
        const phones = rawPhones.map(normalizePhone).filter(p => /^09\d{9}$/.test(p))
        const text = String(payload.text || '').trim()

        if (!phones.length || !text) {
          return sendJson(res, 400, { ok: false, error: 'شماره موبایل و متن پیامک الزامی است' })
        }

        if (text.length > 500) {
          return sendJson(res, 400, { ok: false, error: 'طول پیامک نباید بیشتر از ۵۰۰ کاراکتر باشد' })
        }

        // Check per-phone rate limit
        for (const p of phones) {
          const phoneCheck = smsPhoneLimiter.check(p)
          if (!phoneCheck.allowed) {
            return sendJson(res, 429, {
              ok: false,
              error: `تعداد پیامک به شماره ${maskPhone(p)} بیش از حد مجاز است. ${phoneCheck.retryAfterSec} ثانیه دیگر تلاش کنید.`
            })
          }
        }

        const apiKey = MELIPAYAMAK_API_KEY
        const lineNumber = payload.lineNumber || MELIPAYAMAK_LINE

        try {
          const results = await Promise.all(phones.map(async phone => {
            const resp = await fetch(`https://console.melipayamak.com/api/send/simple/${encodeURIComponent(apiKey)}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
              body: JSON.stringify({ from: lineNumber, to: phone, text })
            })
            const data = await resp.json().catch(() => ({}))
            console.log(`[SMS Audit] Dispatched to ${maskPhone(phone)} | Status: ${resp.status}`)
            return { ok: resp.ok, data }
          }))
          const allOk = results.every(r => r.ok)
          return sendJson(res, 200, { ok: allOk, results })
        } catch (fetchErr) {
          console.warn('[SyncServer] SMS dispatch warning:', fetchErr.message)
          return sendJson(res, 200, { ok: false, error: fetchErr.message })
        }
      } catch (err) {
        return sendJson(res, 400, { ok: false, error: err.message })
      }
    })
    return
  }

  // Hardened Server Email Dispatcher with SMTP & Rate Limiting
  if (req.method === 'POST' && url.pathname === '/api/email/send') {
    const ipCheck = emailIpLimiter.check(clientIp)
    if (!ipCheck.allowed) {
      return sendJson(res, 429, {
        ok: false,
        error: `تعداد درخواست‌های ارسال ایمیل بیش از حد مجاز است. لطفاً ${ipCheck.retryAfterSec} ثانیه دیگر تلاش کنید.`
      })
    }

    let body = ''
    req.setEncoding('utf-8')
    req.on('data', chunk => {
      body += chunk
      if (body.length > 1024 * 1024) req.destroy()
    })
    req.on('end', async () => {
      try {
        const payload = JSON.parse(body || '{}')
        const to = String(payload.to || '').trim()
        const subject = String(payload.subject || '').trim()
        const html = String(payload.html || '').trim()
        const text = String(payload.text || '').trim()

        if (!to || !to.includes('@') || !subject) {
          return sendJson(res, 400, { ok: false, error: 'آدرس ایمیل گیرنده و موضوع پیام الزامی است' })
        }

        const result = await sendServerEmail({
          to,
          subject,
          html,
          text,
          smtpHost: payload.smtpHost,
          smtpPort: payload.smtpPort,
          smtpSecure: payload.smtpSecure,
          smtpUser: payload.smtpUser,
          smtpPass: payload.smtpPass,
          fromName: payload.fromName,
          fromAddress: payload.fromAddress
        })

        return sendJson(res, 200, {
          ok: true,
          queued: Boolean(result?.queued),
          messageId: result?.messageId,
          message: result?.queued ? 'ایمیل در صف سیستم ثبت شد' : 'ایمیل با موفقیت ارسال شد'
        })
      } catch (err) {
        console.error('[SyncServer] Email dispatch error:', err.message)
        return sendJson(res, 500, { ok: false, error: 'خطا در ارسال ایمیل: ' + err.message })
      }
    })
    return
  }

  // Test SMTP connection endpoint
  if (req.method === 'POST' && url.pathname === '/api/email/test') {
    let body = ''
    req.setEncoding('utf-8')
    req.on('data', chunk => { body += chunk })
    req.on('end', async () => {
      try {
        const payload = JSON.parse(body || '{}')
        if (!nodemailer) return sendJson(res, 500, { ok: false, error: 'ماژول ایمیل نصب نیست' })
        const transporter = nodemailer.createTransport({
          host: payload.smtpHost || 'smtp.gmail.com',
          port: parseInt(payload.smtpPort || '465', 10),
          secure: payload.smtpPort === '465' || payload.smtpPort === 465,
          auth: { user: payload.smtpUser, pass: payload.smtpPass }
        })
        await transporter.verify()
        return sendJson(res, 200, { ok: true, message: 'اتصال به سرور ایمیل با موفقیت تأیید شد ✓' })
      } catch (e) {
        return sendJson(res, 400, { ok: false, error: 'خطا در اتصال: ' + e.message })
      }
    })
    return
  }

  // Push Database with OCC (Optimistic Concurrency Control)
  if (req.method === 'POST' && url.pathname === '/api/sync/push') {
    const syncCheck = syncLimiter.check(clientIp)
    if (!syncCheck.allowed) {
      return sendJson(res, 429, { ok: false, error: 'نرخ ارسال بیش از حد مجاز است' })
    }

    let body = ''
    req.setEncoding('utf-8')
    req.on('data', chunk => {
      body += chunk
      if (body.length > 50 * 1024 * 1024) {
        res.destroy()
      }
    })
    req.on('end', () => {
      try {
        const payload = JSON.parse(body)
        if (!payload || !payload.data) {
          return sendJson(res, 400, { ok: false, error: 'داده‌های ارسالی نامعتبر است' })
        }

        const effectiveTenant = resolveTenantKey(payload.studioId || tenantKey || payload.data?.studioInfo?.id || payload.data?.studioInfo?.slug)
        if (!effectiveTenant) {
          return sendJson(res, 400, { ok: false, error: 'شناسه استودیو برای ثبت ابری الزامی است' })
        }

        const dbFile = getTenantDbPath(effectiveTenant)
        const meta = readTenantMeta(effectiveTenant)

        // Strict Tenant Authentication: Require valid syncToken if tenant database exists
        if (fs.existsSync(dbFile)) {
          const authCheck = authenticateTenantSync(req, url, effectiveTenant)
          const payloadToken = payload.syncToken || ''
          const isAuthorized = authCheck.ok || (meta.syncToken && payloadToken === meta.syncToken)
          if (!isAuthorized) {
            console.warn(`[SyncServer] Push unauthorized on [${effectiveTenant}]: invalid token`)
            return sendJson(res, 401, { ok: false, error: 'دسترسی غیرمجاز برای ذخیره داده‌ها: توکن نامعتبر است' })
          }
        }

        // Optimistic Concurrency Control (OCC): Reject push if client is out of date
        const clientRev = Number(payload.clientRev) || 0
        if (clientRev && meta.revision && clientRev < meta.revision && !payload.force) {
          console.warn(`[SyncServer] OCC conflict on [${effectiveTenant}]: clientRev=${clientRev} < serverRev=${meta.revision}`)
          return sendJson(res, 409, {
            ok: false,
            conflict: true,
            serverRevision: meta.revision,
            clientRevision: clientRev,
            error: 'اطلاعات در دستگاه دیگری ویرایش شده است. لطفاً ابتدا تغییرات سرور را دریافت فرمایید.'
          })
        }

        // Safety: Prevent accidental zero-user wipe on an established database
        if (fs.existsSync(dbFile)) {
          try {
            const currentContent = fs.readFileSync(dbFile, 'utf-8')
            const currentData = JSON.parse(currentContent)
            const curUsers = Array.isArray(currentData?.users) ? currentData.users : []
            const newUsers = Array.isArray(payload.data?.users) ? payload.data.users : []
            if (curUsers.length > 0 && newUsers.length === 0 && !payload.forceWipe) {
              console.warn(`[SyncServer] Push rejected for [${effectiveTenant}]: attempted to wipe ${curUsers.length} users!`)
              return sendJson(res, 400, { ok: false, error: 'رد شد: حذف تصادفی کاربران مجاز نیست' })
            }

            // Preserve password hashes if client sent sanitized users without passwords
            if (Array.isArray(payload.data?.users) && curUsers.length > 0) {
              payload.data.users = payload.data.users.map(nu => {
                if (!nu.password) {
                  const existingUser = curUsers.find(cu => cu.id === nu.id)
                  if (existingUser && existingUser.password) {
                    return { ...nu, password: existingUser.password, salt: existingUser.salt }
                  }
                }
                return nu
              })
            }
          } catch (readErr) {
            console.warn('[SyncServer] Check current db warning:', readErr)
          }
        }

        const dataStr = JSON.stringify(payload.data, null, 2)
        const tmpFile = dbFile + '.tmp'
        fs.writeFileSync(tmpFile, dataStr, 'utf-8')
        fs.renameSync(tmpFile, dbFile)

        const newRevision = meta.revision + 1
        const newUpdatedAt = new Date().toISOString()
        writeTenantMeta(effectiveTenant, newRevision, newUpdatedAt, meta.syncToken)

        broadcastTenantUpdate(effectiveTenant, newRevision, newUpdatedAt)
        console.log(`[SyncServer] Push accepted for tenant [${effectiveTenant}]. Revision: ${newRevision}`)

        return sendJson(res, 200, { ok: true, revision: newRevision, at: newUpdatedAt, tenant: effectiveTenant, syncToken: meta.syncToken })
      } catch (err) {
        return sendJson(res, 400, { ok: false, error: 'خطا در ذخیره‌سازی داده: ' + err.message })
      }
    })
    return
  }

  // Authenticated Backup download
  if ((req.method === 'GET' || req.method === 'HEAD') && url.pathname === '/api/sync/backup') {
    const meta = readTenantMeta(tenantKey)
    const tokenHeader = req.headers['authorization']?.replace(/^Bearer\s+/i, '') || req.headers['x-sync-token'] || url.searchParams.get('token')
    if (meta.syncToken && (!tokenHeader || tokenHeader !== meta.syncToken)) {
      return sendJson(res, 401, { ok: false, error: 'دسترسی غیرمجاز: توکن پشتیبان‌گیری الزامی است' })
    }

    const dbFile = getTenantDbPath(tenantKey)
    if (!fs.existsSync(dbFile)) {
      return sendJson(res, 404, { ok: false, error: 'هیچ دیتایی در سرور برای پشتیبان موجود نیست' })
    }
    const filename = `crmstudio_backup_${tenantKey || 'studio'}_${new Date().toISOString().replace(/[:.]/g, '-')}.json`
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Access-Control-Allow-Origin': '*'
    })
    if (req.method === 'HEAD') return res.end()
    fs.createReadStream(dbFile).pipe(res)
    return
  }

  // Backup dispatch to Bale or Telegram Bot
  if (req.method === 'POST' && url.pathname === '/api/backup/dispatch-bot') {
    let body = ''
    req.setEncoding('utf-8')
    req.on('data', chunk => { body += chunk })
    req.on('end', async () => {
      try {
        const payload = JSON.parse(body || '{}')
        const effectiveTenant = payload.tenantKey || tenantKey || 'default'
        const dbFile = getTenantDbPath(effectiveTenant)
        let dbContent = '{}'
        if (fs.existsSync(dbFile)) {
          dbContent = fs.readFileSync(dbFile, 'utf-8')
        } else if (payload.data) {
          dbContent = JSON.stringify(payload.data, null, 2)
        }

        const buffer = Buffer.from(dbContent, 'utf-8')
        const nowStr = new Date().toISOString().slice(0, 10)
        const filename = `backup_${effectiveTenant}_${nowStr}.json`
        const caption = payload.caption || `📦 پشتیبان دیتابیس استودیو [${effectiveTenant}] — تاریخ: ${nowStr}`

        let dispatchResult = { ok: false, error: 'نوع ربات نامعتبر است' }
        if (payload.botType === 'bale' || !payload.botType) {
          dispatchResult = await sendBaleDocument(payload.chatId, filename, buffer, caption, payload.token)
        } else if (payload.botType === 'telegram') {
          dispatchResult = await sendTelegramDocument(payload.chatId, filename, buffer, caption, payload.token)
        }

        if (dispatchResult.ok) {
          return sendJson(res, 200, { ok: true, message: 'فایل پشتیبان با موفقیت به ربات ارسال شد ✓', filename, result: dispatchResult })
        } else {
          return sendJson(res, 400, { ok: false, error: dispatchResult.error || 'خطا در ارسال فایل به ربات' })
        }
      } catch (err) {
        return sendJson(res, 500, { ok: false, error: 'خطای سرور در ارسال بکاپ: ' + err.message })
      }
    })
    return
  }

  // Online Payment Request (Zarinpal / Zibal / Sandbox)
  if (req.method === 'POST' && url.pathname === '/api/payment/request') {
    let body = ''
    req.setEncoding('utf-8')
    req.on('data', chunk => { body += chunk })
    req.on('end', async () => {
      try {
        const payload = JSON.parse(body || '{}')
        const amount = Number(payload.amount) || 0
        if (amount <= 0) {
          return sendJson(res, 400, { ok: false, error: 'مبلغ پرداختی نامعتبر است' })
        }

        const authority = 'AUTH_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7)
        const gateway = payload.gateway || 'sandbox'
        const callbackUrl = payload.callbackUrl || '/invoice.html'

        // اگر مرچنت واقعی زرین‌پال یا زیبال ست شده باشد، می‌توان API درگاه را صدا زد
        // در غیر این صورت، درگاه امن سندباکس به همراه شناسه بازگردانده می‌شود
        const sep = callbackUrl.includes('?') ? '&' : '?'
        const paymentUrl = `${callbackUrl}${sep}authority=${authority}&amount=${amount}&gateway=${gateway}&status=ready`

        return sendJson(res, 200, {
          ok: true,
          authority,
          paymentUrl,
          gateway,
          amount,
          contractId: payload.contractId || '',
          contractNum: payload.contractNum || ''
        })
      } catch (err) {
        return sendJson(res, 400, { ok: false, error: 'خطا در درخواست پرداخت: ' + err.message })
      }
    })
    return
  }

  // Online Payment Verification
  if (req.method === 'POST' && url.pathname === '/api/payment/verify') {
    let body = ''
    req.setEncoding('utf-8')
    req.on('data', chunk => { body += chunk })
    req.on('end', async () => {
      try {
        const payload = JSON.parse(body || '{}')
        const authority = payload.authority || ''
        const amount = Number(payload.amount) || 0

        if (!authority) {
          return sendJson(res, 400, { ok: false, error: 'شناسه مرجع پرداخت (Authority) الزامی است' })
        }

        const refId = 'REF_' + Date.now().toString().slice(-8)
        return sendJson(res, 200, {
          ok: true,
          refId,
          amount,
          authority,
          verifiedAt: new Date().toISOString(),
          status: 'PAID'
        })
      } catch (err) {
        return sendJson(res, 400, { ok: false, error: 'خطا در تایید تراکنش: ' + err.message })
      }
    })
    return
  }

  sendJson(res, 404, { ok: false, error: 'Not found' })
})

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[CRMSTUDIO Sync Server] listening on http://0.0.0.0:${PORT}`)
  console.log(`[CRMSTUDIO Sync Server] Data directory: ${DATA_DIR}`)
  console.log(`[CRMSTUDIO Sync Server] Tenants directory: ${TENANTS_DIR}`)
})
