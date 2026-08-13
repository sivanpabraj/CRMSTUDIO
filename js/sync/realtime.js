/**
 * Studio M Phase 3 — Supabase Realtime entity pull (multi-device live)
 */
import { SyncEngine } from './engine.js'
import { LIVE_REALTIME_PULL_MS } from '../lib/live-sync-ui.js'

const PULL_MS = () => LIVE_REALTIME_PULL_MS || 400

export const RealtimeSync = {
  _channel: null,
  _cloud: null,
  _pullTimer: null,
  _status: 'off',
  _boundLifecycle: false,

  status() {
    return this._status
  },

  async start(cloud) {
    if (!cloud?.isEnabled?.()) return { ok: false, skipped: true }
    this.stop(false)
    this._cloud = cloud
    this._bindLifecycle()

    const sess = await cloud.session?.()
    if (!sess) return { ok: false, error: 'no session' }

    let studioId = cloud.studioCloudConfig?.().studioId
    if (!studioId) studioId = await cloud._loadMemberStudioId?.()
    if (!studioId) return { ok: false, error: 'no studio' }

    const c = await cloud.client()
    if (!c) return { ok: false, error: 'no client' }

    const channel = c.channel(`sm-live:${studioId}`)
    channel.on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'studio_entities',
        filter: `studio_id=eq.${studioId}`
      },
      () => this._schedulePull('entities')
    )
    // Secondary hint channel (migration 004 trigger) — ignore errors if not in publication
    try {
      channel.on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'studio_sync_events',
          filter: `studio_id=eq.${studioId}`
        },
        () => this._schedulePull('events')
      )
    } catch { /* optional */ }

    this._channel = channel
    channel.subscribe(status => {
      this._status = status === 'SUBSCRIBED' ? 'live' : status === 'CLOSED' ? 'off' : status
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('sm-realtime-status', { detail: { status: this._status } }))
      }
      if (status === 'SUBSCRIBED') {
        this._schedulePull('subscribed')
      }
    })

    return { ok: true }
  },

  _schedulePull(reason = 'change') {
    clearTimeout(this._pullTimer)
    this._pullTimer = setTimeout(async () => {
      if (!this._cloud) return
      try {
        const r = await SyncEngine.pullAll(this._cloud, { force: true })
        if (r?.conflicts?.length && typeof Utils !== 'undefined') {
          Utils.toast?.(`${r.conflicts.length} تعارض sync — تنظیمات → ابر`, 'warning')
        } else if (r?.applied > 0 && typeof Utils !== 'undefined') {
          // Quiet toast for live feel (avoid spam); UI refresh handles visibility
          if (reason === 'subscribed') {
            Utils.toast?.(`${r.applied} رکورد از ابر همگام شد`, 'info')
          }
        }
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('sm-sync-pull', {
            detail: { ...(r || {}), reason, live: true }
          }))
        }
      } catch (e) {
        console.warn('[RealtimeSync]', e)
      }
    }, PULL_MS())
  },

  _bindLifecycle() {
    if (this._boundLifecycle || typeof window === 'undefined') return
    this._boundLifecycle = true

    window.addEventListener('online', () => {
      if (!this._cloud?.isEnabled?.()) return
      this.start(this._cloud).catch(() => {})
    })

    document.addEventListener('visibilitychange', () => {
      if (!this._cloud?.isEnabled?.()) return
      if (document.visibilityState === 'hidden') {
        SyncEngine.flushEntityPush?.(this._cloud).catch(() => {})
      } else if (document.visibilityState === 'visible') {
        this._schedulePull('visible')
        if (this._status !== 'live') {
          this.start(this._cloud).catch(() => {})
        }
      }
    })
  },

  stop(clearCloud = true) {
    clearTimeout(this._pullTimer)
    this._pullTimer = null
    if (this._channel) {
      try { this._channel.unsubscribe() } catch { /* */ }
    }
    this._channel = null
    if (clearCloud) this._cloud = null
    this._status = 'off'
  }
}

export default RealtimeSync
