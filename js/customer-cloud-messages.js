/* Secure cross-device customer chat backed by Supabase RLS. */
const CustomerCloudMessages = {
  _pulling: false,
  _lastPullAt: 0,

  _attachment(row) {
    if (!row.attachment_path) return null
    return {
      storagePath: row.attachment_path,
      name: row.attachment_name || 'پیوست',
      mime: row.attachment_mime || 'application/octet-stream',
      size: Number(row.attachment_size) || 0
    }
  },

  _threadEntry(row) {
    const d = new Date(row.created_at)
    return {
      id: `cloud-${row.id}`,
      cloudId: row.id,
      author: row.sender_kind,
      authorName: row.sender_name || '',
      text: row.body || '',
      date: Number.isNaN(d.getTime()) ? Utils.todayJalali() : Utils.formatJalaliDateTime(d.getTime()).split(' ')[0],
      time: Number.isNaN(d.getTime()) ? '' : `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`,
      at: row.created_at,
      action: 'reply',
      attachment: this._attachment(row),
      readBy: [row.sender_kind]
    }
  },

  async pullIntoLocal({ contractLocalId = '', force = false } = {}) {
    if (this._pulling || typeof Cloud === 'undefined' || !Cloud.isConfigured?.()) return { ok: false, skipped: true }
    if (!force && Date.now() - this._lastPullAt < 15000) return { ok: false, skipped: true }
    this._pulling = true
    try {
      const result = await Cloud.listPortalMessages({ contractLocalId })
      if (!result.ok) return result
      let applied = 0
      for (const row of result.messages) {
        const key = String(row.request_key || row.id)
        let req = DB.find('customerRequests', item => String(item.id) === key)
        const entry = this._threadEntry(row)
        if (req?.thread?.some(item => item.cloudId === row.id)) continue
        if (!req) {
          const contract = DB.find('contracts', item => String(item.id) === String(row.contract_local_id))
          req = DB.insert('customerRequests', {
            id: key,
            contractId: row.contract_local_id,
            contractNum: contract?.contractNum || '',
            type: row.request_type || 'message',
            text: row.body || (row.attachment_name ? `پیوست: ${row.attachment_name}` : ''),
            status: 'pending',
            read: row.sender_kind !== 'customer',
            readByStaff: row.sender_kind !== 'customer',
            customerName: contract?.couple || `${contract?.bride || ''} و ${contract?.groom || ''}`.trim(),
            createdAt: entry.date,
            createdTime: entry.time,
            lastActivityAt: row.created_at,
            _cloudContractId: row.contract_id,
            _cloudStudioId: row.studio_id,
            thread: [entry]
          })
        } else {
          const thread = [...InboxShared.ensureThread(req), entry]
            .sort((a, b) => String(a.at || '').localeCompare(String(b.at || '')))
          DB.update('customerRequests', req.id, {
            thread,
            lastActivityAt: row.created_at,
            _cloudContractId: req._cloudContractId || row.contract_id,
            _cloudStudioId: req._cloudStudioId || row.studio_id
          })
        }
        applied++
      }
      if (applied) await DB.flush?.()
      this._lastPullAt = Date.now()
      return { ok: true, applied }
    } finally {
      this._pulling = false
    }
  },

  async send(req, entry) {
    if (typeof Cloud === 'undefined' || !Cloud.isConfigured?.() || !await Cloud.session?.()) {
      return { ok: false, skipped: true, error: 'نشست ابری فعال نیست' }
    }
    const result = await Cloud.sendPortalMessage({
      contractLocalId: req.contractId,
      contractId: req._cloudContractId || '',
      requestKey: req.id,
      requestType: req.type || 'message',
      senderKind: entry.author || 'customer',
      senderName: entry.authorName || '',
      body: entry.text || '',
      attachment: entry.attachment || null
    })
    if (result?.ok && result.message?.id) entry.cloudId = result.message.id
    return result
  },

  async openAttachment(storagePath) {
    if (!storagePath || typeof FileStorage === 'undefined') return
    const result = await FileStorage.signedUrl(storagePath, 300)
    if (!result.ok) return Utils.toast(result.error || 'بازکردن پیوست ناموفق بود', 'error')
    window.open(result.url, '_blank', 'noopener,noreferrer')
  }
}

window.CustomerCloudMessages = CustomerCloudMessages
