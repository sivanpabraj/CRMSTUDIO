/**
 * Studio M Phase 3 — CSRF helpers (user-bound)
 */

export function generateCsrfToken() {
  if (typeof crypto === 'undefined' || typeof crypto.getRandomValues !== 'function') {
    throw new Error('secure_random_unavailable')
  }
  return Array.from(crypto.getRandomValues(new Uint8Array(16)))
    .map(b => b.toString(16).padStart(2, '0')).join('')
}

/**
 * @param {string} token
 * @param {{ userId?: string, csrf?: string } | null} session
 * @param {string | null | undefined} currentUserId
 */
export function validateCsrfBound(token, session, currentUserId) {
  if (!token || !session?.csrf || !currentUserId) return false
  if (session.csrf !== token) return false
  if (session.userId !== currentUserId) return false
  return true
}

/**
 * @param {string} userId
 * @param {string} [existingToken]
 */
export function csrfForUser(userId, existingToken) {
  return {
    userId,
    token: existingToken || generateCsrfToken()
  }
}
