/**
 * Auth Service — کاربر سراسری + memberships + OTP
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
    if (derived.length !== expected.length) return false
    return crypto.timingSafeEqual(Buffer.from(derived, 'utf8'), Buffer.from(expected, 'utf8'))
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
    const sBuf = Buffer.from(s, 'utf8')
    const expBuf = Buffer.from(expected, 'utf8')
    if (sBuf.length !== expBuf.length || !crypto.timingSafeEqual(sBuf, expBuf)) return null
    const payload = JSON.parse(Buffer.from(b, 'base64url').toString('utf8'))
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null
    return payload
  } catch {
    return null
  }
}

function hashOtp(code) {
  return crypto.createHash('sha256').update(String(code).trim()).digest('hex')
}

export function createAuthService(pool, opts = {}) {
  const secret = opts.jwtSecret || process.env.JWT_SECRET || (process.env.VITEST || process.env.NODE_ENV === 'test' ? 'test-secret-suite-key-123456789-32chars' : '')
  if (!secret || secret === 'change-me-in-production' || secret.length < 24) {
    throw new Error('JWT_SECRET قوی (حداقل ۳۲ کاراکتر) الزامی است')
  }
  if (process.env.NODE_ENV === 'production' && secret.length < 32) {
    throw new Error('JWT_SECRET قوی (حداقل ۳۲ کاراکتر) الزامی است')
  }

  async function registerStudio({ studioName, managerName, phone, email, password }) {
    const p = normalizePhone(phone)
    if (!p) throw Object.assign(new Error('شماره موبایل نامعتبر'), { status: 400 })
    if (!password || String(password).length < 8) {
      throw Object.assign(new Error('رمز حداقل ۸ کاراکتر باشد'), { status: 400 })
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

      let userRes = await client.query(`SELECT * FROM users WHERE phone = $1`, [p])
      let user
      if (userRes.rows[0]) {
        user = userRes.rows[0]
        if (!verifyPassword(password, user.password_hash, user.password_salt)) {
          throw Object.assign(
            new Error('این شماره موبایل قبلاً ثبت شده است؛ رمز عبور وارد شده برای این شماره صحیح نیست'),
            { status: 401, code: 'wrong_password_for_existing_account' }
          )
        }
        await client.query(
          `UPDATE users SET name=COALESCE(NULLIF($1,''), name), email=COALESCE($2, email), updated_at=now() WHERE id=$3`,
          [managerName || '', email || null, user.id]
        )
      } else {
        const { password_hash, password_salt } = hashPassword(password)
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
      const token = signAccessToken(
        {
          sub: user.id,
          phone: user.phone,
          studioId: studio.rows[0].id,
          role: 'studio_manager'
        },
        secret
      )
      const memberships = [
        {
          studioId: studio.rows[0].id,
          role: 'studio_manager',
          roles: ['studio_manager'],
          title: 'مدیر استودیو',
          studioName: studio.rows[0].name,
          studioSlug: studio.rows[0].slug
        }
      ]
      return {
        user: publicUser(user),
        studio: studio.rows[0],
        accessToken: token,
        memberships
      }
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

  async function requestOtp({ phone, purpose = 'login' }) {
    const p = normalizePhone(phone)
    if (!p) {
      throw Object.assign(new Error('شماره موبایل نامعتبر'), {
        status: 400,
        code: 'invalid_phone'
      })
    }

    const recent = await pool.query(
      `SELECT COUNT(*)::int AS c FROM otp_codes
       WHERE phone = $1 AND purpose = $2
         AND created_at > now() - interval '5 minutes'`,
      [p, purpose]
    )
    if (recent.rows[0].c >= 3) {
      throw Object.assign(new Error('تعداد درخواست کد زیاد است. کمی صبر کنید.'), {
        status: 429,
        code: 'otp_rate_limited'
      })
    }

    await pool.query(`DELETE FROM otp_codes WHERE expires_at < now()`)

    const code = String(Math.floor(100000 + Math.random() * 900000))
    const codeHash = hashOtp(code)
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000)

    await pool.query(
      `INSERT INTO otp_codes (phone, code_hash, purpose, expires_at)
       VALUES ($1, $2, $3, $4)`,
      [p, codeHash, purpose, expiresAt.toISOString()]
    )

    const isDev = process.env.NODE_ENV !== 'production'
    return {
      ok: true,
      phone: p,
      expiresIn: 300,
      ...(isDev ? { devCode: code } : {})
    }
  }

  async function verifyOtp({ phone, code, purpose = 'login' }) {
    const p = normalizePhone(phone)
    const cleanCode = String(code || '').trim()

    if (!p || !/^\d{6}$/.test(cleanCode)) {
      throw Object.assign(new Error('ورودی نامعتبر'), {
        status: 400,
        code: 'invalid_input'
      })
    }

    const row = await pool.query(
      `SELECT * FROM otp_codes
       WHERE phone = $1 AND purpose = $2 AND expires_at > now()
       ORDER BY created_at DESC
       LIMIT 1`,
      [p, purpose]
    )
    const otp = row.rows[0]

    if (!otp) {
      throw Object.assign(new Error('کد منقضی شده یا یافت نشد'), {
        status: 400,
        code: 'otp_expired'
      })
    }

    if (otp.attempts >= 5) {
      throw Object.assign(new Error('تعداد تلاش بیش از حد مجاز'), {
        status: 429,
        code: 'otp_locked'
      })
    }

    await pool.query(`UPDATE otp_codes SET attempts = attempts + 1 WHERE id = $1`, [otp.id])

    const expected = Buffer.from(otp.code_hash, 'utf8')
    const actual = Buffer.from(hashOtp(cleanCode), 'utf8')
    const match =
      expected.length === actual.length && crypto.timingSafeEqual(expected, actual)

    if (!match) {
      throw Object.assign(new Error('کد اشتباه است'), {
        status: 401,
        code: 'otp_wrong'
      })
    }

    await pool.query(`DELETE FROM otp_codes WHERE phone = $1 AND purpose = $2`, [p, purpose])

    let userRes = await pool.query(`SELECT * FROM users WHERE phone = $1`, [p])
    let user = userRes.rows[0]

    if (!user) {
      userRes = await pool.query(
        `INSERT INTO users (phone, name, status)
         VALUES ($1, $2, 'active')
         RETURNING *`,
        [p, 'کاربر']
      )
      user = userRes.rows[0]
    }

    if (user.status === 'disabled') {
      throw Object.assign(new Error('حساب غیرفعال است'), {
        status: 403,
        code: 'inactive'
      })
    }

    await pool.query(`UPDATE users SET last_login_at = now() WHERE id = $1`, [user.id])

    const mem = await pool.query(
      `SELECT m.*, s.name AS studio_name, s.slug AS studio_slug
       FROM memberships m
       JOIN studios s ON s.id = m.studio_id
       WHERE m.user_id = $1 AND m.status = 'active' AND s.status = 'active'`,
      [user.id]
    )

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
      mustChangePassword: !!user.must_change_pw
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
    requestOtp,
    verifyOtp,
    verifyAccessToken: (t) => verifyAccessToken(t, secret),
    signAccessToken: (p) => signAccessToken(p, secret),
    normalizePhone,
    hashPassword,
    verifyPassword
  }
}
