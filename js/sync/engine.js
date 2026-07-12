/**
 * Studio M Phase 2/3 — Sync engine (entity-first, snapshot fallback, conflicts)
 */
import { SYNC_ENTITIES, isSyncEntity, stripSensitive, toRpcRow } from './entities.js'
import { mergeCollection } from './conflict.js'
import { upsertConflict, listConflicts } from './conflict-store.js'

export const SyncEngine = {
  _entityPushTimer: null,
  _snapshotTimer: null,
  _entityPending: false,
  _lastEntityPullAt: 0,

  scheduleEntityPush(cloud) {
    if (!cloud?.isEnabled?.()) return
    this._entityPending = true
    clearTimeout(this._entityPushTimer)
    this._entityPushTimer = setTimeout(() => {
      this.pushAll(cloud).then(r => {
        if (r?.ok || r?.skipped) return
        cloud._notifyCloudError?.(r?.error || 'ارسال entity ناموفق')
      }).catch(e => {
        cloud._notifyCloudError?.(e?.message || 'خطا در entity sync')
      })
    }, 2500)
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

  async _saveCursors(cursors, extra = {}) {
    if (typeof SecureDB === 'undefined') return
    await SecureDB.merge('studioInfo', {
      ...(DB.get('studioInfo') || {}),
      syncCursors: cursors,
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
      if (!item?.id || item._deleted) return false
      const t = Date.parse(item.updatedAtIso || item.updated_at || '')
      return !since || !Number.isFinite(t) || t > since
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

    const rows = items.map(i => toRpcRow(stripSensitive(entityType, i)))
    const { data, error } = await c.rpc('upsert_studio_entities', {
      p_studio_id: studioId,
      p_entity_type: entityType,
      p_rows: rows
    })
    if (error) return { ok: false, error: error.message, entityType }

    const cursors = { ...this._cursors(), [entityType]: new Date().toISOString() }
    await this._saveCursors(cursors)
    return { ok: true, count: data ?? rows.length, entityType }
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

    if (errors.length) return { ok: false, error: errors.join(' · '), partial: total }
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
    const cursors = { ...this._cursors() }
    let conflictList = listConflicts(DB.get('studioInfo') || {})
    const newConflicts = []

    for (const entityType of SYNC_ENTITIES) {
      if (!isSyncEntity(entityType)) continue
      let since = cursors[entityType] || '1970-01-01T00:00:00.000Z'

      while (true) {
        const { data, error } = await c
          .from('studio_entities')
          .select('local_id, payload, updated_at, revision')
          .eq('studio_id', studioId)
          .eq('entity_type', entityType)
          .gt('updated_at', since)
          .order('updated_at', { ascending: true })
          .limit(500)

        if (error) return { ok: false, error: error.message }
        if (!data?.length) break

        const local = DB.get(entityType) || []
        const merged = mergeCollection(local, data)
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
        const lastAt = data[data.length - 1].updated_at
        if (lastAt) {
          cursors[entityType] = lastAt
          since = lastAt
        }
        if (data.length < 500) break
      }
    }

    if (newConflicts.length) {
      await this._saveConflicts(conflictList)
    }

    if (applied > 0) {
      await this._saveCursors(cursors, {
        cloudLastEntitySyncAt: new Date().toISOString(),
        cloudLastSyncDir: 'pull'
      })
      await DB.flush?.()
    } else if (newConflicts.length) {
      await DB.flush?.()
    } else {
      await this._saveCursors(cursors)
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
