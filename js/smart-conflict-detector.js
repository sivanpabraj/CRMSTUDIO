/**
 * CRMSTUDIO — Smart Conflict Detector
 * موتور هوشمند تشخیص تداخل آفیش پرسنل و رزرو تجهیزات استودیو
 */

(function (window) {
  'use strict'

  function getDB() {
    if (typeof DB !== 'undefined') return DB
    if (typeof window !== 'undefined' && window.DB) return window.DB
    return null
  }

  const SmartConflictDetector = {
    /**
     * بررسی تداخل رزرو یک پرسنل در یک تاریخ مشخص
     */
    checkPersonnelConflict(opts = {}) {
      const {
        personnelId = '',
        date = '',
        excludeContractId = ''
      } = opts

      const db = getDB()
      if (!personnelId || !date || !db) {
        return { hasConflict: false, conflicts: [] }
      }

      const conflicts = []
      const normDate = String(date).trim()

      // ۱. بررسی جدول آفیش‌های پرسنل (persProjects)
      const persProjects = db.get('persProjects') || []
      persProjects.forEach(p => {
        if (p.personnelId !== personnelId) return
        if (excludeContractId && p.contractId === excludeContractId) return
        if (p.status === 'rejected' || p.status === 'cancelled') return

        const pDate = String(p.eventDate || p.reserveDate || '').trim()
        if (pDate && pDate === normDate) {
          const linkedContract = db.find ? db.find('contracts', x => x.id === p.contractId) : (db.get('contracts') || []).find(x => x.id === p.contractId)
          const coupleName = p.couple || linkedContract?.couple || (linkedContract ? `${linkedContract.bride || ''} و ${linkedContract.groom || ''}`.trim() : '') || 'پروژه استودیو'

          conflicts.push({
            type: 'persProjects',
            contractId: p.contractId || '',
            contractNum: p.contractNum || linkedContract?.contractNum || '',
            couple: coupleName,
            role: p.role || p.roleId || 'عضو تیم',
            date: pDate,
            status: p.status || 'invited'
          })
        }
      })

      // ۲. بررسی مستقیم جدول قراردادها (contracts)
      const contracts = db.get('contracts') || []
      contracts.forEach(c => {
        if (excludeContractId && c.id === excludeContractId) return
        if (c.status === 'cancelled') return

        const cDate = String(c.eventDate || c.date || '').trim()
        if (cDate !== normDate) return

        let isAssigned = false
        let assignedRole = ''

        const team = [
          ...(Array.isArray(c.team) ? c.team : []),
          ...(Array.isArray(c.staff) ? c.staff : []),
          ...(Array.isArray(c.assignments) ? c.assignments : [])
        ]

        team.forEach(m => {
          const pid = typeof m === 'string' ? m : (m.personnelId || m.id || m.personId)
          if (pid === personnelId) {
            isAssigned = true
            assignedRole = m.role || m.roleTitle || m.roleId || 'عضو تیم'
          }
        })

        ;['photographerId', 'videographerId', 'editorId', 'cameraId'].forEach(k => {
          if (c[k] === personnelId) {
            isAssigned = true
            assignedRole = k.replace(/Id$/, '')
          }
        })

        if (isAssigned) {
          // جلوگیری از ثبت تکراری اگر قبلاً در persProjects بوده
          const already = conflicts.some(x => x.contractId === c.id)
          if (!already) {
            conflicts.push({
              type: 'contract',
              contractId: c.id,
              contractNum: c.contractNum || '',
              couple: c.couple || `${c.bride || ''} و ${c.groom || ''}`.trim() || 'قرارداد',
              role: assignedRole,
              date: cDate,
              status: c.status || 'active'
            })
          }
        }
      })

      return {
        hasConflict: conflicts.length > 0,
        conflicts
      }
    },

    /**
     * بررسی تداخل رزرو یک تجهیز استودیو (دوربین، لنز، رونین، هلی‌شات و...) در یک تاریخ مشخص
     */
    checkEquipmentConflict(opts = {}) {
      const {
        equipmentId = '',
        date = '',
        excludeContractId = ''
      } = opts

      const db = getDB()
      if (!equipmentId || !date || !db) {
        return { hasConflict: false, conflicts: [] }
      }

      const conflicts = []
      const normDate = String(date).trim()
      const equipmentList = db.get('equipment') || []
      const item = equipmentList.find(e => e.id === equipmentId)

      if (item) {
        // وضعیت تعمیر یا خارج از سرویس
        if (item.status === 'maintenance' || item.status === 'retired') {
          conflicts.push({
            type: 'status',
            equipmentId,
            equipmentName: item.name || 'تجهیز استودیو',
            reason: item.status === 'maintenance' ? 'در دست تعمیر و سرویس' : 'خارج از سرویس',
            date: normDate
          })
        }

        // رزرو در همان تاریخ روی پروژه دیگر
        const assignedDate = String(item.assignedDate || '').trim()
        if (assignedDate === normDate && item.assignedContractId && item.assignedContractId !== excludeContractId) {
          conflicts.push({
            type: 'overlap',
            equipmentId,
            equipmentName: item.name || 'تجهیز استودیو',
            contractId: item.assignedContractId,
            couple: item.assignedCouple || 'پروژه دیگر',
            date: assignedDate
          })
        }
      }

      return {
        hasConflict: conflicts.length > 0,
        conflicts,
        item
      }
    },

    /**
     * اسکن جامع کلیه تداخل‌های یک قرارداد (پرسنل + تجهیزات)
     */
    checkContractConflicts(contract = {}) {
      if (!contract) return { hasConflicts: false, personnelConflicts: [], equipmentConflicts: [] }
      const eventDate = String(contract.eventDate || contract.date || '').trim()
      if (!eventDate) return { hasConflicts: false, personnelConflicts: [], equipmentConflicts: [] }

      const personnelConflicts = []
      const equipmentConflicts = []

      // بررسی پرسنل قرارداد
      const team = [
        ...(Array.isArray(contract.team) ? contract.team : []),
        ...(Array.isArray(contract.staff) ? contract.staff : []),
        ...(Array.isArray(contract.assignments) ? contract.assignments : [])
      ]

      team.forEach(m => {
        const pid = typeof m === 'string' ? m : (m.personnelId || m.id || m.personId)
        if (pid) {
          const res = this.checkPersonnelConflict({
            personnelId: pid,
            date: eventDate,
            excludeContractId: contract.id
          })
          if (res.hasConflict) {
            personnelConflicts.push({
              personnelId: pid,
              personnelName: m.name || m.personnelName || 'پرسنل استودیو',
              conflicts: res.conflicts
            })
          }
        }
      })

      // بررسی تجهیزات تخصیص داده شده به قرارداد
      const eqIds = Array.isArray(contract.equipmentIds) ? contract.equipmentIds : []
      eqIds.forEach(eid => {
        const res = this.checkEquipmentConflict({
          equipmentId: eid,
          date: eventDate,
          excludeContractId: contract.id
        })
        if (res.hasConflict) {
          equipmentConflicts.push({
            equipmentId: eid,
            conflicts: res.conflicts
          })
        }
      })

      const hasConflicts = personnelConflicts.length > 0 || equipmentConflicts.length > 0

      return {
        hasConflicts,
        personnelConflicts,
        equipmentConflicts,
        eventDate
      }
    },

    /**
     * رندر بنر هشدار هوشمند تداخل
     */
    renderConflictHtml(scanResult = {}) {
      if (!scanResult || !scanResult.hasConflicts) return ''

      const items = []
      ;(scanResult.personnelConflicts || []).forEach(p => {
        p.conflicts.forEach(c => {
          items.push(`
            <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 12px;background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.25);border-radius:10px;margin-bottom:6px">
              <div>
                <strong style="color:#ef4444"><i class="fas fa-triangle-exclamation"></i> تداخل پرسنل: ${p.personnelName}</strong>
                <div style="font-size:0.75rem;color:rgba(255,255,255,0.7);margin-top:2px">
                  هم‌زمان در تاریخ ${scanResult.eventDate} در قرارداد «${c.couple}» (${c.role}) رزرو است.
                </div>
              </div>
              <span class="sm-badge sm-badge-danger" style="font-size:0.7rem">هم‌پوشانی آفیش</span>
            </div>
          `)
        })
      })

      ;(scanResult.equipmentConflicts || []).forEach(e => {
        e.conflicts.forEach(c => {
          items.push(`
            <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 12px;background:rgba(245,158,11,0.1);border:1px solid rgba(245,158,11,0.25);border-radius:10px;margin-bottom:6px">
              <div>
                <strong style="color:#f59e0b"><i class="fas fa-camera"></i> تداخل تجهیز: ${c.equipmentName || 'دستگاه'}</strong>
                <div style="font-size:0.75rem;color:rgba(255,255,255,0.7);margin-top:2px">
                  ${c.reason || `در تاریخ ${scanResult.eventDate} در پروژه «${c.couple}» استفاده می‌شود.`}
                </div>
              </div>
              <span class="sm-badge sm-badge-warning" style="font-size:0.7rem">رزرو هم‌زمان</span>
            </div>
          `)
        })
      })

      return `
        <div class="sm-conflict-alert-wrap" style="margin-bottom:16px;background:rgba(22,24,29,0.85);border:1px solid rgba(239,68,68,0.3);border-radius:14px;padding:14px;box-shadow:0 8px 24px rgba(239,68,68,0.15)">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;color:#ef4444;font-weight:800;font-size:0.9rem">
            <i class="fas fa-shield-halved"></i>
            هوش مصنوعی استودیو: هشدار تداخل زمانی و تجهیزاتی
          </div>
          ${items.join('')}
        </div>
      `
    }
  }

  window.SmartConflictDetector = SmartConflictDetector
})(typeof window !== 'undefined' ? window : globalThis)
