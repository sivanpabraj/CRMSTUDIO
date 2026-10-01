import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'

const PORT = parseInt(process.env.PORT || '3000', 10)
const DATA_DIR = process.env.DATA_DIR || '/var/lib/crmstudio'
const TENANTS_DIR = path.join(DATA_DIR, 'tenants')
const DEFAULT_DB_FILE = path.join(DATA_DIR, 'crmstudio_db.json')
const DEFAULT_META_FILE = path.join(DATA_DIR, 'crmstudio_meta.json')

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true })
}
if (!fs.existsSync(TENANTS_DIR)) {
  fs.mkdirSync(TENANTS_DIR, { recursive: true })
}

function resolveTenantKey(studioId) {
  if (!studioId || typeof studioId !== 'string') return ''
  const clean = studioId.replace(/[^a-zA-Z0-9_\-]/g, '').slice(0, 64)
  if (!clean || clean === 'undefined' || clean === 'null') return ''
  return clean
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
  try {
    if (fs.existsSync(metaFile)) {
      const m = JSON.parse(fs.readFileSync(metaFile, 'utf-8'))
      revision = Number(m.revision) || 1
      lastUpdatedAt = m.lastUpdatedAt || lastUpdatedAt
    }
  } catch (e) {
    console.warn(`Meta read failed for [${tenantKey || 'default'}]:`, e.message)
  }
  return { revision, lastUpdatedAt }
}

function writeTenantMeta(tenantKey, revision, lastUpdatedAt) {
  const metaFile = getTenantMetaPath(tenantKey)
  try {
    fs.writeFileSync(metaFile, JSON.stringify({ revision, lastUpdatedAt }, null, 2), 'utf-8')
  } catch (e) {
    console.warn(`Meta write failed for [${tenantKey || 'default'}]:`, e.message)
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
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With, X-Studio-Id',
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
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With, X-Studio-Id',
      'Access-Control-Max-Age': '86400'
    })
    return res.end()
  }

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
      app: 'CRMSTUDIO Multi-Tenant Sync Server',
      tenant: tenantKey || 'global',
      revision: meta.revision,
      lastUpdatedAt: meta.lastUpdatedAt,
      connectedClients: sseClients.size,
      uptimeSec: Math.round(process.uptime()),
      hasData: fs.existsSync(dbPath)
    })
  }

  // SSE Stream
  if (url.pathname === '/api/sync/stream') {
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

  // Pull Database
  if (req.method === 'GET' && url.pathname === '/api/sync/pull') {
    // If client does not specify a studio ID, do not leak other studios' data!
    if (!tenantKey) {
      return sendJson(res, 200, { ok: true, empty: true, data: null, revision: 1, message: 'No studio specified' })
    }

    const meta = readTenantMeta(tenantKey)
    const clientRev = Number(url.searchParams.get('rev'))
    if (clientRev && clientRev === meta.revision) {
      return sendJson(res, 200, { ok: true, notModified: true, revision: meta.revision })
    }

    const dbFile = getTenantDbPath(tenantKey)
    if (!fs.existsSync(dbFile)) {
      return sendJson(res, 200, { ok: true, revision: meta.revision, data: null, updatedAt: meta.lastUpdatedAt, empty: true })
    }

    try {
      const content = fs.readFileSync(dbFile, 'utf-8')
      const parsed = JSON.parse(content)
      return sendJson(res, 200, { ok: true, revision: meta.revision, data: parsed, updatedAt: meta.lastUpdatedAt, tenant: tenantKey })
    } catch (err) {
      return sendJson(res, 500, { ok: false, error: 'خطا در خواندن داده‌های سرور: ' + err.message })
    }
  }

  // Push Database
  if (req.method === 'POST' && url.pathname === '/api/sync/push') {
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
        writeTenantMeta(effectiveTenant, newRevision, newUpdatedAt)

        broadcastTenantUpdate(effectiveTenant, newRevision, newUpdatedAt)
        console.log(`[SyncServer] Push accepted for tenant [${effectiveTenant}]. Revision: ${newRevision}`)

        return sendJson(res, 200, { ok: true, revision: newRevision, at: newUpdatedAt, tenant: effectiveTenant })
      } catch (err) {
        return sendJson(res, 400, { ok: false, error: 'خطا در ذخیره‌سازی داده: ' + err.message })
      }
    })
    return
  }

  // Backup download
  if ((req.method === 'GET' || req.method === 'HEAD') && url.pathname === '/api/sync/backup') {
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
