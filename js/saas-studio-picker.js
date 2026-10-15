/**
 * UI انتخاب استودیو — وقتی کاربر چند membership دارد
 */
(function (w) {
  'use strict'

  function openPicker(memberships, onPick) {
    if (document.getElementById('saas-studio-picker')) return
    const list = memberships || w.SaasContext?.getMemberships?.() || []
    if (list.length < 2) {
      if (list[0]) w.SaasContext?.setStudioId?.(list[0].studioId)
      onPick?.(list[0]?.studioId)
      return
    }

    const currentId = w.SaasContext?.getStudioId?.() || ''
    const isLight = document.body?.dataset?.theme === 'light'
    const bg = isLight ? '#ffffff' : '#14141a'
    const text = isLight ? '#1f2937' : '#ffffff'
    const subText = isLight ? '#6b7280' : 'rgba(255,255,255,0.6)'
    const border = isLight ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.12)'
    const cardBg = isLight ? '#f9fafb' : 'rgba(255,255,255,0.04)'
    const cardBorder = isLight ? '#e5e7eb' : 'rgba(255,255,255,0.1)'

    const ov = document.createElement('div')
    ov.id = 'saas-studio-picker'
    ov.setAttribute('role', 'dialog')
    ov.setAttribute('aria-modal', 'true')
    ov.setAttribute('aria-labelledby', 'saas-studio-picker-title')
    ov.style.cssText =
      'position:fixed;inset:0;z-index:100000;background:rgba(0,0,0,.68);display:flex;align-items:center;justify-content:center;padding:20px;backdrop-filter:blur(8px);animation:fadeIn .2s ease'
    ov.innerHTML = `
      <div style="width:min(420px,94vw);background:${bg};border:1px solid ${border};border-radius:22px;padding:24px;font-family:Vazirmatn,Tahoma,sans-serif;color:${text};box-shadow:0 20px 40px rgba(0,0,0,.3);position:relative">
        <button type="button" id="saas-picker-close-btn" style="position:absolute;top:18px;left:18px;background:none;border:none;color:${subText};cursor:pointer;font-size:16px;padding:4px" title="بستن">✕</button>
        <h3 id="saas-studio-picker-title" style="margin:0 0 6px;font-size:18px;font-weight:700">انتخاب استودیو</h3>
        <p style="margin:0 0 18px;font-size:12.5px;color:${subText};line-height:1.6">شما به چندین استودیو دسترسی دارید. استودیوی مورد نظر را انتخاب کنید:</p>
        <div id="saas-studio-list" style="display:flex;flex-direction:column;gap:10px;max-height:60vh;overflow-y:auto"></div>
      </div>`
    document.body.appendChild(ov)

    const close = () => {
      document.removeEventListener('keydown', onKeyDown)
      ov.remove()
    }

    const onKeyDown = (e) => {
      if (e.key === 'Escape') close()
    }
    document.addEventListener('keydown', onKeyDown)

    document.getElementById('saas-picker-close-btn')?.addEventListener('click', close)
    ov.addEventListener('click', (e) => {
      if (e.target === ov) close()
    })

    const box = document.getElementById('saas-studio-list')
    list.forEach((m) => {
      const isActive = m.studioId === currentId
      const btn = document.createElement('button')
      btn.type = 'button'
      btn.style.cssText = `text-align:right;padding:14px 16px;border-radius:14px;border:${isActive ? '2px solid #0071E3' : '1px solid ' + cardBorder};background:${isActive ? (isLight ? '#eff6ff' : 'rgba(0,113,227,0.15)') : cardBg};color:${text};cursor:pointer;font-family:inherit;display:flex;align-items:center;justify-content:space-between;gap:8px;transition:all .15s ease`
      btn.innerHTML = `
        <div>
          <strong style="display:block;font-size:14.5px;font-weight:600">${esc(m.studioName || m.studioSlug || 'استودیو')}</strong>
          <span style="font-size:11.5px;color:${subText}">${esc(m.title || m.role || '')}</span>
        </div>
        ${isActive ? '<span style="font-size:11px;background:#0071E3;color:#fff;padding:2px 8px;border-radius:10px;font-weight:500">فعال</span>' : ''}`
      btn.onclick = () => {
        w.SaasContext?.setStudioId?.(m.studioId)
        close()
        onPick?.(m.studioId)
      }
      box.appendChild(btn)
    })
  }

  function esc(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
  }

  function maybeShow() {
    if (!w.SaasContext?.ensureStudioSelected) return
    const r = w.SaasContext.ensureStudioSelected()
    if (r?.needSelect) openPicker(r.memberships)
  }

  w.SaasStudioPicker = { open: openPicker, maybeShow }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => setTimeout(maybeShow, 900))
    } else setTimeout(maybeShow, 900)
  }
})(typeof window !== 'undefined' ? window : globalThis)
