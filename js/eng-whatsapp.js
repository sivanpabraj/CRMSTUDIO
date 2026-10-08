/** اشتراک قرارداد / لینک پرتال در واتساپ */
;(function (w) {
  'use strict'

  const EngWhatsApp = {
    phoneToWa(phone) {
      let p = String(phone || '').replace(/\D/g, '')
      if (p.startsWith('0')) p = '98' + p.slice(1)
      if (p.length === 10) p = '98' + p
      return p
    },

    open(text, phone) {
      const msg = encodeURIComponent(text || '')
      const ph = this.phoneToWa(phone)
      const url = ph ? `https://wa.me/${ph}?text=${msg}` : `https://wa.me/?text=${msg}`
      window.open(url, '_blank', 'noopener')
    },

    shareContract(c) {
      if (!c) return
      const couple = c.couple || `${c.bride || ''} و ${c.groom || ''}`.trim()
      const fin = w.StudioFinance?.forContract?.(c)
      const origin = location.origin || ''
      const text =
        `سلام ${couple}\n` +
        `قرارداد ${c.contractNum || ''} — ${c.eventDate || ''}\n` +
        (fin ? `مانده: ${StudioFinance.fmt(fin.debt)} تومان\n` : '') +
        `پیگیری آنلاین: ${origin}/customer.html`
      const phone = c.groomPhone || c.bridePhone || c.phone || ''
      this.open(text, phone)
    },

    shareAfish(p) {
      if (!p) return
      const text =
        `آفیش جدید: ${p.couple || ''}\nنقش: ${p.role || ''}\nتاریخ: ${p.eventDate || p.reserveDate || ''}\n` +
        `ورود پرسنل: ${(location.origin || '')}/index.html?view=portal`
      this.open(text, '')
    }
  }

  w.EngWhatsApp = EngWhatsApp
})(typeof window !== 'undefined' ? window : globalThis)
