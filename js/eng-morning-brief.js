/** بریف صبحگاهی پرسنل — امروز با این کار شروع کن */
;(function (w) {
  'use strict'

  function briefHtml(personnel) {
    if (!personnel) return ''
    const projects = (DB.get('persProjects') || []).filter((p) => p.personnelId === personnel.id)
    const pending = projects.filter((p) => p.accepted === null)
    const active = projects.filter(
      (p) => p.accepted === true && !['done', 'delivered', 'rejected'].includes(p.status)
    )
    const lines = []
    if (pending.length) lines.push(`✅ ${pending.length} آفیش در انتظار تأیید — اول آن‌ها را مشخص کنید.`)
    if (active.length) {
      const sorted = active
        .map((p) => ({ p, d: p.deadline || p.deliveryDate || p.eventDate || '' }))
        .sort((a, b) => String(a.d).localeCompare(String(b.d)))
      const top = sorted[0]
      if (top)
        lines.push(
          `🎬 پروژه فعال اولویت: «${top.p.couple || '—'}» — نقش ${top.p.role || ''} — موعد ${top.d || '—'}`
        )
    }
    if (!lines.length) lines.push('امروز آفیش معلقی ندارید. در صورت تخصیص جدید، اینجا اعلام می‌شود.')

    return `
      <div class="eng-morning-brief" style="margin-bottom:14px;padding:14px 16px;border-radius:16px;border:1px solid rgba(201,169,110,.35);background:linear-gradient(135deg,rgba(201,169,110,.12),rgba(20,20,28,.9))">
        <div style="font-weight:800;font-size:14px;margin-bottom:8px;color:#c9a96e">☀️ برنامه امروز شما</div>
        <ul style="margin:0;padding-right:18px;font-size:13px;line-height:1.7;opacity:.92">
          ${lines.map((l) => `<li>${l}</li>`).join('')}
        </ul>
      </div>`
  }

  function inject() {
    if (!document.body.classList.contains('portal-app')) return
    const content = document.getElementById('portal-content')
    if (!content || content.querySelector('.eng-morning-brief')) return
    const user = typeof Auth !== 'undefined' ? Auth.getUser() : null
    const pers =
      user &&
      (DB.findPersonnelByUserId?.(user.id) || DB.findPersonnelByPhone?.(user.phone))
    if (!pers) return
    const wrap = document.createElement('div')
    wrap.innerHTML = briefHtml(pers)
    content.insertBefore(wrap, content.firstChild)
  }

  w.EngMorningBrief = { inject, briefHtml }
  setInterval(inject, 2500)
})(typeof window !== 'undefined' ? window : globalThis)
