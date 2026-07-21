/**
 * Studio M Phase 2/3 — Per-row merge + conflict detection
 */

const META_KEYS = new Set(['_syncRev', 'updatedAtIso', 'updatedAt', 'updated_at', 'createdAt'])

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
  const verdict = compareRows(localItem, remoteRow.payload, remoteRow.updated_at)
  const localJson = JSON.stringify(stripMeta(localItem))
  const remoteJson = JSON.stringify(stripMeta(remoteRow.payload))
  if (localJson === remoteJson) return false

  if (verdict === 'equal') return true

  const localRev = Number(localItem._syncRev) || 0
  const remoteRev = Number(remoteRow.revision) || 0
  if (localRev > 0 && remoteRev > 0 && localRev !== remoteRev) {
    const localT = parseTime(localItem.updatedAtIso)
    const remoteT = parseTime(remoteRow.updated_at)
    if (Math.abs(localT - remoteT) < 120000) return true
  }
  return false
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

    const verdict = compareRows(local, row.payload, row.updated_at)
    if (verdict === 'remote' || (!local && row.payload)) {
      const next = {
        ...row.payload,
        id: localId,
        updatedAtIso: row.updated_at
      }
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
