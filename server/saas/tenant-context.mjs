/**
 * Tenant Context — studio_id + عضویت اجباری (امنیت Multi-tenant)
 */
export function isUuid(s) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(s || '')
  )
}

export function resolveStudioId(req, claims = null) {
  const h = req.headers['x-studio-id'] || req.headers['x-tenant-id'] || ''
  if (h && isUuid(h)) return h
  if (claims?.studioId && isUuid(claims.studioId)) return claims.studioId
  try {
    const url = new URL(req.url, 'http://localhost')
    const q = url.searchParams.get('studioId') || url.searchParams.get('tenant')
    if (q && isUuid(q)) return q
  } catch { /* */ }
  return null
}

export function requireStudio(req, claims) {
  const id = resolveStudioId(req, claims)
  if (!id) {
    const err = new Error('X-Studio-Id الزامی است')
    err.status = 400
    err.code = 'studio_required'
    throw err
  }
  return id
}

/**
 * کاربر باید membership فعال روی این studio داشته باشد
 * بدون این چک، نمره امنیت Multi-tenant زیر ۵ است
 */
export async function assertMembership(pool, userId, studioId) {
  if (!userId || !studioId) {
    const err = new Error('دسترسی نامعتبر')
    err.status = 403
    err.code = 'forbidden'
    throw err
  }
  const r = await pool.query(
    `SELECT m.id, m.role, m.roles, s.status AS studio_status
     FROM memberships m
     JOIN studios s ON s.id = m.studio_id
     WHERE m.user_id = $1 AND m.studio_id = $2 AND m.status = 'active'
     LIMIT 1`,
    [userId, studioId]
  )
  if (!r.rows[0]) {
    const err = new Error('شما عضو این استودیو نیستید')
    err.status = 403
    err.code = 'not_member'
    throw err
  }
  if (r.rows[0].studio_status !== 'active') {
    const err = new Error('استودیو غیرفعال است')
    err.status = 403
    err.code = 'studio_inactive'
    throw err
  }
  return r.rows[0]
}

export async function requireStudioMember(pool, req, claims) {
  const studioId = requireStudio(req, claims)
  const mem = await assertMembership(pool, claims.sub, studioId)
  return { studioId, membership: mem }
}
