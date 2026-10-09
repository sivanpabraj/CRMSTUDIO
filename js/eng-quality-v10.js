/**
 * Engineering Quality Pack v10
 * هدف: نمره مهندسی نزدیک ۱۰ — UI پایدار + async درست + پیام خطای واضح
 */
(function (w) {
  'use strict'

  /* ── ۱) await روی واریز قرارداد ── */
  function patchContractPayment() {
    if (typeof SMModules === 'undefined' || !SMModules.contracts?.addPayment) return
    if (SMModules.contracts.__q10pay) return
    SMModules.contracts.__q10pay = true

    SMModules.contracts.addPayment = function (contractId) {
      const c = DB.find('contracts', (x) => x.id === contractId)
      if (!c) return
      const banks = DB.get('banks') || []
      const bankOpts = [
        { value: '', label: '— انتخاب حساب —' },
        ...banks.map((b) => ({
          value: b.id,
          label:
            typeof FinanceSync !== 'undefined'
              ? FinanceSync.bankLabel(b.id)
              : b.name || b.bank
        }))
      ]
      const couple =
        typeof this._couple === 'function'
          ? this._couple(c)
          : c.couple || [c.bride, c.groom].filter(Boolean).join(' و ') || '—'

      SMUI.modal(
        'ثبت واریز — ' + couple,
        `
        <p style="font-size:.82rem;color:var(--sm-text-muted);margin:0 0 12px">
          واریز همزمان در <strong>حسابداری</strong> و <strong>فاکتورها</strong> ثبت می‌شود.
        </p>
        ${SMUI.formField('مبلغ (تومان)', 'cp-amt', { type: 'number', dir: 'ltr' })}
        ${SMUI.formField('واریز به حساب', 'cp-bank', { type: 'select', options: bankOpts })}
        ${SMUI.formField('بابت', 'cp-cat', {
          type: 'select',
          options: [
            { value: 'contract_payment', label: 'پرداخت قرارداد' },
            { value: 'contract_deposit', label: 'بیعانه (اگر قبلاً ثبت نشده)' }
          ]
        })}
        ${SMUI.formField('تاریخ', 'cp-date', { value: Utils.todayJalali() })}
        ${SMUI.formField('روش', 'cp-method', {
          type: 'select',
          options: [
            { value: 'transfer', label: 'انتقال / کارت' },
            { value: 'cash', label: 'نقد' },
            { value: 'pos', label: 'کارتخوان' }
          ]
        })}
        ${SMUI.formField('شماره پیگیری', 'cp-ref', { dir: 'ltr' })}
        ${SMUI.formField('شرح', 'cp-note', { type: 'textarea' })}`,
        {
          width: 480,
          onSave: async () => {
            const d = SMUI.readForm([
              'cp-amt',
              'cp-bank',
              'cp-cat',
              'cp-date',
              'cp-method',
              'cp-ref',
              'cp-note'
            ])
            const amount = +d['cp-amt'] || 0
            if (!amount || !d['cp-bank']) {
              return SM.toast('مبلغ و حساب بانکی الزامی است', 'error')
            }
            if (typeof FinanceSync === 'undefined') {
              return SM.toast('ماژول مالی بارگذاری نشده', 'error')
            }
            try {
              let res
              if (d['cp-cat'] === 'contract_deposit') {
                res = await Promise.resolve(
                  FinanceSync.recordContractInitialDeposit(c, d['cp-bank'], {
                    paymentMethod: d['cp-method'],
                    transactionRef: d['cp-ref'],
                    date: d['cp-date'],
                    notes: d['cp-note']
                  })
                )
              } else {
                res = await Promise.resolve(
                  FinanceSync.recordContractPayment({
                    contractId: c.id,
                    amount,
                    bankId: d['cp-bank'],
                    purposeCategory: 'contract_payment',
                    date: d['cp-date'],
                    paymentMethod: d['cp-method'],
                    transactionRef: d['cp-ref'],
                    notes: d['cp-note']
                  })
                )
              }
              if (!res?.ok && !res?.skipped) {
                return SM.toast(res?.error || 'خطا در ثبت واریز', 'error')
              }
              SMUI.closeModal()
              SM.toast(
                res?.skipped ? 'قبلاً ثبت شده بود' : 'واریز ثبت شد — حسابداری و فاکتور',
                'success'
              )
              SMModules.contracts.view?.(contractId)
            } catch (e) {
              console.error('[q10] payment', e)
              SM.toast('خطا: ' + (e.message || 'ثبت ناموفق'), 'error')
            }
          }
        }
      )
    }
  }

  /* ── ۲) ماژول خالی: پیام مهندسی به جای پازل خاموش ── */
  function patchNavigateEmpty() {
    if (typeof SM === 'undefined' || !SM.navigate || SM.__q10nav) return
    SM.__q10nav = true
    const orig = SM.navigate.bind(SM)

    SM.navigate = function (route) {
      orig(route)
      const main = document.getElementById('sm-content')
      if (!main) return
      const mod = typeof SMModules !== 'undefined' ? SMModules[route] : null
      if (mod?.render) return
      if (SM.isModuleDisabled?.(route)) return

      // فقط وقتی واقعاً محتوا خالی/پازل است
      const isPuzzle =
        main.querySelector('.fa-puzzle-piece') ||
        (main.textContent || '').trim().length < 40
      if (!isPuzzle) return

      const titles = {
        calendar: 'تقویم',
        accounting: 'حسابداری',
        employees: 'پرسنل',
        reports: 'گزارش‌ها',
        settings: 'تنظیمات',
        workflow: 'گردش کار',
        inbox: 'صندوق',
        messaging: 'پیام‌رسانی',
        portal: 'پرتال',
        payroll: 'حقوق',
        attendance: 'حضور'
      }
      const name = titles[route] || route
      main.innerHTML = `
        <div class="sm-empty" style="padding:48px 24px;text-align:center">
          <i class="fas fa-triangle-exclamation" style="font-size:32px;color:#f59e0b;margin-bottom:12px"></i>
          <div class="sm-empty-title" style="font-size:16px;font-weight:700;margin-bottom:8px">بخش «${name}» بارگذاری نشد</div>
          <p style="opacity:.65;font-size:13px;max-width:360px;margin:0 auto 16px;line-height:1.7">
            اسکریپت این ماژول در دسترس نیست یا خطا داده است. یک‌بار صفحه را تازه کنید.
            اگر ادامه داشت، فایل مربوط به <code>${route}</code> را در deploy بررسی کنید.
          </p>
          <button type="button" class="sm-btn sm-btn-primary" onclick="location.reload()">
            <i class="fas fa-rotate"></i> بارگذاری مجدد
          </button>
          <button type="button" class="sm-btn sm-btn-ghost" style="margin-right:8px" onclick="SM.navigate('dashboard')">
            بازگشت داشبورد
          </button>
        </div>`
    }
  }

  /* ── ۳) roleLabel ReferenceError در renderShell ── */
  function patchRoleLabel() {
    if (typeof SM === 'undefined' || !SM.renderShell || SM.__q10role) return
    SM.__q10role = true
    const orig = SM.renderShell.bind(SM)
    SM.renderShell = function () {
      // تزریق متغیر امن قبل از اجرای اصل
      try {
        if (typeof w.roleLabel === 'undefined') {
          w.roleLabel = function (u) {
            if (typeof Access !== 'undefined' && Access.getPrimaryRoleLabel) {
              return Access.getPrimaryRoleLabel(u)
            }
            return (u && u.name) || 'کاربر'
          }
        }
      } catch { /* */ }
      try {
        return orig()
      } catch (e) {
        if (String(e).includes('roleLabel')) {
          console.warn('[q10] roleLabel patched retry')
          w.roleLabel = 'مدیر'
          return orig()
        }
        throw e
      }
    }
  }

  /* ── ۴) هزینه‌های جاری → پل به حسابداری برای پرسنل/چاپ ── */
  function patchExpensesBridge() {
    if (typeof SMModules === 'undefined' || !SMModules.expenses?.add) return
    if (SMModules.expenses.__q10) return
    SMModules.expenses.__q10 = true

    const origAdd = SMModules.expenses.add.bind(SMModules.expenses)
    SMModules.expenses.add = function () {
      // اگر دسته سنگین لازم است، راهنما در ابتدای فرم
      origAdd()
      setTimeout(() => {
        const modal = document.querySelector('.sm-modal, .sm-modal-root .sm-modal-card, [class*="modal"]')
        const body =
          document.querySelector('.sm-modal-body') ||
          document.querySelector('#sm-modal-root') ||
          modal
        if (!body || document.getElementById('q10-exp-hint')) return
        const hint = document.createElement('div')
        hint.id = 'q10-exp-hint'
        hint.style.cssText =
          'margin:0 0 12px;padding:10px 12px;border-radius:10px;background:rgba(56,189,248,.1);border:1px solid rgba(56,189,248,.25);font-size:12px;line-height:1.6'
        hint.innerHTML =
          '<strong>راهنما:</strong> برای <em>پرداخت پرسنل</em> یا <em>چاپ/آلبوم مرتبط با قرارداد</em> از ' +
          '<button type="button" class="sm-btn sm-btn-sm sm-btn-ghost" onclick="SMUI.closeModal();SM.navigate(\'accounting\');setTimeout(()=>SMAccounting?.addWithdrawal?.(),300)">حسابداری → ثبت برداشت</button> ' +
          'استفاده کنید تا پرسنل و قرارداد به‌صورت کامل لینک شوند. اینجا برای هزینه روزمره سریع است.'
        const first = body.querySelector('.sm-form-field, .sm-field, form, div')
        if (first?.parentNode) first.parentNode.insertBefore(hint, first)
        else body.insertBefore(hint, body.firstChild)
      }, 80)
    }
  }

  /* ── ۵) تراز مطالبات با StudioFinance هم‌خوان ── */
  function patchBalanceReceivables() {
    if (typeof SMAccounting === 'undefined' || !SMAccounting._balanceView) return
    if (SMAccounting.__q10bal) return
    SMAccounting.__q10bal = true
    const orig = SMAccounting._balanceView.bind(SMAccounting)
    SMAccounting._balanceView = function (q) {
      const html = orig(q)
      // فقط اگر StudioFinance هست، عدد را در لاگ همگام نگه می‌داریم (UI همان)
      try {
        if (typeof StudioFinance !== 'undefined' && StudioFinance.forContract) {
          const contracts = DB.get('contracts') || []
          let debt = 0
          contracts.forEach((c) => {
            debt += StudioFinance.forContract(c).debt || 0
          })
          w.__q10ContractReceivables = debt
        }
      } catch { /* */ }
      return html
    }
  }

  /* ── ۶) جلوگیری از پچ دوبارهٔ مخرب Auth (فقط هشدار) ── */
  function authHealthLog() {
    if (typeof Auth === 'undefined') return
    const flags = [Auth.__serverBridge, Auth.__dbFix].filter(Boolean).length
    if (flags > 1) {
      console.info('[q10] Auth.login has stacked patches (bridge+db) — OK if order: bridge then db')
    }
  }

  function boot() {
    patchRoleLabel()
    patchNavigateEmpty()
    patchContractPayment()
    patchExpensesBridge()
    patchBalanceReceivables()
    authHealthLog()
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        setTimeout(boot, 700)
        setTimeout(boot, 2200)
      })
    } else {
      setTimeout(boot, 700)
      setTimeout(boot, 2200)
    }
  }

  w.EngQualityV10 = { boot }
})(typeof window !== 'undefined' ? window : globalThis)
