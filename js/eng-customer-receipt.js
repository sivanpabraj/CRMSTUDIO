/** ثبت فیش واریز توسط مشتری — pending برای تأیید مدیر */
;(function (w) {
  'use strict'

  const EngCustomerReceipt = {
    inject() {
      const c = w.CustomerPortal?.state?.contract
      if (!c) return
      if (document.getElementById('eng-receipt-box')) return
      const page = document.querySelector('.customer-page > div') || document.querySelector('.customer-page')
      if (!page) return

      const fin = w.StudioFinance?.forContract?.(c) || { debt: 0, total: 0, paid: 0 }
      const box = document.createElement('div')
      box.id = 'eng-receipt-box'
      box.className = 'customer-card'
      box.style.cssText = 'max-width:none;margin-bottom:16px'
      box.innerHTML = `
        <h1 style="font-size:16px;margin:0 0 10px">🧾 اعلام واریز / فیش</h1>
        <p style="font-size:12px;opacity:.7;margin:0 0 10px">مانده فعلی: <strong>${w.StudioFinance ? StudioFinance.fmt(fin.debt) : fin.debt}</strong> تومان — پس از ثبت، مدیر تأیید می‌کند.</p>
        <input type="number" id="eng-receipt-amount" placeholder="مبلغ واریزی (تومان)" style="width:100%;box-sizing:border-box;padding:10px;border-radius:10px;border:1px solid rgba(255,255,255,.12);background:rgba(0,0,0,.25);color:#fff;margin-bottom:8px;font-family:inherit"/>
        <input type="text" id="eng-receipt-note" placeholder="شماره پیگیری / توضیح" style="width:100%;box-sizing:border-box;padding:10px;border-radius:10px;border:1px solid rgba(255,255,255,.12);background:rgba(0,0,0,.25);color:#fff;margin-bottom:8px;font-family:inherit"/>
        <button type="button" id="eng-receipt-btn" style="width:100%;padding:12px;border:none;border-radius:12px;background:#c9a96e;color:#111;font-weight:800;font-family:inherit;cursor:pointer">ثبت اعلام واریز</button>
      `
      page.appendChild(box)
      document.getElementById('eng-receipt-btn').onclick = () => this.submit(c)
    },

    async submit(c) {
      const amount = Number(document.getElementById('eng-receipt-amount')?.value || 0)
      const note = document.getElementById('eng-receipt-note')?.value?.trim() || ''
      if (!amount || amount <= 0) {
        Utils?.toast?.('مبلغ را وارد کنید', 'error')
        return
      }
      const row = {
        id: 'rcpt_' + Date.now(),
        contractId: c.id,
        contractNum: c.contractNum,
        amount,
        note,
        status: 'pending_review',
        source: 'customer_portal',
        createdAt: typeof Utils !== 'undefined' && Utils.todayJalali ? Utils.todayJalali() : new Date().toISOString()
      }
      try {
        const list = DB.get('paymentReceipts') || []
        list.push(row)
        DB.set('paymentReceipts', list)
        await DB.flush?.()
        if (typeof SecureDB !== 'undefined' && SecureDB.insert) {
          await SecureDB.insert('paymentReceipts', row).catch(() => {})
        }
        Utils?.toast?.('اعلام واریز ثبت شد — منتظر تأیید استودیو', 'success')
        document.getElementById('eng-receipt-amount').value = ''
        document.getElementById('eng-receipt-note').value = ''
      } catch (e) {
        console.error(e)
        Utils?.toast?.('خطا در ثبت', 'error')
      }
    }
  }

  w.EngCustomerReceipt = EngCustomerReceipt
  setInterval(() => {
    try {
      EngCustomerReceipt.inject()
    } catch { /* */ }
  }, 2000)
})(typeof window !== 'undefined' ? window : globalThis)
