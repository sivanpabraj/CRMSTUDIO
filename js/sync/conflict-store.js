/**
 * Studio M Phase 3 — Conflict queue (stored in studioInfo.syncConflicts)
 */

export function conflictKey(entityType, localId) {
  return `${entityType}:${localId}`
}

export function listConflicts(studioInfo) {
  const list = studioInfo?.syncConflicts
  return Array.isArray(list) ? list : []
}

export function upsertConflict(studioInfo, entry) {
  const list = listConflicts(studioInfo)
  const key = conflictKey(entry.entityType, entry.localId)
  const idx = list.findIndex(c => conflictKey(c.entityType, c.localId) === key)
  const next = {
    id: entry.id || key,
    entityType: entry.entityType,
    localId: String(entry.localId),
    local: entry.local,
    remote: entry.remote,
    remoteUpdatedAt: entry.remoteUpdatedAt,
    remoteRevision: entry.remoteRevision || 0,
    detectedAt: entry.detectedAt || new Date().toISOString()
  }
  if (idx >= 0) list[idx] = next
  else list.push(next)
  return list
}

export function removeConflict(studioInfo, entityType, localId) {
  const key = conflictKey(entityType, localId)
  return listConflicts(studioInfo).filter(c => conflictKey(c.entityType, c.localId) !== key)
}

export function conflictCount(studioInfo) {
  return listConflicts(studioInfo).length
}

/**
 * Apply user resolution: 'local' | 'remote'
 * @returns {object|null} merged item for collection
 */
export function resolveConflict(entry, choice) {
  if (!entry) return null
  if (choice === 'remote') {
    return {
      ...entry.remote,
      id: entry.localId,
      updatedAtIso: entry.remoteUpdatedAt,
      _syncRev: Math.max(Number(entry.remote._syncRev) || 0, Number(entry.remoteRevision) || 0) + 1
    }
  }
  return {
    ...entry.local,
    id: entry.localId,
    updatedAtIso: new Date().toISOString(),
    _syncRev: (Number(entry.local._syncRev) || 0) + 1
  }
}
