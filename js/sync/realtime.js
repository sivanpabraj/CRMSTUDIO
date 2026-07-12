/**
 * Studio M Phase 3 — Supabase Realtime entity pull
 */
import { SyncEngine } from './engine.js'

export const RealtimeSync = {
  _channel: null,
  _cloud: null,
  _pullTimer: null,
  _status: 'off',

  status() {
    return this._status
  },

  async start(cloud) {
    if (!cloud?.isEnabled?.()) return { ok: false, skipped: true }
    this.stop()
    this._cloud = cloud

    const sess = await cloud.session?.()
    if (!sess) return { ok: false, error: 'no session' }

    let studioId = cloud.studioCloudConfig?.().studioId
    if (!studioId) studioId = await cloud._loadMemberStudioId?.()
    if (!studioId) return { ok: false, error: 'no studio' }

    const c = await cloud.client()
    if (!c) return { ok: false, error: 'no client' }

    this._channel = c
      .channel(`sm-entities:${studioId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'studio_entities',
          filter: `studio_id=eq.${studioId}`
        },
        () => this._schedulePull()
      )
      .subscribe(status => {
        this._status = status === 'SUBSCRIBED' ? 'live' : status === 'CLOSED' ? 'off' : status
      })

    return { ok: true }
  },

  _schedulePull() {
    clearTimeout(this._pullTimer)
    this._pullTimer = setTimeout(async () => {
      if (!this._cloud) return
      try {
        const r = await SyncEngine.pullAll(this._cloud, { force: true })
        if (r?.conflicts?.length && typeof Utils !== 'undefined') {
          Utils.toast?.(`${r.conflicts.length} تعارض sync — تنظیمات → ابر`, 'warning')
        } else if (r?.applied > 0 && typeof Utils !== 'undefined') {
          Utils.toast?.(`${r.applied} رکورد از ابر به‌روز شد`, 'info')
        }
        window.dispatchEvent(new CustomEvent('sm-sync-pull', { detail: r }))
      } catch (e) {
        console.warn('[RealtimeSync]', e)
      }
    }, 1200)
  },

  stop() {
    clearTimeout(this._pullTimer)
    this._pullTimer = null
    if (this._channel) {
      try { this._channel.unsubscribe() } catch { /* */ }
    }
    this._channel = null
    this._cloud = null
    this._status = 'off'
  }
}

export default RealtimeSync
