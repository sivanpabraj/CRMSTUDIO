/**
 * Tenant Context — استخراج studio_id از هدر / JWT / query
 */
export function resolveStudioId(req, claims = null) {
  const h =
    req.headers['x-studio-id'] ||
    req.headers['x-tenant-id'] ||
    ''
  if (h && isUuid(h)) return h
  if (claims?.studioId && isUuid(claims.studioId)) return claims.studioId
  try {
    const url = new URL(req.url, 'http://localhost')
    const q = url.searchParams.get('studioId') || url.searchParams.get('tenant')
    if (q && isUuid(q)) return q
  } catch { /* */ }
  return null
}

export function isUuid(s) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(s || '')
  )
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
