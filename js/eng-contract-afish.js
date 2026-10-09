/**
 * قرارداد → آفیش پرسنل
 * وقتی قرارداد تیم/نقش دارد، persProjects با accepted:null ساخته می‌شود
 */
;(function (w) {
  'use strict'

  function today() {
    try {
      return Utils.todayJalali()
    } catch {
      return new Date().toISOString().slice(0, 10)
    }
  }

  function ensureAfishFromContract(contract) {
    if (!contract || !contract.id || typeof DB === 'undefined') return []
    const created = []

    // ساختارهای رایج تیم روی قرارداد
    const team = []
    const pushMember = (m, roleHint) => {
      if (!m) return
      if (typeof m === 'string') {
        team.push({ personnelId: m, roleId: roleHint || 'other' })
        return
      }
      const pid = m.personnelId || m.id || m.personId
      if (!pid) return
      team.push({
        personnelId: pid,
        roleId: m.roleId || m.role || roleHint || 'other',
        role: m.roleTitle || m.roleName || m.role || '',
        amount: Number(m.amount || m.fee || 0),
        name: m.name || m.personnelName || ''
      })
    }

    if (Array.isArray(contract.team)) contract.team.forEach((m) => pushMember(m))
    if (Array.isArray(contract.staff)) contract.staff.forEach((m) => pushMember(m))
    if (Array.isArray(contract.assignments)) contract.assignments.forEach((m) => pushMember(m))
    if (Array.isArray(contract.personnel)) contract.personnel.forEach((m) => pushMember(m))

    // فیلدهای تکی رایج
    ;['photographerId', 'videographerId', 'editorId', 'cameraId'].forEach((k) => {
      if (contract[k]) pushMember(contract[k], k.replace(/Id$/, ''))
    })

    const existing = DB.get('persProjects') || []
    team.forEach((m) => {
      const dup = existing.find(
        (p) =>
          p.contractId === contract.id &&
          p.personnelId === m.personnelId &&
          String(p.roleId || p.role) === String(m.roleId || m.role)
      )
      if (dup) return

      const pers = (DB.get('personnel') || []).find((x) => x.id === m.personnelId)
      const couple =
        contract.couple || `${contract.bride || ''} و ${contract.groom || ''}`.trim() || 'قرارداد'
      const row = {
        id: 'pp_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
        contractId: contract.id,
        contractNum: contract.contractNum || '',
        personnelId: m.personnelId,
        personnelName: m.name || pers?.name || '',
        couple,
        roleId: m.roleId,
        role: m.role || m.roleId,
        amount: m.amount || 0,
        paid: 0,
        accepted: null,
        status: 'invited',
        eventDate: contract.eventDate || contract.date || '',
        reserveDate: contract.eventDate || contract.date || '',
        deadline: contract.deliveryDate || contract.deadline || '',
        deliveryDate: contract.deliveryDate || '',
        createdAt: today(),
        source: 'contract-auto'
      }
      try {
        if (typeof SecureDB !== 'undefined' && SecureDB.insert) {
          SecureDB.insert('persProjects', row).catch(() => {})
        }
        existing.push(row)
        DB.set('persProjects', existing)
        created.push(row)
        try {
          w.EngStaffNotify?.onNewAfish?.(row)
        } catch { /* */ }
      } catch (e) {
        console.warn('[eng-afish]', e)
      }
    })

    try {
      DB.flush?.()
    } catch { /* */ }
    return created
  }

  function patchDb() {
    if (typeof SecureDB === 'undefined' || SecureDB.__afishPatch) return
    SecureDB.__afishPatch = true
    const wrap = (fnName) => {
      const orig = SecureDB[fnName]?.bind(SecureDB)
      if (!orig) return
      SecureDB[fnName] = async function (table, a, b) {
        const res = await orig(table, a, b)
        try {
          if (table === 'contracts') {
            const c =
              fnName === 'insert'
                ? a
                : fnName === 'update'
                  ? { ...(DB.find('contracts', (x) => x.id === a) || {}), ...(b || {}) }
                  : null
            if (c && c.id) ensureAfishFromContract(c)
          }
        } catch (e) {
          console.warn('[eng-afish] hook', e)
        }
        return res
      }
    }
    wrap('insert')
    wrap('update')
  }

  function boot() {
    patchDb()
    // API عمومی برای دکمه مدیر
    w.EngContractAfish = { ensureAfishFromContract }
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(boot, 800))
    else setTimeout(boot, 800)
  } else {
    boot()
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { ensureAfishFromContract }
  }
})(typeof window !== 'undefined' ? window : globalThis)
