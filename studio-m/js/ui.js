/* Studio M Pro — UI Components */
const SMUI = {
  modal(title, bodyHtml, { onSave, onDelete, saveLabel, width, onBack } = {}) {
    const root = document.getElementById('sm-modal-root')
    const overlay = document.createElement('div')
    overlay.className = 'sm-modal-overlay'
    overlay.innerHTML = `
      <div class="sm-modal" style="${width ? `max-width:${width}px` : ''}" role="dialog" aria-modal="true">
        <div class="sm-modal-head">
          <button type="button" class="sm-btn-icon sm-modal-back" onclick="SMUI._modalBack()" title="${SM.t('back')}"><i class="fas fa-arrow-right"></i></button>
          <div class="sm-modal-title">${SM.esc(title)}</div>
          <button type="button" class="sm-btn-icon" onclick="SMUI.closeModal()" title="${SM.t('close')}"><i class="fas fa-times"></i></button>
        </div>
        <div class="sm-modal-body">${bodyHtml}</div>
        ${onSave ? `<div class="sm-modal-foot sm-modal-foot-split">
          ${onDelete ? `<button type="button" class="sm-btn sm-btn-danger" id="sm-modal-delete"><i class="fas fa-trash"></i> ${SM.t('delete')}</button>` : '<span></span>'}
          <div class="sm-modal-foot-actions">
            <button type="button" class="sm-btn sm-btn-ghost" onclick="SMUI._modalBack()"><i class="fas fa-arrow-right"></i> ${SM.t('back')}</button>
            <button type="button" class="sm-btn sm-btn-primary" id="sm-modal-save">${SM.esc(saveLabel || SM.t('save'))}</button>
          </div>
        </div>` : `<div class="sm-modal-foot">
          <button type="button" class="sm-btn sm-btn-ghost" onclick="SMUI._modalBack()"><i class="fas fa-arrow-right"></i> ${SM.t('back')}</button>
        </div>`}
      </div>`
    root.innerHTML = ''
    root.appendChild(overlay)
    overlay.addEventListener('click', e => { if (e.target === overlay) SMUI.closeModal() })
    document.getElementById('sm-modal-save')?.addEventListener('click', async () => {
      if (!onSave) return
      const btn = document.getElementById('sm-modal-save')
      if (btn?.disabled) return
      try {
        if (btn) btn.disabled = true
        await Promise.resolve(onSave())
      } catch (e) {
        const msg = e?.message || ''
        if (/csrf/i.test(msg) && typeof Auth !== 'undefined') {
          Auth.getCsrfToken?.()
          const tip = typeof SM !== 'undefined' && SM.t
            ? SM.t('csrf_retry') || 'نشست به‌روز شد — دوباره ذخیره کنید'
            : 'نشست به‌روز شد — دوباره ذخیره کنید'
          if (typeof SM !== 'undefined' && SM.toast) SM.toast(tip, 'error')
          else if (typeof Utils !== 'undefined') Utils.toast(tip, 'error')
        } else {
          const err = msg || (typeof SM !== 'undefined' && SM.t ? SM.t('save_error') : 'خطا در ذخیره')
          if (typeof SM !== 'undefined' && SM.toast) SM.toast(err, 'error')
          else if (typeof Utils !== 'undefined') Utils.toast(err, 'error')
        }
      } finally {
        if (btn) btn.disabled = false
      }
    })
    document.getElementById('sm-modal-delete')?.addEventListener('click', () => onDelete?.())
    SMUI._modalBackHandler = onBack || (() => SMUI.closeModal())
    return overlay
  },

  _modalBack() {
    if (typeof SMUI._modalBackHandler === 'function') SMUI._modalBackHandler()
    else SMUI.closeModal()
  },

  closeModal() {
    document.getElementById('sm-modal-root').innerHTML = ''
    SMUI._modalBackHandler = null
  },

  backBar(title, onclick = 'SM.popSubView()') {
    return `<div class="sm-back-bar">
      <button type="button" class="sm-btn sm-btn-ghost sm-back-btn" onclick="${onclick}"><i class="fas fa-arrow-right"></i> ${SM.t('back')}</button>
      <div class="sm-back-title">${SM.esc(title)}</div>
    </div>`
  },

  tabs(items, activeId, attr = 'data-sm-tab') {
    return `<div class="sm-tabs" role="tablist">${items.map(t => `
      <button type="button" class="sm-tab${t.id === activeId ? ' active' : ''}" role="tab"
        ${attr}="${t.id}" onclick="${t.onclick || ''}" aria-selected="${t.id === activeId}">
        ${t.icon ? `<i class="fas ${t.icon}"></i>` : ''}${SM.esc(t.label)}
      </button>`).join('')}</div>`
  },

  rowActions(buttons) {
    return `<div class="sm-row-actions">${buttons.map(b =>
      `<button type="button" class="sm-btn sm-btn-sm ${b.className || 'sm-btn-ghost'}" onclick="${b.onclick}">${b.icon ? `<i class="fas ${b.icon}"></i> ` : ''}${SM.esc(b.label)}</button>`
    ).join('')}</div>`
  },

  formField(label, id, { type = 'text', value = '', options, placeholder, dir } = {}) {
    if (type === 'select') {
      return `<div class="sm-form-group"><label class="sm-label" for="${id}">${SM.esc(label)}</label>
        <select class="sm-select" id="${id}">${(options || []).map(o =>
          `<option value="${SM.esc(o.value)}"${o.value === value ? ' selected' : ''}>${SM.esc(o.label)}</option>`
        ).join('')}</select></div>`
    }
    if (type === 'textarea') {
      return `<div class="sm-form-group"><label class="sm-label" for="${id}">${SM.esc(label)}</label>
        <textarea class="sm-textarea" id="${id}" placeholder="${SM.esc(placeholder || '')}">${SM.esc(value)}</textarea></div>`
    }
    return `<div class="sm-form-group"><label class="sm-label" for="${id}">${SM.esc(label)}</label>
      <input class="sm-input" type="${type}" id="${id}" value="${SM.esc(value)}" placeholder="${SM.esc(placeholder || '')}"${dir ? ` dir="${dir}"` : ''}/></div>`
  },

  readForm(ids) {
    const data = {}
    ids.forEach(id => {
      const el = document.getElementById(id)
      if (el) data[id] = el.value.trim()
    })
    return data
  },

  statCards(items) {
    return `<div class="sm-stats">${items.map((s, i) => {
      const route = s.route ? ` onclick="SM.navigate('${s.route}')" role="button" tabindex="0"` : ''
      const cls = s.route ? ' sm-stat--click' : ''
      return `
      <div class="sm-stat${cls}" style="--stat-color:${s.color || 'var(--sm-accent)'};animation-delay:${i * 0.05}s"${route}>
        <div class="sm-stat-val">${s.value}</div>
        <div class="sm-stat-lbl">${SM.esc(s.label)}</div>
        ${s.icon ? `<div class="sm-stat-icon"><i class="fas ${s.icon}"></i></div>` : ''}
        ${s.route ? '<div class="sm-stat-go"><i class="fas fa-chevron-left"></i></div>' : ''}
      </div>`
    }).join('')}</div>`
  },

  sectionHead(title, desc, actionHtml = '') {
    return `<div class="sm-section-head">
      <div><div class="sm-section-title">${SM.esc(title)}</div>${desc ? `<div class="sm-section-desc">${SM.esc(desc)}</div>` : ''}</div>
      ${actionHtml}
    </div>`
  },

  moduleSearch(route, placeholder = 'جستجو در این بخش...') {
    const val = SM.getModuleSearch(route)
    return `<div class="sm-module-search">
      <i class="fas fa-search" aria-hidden="true"></i>
      <input type="search" id="sm-search-${route}" placeholder="${SM.esc(placeholder)}" value="${SM.esc(val)}"
        autocomplete="off" oninput="SM.setModuleSearch('${route}', this.value)"/>
      ${val ? `<button type="button" class="sm-search-clear" onclick="SM.setModuleSearch('${route}','')" title="پاک کردن"><i class="fas fa-times"></i></button>` : ''}
    </div>`
  },

  empty(icon, title, desc = '') {
    return `<div class="sm-empty"><i class="fas ${icon}"></i><div class="sm-empty-title">${SM.esc(title)}</div>${desc ? `<p>${SM.esc(desc)}</p>` : ''}</div>`
  },

  moduleDisabled(route) {
    const title = SM.disabledModuleTitle(route)
    return `<div class="sm-module-disabled">
      <div class="sm-module-disabled-icon"><i class="fas fa-screwdriver-wrench"></i></div>
      <h2>${SM.esc(title)}</h2>
      <p class="sm-module-disabled-lead">این بخش فعلاً غیرفعال است.</p>
      <p>در حال ارتقا و به‌روزرسانی هستیم — به‌زودی با امکانات کامل در دسترس قرار می‌گیرد.</p>
      <button type="button" class="sm-btn sm-btn-primary" onclick="SM.navigate('dashboard')"><i class="fas fa-home"></i> بازگشت به داشبورد</button>
    </div>`
  },

  table(headers, rows) {
    if (!rows.length) return SMUI.empty('fa-table', SM.t('no_data'))
    return `<div class="sm-table-wrap"><table class="sm-table">
      <thead><tr>${headers.map(h => `<th>${SM.esc(h)}</th>`).join('')}</tr></thead>
      <tbody>${rows.join('')}</tbody></table></div>`
  },

  tableActionsCell(viewOnclick, editOnclick, extra = '') {
    return `<td>${SMUI.rowActions([
      viewOnclick ? { label: SM.t('view'), icon: 'fa-eye', onclick: viewOnclick } : null,
      editOnclick ? { label: SM.t('edit'), icon: 'fa-pen', onclick: editOnclick } : null
    ].filter(Boolean))}${extra}</td>`
  },

  badge(text, type = 'info') {
    return `<span class="sm-badge sm-badge-${type}">${SM.esc(text)}</span>`
  },

  barChart(data, { max } = {}) {
    const m = max || Math.max(...data.map(d => d.value), 1)
    return `<div class="sm-chart">${data.map(d => `
      <div class="sm-chart-bar-wrap">
        <div class="sm-chart-bar" style="height:${Math.max(4, (d.value / m) * 120)}px" title="${d.value}"></div>
        <div class="sm-chart-lbl">${SM.esc(d.label)}</div>
      </div>`).join('')}</div>`
  },

  revenueChart(data) {
    const max = Math.max(...data.map(d => d.value), 1)
    const total = data.reduce((s, d) => s + d.value, 0)
    const peak = data.reduce((best, d) => d.value > best.value ? d : best, data[0])
    return `<div class="sm-revenue">
      <div class="sm-revenue-head">
        <div class="sm-revenue-total">${SM.fmt(total)}<span>تومان — جمع سال</span></div>
        <div class="sm-revenue-peak">بیشترین: <strong>${SM.esc(peak.label)}</strong> — ${SM.fmt(peak.value)}</div>
      </div>
      <div class="sm-revenue-bars">${data.map((d, i) => {
        const h = Math.max(6, (d.value / max) * 100)
        const hot = d.value === peak.value && d.value > 0
        return `<div class="sm-revenue-col${hot ? ' hot' : ''}" style="animation-delay:${i * 0.04}s">
          <div class="sm-revenue-val">${d.value > 0 ? SM.fmt(d.value) : ''}</div>
          <div class="sm-revenue-bar" style="height:${h}%"></div>
          <div class="sm-revenue-lbl">${SM.esc(d.label)}</div>
        </div>`
      }).join('')}</div>
    </div>`
  },

  signaturePad(canvasId) {
    setTimeout(() => {
      const canvas = document.getElementById(canvasId)
      if (!canvas) return
      const ctx = canvas.getContext('2d')
      canvas.width = canvas.offsetWidth * 2
      canvas.height = 200 * 2
      ctx.scale(2, 2)
      ctx.strokeStyle = '#0071E3'
      ctx.lineWidth = 2
      ctx.lineCap = 'round'
      let drawing = false
      const pos = e => {
        const r = canvas.getBoundingClientRect()
        const x = (e.touches ? e.touches[0].clientX : e.clientX) - r.left
        const y = (e.touches ? e.touches[0].clientY : e.clientY) - r.top
        return { x, y }
      }
      const start = e => { drawing = true; const p = pos(e); ctx.beginPath(); ctx.moveTo(p.x, p.y); e.preventDefault() }
      const move = e => { if (!drawing) return; const p = pos(e); ctx.lineTo(p.x, p.y); ctx.stroke(); e.preventDefault() }
      const end = () => { drawing = false }
      canvas.addEventListener('mousedown', start)
      canvas.addEventListener('mousemove', move)
      canvas.addEventListener('mouseup', end)
      canvas.addEventListener('touchstart', start, { passive: false })
      canvas.addEventListener('touchmove', move, { passive: false })
      canvas.addEventListener('touchend', end)
    }, 50)
  },

  getSignatureData(canvasId) {
    const canvas = document.getElementById(canvasId)
    return canvas ? canvas.toDataURL('image/png') : ''
  },

  clearSignature(canvasId) {
    const canvas = document.getElementById(canvasId)
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    ctx.clearRect(0, 0, canvas.width, canvas.height)
  }
}

window.SMUI = SMUI
