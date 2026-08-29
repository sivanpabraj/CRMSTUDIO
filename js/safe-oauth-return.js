export function safeStudioReturn(raw, origin) {
  const fallback = '/studio-m/index.html#settings'
  try {
    const base = new URL(origin)
    const target = new URL(String(raw || ''), base)
    if (target.origin !== base.origin || !target.pathname.startsWith('/studio-m/')) return fallback
    return target.pathname + target.search + target.hash
  } catch {
    return fallback
  }
}
