/**
 * اتصال ثبت هزینه/برداشت به پرسنل · قرارداد · آلبوم/چاپ
 * - انتخاب پرسنل → نام، نقش، موبایل، پیشنهاد مبلغ
 * - دسته چاپ → قرارداد + مشتری + آلبوم الزامی‌تر
 * - ذخیره: contractId/personnelId/album همیشه از فرم خوانده شود
 */
(function (w) {
  'use strict'

  function couple(c) {
    if (!c) return ''
    return c.couple || (c.bride && c.groom ? c.bride + ' و ' + c.groom : c.bride || c.groom || '')
  }

  function roleLabel(p) {
    const roles = p?.roles || []
    if (typeof RolesHelper !== 'undefined' && RolesHelper.normalize) {
      return RolesHelper.normalize(roles)
        .map((r) => (RolesHelper.title ? RolesHelper.title(r) : r))
        .join('، ')
    }
    if (typeof getRoleTitle === 'function') {
      return roles.map((r) => getRoleTitle(r) || r).join('، ')
    }
    return roles.join('، ') || '—'
  }

  function injectAlbumField() {
    if (document.getElementById('tx-album')) return
    const cust = document.getElementById('tx-customer-fields')
    if (!cust) return
    const wrap = document.createElement('div')
    wrap.className = 'sm-form-field'
    wrap.id = 'tx-album-wrap'
    wrap.innerHTML =
      '<label class="sm-label">آلبوم / سفارش چاپ</label>' +
      '<input type="text" id="tx-album" class="sm-input" placeholder="مثلاً آلبوم ۳۰×۳۰ — کد سفارش" />' +
      '<p style="font-size:11px;opacity:.6;margin:4px 0 0">مرتبط با قرارداد انتخاب‌شده (مشتری و مراسم)</p>'
    cust.appendChild(wrap)
  }

  function injectPersonnelInfo() {
    let box = document.getElementById('tx-personnel-info')
    if (box) return box
    const pers = document.getElementById('tx-personnel-fields')
    if (!pers) return null
    box = document.createElement('div')
    box.id = 'tx-personnel-info'
    box.style.cssText =
      'display:none;margin:8px 0 12px;padding:12px;border-radius:12px;border:1px solid rgba(201,169,110,.35);background:rgba(201,169,110,.08);font-size:12.5px;line-height:1.7'
    pers.appendChild(box)
    return box
  }

  function showPersonnel(p) {
    const box = injectPersonnelInfo()
    if (!box) return
    if (!p) {
      box.style.display = 'none'
      box.innerHTML = ''
      return
    }
    const salary =
      p.salaryMonthly || p.salary || p.roleAmounts
        ? Number(p.salaryMonthly || p.salary || 0)
        : 0
    box.style.display = 'block'
    box.innerHTML =
      '<strong style="color:var(--sm-accent,#c9a96e)">' +
      escapeHtml(p.name || '—') +
      '</strong>' +
      '<div>نقش: ' +
      escapeHtml(roleLabel(p)) +
      '</div>' +
      '<div>موبایل: <span dir="ltr">' +
      escapeHtml(p.phone || '—') +
      '</span></div>' +
      (salary
        ? '<div>حقوق/مرجع: ' + Number(salary).toLocaleString('fa-IR') + ' تومان</div>'
        : '') +
      (p.status ? '<div>وضعیت: ' + escapeHtml(p.status) + '</div>' : '')
  }

  function escapeHtml(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
  }

  function enhanceBind() {
    if (typeof SMAccounting === 'undefined' || SMAccounting.__expenseLink) return
    SMAccounting.__expenseLink = true

    const orig = SMAccounting._bindTxFormFields?.bind(SMAccounting)
    if (!orig) return

    SMAccounting._bindTxFormFields = function (contracts, personnel) {
      orig(contracts, personnel)

      injectAlbumField()
      injectPersonnelInfo()

      const syncCat = () => {
        const cat = document.getElementById('tx-cat')?.value || ''
        const srcEl = document.getElementById('tx-source')
        const cust = document.getElementById('tx-customer-fields')
        const pers = document.getElementById('tx-personnel-fields')

        if (cat === 'personnel') {
          if (srcEl) srcEl.value = 'personnel'
          if (pers) pers.style.display = ''
          if (cust) cust.style.display = 'none'
        }
        if (cat === 'print' || cat === 'cancellation_refund') {
          if (srcEl && srcEl.value === 'other') srcEl.value = 'customer'
          if (cust) cust.style.display = ''
          injectAlbumField()
          const albumWrap = document.getElementById('tx-album-wrap')
          if (albumWrap) albumWrap.style.display = cat === 'print' ? '' : 'none'
        }
        if (cat === 'equipment') {
          if (cust) cust.style.display = ''
        }
      }

      document.getElementById('tx-cat')?.addEventListener('change', syncCat)
      document.getElementById('tx-source')?.addEventListener('change', () => {
        setTimeout(syncCat, 0)
      })

      document.getElementById('tx-personnel')?.addEventListener('change', (e) => {
        const p = (personnel || []).find((x) => x.id === e.target.value)
        showPersonnel(p)
        if (p) {
          const purpose = document.getElementById('tx-purpose')
          if (purpose && !purpose.value) {
            purpose.value = 'پرداخت پرسنل — ' + (p.name || '')
          }
          const amt = document.getElementById('tx-amt')
          if (amt && !amt.value && (p.salaryMonthly || p.salary)) {
            amt.value = String(p.salaryMonthly || p.salary)
          }
        }
      })

      document.getElementById('tx-contract')?.addEventListener('change', (e) => {
        const c = (contracts || []).find((x) => x.id === e.target.value)
        if (!c) return
        const client = document.getElementById('tx-client')
        if (client) client.value = couple(c)
        const purpose = document.getElementById('tx-purpose')
        const cat = document.getElementById('tx-cat')?.value
        if (purpose && !purpose.value && cat === 'print') {
          purpose.value = 'چاپ/آلبوم — ' + couple(c)
        }
        // پیشنهاد نام آلبوم از پکیج قرارداد اگر باشد
        const album = document.getElementById('tx-album')
        if (album && !album.value) {
          const pkg =
            c.packageName ||
            c.album ||
            c.albumType ||
            (Array.isArray(c.packages) ? c.packages.map((x) => x.name || x).join('، ') : '') ||
            c.package ||
            ''
          if (pkg) album.value = String(pkg)
        }
      })

      // مقدار اولیه اگر ویرایش
      const pid = document.getElementById('tx-personnel')?.value
      if (pid) {
        showPersonnel((personnel || []).find((x) => x.id === pid))
      }
      syncCat()
    }
  }

  function enrichPayload(data) {
    if (!data || typeof data !== 'object') return data
    try {
      const contractId = document.getElementById('tx-contract')?.value || data.contractId || ''
      const personnelId = document.getElementById('tx-personnel')?.value || data.personnelId || ''
      const album = document.getElementById('tx-album')?.value?.trim() || data.album || ''
      const clientField = document.getElementById('tx-client')?.value || data.client || ''

      if (contractId) data.contractId = contractId
      if (personnelId) data.personnelId = personnelId
      if (album) data.album = album

      if (personnelId && typeof DB !== 'undefined') {
        const p = DB.find('personnel', (x) => x.id === personnelId)
        if (p) {
          data.personnelName = p.name || ''
          data.personnelPhone = p.phone || ''
          data.personnelRoles = p.roles || []
          if (!data.client || data.client === '—') data.client = p.name
        }
      }

      if (contractId && typeof DB !== 'undefined') {
        const c = DB.find('contracts', (x) => x.id === contractId)
        if (c) {
          data.client = clientField || couple(c) || data.client
          data.contractNum = c.contractNum || ''
          data.eventDate = c.eventDate || c.date || ''
          if (album) data.notes = [data.notes || '', 'آلبوم/چاپ: ' + album].filter(Boolean).join(' | ')
        }
      }

      // اگر دسته پرسنل است source را درست کن
      if (data.purposeCategory === 'personnel' && !data.sourceType) data.sourceType = 'personnel'
      if (data.purposeCategory === 'print' && !data.sourceType) data.sourceType = 'customer'
    } catch (e) {
      console.warn('[eng-expense-link]', e)
    }
    return data
  }

  function patchSecureDb() {
    if (typeof SecureDB === 'undefined' || SecureDB.__expenseLink) return
    SecureDB.__expenseLink = true

    ;['insert', 'update'].forEach((fn) => {
      const orig = SecureDB[fn]?.bind(SecureDB)
      if (!orig) return
      SecureDB[fn] = async function (table, a, b) {
        if (table === 'transactions') {
          if (fn === 'insert') return orig(table, enrichPayload(a))
          if (fn === 'update') return orig(table, a, enrichPayload({ ...(b || {}) }))
        }
        return fn === 'insert' ? orig(table, a) : orig(table, a, b)
      }
    })
  }

  function boot() {
    enhanceBind()
    patchSecureDb()
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      setTimeout(boot, 600)
      setTimeout(boot, 2000)
    })
  } else {
    setTimeout(boot, 600)
    setTimeout(boot, 2000)
  }

  w.EngExpenseLink = { enrichPayload, showPersonnel }
})(typeof window !== 'undefined' ? window : globalThis)
