/**
 * سرچ سراسری مدیر — ذره‌بین + Ctrl/Cmd+K
 * قرارداد، پرسنل، مشتری، چک
 */
;(function (w) {
  'use strict'

  const EngSearch = {
    open() {
      let overlay = document.getElementById('eng-search-overlay')
      if (overlay) {
        overlay.style.display = 'flex'
        document.getElementById('eng-search-input')?.focus()
        return
      }
      overlay = document.createElement('div')
      overlay.id = 'eng-search-overlay'
      overlay.innerHTML = `
        <div class="eng-search-panel" role="dialog" aria-label="جستجو">
          <div class="eng-search-bar">
            <i class="fas fa-search"></i>
            <input id="eng-search-input" type="search" placeholder="جستجو: قرارداد، زوج، پرسنل، موبایل…" autocomplete="off" />
            <kbd>Esc</kbd>
          </div>
          <div id="eng-search-results" class="eng-search-results"></div>
        </div>`
      Object.assign(overlay.style, {
        position: 'fixed',
        inset: '0',
        zIndex: '99999',
        background: 'rgba(0,0,0,.55)',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        paddingTop: '12vh',
        backdropFilter: 'blur(6px)'
      })
      const style = document.createElement('style')
      style.textContent = `
        .eng-search-panel{width:min(560px,92vw);background:#16161c;border:1px solid rgba(255,255,255,.12);border-radius:18px;overflow:hidden;box-shadow:0 24px 80px rgba(0,0,0,.45);font-family:Vazirmatn,sans-serif}
        .eng-search-bar{display:flex;align-items:center;gap:10px;padding:14px 16px;border-bottom:1px solid rgba(255,255,255,.08)}
        .eng-search-bar i{color:#c9a96e}
        .eng-search-bar input{flex:1;background:transparent;border:none;outline:none;color:#fff;font-size:15px;font-family:inherit}
        .eng-search-bar kbd{font-size:11px;opacity:.5;border:1px solid rgba(255,255,255,.15);padding:2px 6px;border-radius:6px}
        .eng-search-results{max-height:50vh;overflow:auto}
        .eng-search-item{padding:12px 16px;cursor:pointer;border-bottom:1px solid rgba(255,255,255,.05);color:#eee;font-size:13px}
        .eng-search-item:hover{background:rgba(201,169,110,.12)}
        .eng-search-item small{display:block;opacity:.55;margin-top:4px;font-size:11px}
        .eng-search-empty{padding:24px;text-align:center;opacity:.5;font-size:13px}
      `
      document.head.appendChild(style)
      document.body.appendChild(overlay)
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) overlay.style.display = 'none'
      })
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') overlay.style.display = 'none'
      })
      const input = document.getElementById('eng-search-input')
      input.addEventListener('input', () => this.run(input.value))
      input.focus()
      this.run('')
    },

    run(q) {
      const box = document.getElementById('eng-search-results')
      if (!box || typeof DB === 'undefined') return
      q = String(q || '')
        .trim()
        .toLowerCase()
      const items = []

      const add = (type, title, sub, href) => {
        items.push({ type, title, sub, href })
      }

      ;(DB.get('contracts') || []).forEach((c) => {
        const couple = c.couple || `${c.bride || ''} ${c.groom || ''}`
        const blob = `${couple} ${c.contractNum || ''} ${c.phone || ''} ${c.groomPhone || ''} ${c.bridePhone || ''}`.toLowerCase()
        if (!q || blob.includes(q)) {
          const fin = w.StudioFinance?.forContract?.(c)
          add(
            'قرارداد',
            couple || c.contractNum || c.id,
            `قرارداد ${c.contractNum || ''} · مانده ${fin ? StudioFinance.fmt(fin.debt) : '—'}`,
            'studio-m/#contracts'
          )
        }
      })

      ;(DB.get('personnel') || []).forEach((p) => {
        const blob = `${p.name || ''} ${p.phone || ''}`.toLowerCase()
        if (!q || blob.includes(q)) add('پرسنل', p.name || '—', p.phone || '', 'studio-m/#personnel')
      })

      ;(DB.get('cheques') || []).slice(0, 200).forEach((ch) => {
        const blob = `${ch.payee || ''} ${ch.amount || ''} ${ch.dueDate || ''}`.toLowerCase()
        if (q && blob.includes(q)) add('چک', ch.payee || 'چک', String(ch.dueDate || ''), 'studio-m/#accounting')
      })

      const list = items.slice(0, 40)
      if (!list.length) {
        box.innerHTML = '<div class="eng-search-empty">نتیجه‌ای نیست</div>'
        return
      }
      box.innerHTML = list
        .map(
          (it) =>
            `<div class="eng-search-item" data-href="${it.href}"><strong>${it.type}</strong> — ${escapeHtml(it.title)}<small>${escapeHtml(it.sub)}</small></div>`
        )
        .join('')
      box.querySelectorAll('.eng-search-item').forEach((el) => {
        el.onclick = () => {
          const href = el.getAttribute('data-href')
          if (href) location.href = href
          document.getElementById('eng-search-overlay').style.display = 'none'
        }
      })
    },

    injectFab() {
      if (document.getElementById('eng-search-fab')) return
      // فقط محیط مدیریت
      const isMgr =
        location.pathname.includes('studio-m') ||
        document.body.classList.contains('studio-m') ||
        document.getElementById('app-root')
      if (!isMgr && !location.pathname.includes('studio')) return

      const btn = document.createElement('button')
      btn.id = 'eng-search-fab'
      btn.type = 'button'
      btn.title = 'جستجو (Ctrl+K)'
      btn.innerHTML = '<i class="fas fa-search"></i>'
      Object.assign(btn.style, {
        position: 'fixed',
        bottom: '24px',
        left: '24px',
        zIndex: '9000',
        width: '52px',
        height: '52px',
        borderRadius: '16px',
        border: 'none',
        background: 'linear-gradient(135deg,#c9a96e,#a67c3a)',
        color: '#111',
        fontSize: '18px',
        cursor: 'pointer',
        boxShadow: '0 8px 24px rgba(201,169,110,.4)'
      })
      btn.onclick = () => this.open()
      document.body.appendChild(btn)
    }
  }

  function escapeHtml(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
  }

  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault()
      EngSearch.open()
    }
  })

  w.EngSearch = EngSearch
  setTimeout(() => EngSearch.injectFab(), 1200)
})(typeof window !== 'undefined' ? window : globalThis)
