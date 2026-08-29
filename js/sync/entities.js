/**
 * Studio M Phase 2 — Entity sync registry
 */

/** @typedef {{ table?: string, rpc?: boolean, excludeFields?: string[] }} EntityConfig */

export const SYNC_ENTITIES = [
  'bookings',
  'personnel',
  'equipment',
  'workflows',
  'packages',
  'leads',
  'appointments',
  'customerRequests',
  'fileAssets',
  'attendance',
  'notifications',
  'calendarReminders',
  'galleries',
  'customerCustody'
]

/** Collections that soft-delete (tombstone) instead of hard-splice */
export const TOMBSTONE_ENTITIES = new Set(SYNC_ENTITIES)

/** Collections never row-synced (snapshot / server-only) */
export const SYNC_EXCLUDED = new Set([
  // These domains are server-authoritative and may only change through typed
  // commands/RPCs. A browser-originated generic JSON payload is never trusted.
  'contracts',
  'transactions',
  'invoices',
  'expenses',
  'banks',
  'cheques',
  'salaryPayments',
  'persProjects',
  'persContracts',
  'users',
  'securityState',
  'logs',
  'apiKeys',
  'studioInfo',
  '_meta',
  'smsTemplates',
  'commLogs',
  'customRoles'
])

export const ENTITY_CONFIG = {
  contracts: { dedicatedTable: 'contracts' }
}

export function isSyncEntity(name) {
  return SYNC_ENTITIES.includes(name) && !SYNC_EXCLUDED.has(name)
}

export function isTombstoneEntity(name) {
  return TOMBSTONE_ENTITIES.has(name)
}

/** Active (non-deleted) rows helper for UI */
export function activeRows(items) {
  return (items || []).filter(i => i && !i._deleted)
}

export function stripSensitive(collection, item) {
  if (!item || typeof item !== 'object') return item
  const copy = { ...item }
  if (collection === 'users') {
    delete copy.password
    delete copy.salt
  }
  if (collection === 'fileAssets') {
    delete copy.data
  }
  delete copy._serverRevision
  delete copy._serverSeq
  delete copy._syncMutationId
  // Keep _deleted so tombstones sync to peers
  return copy
}

export function rowUpdatedAt(item) {
  if (!item) return ''
  return item.updatedAtIso || item.updated_at || item.updatedAt || ''
}

export function toSyncRow(studioId, entityType, item) {
  return {
    studio_id: studioId,
    entity_type: entityType,
    local_id: String(item.id),
    payload: stripSensitive(entityType, item),
    revision: Number(item._syncRev) || 1,
    updated_at: rowUpdatedAt(item) || new Date().toISOString()
  }
}

export function toRpcRow(item) {
  return {
    local_id: String(item.id),
    payload: item,
    revision: Number(item._syncRev) || 1,
    updated_at: rowUpdatedAt(item) || new Date().toISOString()
  }
}
