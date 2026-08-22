/** Pure list pagination helper */

export function paginate(items, page = 0, pageSize = 40) {
  const list = Array.isArray(items) ? items : []
  const size = Math.max(1, Number(pageSize) || 40)
  const total = list.length
  const pages = Math.max(1, Math.ceil(total / size))
  const p = Math.min(Math.max(0, Number(page) || 0), pages - 1)
  const start = p * size
  return {
    page: p,
    pageSize: size,
    pages,
    total,
    items: list.slice(start, start + size),
    hasPrev: p > 0,
    hasNext: p < pages - 1
  }
}

if (typeof window !== 'undefined') {
  window.ListPage = { paginate }
}
