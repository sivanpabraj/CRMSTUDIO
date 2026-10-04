import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
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
const MELIPAYAMAK_API_KEY = process.env.MELIPAYAMAK_API_KEY || '09e58c2abb4a49188d3a1f5c4a53390f'
const MELIPAYAMAK_LINE = process.env.MELIPAYAMAK_LINE || '50004001004893'

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

async function sendBaleMessage(chatId, text) {
  if (!BALE_BOT_TOKEN) {
    console.log(`[Bale Audit] Mock dispatch to ${chatId}: ${text}`)
    return { ok: true, mocked: true }
  }
  try {
    const res = await fetch(`https://tapi.bale.ai/bot${BALE_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text })
    })
    const data = await res.json().catch(() => ({}))
    return { ok: res.ok && data.ok, data }
  } catch (err) {
    console.warn('[Bale Error]', err.message)
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
              const isStaff = matchUser.portalType === 'staff' || roles.some(r => ['photographer', 'videographer', 'editor', 'album_designer', 'office_secretary'].includes(r))
              userKind = isManager ? 'manager' : (isStaff ? 'staff' : 'user')
              roleTitle = isManager ? 'مدیر استودیو' : (roles.join('، ') || 'همکار')
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
              contractSummary
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
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With, X-Studio-Id, X-Sync-Token',
    'Cache-Control': 'no-store'
  })
  res.end(JSON.stringify(data))
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
      version: '2.1.0',
      commit: commitHash,
      nodeVersion: process.version,
      uptimeSec: Math.round(process.uptime()),
      timestamp: new Date().toISOString()
    })
  }

  // One-Click Automated Server Update Endpoint
  if (req.method === 'POST' && url.pathname === '/api/system/update') {
    const authHeader = req.headers['authorization'] || ''
    const adminKey = req.headers['x-admin-key'] || url.searchParams.get('key') || ''

    if (adminKey !== 'mandani_root_2026' && !authHeader.includes('Bearer')) {
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
      contractId: match.contractSummary?.id || null,
      eventDate: match.contractSummary?.eventDate || null
    })
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

              // Check 1: pbkdf2 password
              if (user.password && user.salt) {
                try {
                  match = verifyPasswordSync(rawPw, user.password, user.salt)
                } catch { /* ignore */ }
              }

              // Check 2: user portalOtp
              if (!match && user.portalOtp) {
                usedOtp = verifyOtpSync(rawPw, user.portalOtp)
                if (usedOtp) match = true
              }

              // Check 3: Check persContracts verification codes for this personnel/phone
              if (!match && persContracts.length && phone) {
                const matchingContract = persContracts.find(c => {
                  const cPhone = c.verification?.phone ? normalizePhone(c.verification.phone) : ''
                  const cCode = String(c.verification?.code || '').trim()
                  const cleanPw = rawPw.replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d))
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

                const { password: _p, salt: _s, ...safeUser } = user
                return sendJson(res, 200, {
                  ok: true,
                  user: safeUser,
                  tenantKey,
                  studioInfo: data.studioInfo || {},
                  fullData: data
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

              return sendJson(res, 200, {
                ok: true,
                userKind: 'customer',
                user: safeUser,
                contract: matchCustomerContract,
                tenantKey,
                studioInfo: data.studioInfo || {},
                fullData: data
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
                  fullData: data
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
                  studioInfo: data.studioInfo || {},
                  fullData: data
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

        const msgText = `🔐 استودیو فیلم و عکس ماندنی\nکد تأیید ورود شما: ${code}\nاعتبار این کد ۵ دقیقه می‌باشد.`

        if (channel === 'bale') {
          await sendBaleMessage(phone, msgText)
        }

        console.log(`[OTP Audit] Code generated for ${maskPhone(phone)} via ${channel} -> ${code}`)

        return sendJson(res, 200, {
          ok: true,
          channel,
          message: channel === 'bale' ? 'کد تأیید به پیام‌رسان بله ارسال گردید' : 'کد تأیید آماده ارسال در واتساپ است',
          baleBotUrl: `https://ble.ir/${BALE_BOT_USERNAME}?start=${code}`,
          whatsAppUrl: `https://api.whatsapp.com/send?phone=98${phone.slice(1)}&text=${encodeURIComponent(msgText)}`,
          retryAfterSec: 60,
          demoCode: code
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
                fullData: data
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
              return sendJson(res, 200, {
                ok: true,
                userKind: 'customer',
                user: safeCust,
                contract: customerContract,
                tenantKey,
                studioInfo: data.studioInfo || {},
                fullData: data
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

  // Manager Password Reset via Studio Join Code (Zero-SMS Reliable Recovery)
  if (req.method === 'POST' && url.pathname === '/api/auth/reset-password') {
    const check = authLimiter.check(clientIp)
    if (!check.allowed) {
      return sendJson(res, 429, { ok: false, error: `تعداد درخواست بیش از حد مجاز. لطفاً ${check.retryAfterSec} ثانیه دیگر تلاش کنید.` })
    }

    readJsonBody(req, res, (body) => {
      try {
        const phone = normalizePhone(body.phone || '')
        const joinCode = String(body.joinCode || '').trim().toUpperCase()
        const newPassword = String(body.newPassword || '').trim()

        if (!phone || !joinCode || !newPassword) {
          return sendJson(res, 400, { ok: false, error: 'شماره همراه مدیر، کد اختصاصی استودیو و رمز جدید الزامی هستند' })
        }
        if (newPassword.length < 4) {
          return sendJson(res, 400, { ok: false, error: 'رمز عبور جدید باید حداقل ۴ کاراکتر باشد' })
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

      return sendJson(res, 200, {
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
        const text = String(payload.text || '').trim() || html.replace(/<[^>]+>/g, ' ')

        if (!to || !to.includes('@') || !subject) {
          return sendJson(res, 400, { ok: false, error: 'آدرس ایمیل گیرنده و موضوع پیام الزامی است' })
        }

        const smtpHost = payload.smtpHost || process.env.SMTP_HOST || 'smtp.gmail.com'
        const smtpPort = parseInt(payload.smtpPort || process.env.SMTP_PORT || '465', 10)
        const smtpSecure = payload.smtpSecure !== undefined ? Boolean(payload.smtpSecure) : (smtpPort === 465)
        const smtpUser = payload.smtpUser || process.env.SMTP_USER || ''
        const smtpPass = payload.smtpPass || process.env.SMTP_PASS || ''
        const fromName = payload.fromName || 'استودیو فیلم و عکس ماندنی'
        const fromAddress = payload.fromAddress || smtpUser || 'noreply@studiomandani.ir'

        if (!smtpUser || !smtpPass) {
          const outboxDir = path.join(DATA_DIR, 'outbox')
          if (!fs.existsSync(outboxDir)) fs.mkdirSync(outboxDir, { recursive: true })
          const outboxEntry = {
            id: 'email_' + Date.now(),
            to,
            subject,
            createdAt: new Date().toISOString(),
            status: 'queued_no_smtp'
          }
          fs.writeFileSync(path.join(outboxDir, `${outboxEntry.id}.json`), JSON.stringify({ ...outboxEntry, html }, null, 2))
          console.log(`[Email Audit] Stored to outbox: ${to} | Subject: ${subject}`)
          return sendJson(res, 200, {
            ok: true,
            queued: true,
            message: 'ایمیل در صف سیستم ثبت شد (برای ارسال مستقیم زنده، اطلاعات جیمیل یا SMTP در تنظیمات ست شود)'
          })
        }

        if (!nodemailer) {
          return sendJson(res, 500, { ok: false, error: 'ماژول ارسال ایمیل در سرور بارگذاری نشده است' })
        }

        const transporter = nodemailer.createTransport({
          host: smtpHost,
          port: smtpPort,
          secure: smtpSecure,
          auth: {
            user: smtpUser,
            pass: smtpPass
          }
        })

        const info = await transporter.sendMail({
          from: `"${fromName}" <${fromAddress}>`,
          to,
          subject,
          text,
          html: html || undefined
        })

        console.log(`[Email Audit] Dispatched to ${to} | MessageId: ${info.messageId}`)
        return sendJson(res, 200, { ok: true, messageId: info.messageId })
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

        return sendJson(res, 200, { ok: true, revision: newRevision, at: newUpdatedAt, tenant: effectiveTenant })
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

  sendJson(res, 404, { ok: false, error: 'Not found' })
})

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[CRMSTUDIO Sync Server] listening on http://0.0.0.0:${PORT}`)
  console.log(`[CRMSTUDIO Sync Server] Data directory: ${DATA_DIR}`)
  console.log(`[CRMSTUDIO Sync Server] Tenants directory: ${TENANTS_DIR}`)
})
