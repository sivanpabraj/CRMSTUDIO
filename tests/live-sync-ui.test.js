import { describe, it, expect } from 'vitest'
import {
  shouldRefreshUiAfterPull,
  LIVE_ENTITY_PUSH_MS,
  LIVE_REALTIME_PULL_MS,
  LIVE_REFRESH_ROUTES
} from '../js/lib/live-sync-ui.js'

describe('LiveSyncUi', () => {
  it('uses near-live debounce windows', () => {
    expect(LIVE_ENTITY_PUSH_MS).toBeLessThanOrEqual(1000)
    expect(LIVE_REALTIME_PULL_MS).toBeLessThanOrEqual(600)
  })

  it('refreshes when peers applied rows on a safe route', () => {
    expect(shouldRefreshUiAfterPull(
      { ok: true, applied: 2 },
      { route: 'accounting', hasOpenModal: false }
    )).toBe(true)
  })

  it('skips refresh while modal is open', () => {
    expect(shouldRefreshUiAfterPull(
      { ok: true, applied: 3 },
      { route: 'contracts', hasOpenModal: true }
    )).toBe(false)
  })

  it('skips when nothing applied', () => {
    expect(shouldRefreshUiAfterPull(
      { ok: true, applied: 0 },
      { route: 'dashboard' }
    )).toBe(false)
  })

  it('includes finance routes', () => {
    expect(LIVE_REFRESH_ROUTES.has('accounting')).toBe(true)
    expect(LIVE_REFRESH_ROUTES.has('invoices')).toBe(true)
  })
})
