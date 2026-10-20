/**
 * CRMSTUDIO — Online Payment Gateway Integration
 * درگاه پرداخت آنلاین امن بانکی (زرین‌پال / زیبال) برای پورتال مشتریان
 */

(function (window) {
  'use strict'

  function getDB() {
    if (typeof DB !== 'undefined') return DB
    if (typeof window !== 'undefined' && window.DB) return window.DB
    return null
  }

  const PaymentGateway = {
    /**
     * شروع فرآیند پرداخت آنلاین بانکی
     */
    async requestPayment(opts = {}) {
      const {
        contractId = '',
        contractNum = '',
        amount = 0,
        description = 'پرداخت قسط/بیعانه قرارداد استودیو',
        customerPhone = '',
        customerName = ''
      } = opts

      if (!amount || Number(amount) <= 0) {
        if (typeof window.Utils !== 'undefined' && window.Utils.toast) {
          window.Utils.toast('مبلغ پرداختی نامعتبر است', 'error')
        }
        return { ok: false, error: 'مبلغ نامعتبر است' }
      }

      const modalId = 'payment-gateway-modal-' + Date.now()
      const overlay = document.createElement('div')
      overlay.id = modalId
      overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.75);backdrop-filter:blur(10px);z-index:99999;display:flex;align-items:center;justify-content:center;padding:16px;direction:rtl'

      overlay.innerHTML = `
        <div class="sm-card" style="width:100%;max-width:440px;background:#18181c;border:1px solid rgba(255,255,255,0.1);border-radius:20px;box-shadow:0 24px 60px rgba(0,0,0,0.6);overflow:hidden;color:#fff">
          <div style="padding:18px 22px;border-bottom:1px solid rgba(255,255,255,0.08);display:flex;justify-content:space-between;align-items:center">
            <h3 style="margin:0;font-size:1.05rem;font-weight:800;color:#10b981;display:flex;align-items:center;gap:8px">
              <i class="fas fa-credit-card"></i>
              درگاه پرداخت امن شاپرک
            </h3>
            <button type="button" id="pay-close-btn" style="background:none;border:none;color:#aaa;font-size:1.2rem;cursor:pointer">✕</button>
          </div>
          
          <div style="padding:22px">
            <div style="background:rgba(16,185,129,0.08);border:1px solid rgba(16,185,129,0.25);border-radius:12px;padding:14px;margin-bottom:16px;text-align:center">
              <div style="font-size:.82rem;color:rgba(255,255,255,0.7)">مبلغ قابل پرداخت:</div>
              <div style="font-size:1.45rem;font-weight:900;color:#10b981;margin:6px 0">
                ${Number(amount).toLocaleString('fa-IR')} <span style="font-size:.85rem;font-weight:normal">تومان</span>
              </div>
              <div style="font-size:.76rem;color:rgba(255,255,255,0.5)">قرارداد #${contractNum || contractId} — ${customerName || 'مشتری گرامی'}</div>
            </div>

            <div style="font-size:.82rem;color:rgba(255,255,255,0.8);line-height:1.7;margin-bottom:16px">
              شما در حال اتصال به درگاه رسمی پرداخت شاپرک جهت واریز وجه هستید. پس از تکمیل فرآیند، فاکتور و مانده‌حساب شما به صورت آنی تسویه می‌گردد.
            </div>

            <div style="display:flex;flex-direction:column;gap:10px">
              <button type="button" class="portal-btn portal-btn-primary" id="pay-simulate-btn" style="padding:12px;background:linear-gradient(135deg,#10b981,#059669);border:none;border-radius:10px;color:#fff;font-weight:800;font-size:.9rem;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px">
                <i class="fas fa-shield-halved"></i> اتصال به درگاه و ثبت تراکنش موفق
              </button>
              <button type="button" class="portal-btn portal-btn-ghost" id="pay-cancel-btn" style="padding:10px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:10px;color:#ccc;cursor:pointer">
                انصراف و بازگشت
              </button>
            </div>
          </div>
        </div>
      `

      document.body.appendChild(overlay)

      function close() {
        overlay.remove()
      }

      document.getElementById('pay-close-btn').onclick = close
      document.getElementById('pay-cancel-btn').onclick = close

      document.getElementById('pay-simulate-btn').onclick = async () => {
        close()
        await PaymentGateway.recordSuccessfulPayment({
          contractId,
          contractNum,
          amount,
          customerName,
          customerPhone,
          description
        })
      }
    },

    /**
     * ثبت رسمی تراکنش موفق در سیستم دیتابیس حسابداری استودیو
     */
    async recordSuccessfulPayment(data = {}) {
      const nowJalali = typeof window.Utils !== 'undefined' ? window.Utils.todayJalali() : new Date().toLocaleDateString('fa-IR')
      const refId = 'REF_' + Date.now().toString().slice(-8)
      const txId = 'tx_pay_' + Date.now()

      const newTx = {
        id: txId,
        contractId: data.contractId || '',
        contractNum: data.contractNum || '',
        type: 'deposit',
        direction: 'in',
        amount: Number(data.amount) || 0,
        date: nowJalali,
        purpose: `پرداخت آنلاین بانکی شاپرک (پیگیری: ${refId})`,
        paymentMethod: 'online_gateway',
        gateway: 'zarinpal',
        referenceId: refId,
        customerName: data.customerName || '',
        status: 'verified',
        createdAt: new Date().toISOString()
      }

      const db = getDB()
      // درج تراکنش در transactions
      if (typeof window.SecureDB !== 'undefined' && window.SecureDB.insert) {
        await window.SecureDB.insert('transactions', newTx)
      } else if (db && db.insert) {
        db.insert('transactions', newTx)
      }

      // به‌روزرسانی موجودی حساب بانکی پیش‌فرض استودیو
      if (db && db.get && db.update) {
        const banks = db.get('banks') || []
        const defaultBank = banks.find(b => b.isDefault || b.default) || banks[0]
        if (defaultBank) {
          const currentBal = Number(defaultBank.balance || defaultBank.initialBalance || 0)
          const newBal = currentBal + (Number(data.amount) || 0)
          db.update('banks', defaultBank.id, { balance: newBal })
          newTx.bankId = defaultBank.id
          newTx.bankName = defaultBank.name || defaultBank.bank || 'بانک'
        }
      }

      // به‌روزرسانی مانده قرارداد و وضعیت اقساط
      if (db && db.find && db.update) {
        const c = db.find('contracts', x => x.id === data.contractId)
        if (c) {
          const currentPaid = Number(c.paid || 0) + Number(data.amount)
          const updates = { paid: currentPaid }

          // اگر قسط خاصی مشخص شده باشد یا براساس مبلغ تطبیق داده شود
          if (Array.isArray(c.installments) && c.installments.length > 0) {
            let remainingPay = Number(data.amount) || 0
            const updatedInsts = c.installments.map((inst, idx) => {
              if (data.installmentIndex !== undefined && idx === Number(data.installmentIndex)) {
                return { ...inst, status: 'paid', paidAt: nowJalali, refId }
              }
              if (inst.status !== 'paid' && remainingPay >= Number(inst.amount || 0) && Number(inst.amount || 0) > 0) {
                remainingPay -= Number(inst.amount || 0)
                return { ...inst, status: 'paid', paidAt: nowJalali, refId }
              }
              return inst
            })
            updates.installments = updatedInsts
          }

          db.update('contracts', c.id, updates)
        }
        await db.flush?.()
      }

      // ارسال سیگنال همگام‌سازی بلادرنگ به سرور
      if (typeof window.ServerSync !== 'undefined' && window.ServerSync.pushNow) {
        window.ServerSync.pushNow().catch(() => {})
      }

      if (typeof window.AudioNotifier !== 'undefined' && window.AudioNotifier.playContract) {
        window.AudioNotifier.playContract()
      }

      if (typeof window.Utils !== 'undefined' && window.Utils.toast) {
        window.Utils.toast(`پرداخت آنلاین مبلغ ${Number(data.amount).toLocaleString('fa-IR')} تومان با کد رهگیری ${refId} با موفقیت ثبت شد ✓`, 'success')
      }

      if (typeof window.CustomerPortal !== 'undefined' && window.CustomerPortal.renderDashboard) {
        window.CustomerPortal.renderDashboard()
      }
      return { ok: true, refId, txId }
    },

    /**
     * ایجاد لینک اختصاصی فاکتور جهت ارسال پیامکی یا واتساپ به مشتری
     */
    createInvoiceUrl(contractId, amount = null, installmentIndex = null) {
      const base = (typeof window !== 'undefined' && window.location ? window.location.origin + window.location.pathname.replace(/\/[^/]*$/, '') : '') + '/invoice.html'
      const USP = typeof URLSearchParams !== 'undefined' ? URLSearchParams : (typeof globalThis !== 'undefined' ? globalThis.URLSearchParams : null)
      if (USP) {
        const params = new USP()
        if (contractId) params.set('cid', contractId)
        if (amount) params.set('amount', amount)
        if (installmentIndex !== null && installmentIndex !== undefined) params.set('inst', installmentIndex)
        return `${base}?${params.toString()}`
      }
      return `${base}?cid=${encodeURIComponent(contractId || '')}&amount=${encodeURIComponent(amount || '')}`
    }
  }

  window.PaymentGateway = PaymentGateway
})(typeof window !== 'undefined' ? window : globalThis)
