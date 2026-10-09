/**
 * Auth Service — کاربر سراسری + memberships
 * نیازمند pg Pool
 */
import crypto from 'node:crypto'

function normalizePhone(p) {
  if (!p) return null
  let en = String(p)
    .replace(/[۰-۹]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d))
    .replace(/\D/g, '')
  if (en.startsWith('98') && en.length === 12) en = '0' + en.slice(2)
  if (en.length === 10 && en.startsWith('9')) en = '0' + en
  return en.length >= 11 ? en : null
}

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const clean = String(password).trim()
  const iterations = 120000
  const derived = crypto.pbkdf2Sync(clean, Buffer.from(salt, 'hex'), iterations, 32, 'sha256').toString('hex')
  return { password_hash: `pbkdf2$${iterations}$${derived}`, password_salt: salt }
}

function verifyPassword(password, storedHash, salt) {
  if (!password || !storedHash) return false
  const clean = String(password).trim()
  if (storedHash.startsWith('pbkdf2$')) {
    const [, iterStr, expected] = storedHash.split('$')
    const derived = crypto
      .pbkdf2Sync(clean, Buffer.from(salt || '', 'hex'), parseInt(iterStr, 10), 32, 'sha256')
      .toString('hex')
    return derived === expected
  }
  return false
}

function signAccessToken(payload, secret, ttlSec = 3600) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')
  const body = Buffer.from(
    JSON.stringify({ ...payload, exp: Math.floor(Date.now() / 1000) + ttlSec })
  ).toString('base64url')
  const sig = crypto.createHmac('sha256', secret).update(`${header}.${body}`).digest('base64url')
  return `${header}.${body}.${sig}`
}

function verifyAccessToken(token, secret) {
  try {
    const [h, b, s] = String(token || '').split('.')
    if (!h || !b || !s) return null
    const expected = crypto.createHmac('sha256', secret).update(`${h}.${b}`).digest('base64url')
    if (expected !== s) return null
    const payload = JSON.parse(Buffer.from(b, 'base64url').toString())
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null
    return payload
  } catch {
    return null
  }
}

export function createAuthService(pool, opts = {}) {
  const secret = opts.jwtSecret || process.env.JWT_SECRET || 'change-me-in-production'

  async function registerStudio({ studioName, managerName, phone, email, password }) {
    const p = normalizePhone(phone)
    if (!p) throw Object.assign(new Error('شماره موبایل نامعتبر'), { status: 400 })
    if (!password || String(password).length < 6) {
      throw Object.assign(new Error('رمز حداقل ۶ کاراکتر'), { status: 400 })
    }
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      const slug =
        's_' +
        p.slice(-8) +
        '_' +
        crypto.randomBytes(3).toString('hex')
      const studio = await client.query(
        `INSERT INTO studios (slug, name, phone, email) VALUES ($1,$2,$3,$4) RETURNING *`,
        [slug, studioName || 'استودیو', p, email || null]
      )
      const { password_hash, password_salt } = hashPassword(password)
      let userRes = await client.query(`SELECT * FROM users WHERE phone = $1`, [p])
      let user
      if (userRes.rows[0]) {
        user = userRes.rows[0]
        await client.query(
          `UPDATE users SET password_hash=$1, password_salt=$2, name=COALESCE(NULLIF($3,''), name), email=COALESCE($4, email), updated_at=now() WHERE id=$5`,
          [password_hash, password_salt, managerName || '', email || null, user.id]
        )
      } else {
        userRes = await client.query(
          `INSERT INTO users (phone, email, password_hash, password_salt, name) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
          [p, email || null, password_hash, password_salt, managerName || 'مدیر']
        )
        user = userRes.rows[0]
      }
      await client.query(
        `INSERT INTO memberships (user_id, studio_id, role, roles, status, title)
         VALUES ($1,$2,'studio_manager','["studio_manager"]'::jsonb,'active','مدیر استودیو')
         ON CONFLICT (user_id, studio_id) DO UPDATE SET role='studio_manager', status='active'`,
        [user.id, studio.rows[0].id]
      )
      await client.query('COMMIT')
      return { user: publicUser(user), studio: studio.rows[0] }
    } catch (e) {
      await client.query('ROLLBACK')
      throw e
    } finally {
      client.release()
    }
  }

  async function login({ phone, email, password }) {
    const p = phone ? normalizePhone(phone) : null
    const em = email ? String(email).toLowerCase() : null
    const q = p
      ? await pool.query(`SELECT * FROM users WHERE phone = $1`, [p])
      : await pool.query(`SELECT * FROM users WHERE email = $1`, [em])
    const user = q.rows[0]
    if (!user) throw Object.assign(new Error('کاربر یافت نشد'), { status: 404, code: 'not_found' })
    if (user.status === 'disabled') {
      throw Object.assign(new Error('حساب غیرفعال است'), { status: 403, code: 'inactive' })
    }
    if (!verifyPassword(password, user.password_hash, user.password_salt)) {
      throw Object.assign(new Error('رمز عبور اشتباه است'), { status: 401, code: 'wrong_password' })
    }
    const mem = await pool.query(
      `SELECT m.*, s.name AS studio_name, s.slug AS studio_slug, s.status AS studio_status
       FROM memberships m JOIN studios s ON s.id = m.studio_id
       WHERE m.user_id = $1 AND m.status = 'active' AND s.status = 'active'`,
      [user.id]
    )
    await pool.query(`UPDATE users SET last_login_at = now() WHERE id = $1`, [user.id])
    const memberships = mem.rows.map((r) => ({
      studioId: r.studio_id,
      role: r.role,
      roles: r.roles,
      title: r.title,
      studioName: r.studio_name,
      studioSlug: r.studio_slug
    }))
    const primary = memberships[0]
    const accessToken = signAccessToken(
      {
        sub: user.id,
        phone: user.phone,
        studioId: primary?.studioId || null,
        role: primary?.role || null
      },
      secret
    )
    return {
      ok: true,
      user: publicUser(user),
      memberships,
      accessToken,
      mustChangePassword: user.must_change_pw
    }
  }

  async function listMemberships(userId) {
    const mem = await pool.query(
      `SELECT m.*, s.name AS studio_name, s.slug AS studio_slug
       FROM memberships m JOIN studios s ON s.id = m.studio_id
       WHERE m.user_id = $1 AND m.status = 'active'`,
      [userId]
    )
    return mem.rows.map((r) => ({
      studioId: r.studio_id,
      role: r.role,
      roles: r.roles,
      studioName: r.studio_name,
      studioSlug: r.studio_slug
    }))
  }

  function publicUser(u) {
    return {
      id: u.id,
      name: u.name,
      phone: u.phone,
      email: u.email,
      status: u.status
    }
  }

  return {
    registerStudio,
    login,
    listMemberships,
    verifyAccessToken: (t) => verifyAccessToken(t, secret),
    signAccessToken: (p) => signAccessToken(p, secret),
    normalizePhone,
    hashPassword,
    verifyPassword
  }
}
