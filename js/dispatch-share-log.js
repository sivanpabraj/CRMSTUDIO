/**
 * Dispatch shareLog — records multi-channel contract sends
 * Extends DispatchHub without rewriting the whole module.
 * Load AFTER dispatch-hub.js
 */
(function () {
  if (typeof window === 'undefined') return

  function ensureHub() {
    return window.DispatchHub || null
  }

  /**
   * Persist share event on contract
   * @param {string} contractId
   * @param {{channel:string, target?:string, ok?:boolean, note?:string}} entry
   */
  async function recordShare(contractId, entry) {
    if (!contractId || typeof DB === 'undefined') return { ok: false, error: 'no-db' }
    const c = DB.find('contracts', (x) => x.id === contractId || String(x.contractNum) === String(contractId))
    if (!c) return { ok: false, error: 'contract-not-found' }

    const log = Array.isArray(c.shareLog) ? c.shareLog.slice() : []
    log.push({
      id: 'sh_' + Date.now().toString(36),
      channel: entry.channel || 'unknown',
      target: entry.target || '',
      ok: entry.ok !== false,
      note: entry.note || '',
      at: Date.now(),
      atJalali: (typeof Utils !== 'undefined' && Utils.todayJalali) ? Utils.todayJalali() : null
    })
    // keep last 40
    while (log.length > 40) log.shift()

    try {
      if (typeof SecureDB !== 'undefined' && SecureDB.update) {
        await SecureDB.update('contracts', c.id, { shareLog: log, lastSharedAt: Date.now() })
      } else {
        c.shareLog = log
        c.lastSharedAt = Date.now()
        if (DB.flush) await DB.flush()
      }
      return { ok: true, log }
    } catch (e) {
      return { ok: false, error: String(e && e.message || e) }
    }
  }

  function lastShareChips(contract) {
    const log = (contract && contract.shareLog) || []
    if (!log.length) return ''
    const last = log.slice(-3).reverse()
    const labels = { whatsapp: 'واتساپ', eitaa: 'ایتا', bale: 'بله', telegram: 'تلگرام', email: 'ایمیل', copy: 'کپی' }
    return last.map((e) => {
      const cls = e.channel === 'whatsapp' ? 'share-log-chip--wa' : e.channel === 'email' ? 'share-log-chip--email' : ''
      const name = labels[e.channel] || e.channel
      const when = e.atJalali || ''
      return `<span class="share-log-chip ${cls}" title="${when}"><i class="fas fa-check"></i> ${name}</span>`
    }).join(' ')
  }

  function wrapOpen(fnName, channel) {
    const hub = ensureHub()
    if (!hub || typeof hub[fnName] !== 'function') return
    const orig = hub[fnName].bind(hub)
    hub[fnName] = function () {
      const args = arguments
      const result = orig.apply(hub, args)
      try {
        // Best-effort: contract id may be on last modal dataset
        const modal = document.getElementById('dispatch-hub-modal')
        const cid = modal && modal.dataset && modal.dataset.contractId
        if (cid) recordShare(cid, { channel, target: String(args[0] || ''), ok: true })
      } catch { /* */ }
      return result
    }
  }

  function enhanceModal() {
    const hub = ensureHub()
    if (!hub || typeof hub.showContractShareModal !== 'function') return
    const orig = hub.showContractShareModal.bind(hub)
    hub.showContractShareModal = function (contract) {
      orig(contract)
      const modal = document.getElementById('dispatch-hub-modal')
      if (modal && contract) {
        modal.dataset.contractId = contract.id || ''
        // Wire buttons if ids exist
        const map = [
          ['dh-btn-wa', 'whatsapp', () => hub.openWhatsApp(contract.groomPhone || contract.phoneGroom || contract.phone || '', hub.buildContractShareContent(contract).text)],
          ['dh-btn-eitaa', 'eitaa', null],
          ['dh-btn-bale', 'bale', null],
          ['dh-btn-tg', 'telegram', null],
          ['dh-btn-copy', 'copy', null]
        ]
        map.forEach(([id, channel]) => {
          const el = document.getElementById(id)
          if (!el) return
          el.addEventListener('click', () => {
            recordShare(contract.id, { channel, ok: true })
          }, { once: false })
        })
      }
    }
  }

  // Public API
  window.DispatchShareLog = {
    recordShare,
    lastShareChips,
    enhanceModal
  }

  // Auto-enhance when DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', enhanceModal)
  } else {
    setTimeout(enhanceModal, 0)
  }

  // Also wrap primitive openers
  setTimeout(() => {
    wrapOpen('openWhatsApp', 'whatsapp')
    wrapOpen('openEitaa', 'eitaa')
    wrapOpen('openBale', 'bale')
    wrapOpen('openTelegram', 'telegram')
  }, 50)
})()
