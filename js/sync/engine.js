/**
 * Studio M Phase 2/3 — Sync engine (entity-first, snapshot fallback, conflicts)
 */
import { SYNC_ENTITIES, isSyncEntity, stripSensitive } from './entities.js'
import { mergeCollection } from './conflict.js'
import { upsertConflict, listConflicts } from './conflict-store.js'
import { LIVE_ENTITY_PUSH_MS } from '../lib/live-sync-ui.js'
import {
  nextSequenceCursor,
  normalizeDelta,
  reconcilePush,
  toAuthoritativeCommand,
} from './protocol.js'

export const SyncEngine = {
  _entityPushTimer: null,
  _snapshotTimer: null,
  _entityPending: false,
  _lastEntityPullAt: 0,

  scheduleEntityPush(cloud) {
    if (!cloud?.isEnabled?.()) return
    this._entityPending = true
    clearTimeout(this._entityPushTimer)
    const delay = LIVE_ENTITY_PUSH_MS || 700
    this._entityPushTimer = setTimeout(() => {
      this.pushAll(cloud).then(r => {
        if (r?.ok || r?.skipped) return
        cloud._notifyCloudError?.(r?.error || 'ارسال entity ناموفق')
      }).catch(e => {
        cloud._notifyCloudError?.(e?.message || 'خطا در entity sync')
      })
    }, delay)
  },

  /** Flush pending entity push immediately (tab hide / critical path). */
  async flushEntityPush(cloud) {
    if (!cloud?.isEnabled?.()) return { ok: false, skipped: true }
    clearTimeout(this._entityPushTimer)
    this._entityPushTimer = null
    if (!this._entityPending) return { ok: true, skipped: true, reason: 'nothing_pending' }
    return this.pushAll(cloud)
  },

  scheduleSnapshotPush(cloud) {
    if (!cloud?.isEnabled?.()) return
    cloud._snapshotPending = true
    clearTimeout(this._snapshotTimer)
    this._snapshotTimer = setTimeout(() => {
      cloud._pushSnapshotDebounced?.().catch(() => {})
    }, 60000)
  },

  _cursors() {
    const info = typeof DB !== 'undefined' ? (DB.get('studioInfo') || {}) : {}
    return info.syncCursors && typeof info.syncCursors === 'object' ? info.syncCursors : {}
  },

  _sequenceCursors() {
    const info = typeof DB !== 'undefined' ? (DB.get('studioInfo') || {}) : {}
    return info.syncSequenceCursors && typeof info.syncSequenceCursors === 'object'
      ? info.syncSequenceCursors
      : {}
  },

  async _saveCursors(cursors, extra = {}) {
    if (typeof SecureDB === 'undefined') return
    await SecureDB.merge('studioInfo', {
      ...(DB.get('studioInfo') || {}),
      syncCursors: cursors,
      ...extra
    })
  },

  async _saveSequenceCursors(cursors, extra = {}) {
    if (typeof SecureDB === 'undefined') return
    await SecureDB.merge('studioInfo', {
      ...(DB.get('studioInfo') || {}),
      syncSequenceCursors: cursors,
      ...extra
    })
  },

  async _saveConflicts(conflicts) {
    if (typeof SecureDB === 'undefined') return
    await SecureDB.merge('studioInfo', {
      ...(DB.get('studioInfo') || {}),
      syncConflicts: conflicts
    })
  },

  _rowsSince(collection, sinceIso) {
    const since = sinceIso ? Date.parse(sinceIso) : 0
    return (DB.get(collection) || []).filter(item => {
      if (!item?.id) return false
      // Include tombstones (_deleted) so peers receive soft-deletes
      const t = Date.parse(item.updatedAtIso || item.updated_at || item.deletedAtIso || '')
      return !!item._syncMutationId || !item._serverRevision || !since || !Number.isFinite(t) || t > since
    })
  },

  async _resolveStudioId(cloud) {
    let studioId = cloud.studioCloudConfig?.().studioId
    if (!studioId) studioId = await cloud._loadMemberStudioId?.()
    return studioId || null
  },

  async pushEntityType(cloud, entityType, studioId) {
    const c = await cloud.client()
    if (!c) return { ok: false, error: 'no client' }

    const since = this._cursors()[entityType] || ''
    const items = this._rowsSince(entityType, since)
    if (!items.length) return { ok: true, count: 0, entityType }

    let accepted = 0
    for (let offset = 0; offset < items.length; offset += 200) {
      const batchItems = items.slice(offset, offset + 200)
      const commands = batchItems.map(item => {
        const command = toAuthoritativeCommand(entityType, item)
        if (command.payload) command.payload = stripSensitive(entityType, command.payload)
        return command
      })
      const { data, error } = await c.rpc('apply_studio_entity_commands', {
        p_studio_id: studioId,
        p_entity_type: entityType,
        p_commands: commands
      })
      if (error) return { ok: false, error: error.message, entityType }
      const current = DB.get(entityType) || []
      const reconciled = reconcilePush(current, commands, data?.results || [])
      if (typeof SecureDB !== 'undefined' && SecureDB.systemSet) {
        await SecureDB.systemSet(entityType, reconciled)
      } else {
        await DB.set(entityType, reconciled)
      }
      accepted += data?.results?.length || 0
    }

    const cursors = { ...this._cursors(), [entityType]: new Date().toISOString() }
    await this._saveCursors(cursors)
    await DB.flush?.()
    return { ok: true, count: accepted, entityType }
  },

  async pushContractsTable(cloud) {
    if (typeof cloud.syncContractsFromLocal === 'function') {
      return cloud.syncContractsFromLocal()
    }
    return { ok: true, skipped: true }
  },

  async pushAll(cloud) {
    if (!this._entityPending) return { ok: false, skipped: true }
    this._entityPending = false
    if (!cloud.isEnabled()) return { ok: false, skipped: true }

    const sess = await cloud.session()
    if (!sess) return { ok: false, error: 'ابر: ورود Supabase لازم است' }

    const studioId = await this._resolveStudioId(cloud)
    if (!studioId) return { ok: false, error: 'استودیوی ابری یافت نشد' }

    let total = 0
    const errors = []

    for (const entityType of SYNC_ENTITIES) {
      if (!isSyncEntity(entityType)) continue
      const r = await this.pushEntityType(cloud, entityType, studioId)
      if (r.ok) total += r.count || 0
      else if (!r.skipped) errors.push(`${entityType}: ${r.error}`)
    }

    await this.pushContractsTable(cloud)

    const at = new Date().toISOString()
    await SecureDB.merge('studioInfo', {
      ...(DB.get('studioInfo') || {}),
      cloudLastEntitySyncAt: at,
      cloudLastSyncDir: 'push'
    })
    await DB.flush?.()

    if (errors.length) {
      this._entityPending = true
      return { ok: false, error: errors.join(' · '), partial: total }
    }
    return { ok: true, count: total, at }
  },

  async pullAll(cloud, { force = false } = {}) {
    if (!cloud.isEnabled()) return { ok: false, skipped: true }
    const now = Date.now()
    if (!force && now - this._lastEntityPullAt < 15000) return { ok: false, skipped: true }
    this._lastEntityPullAt = now

    const sess = await cloud.session()
    if (!sess) return { ok: false, error: 'ابر: ورود Supabase لازم است' }

    const studioId = await this._resolveStudioId(cloud)
    if (!studioId) return { ok: false, error: 'استودیوی ابری یافت نشد' }

    const c = await cloud.client()
    if (!c) return { ok: false, error: 'no client' }

    let applied = 0
    const cursors = { ...this._sequenceCursors() }
    let conflictList = listConflicts(DB.get('studioInfo') || {})
    const newConflicts = []

    for (const entityType of SYNC_ENTITIES) {
      if (!isSyncEntity(entityType)) continue
      let cursor = cursors[entityType] || {
        seq: 0,
        id: '00000000-0000-0000-0000-000000000000'
      }

      while (true) {
        const { data, error } = await c.rpc('pull_studio_entity_deltas', {
          p_studio_id: studioId,
          p_entity_type: entityType,
          p_after_seq: Number(cursor.seq) || 0,
          p_after_id: cursor.id || '00000000-0000-0000-0000-000000000000',
          p_limit: 500
        })

        if (error) return { ok: false, error: error.message }
        if (!data?.length) break

        const local = DB.get(entityType) || []
        const normalized = data.map(normalizeDelta)
        const merged = mergeCollection(local, normalized)
        if (merged.conflicts?.length) {
          for (const cfl of merged.conflicts) {
            cfl.entityType = entityType
            conflictList = upsertConflict({ syncConflicts: conflictList }, cfl)
            newConflicts.push(cfl)
          }
        }
        if (merged.applied > 0) {
          if (typeof SecureDB !== 'undefined' && SecureDB.systemSet) {
            SecureDB.systemSet(entityType, merged.items)
          } else {
            DB.set(entityType, merged.items)
          }
          applied += merged.applied
        }
        cursor = nextSequenceCursor(data, cursor)
        cursors[entityType] = cursor
        if (data.length < 500) break
      }
    }

    if (newConflicts.length) {
      await this._saveConflicts(conflictList)
    }

    if (applied > 0) {
      await this._saveSequenceCursors(cursors, {
        cloudLastEntitySyncAt: new Date().toISOString(),
        cloudLastSyncDir: 'pull'
      })
      await DB.flush?.()
    } else if (newConflicts.length) {
      await DB.flush?.()
    } else {
      await this._saveSequenceCursors(cursors)
    }

    return {
      ok: true,
      applied,
      conflicts: newConflicts,
      conflictCount: conflictList.length,
      skipped: applied === 0 && !newConflicts.length
    }
  }
}

export default SyncEngine
