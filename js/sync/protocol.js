export function mutationKey(entityType, item) {
  return item._syncMutationId || `${entityType}:${item.id}:bootstrap:${Number(item._syncRev) || 1}`
}

export function toAuthoritativeCommand(entityType, item) {
  const payload = { ...item }
  delete payload._serverRevision
  delete payload._serverSeq
  delete payload._syncMutationId
  return {
    local_id: String(item.id),
    idempotency_key: mutationKey(entityType, item),
    op: item._deleted ? 'delete' : 'upsert',
    expected_revision: Number(item._serverRevision) || 0,
    ...(!item._deleted ? { payload } : {}),
  }
}

export function reconcilePush(items, submitted, results) {
  const byId = new Map((results || []).map(result => [String(result.local_id), result]))
  const submittedById = new Map((submitted || []).map(command => [String(command.local_id), command]))
  return (items || []).map(item => {
    const result = byId.get(String(item.id))
    const command = submittedById.get(String(item.id))
    if (!result || !command) return item
    const currentKey = item._syncMutationId || mutationKey('', item)
    const unchanged = item._syncMutationId
      ? currentKey === command.idempotency_key
      : command.idempotency_key.includes(':bootstrap:')
    if (!unchanged) return item
    const next = { ...item, _serverRevision: Number(result.revision), _serverSeq: Number(result.updated_seq) }
    delete next._syncMutationId
    return next
  })
}

export function normalizeDelta(row) {
  return {
    ...row,
    payload: {
      ...(row.payload || {}),
      _serverRevision: Number(row.revision) || 0,
      _serverSeq: Number(row.updated_seq) || 0,
    },
  }
}

export function nextSequenceCursor(rows, fallback = { seq: 0, id: '00000000-0000-0000-0000-000000000000' }) {
  if (!rows?.length) return fallback
  const last = rows[rows.length - 1]
  return { seq: Number(last.updated_seq) || 0, id: String(last.id) }
}
