/**
 * Live multi-device sync UI helpers (testable, no DOM required for policy).
 */

/** Routes that are safe to soft-refresh after peer pull */
export const LIVE_REFRESH_ROUTES = new Set([
  'dashboard',
  'contracts',
  'bookings',
  'calendar',
  'accounting',
  'invoices',
  'expenses',
  'employees',
  'attendance',
  'payroll',
  'equipment',
  'custody',
  'workflow',
  'inbox',
  'messaging',
  'notifications',
  'reports',
  'portal',
  'packages'
])

/**
 * @param {{ applied?: number, skipped?: boolean, ok?: boolean }} pullResult
 * @param {{ hasOpenModal?: boolean, route?: string, liveUiEnabled?: boolean }} ctx
 */
export function shouldRefreshUiAfterPull(pullResult = {}, ctx = {}) {
  if (ctx.liveUiEnabled === false) return false
  if (!pullResult || pullResult.skipped) return false
  if (pullResult.ok === false) return false
  if (!(Number(pullResult.applied) > 0)) return false
  if (ctx.hasOpenModal) return false
  const route = ctx.route || ''
  if (route && !LIVE_REFRESH_ROUTES.has(route)) return false
  return true
}

/** Entity push debounce for near-live multi-device (ms) */
export const LIVE_ENTITY_PUSH_MS = 700
/** Realtime → pull coalesce window (ms) */
export const LIVE_REALTIME_PULL_MS = 400

if (typeof window !== 'undefined') {
  window.LiveSyncUi = {
    shouldRefreshUiAfterPull,
    LIVE_REFRESH_ROUTES,
    LIVE_ENTITY_PUSH_MS,
    LIVE_REALTIME_PULL_MS
  }
}
