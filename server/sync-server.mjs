import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'

const PORT = parseInt(process.env.PORT || '3000', 10)
const DATA_DIR = process.env.DATA_DIR || '/var/lib/crmstudio'
const DB_FILE = path.join(DATA_DIR, 'crmstudio_db.json')
const META_FILE = path.join(DATA_DIR, 'crmstudio_meta.json')

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true })
}

let revision = 1
let lastUpdatedAt = new Date().toISOString()

try {
  if (fs.existsSync(META_FILE)) {
    const m = JSON.parse(fs.readFileSync(META_FILE, 'utf-8'))
    revision = Number(m.revision) || 1
    lastUpdatedAt = m.lastUpdatedAt || lastUpdatedAt
  }
} catch (e) {
  console.warn('Meta read failed, starting fresh:', e.message)
}

const sseClients = new Set()

function broadcastUpdate(rev, updatedAt) {
  const payload = JSON.stringify({ type: 'update', revision: rev, updatedAt })
  for (const res of sseClients) {
    try {
      res.write(`data: ${payload}\n\n`)
    } catch {
      sseClients.delete(res)
    }
  }
}

setInterval(() => {
  for (const res of sseClients) {
    try {
      res.write(': ping\n\n')
    } catch {
      sseClients.delete(res)
    }
  }
}, 25000)

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
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
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
      'Access-Control-Max-Age': '86400'
    })
    return res.end()
  }

  const host = req.headers.host || 'localhost'
  const url = new URL(req.url, `http://${host}`)

  // Health
  if (url.pathname === '/api/health') {
    return sendJson(res, 200, {
      status: 'ok',
      app: 'CRMSTUDIO Sync Server',
      revision,
      lastUpdatedAt,
      connectedClients: sseClients.size,
      uptimeSec: Math.round(process.uptime()),
      hasData: fs.existsSync(DB_FILE)
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
    res.write(`data: ${JSON.stringify({ type: 'init', revision, updatedAt: lastUpdatedAt })}\n\n`)
    sseClients.add(res)
    req.on('close', () => sseClients.delete(res))
    return
  }

  // Pull Database
  if (req.method === 'GET' && url.pathname === '/api/sync/pull') {
    const clientRev = Number(url.searchParams.get('rev'))
    if (clientRev && clientRev === revision) {
      return sendJson(res, 200, { ok: true, notModified: true, revision })
    }
    if (!fs.existsSync(DB_FILE)) {
      return sendJson(res, 200, { ok: true, revision, data: null, updatedAt: lastUpdatedAt, empty: true })
    }
    try {
      const content = fs.readFileSync(DB_FILE, 'utf-8')
      const parsed = JSON.parse(content)
      return sendJson(res, 200, { ok: true, revision, data: parsed, updatedAt: lastUpdatedAt })
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

        // محافظت در برابر بازنویسی ناخواسته دیتابیس با داده خالی
        if (fs.existsSync(DB_FILE)) {
          try {
            const currentContent = fs.readFileSync(DB_FILE, 'utf-8')
            const currentData = JSON.parse(currentContent)
            const curUsers = Array.isArray(currentData?.users) ? currentData.users : []
            const newUsers = Array.isArray(payload.data?.users) ? payload.data.users : []
            if (curUsers.length > 0 && newUsers.length === 0) {
              console.warn(`[SyncServer] Push rejected: attempted to wipe ${curUsers.length} users with 0 users!`)
              return sendJson(res, 400, { ok: false, error: 'رد شد: حذف تصادفی کاربران مجاز نیست' })
            }
          } catch (readErr) {
            console.warn('[SyncServer] Check current db warning:', readErr)
          }
        }

        const dataStr = JSON.stringify(payload.data, null, 2)
        const tmpFile = DB_FILE + '.tmp'
        fs.writeFileSync(tmpFile, dataStr, 'utf-8')
        fs.renameSync(tmpFile, DB_FILE)

        revision += 1
        lastUpdatedAt = new Date().toISOString()
        fs.writeFileSync(META_FILE, JSON.stringify({ revision, lastUpdatedAt }), 'utf-8')

        broadcastUpdate(revision, lastUpdatedAt)
        console.log(`[SyncServer] Push accepted. Revision: ${revision}, bytes: ${dataStr.length}`)

        return sendJson(res, 200, { ok: true, revision, at: lastUpdatedAt })
      } catch (err) {
        return sendJson(res, 400, { ok: false, error: 'خطا در ذخیره‌سازی داده: ' + err.message })
      }
    })
    return
  }

  // Backup download
  if ((req.method === 'GET' || req.method === 'HEAD') && url.pathname === '/api/sync/backup') {
    if (!fs.existsSync(DB_FILE)) {
      return sendJson(res, 404, { ok: false, error: 'هیچ دیتایی در سرور برای پشتیبان موجود نیست' })
    }
    const filename = `crmstudio_backup_${new Date().toISOString().replace(/[:.]/g, '-')}.json`
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Access-Control-Allow-Origin': '*'
    })
    if (req.method === 'HEAD') return res.end()
    fs.createReadStream(DB_FILE).pipe(res)
    return
  }

  sendJson(res, 404, { ok: false, error: 'Not found' })
})

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[CRMSTUDIO Sync Server] listening on http://0.0.0.0:${PORT}`)
  console.log(`[CRMSTUDIO Sync Server] Data directory: ${DATA_DIR}`)
})
