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

    const ov = document.createElement('div')
    ov.id = 'saas-studio-picker'
    ov.style.cssText =
      'position:fixed;inset:0;z-index:100000;background:rgba(0,0,0,.72);display:flex;align-items:center;justify-content:center;padding:20px;backdrop-filter:blur(8px)'
    ov.innerHTML = `
      <div style="width:min(400px,94vw);background:#14141a;border:1px solid rgba(255,255,255,.12);border-radius:20px;padding:22px;font-family:Vazirmatn,Tahoma,sans-serif;color:#fff">
        <h3 style="margin:0 0 6px;font-size:17px">انتخاب استودیو</h3>
        <p style="margin:0 0 16px;font-size:12.5px;opacity:.6;line-height:1.6">به بیش از یک استودیو دسترسی دارید. برای ادامه یکی را انتخاب کنید.</p>
        <div id="saas-studio-list" style="display:flex;flex-direction:column;gap:10px"></div>
      </div>`
    document.body.appendChild(ov)
    const box = document.getElementById('saas-studio-list')
    list.forEach((m) => {
      const btn = document.createElement('button')
      btn.type = 'button'
      btn.style.cssText =
        'text-align:right;padding:14px 16px;border-radius:14px;border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.04);color:#fff;cursor:pointer;font-family:inherit'
      btn.innerHTML = `<strong style="display:block;font-size:14px">${esc(m.studioName || m.studioSlug || 'استودیو')}</strong>
        <span style="font-size:11px;opacity:.55">${esc(m.title || m.role || '')}</span>`
      btn.onclick = () => {
        w.SaasContext?.setStudioId?.(m.studioId)
        ov.remove()
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
