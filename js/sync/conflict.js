/**
 * Studio M Phase 2/3 — Per-row merge + conflict detection
 */

const META_KEYS = new Set([
  '_syncRev', '_syncMutationId', '_serverRevision', '_serverSeq',
  'updatedAtIso', 'updatedAt', 'updated_at', 'createdAt'
])

export function parseTime(v) {
  if (!v) return 0
  const t = Date.parse(v)
  return Number.isFinite(t) ? t : 0
}

export function stripMeta(item) {
  if (!item || typeof item !== 'object') return item
  const copy = { ...item }
  for (const k of META_KEYS) delete copy[k]
  return copy
}

/** @returns {'local'|'remote'|'equal'} */
export function compareRows(localItem, remotePayload, remoteUpdatedAt) {
  const localT = parseTime(localItem?.updatedAtIso || localItem?.updated_at || localItem?.updatedAt)
  const remoteT = parseTime(remoteUpdatedAt)
  if (remoteT > localT) return 'remote'
  if (localT > remoteT) return 'local'
  return 'equal'
}

/** Detect concurrent edit needing user choice */
export function detectConflict(localItem, remoteRow) {
  if (!localItem || !remoteRow?.payload) return false
  const localJson = JSON.stringify(stripMeta(localItem))
  const remoteJson = JSON.stringify(stripMeta(remoteRow.payload))
  if (localJson === remoteJson) return false
  if (!localItem._syncMutationId) return false
  const localRev = Number(localItem._serverRevision) || 0
  const remoteRev = Number(remoteRow.revision) || 0
  return localRev !== remoteRev
}

export function mergeCollection(localItems, remoteRows, { idKey = 'id', onConflict } = {}) {
  const byId = new Map((localItems || []).map(i => [String(i[idKey]), i]))
  let applied = 0
  let skipped = 0
  const conflicts = []

  for (const row of remoteRows || []) {
    const localId = String(row.local_id || row.payload?.[idKey] || '')
    if (!localId) continue
    const local = byId.get(localId)

    if (local && detectConflict(local, row)) {
      const entry = {
        entityType: '',
        localId,
        local: { ...local },
        remote: { ...row.payload },
        remoteUpdatedAt: row.updated_at,
        remoteRevision: row.revision
      }
      conflicts.push(entry)
      if (typeof onConflict === 'function') onConflict(entry)
      skipped++
      continue
    }

    const remoteRevision = Number(row.revision) || 0
    const localRevision = Number(local?._serverRevision) || 0
    if (!local || remoteRevision >= localRevision) {
      const next = {
        ...row.payload,
        id: localId,
        updatedAtIso: row.updated_at,
        _serverRevision: remoteRevision,
        _serverSeq: Number(row.updated_seq) || 0
      }
      delete next._syncMutationId
      if (row.payload?._deleted) {
        next._deleted = true
        next.deletedAtIso = row.payload.deletedAtIso || row.updated_at
      }
      byId.set(localId, next)
      applied++
    } else {
      skipped++
    }
  }

  return {
    items: Array.from(byId.values()),
    applied,
    skipped,
    conflicts
  }
}
