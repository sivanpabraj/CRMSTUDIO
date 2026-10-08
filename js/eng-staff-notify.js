/** نوتیف آفیش جدید برای پرسنل */
;(function (w) {
  'use strict'

  const EngStaffNotify = {
    onNewAfish(row) {
      try {
        const key = 'talar_afish_notify_queue'
        const q = JSON.parse(localStorage.getItem(key) || '[]')
        q.push({ id: row.id, couple: row.couple, at: Date.now() })
        localStorage.setItem(key, JSON.stringify(q.slice(-30)))
      } catch { /* */ }
      try {
        if (typeof NotificationTicker !== 'undefined' && NotificationTicker.push) {
          NotificationTicker.push({ title: 'آفیش جدید', body: row.couple || 'پروژه جدید', scope: 'portal' })
        }
      } catch { /* */ }
      try {
        if (typeof AudioNotifier !== 'undefined' && AudioNotifier.playSent) AudioNotifier.playSent()
      } catch { /* */ }
      try {
        if (typeof Utils !== 'undefined' && Utils.toast) Utils.toast('آفیش برای پرسنل ثبت شد', 'success')
      } catch { /* */ }
    },

    pendingForCurrentUser() {
      try {
        const user = Auth.getUser?.()
        if (!user) return []
        const pers =
          DB.findPersonnelByUserId?.(user.id) || DB.findPersonnelByPhone?.(user.phone)
        if (!pers) return []
        return (DB.get('persProjects') || []).filter((p) => p.personnelId === pers.id && p.accepted === null)
      } catch {
        return []
      }
    },

    showPortalBanner() {
      if (!document.body.classList.contains('portal-app')) return
      const pending = this.pendingForCurrentUser()
      if (!pending.length) return
      if (document.getElementById('eng-afish-banner')) return
      const el = document.createElement('div')
      el.id = 'eng-afish-banner'
      el.setAttribute(
        'style',
        'position:sticky;top:0;z-index:50;background:linear-gradient(90deg,#b45309,#d97706);color:#fff;padding:10px 14px;font-size:13px;font-weight:700;text-align:center'
      )
      el.textContent = `${pending.length} آفیش جدید در انتظار تأیید شما`
      el.onclick = () => {
        try {
          Portal.showSection?.('overview', true)
        } catch { /* */ }
      }
      const shell = document.querySelector('.portal-shell') || document.getElementById('portal-app')
      shell?.insertBefore(el, shell.firstChild)
    }
  }

  w.EngStaffNotify = EngStaffNotify
  setInterval(() => {
    try {
      EngStaffNotify.showPortalBanner()
    } catch { /* */ }
  }, 4000)
})(typeof window !== 'undefined' ? window : globalThis)
