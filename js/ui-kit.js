/* ══════════════════════════════════════════════
   UiKit — دیالوگ فارسی، فرم، loading، صفحه‌بندی
   ══════════════════════════════════════════════ */

const UiKit = {
  confirm(message, opts = {}) {
    const {
      title = 'تأیید',
      confirmText = 'بله',
      cancelText = 'خیر',
      danger = false
    } = opts
    return new Promise(resolve => {
      const overlay = document.createElement('div')
      overlay.className = 'ui-dialog-overlay'
      overlay.setAttribute('role', 'dialog')
      overlay.setAttribute('aria-modal', 'true')
      overlay.innerHTML = `
        <div class="ui-dialog" dir="rtl">
          <h3 class="ui-dialog-title">${Utils.escapeHtml(title)}</h3>
          <p class="ui-dialog-message">${Utils.escapeHtml(message)}</p>
          <div class="ui-dialog-actions">
            <button type="button" class="ui-btn ui-btn-ghost" data-act="cancel">${Utils.escapeHtml(cancelText)}</button>
            <button type="button" class="ui-btn ${danger ? 'ui-btn-danger' : 'ui-btn-primary'}" data-act="ok">${Utils.escapeHtml(confirmText)}</button>
          </div>
        </div>`
      const close = val => {
        overlay.remove()
        document.removeEventListener('keydown', onKey)
        resolve(val)
      }
      const onKey = e => { if (e.key === 'Escape') close(false) }
      overlay.querySelector('[data-act="cancel"]').onclick = () => close(false)
      overlay.querySelector('[data-act="ok"]').onclick = () => close(true)
      overlay.addEventListener('click', e => { if (e.target === overlay) close(false) })
      document.addEventListener('keydown', onKey)
      document.body.appendChild(overlay)
      overlay.querySelector('[data-act="ok"]')?.focus()
    })
  },

  form(opts = {}) {
    const {
      title = 'فرم',
      submitText = 'ذخیره',
      cancelText = 'انصراف',
      fields = []
    } = opts
    return new Promise(resolve => {
      const overlay = document.createElement('div')
      overlay.className = 'ui-dialog-overlay'
      overlay.setAttribute('role', 'dialog')
      overlay.setAttribute('aria-modal', 'true')

      const fieldsHtml = fields.map(f => {
        const id = `ui-field-${f.id}`
        const input = f.type === 'select'
          ? `<select id="${id}" name="${Utils.escapeHtml(f.id)}" ${f.required ? 'required' : ''}>
            ${(f.options || []).map(o => `<option value="${Utils.escapeHtml(String(o.value))}"${String(o.value) === String(f.value ?? '') ? ' selected' : ''}>${Utils.escapeHtml(o.label)}</option>`).join('')}
          </select>`
          : f.type === 'textarea'
            ? `<textarea id="${id}" name="${Utils.escapeHtml(f.id)}" rows="${f.rows || 3}" ${f.required ? 'required' : ''} placeholder="${Utils.escapeHtml(f.placeholder || '')}">${Utils.escapeHtml(f.value || '')}</textarea>`
            : `<input id="${id}" name="${Utils.escapeHtml(f.id)}" type="${Utils.escapeHtml(f.type || 'text')}"
            value="${Utils.escapeHtml(f.value ?? '')}" ${f.required ? 'required' : ''}
            placeholder="${Utils.escapeHtml(f.placeholder || '')}" ${f.dir ? `dir="${f.dir}"` : ''} ${f.inputmode ? `inputmode="${f.inputmode}"` : ''}/>`
        return `<div class="ui-dialog-field" data-field="${Utils.escapeHtml(f.id)}">
          <label for="${id}">${Utils.escapeHtml(f.label)}${f.required ? ' *' : ''}</label>
          ${input}
          ${f.hint ? `<div class="ui-field-hint">${Utils.escapeHtml(f.hint)}</div>` : ''}
          <div class="ui-field-error" hidden></div>
        </div>`
      }).join('')

      overlay.innerHTML = `
        <div class="ui-dialog" dir="rtl">
          <h3 class="ui-dialog-title">${Utils.escapeHtml(title)}</h3>
          <form class="ui-dialog-form">${fieldsHtml}
            <div class="ui-dialog-actions">
              <button type="button" class="ui-btn ui-btn-ghost" data-act="cancel">${Utils.escapeHtml(cancelText)}</button>
              <button type="submit" class="ui-btn ui-btn-primary">${Utils.escapeHtml(submitText)}</button>
            </div>
          </form>
        </div>`

      const close = val => {
        overlay.remove()
        document.removeEventListener('keydown', onKey)
        resolve(val)
      }
      const onKey = e => { if (e.key === 'Escape') close(null) }
      overlay.querySelector('[data-act="cancel"]').onclick = () => close(null)
      overlay.addEventListener('click', e => { if (e.target === overlay) close(null) })
      document.addEventListener('keydown', onKey)

      overlay.querySelector('form').addEventListener('submit', e => {
        e.preventDefault()
        const values = {}
        let valid = true
        fields.forEach(f => {
          const el = overlay.querySelector(`[name="${f.id}"]`)
          const wrap = overlay.querySelector(`[data-field="${f.id}"]`)
          const errEl = wrap?.querySelector('.ui-field-error')
          let val = el?.value?.trim?.() ?? el?.value ?? ''
          if (f.type === 'tel' || f.id === 'phone') val = Utils.normalizePhone(val)
          values[f.id] = val
          let err = ''
          if (f.required && !val) err = 'این فیلد الزامی است'
          else if (f.id === 'phone' && val && !Utils.isValidPhone(val)) err = 'شماره موبایل نامعتبر است'
          else if (f.validate) err = f.validate(val, values) || ''
          if (err) {
            valid = false
            if (errEl) { errEl.textContent = err; errEl.hidden = false }
          } else if (errEl) {
            errEl.hidden = true
          }
        })
        if (valid) close(values)
      })

      document.body.appendChild(overlay)
      overlay.querySelector('input, select, textarea')?.focus()
    })
  },

  async withLoading(fn, message = 'لطفاً صبر کنید…') {
    const overlay = document.createElement('div')
    overlay.className = 'ui-loading-overlay'
    overlay.innerHTML = `<div class="ui-spinner" role="status" aria-label="در حال بارگذاری"></div><div class="ui-loading-text">${Utils.escapeHtml(message)}</div>`
    document.body.appendChild(overlay)
    try {
      return await fn()
    } finally {
      overlay.remove()
    }
  },

  paginate(items, key, pageSize = 25) {
    if (!UiKit._pages) UiKit._pages = {}
    const total = (items || []).length
    const totalPages = Math.max(1, Math.ceil(total / pageSize))
    let page = UiKit._pages[key] || 1
    page = Math.min(Math.max(1, page), totalPages)
    UiKit._pages[key] = page
    const start = (page - 1) * pageSize
    return {
      slice: (items || []).slice(start, start + pageSize),
      page,
      totalPages,
      total,
      pagerHtml: total > pageSize
        ? `<div class="ui-pager" data-pager-key="${Utils.escapeHtml(key)}">
            <button type="button" class="ui-pager-btn" data-pager-dir="prev" ${page <= 1 ? 'disabled' : ''}>قبلی</button>
            <span class="ui-pager-info">صفحه ${page} از ${totalPages} (${Utils.fmtNum(total)} مورد)</span>
            <button type="button" class="ui-pager-btn" data-pager-dir="next" ${page >= totalPages ? 'disabled' : ''}>بعدی</button>
          </div>`
        : ''
    }
  },

  setPage(key, page) {
    if (!UiKit._pages) UiKit._pages = {}
    UiKit._pages[key] = page
  },

  bindPager(container, key, onChange) {
    if (!container) return
    container.querySelectorAll(`[data-pager-key="${key}"] [data-pager-dir]`).forEach(btn => {
      btn.addEventListener('click', () => {
        const cur = UiKit._pages?.[key] || 1
        const dir = btn.dataset.pagerDir
        const next = dir === 'next' ? cur + 1 : cur - 1
        if (next < 1) return
        UiKit.setPage(key, next)
        onChange?.()
      })
    })
  }
}

window.UiKit = UiKit
