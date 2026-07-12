/** @module — safe redirect + URL helpers (testable, no DOM) */

export function safeRedirectPath(next, origin) {
  if (!next || typeof next !== 'string') return null
  const t = next.trim()
  if (!t || /^https?:\/\//i.test(t) || t.startsWith('//') || t.startsWith('\\')) return null
  if (!t.startsWith('/')) return null
  try {
    const base = origin || 'http://localhost'
    const u = new URL(t, base)
    const baseUrl = new URL(base)
    if (u.origin !== baseUrl.origin) return null
    return u.pathname + u.search + u.hash
  } catch {
    return null
  }
}

/** مسیر نسبی اپ مثل studio-m/ یا admin.html */
export function safeAppRedirect(url, origin) {
  if (!url || typeof url !== 'string') return null
  const t = url.trim()
  if (!t || /^https?:\/\//i.test(t) || t.startsWith('//') || t.startsWith('\\')) return null
  const path = t.startsWith('/') ? t : `/${t}`
  return safeRedirectPath(path, origin)
}

export function studioMLoginReturnPath(pathname, hash) {
  const p = String(pathname || '')
  if (p.includes('studio-m')) {
    return p + (hash || '#dashboard')
  }
  return '/studio-m/index.html' + (hash || '#dashboard')
}

export function normalizeSupabaseUrl(url) {
  let u = String(url || '').trim()
  if (!u) return ''
  const dash = u.match(/supabase\.com\/dashboard\/project\/([a-z0-9]+)/i)
  if (dash) u = `https://${dash[1]}.supabase.co`
  u = u.replace(/\/rest\/v1\/?$/i, '').replace(/\/+$/, '')
  if (u && !/^https?:\/\//i.test(u)) u = `https://${u}`
  return u
}

export function jwtRole(key) {
  try {
    const part = String(key || '').split('.')[1]
    if (!part) return ''
    const json = JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/')))
    return json.role || ''
  } catch {
    return ''
  }
}

export function validateAnonKey(key) {
  const role = jwtRole(key)
  if (!role) return { ok: true }
  if (role === 'service_role') {
    return { ok: false, error: 'service_role not allowed in client' }
  }
  if (role !== 'anon') return { ok: false, error: 'invalid api key role' }
  return { ok: true }
}

export function phoneToCloudEmail(phone) {
  const p = String(phone || '').replace(/\D/g, '')
  return `u${p || 'user'}@studiom.app`
}
