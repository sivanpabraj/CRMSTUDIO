/**
 * Finance reconciliation outbox. It retains receipts for commands already
 * accepted by the server; it never authorizes offline/local ledger commits.
 */
const FinanceOutbox = {
  COLLECTION: 'financeOutbox',
  _flushing: false,
  _bound: false,
  _volatile: new Map(),

  _rows() {
    if (typeof DB === 'undefined' || !DB.get) return []
    return DB.get(this.COLLECTION) || []
  },

  pending() {
    const durable = this._rows().filter(r => r && !r._deleted
      && ['pending', 'flushing', 'projection_pending'].includes(r.status))
    const seen = new Set(durable.map(r => r.idempotencyKey))
    return durable.concat([...this._volatile.values()].filter(r => !seen.has(r.idempotencyKey)))
  },

  async enqueue({ op, idempotencyKey, payload = {}, status = 'pending', serverResult = null }) {
    if (!op || !idempotencyKey) return { ok: false, error: 'invalid outbox entry' }
    const existing = this._rows().find(r => r.idempotencyKey === idempotencyKey && !r._deleted)
    if (existing) {
      if (existing.status === 'synced') return { ok: true, deduped: true, id: existing.id }
      if (status === 'projection_pending') {
        await this._patch(existing.id, { status, serverResult, payload: { ...payload }, lastError: '' })
      }
      return { ok: true, deduped: true, id: existing.id }
    }
    const row = {
      id: (typeof crypto !== 'undefined' && crypto.randomUUID)
        ? crypto.randomUUID()
        : `obx_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      op,
      idempotencyKey: String(idempotencyKey).slice(0, 128),
      payload: { ...payload },
      status,
      serverResult,
      attempts: 0,
      lastError: '',
      createdAtIso: new Date().toISOString(),
      updatedAtIso: new Date().toISOString()
    }
    if (typeof SecureDB !== 'undefined' && SecureDB.insert) {
      await SecureDB.insert(this.COLLECTION, row)
    } else if (typeof DB !== 'undefined' && DB.insert) {
      DB.insert(this.COLLECTION, row)
    }
    await DB.flush?.()
    if (typeof SMObservability !== 'undefined') {
      SMObservability.captureEvent('finance_outbox_enqueue', { op, idempotencyKey })
    }
    return { ok: true, id: row.id }
  },

  /** Durably remember a command already accepted by the server. */
  async recordAccepted({ op, idempotencyKey, payload = {}, serverResult = null }) {
    const fallback = {
      id: `volatile:${idempotencyKey}`,
      op, idempotencyKey, payload: { ...payload }, serverResult,
      status: 'projection_pending', attempts: 0, lastError: '',
      createdAtIso: new Date().toISOString(), updatedAtIso: new Date().toISOString()
    }
    this._volatile.set(idempotencyKey, fallback)
    try {
      const saved = await this.enqueue({ op, idempotencyKey, payload, status: 'projection_pending', serverResult })
      this._volatile.delete(idempotencyKey)
      return saved
    } catch (error) {
      return { ok: false, volatile: true, error: error?.message || 'reconciliation_receipt_not_persisted' }
    }
  },

  async markApplied(idempotencyKey) {
    this._volatile.delete(idempotencyKey)
    const row = this._rows().find(r => r.idempotencyKey === idempotencyKey && !r._deleted)
    if (row) await this._patch(row.id, { status: 'synced', lastError: '' })
  },

  async _patch(id, patch) {
    if (typeof SecureDB !== 'undefined' && SecureDB.update) {
      await SecureDB.update(this.COLLECTION, id, {
        ...patch,
        updatedAtIso: new Date().toISOString()
      })
    }
  },

  async markTxMutateStatus(payload, status) {
    try {
      const txId = payload?.transactionId || payload?.outTransactionId
      if (!txId || typeof SecureDB === 'undefined') return
      const tx = typeof DB.findActive === 'function'
        ? DB.findActive('transactions', t => t.id === txId)
        : DB.find?.('transactions', t => t.id === txId && !t._deleted)
      if (tx) await SecureDB.update('transactions', txId, { mutateStatus: status })
      if (payload?.inTransactionId) {
        await SecureDB.update('transactions', payload.inTransactionId, { mutateStatus: status })
      }
    } catch { /* best-effort */ }
  },

  /**
   * Retry the same idempotency key, then apply the authoritative projection.
   */
  async flush({ limit = 20 } = {}) {
    if (this._flushing) return { ok: true, skipped: true, reason: 'busy' }
    if (typeof StudioMutateClient === 'undefined' || !StudioMutateClient.authorize) {
      return { ok: false, error: 'mutate client missing' }
    }
    if (typeof StudioMutateClient.requiredWhenOnline === 'function'
      && !StudioMutateClient.requiredWhenOnline()
      && !(StudioMutateClient.enabled?.())) {
      return { ok: true, skipped: true, reason: 'not_required' }
    }

    const offline = typeof navigator !== 'undefined' && navigator.onLine === false
    if (offline) return { ok: true, skipped: true, reason: 'offline' }

    this._flushing = true
    let synced = 0
    let failed = 0
    let deferred = 0
    try {
      const batch = this.pending().slice(0, limit)
      for (const row of batch) {
        if (!String(row.id).startsWith('volatile:')) {
          await this._patch(row.id, { status: 'flushing', attempts: (row.attempts || 0) + 1 })
        }
        const res = await StudioMutateClient.authorize(row.op, row.payload || {}, {
          idempotencyKey: row.idempotencyKey
        })
        if (res.ok || res.deduped) {
          if (typeof FinanceSync === 'undefined' || typeof FinanceSync.reconcileAccepted !== 'function') {
            if (!String(row.id).startsWith('volatile:')) {
              await this._patch(row.id, { status: 'projection_pending', lastError: 'reconciler_missing' })
            }
            deferred++
            continue
          }
          try {
            await FinanceSync.reconcileAccepted(row, res.result || row.serverResult || null)
          } catch (error) {
            if (!String(row.id).startsWith('volatile:')) {
              await this._patch(row.id, { status: 'projection_pending', lastError: error?.message || 'projection_failed' })
            }
            deferred++
            continue
          }
          await this.markApplied(row.idempotencyKey)
          await this.markTxMutateStatus(row.payload, 'synced')
          if (res.result?.ledgerVersion != null && typeof SecureDB !== 'undefined') {
            const info = DB.get('studioInfo') || {}
            await SecureDB.merge('studioInfo', {
              ...info,
              ledgerVersion: res.result.ledgerVersion
            })
          }
          synced++
          continue
        }
        const queueable = !!res.retryable
          || !!res.queueable
          || res.reason === 'offline_blocked'
          || res.reason === 'no_cloud_session'
          || res.reason === 'network'
          || res.reason === 'no_endpoint'
          || res.reason === 'no_studio'
        if (queueable || res.status === 401 || res.status === 429) {
          await this._patch(row.id, { status: 'pending', lastError: res.error || res.reason || '' })
          deferred++
          continue
        }
        // Permanent rejection
        await this._patch(row.id, {
          status: 'failed',
          lastError: res.error || res.reason || 'rejected'
        })
        await this.markTxMutateStatus(row.payload, 'failed')
        failed++
        if (typeof SMObservability !== 'undefined') {
          SMObservability.captureError('finance_outbox_failed', new Error(res.error || 'rejected'), {
            op: row.op,
            idempotencyKey: row.idempotencyKey
          })
        }
      }
      await DB.flush?.()
      if (synced && typeof Utils !== 'undefined' && Utils.toast) {
        Utils.toast(`${synced} تراکنش صف‌شده با سرور همگام شد`, 'success')
      }
      return { ok: true, synced, failed, deferred }
    } finally {
      this._flushing = false
    }
  },

  bindAutoFlush() {
    if (this._bound || typeof window === 'undefined') return
    this._bound = true
    window.addEventListener('online', () => {
      this.flush().catch(() => {})
    })
    // Periodic soft flush while tab open
    setInterval(() => {
      if (this.pending().length) this.flush().catch(() => {})
    }, 45_000)
  }
}

if (typeof window !== 'undefined') {
  window.FinanceOutbox = FinanceOutbox
  try { FinanceOutbox.bindAutoFlush() } catch { /* */ }
}

export { FinanceOutbox }
