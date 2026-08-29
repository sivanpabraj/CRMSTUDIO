/* Studio M Pro — split module (loaded after modules.js) */
/** پالت رنگ قراردادها — متعادل و بدون تم صرفاً بنفش/صورتی */
const SM_CONTRACT_PALETTE = ['#0071E3', '#009688', '#E68619', '#34C759', '#5856D6', '#00A3BF', '#B8860B', '#64748B']

/* ── Contracts ── */
SMModules.contracts = {
  _cadres: SM_CONTRACT_PALETTE,
  _selectedId: null,
  _all() {
    return window.ErpRuntime?.hasTypedData?.() ? window.ErpRuntime.state().contracts : []
  },
  _statusMap: {
    active: { label: 'فعال', badge: 'success' },
    draft: { label: 'پیش‌نویس', badge: 'muted' },
    done: { label: 'اتمام یافته', badge: 'info' },
    cancelled: { label: 'لغو شده', badge: 'danger' }
  },

  _statusOf(c) {
    const key = c.status || 'active'
    return this._statusMap[key] || { label: key, badge: 'muted' }
  },

  _color(i) { return this._cadres[i % this._cadres.length] },

  _couple(c) {
    if (c.couple) return c.couple
    const b = c.bride || '', g = c.groom || ''
    return b && g ? `${b} و ${g}` : b || g || '—'
  },

  _bride(c) { return c.bride || (c.couple ? c.couple.split(' و ')[0] : '') || '—' },
  _groom(c) { return c.groom || (c.couple ? c.couple.split(' و ')[1] : '') || '—' },

  _eventDate(c) { return c.eventDate || c.date || '—' },

  _daysLeft(c) {
    const d = this._eventDate(c)
    if (d === '—' || typeof Utils === 'undefined') return null
    return Utils.daysUntil(d)
  },

  _refundLabel(v) {
    const map = { cash: 'نقدی', card: 'کارت به کارت', cheque: 'چک', partial: 'برگشت جزئی', none: 'بدون برگشت (جریمه)' }
    return map[v] || v || '—'
  },

  _daysBadge(days) {
    if (days === 0) return SMUI.badge('امروز مراسم', 'danger')
    if (days < 0) return SMUI.badge(`${Math.abs(days)} روز گذشته`, 'muted')
    if (days === 1) return SMUI.badge('فردا', 'warning')
    if (days <= 7) return SMUI.badge(`${days} روز مانده`, 'warning')
    return SMUI.badge(`${days} روز مانده`, 'info')
  },

  _verifyLabel(c) {
    const v = c.verification
    if (!v) return SMUI.badge('بدون استعلام', 'muted')
    const g = v.groom?.verified
    const b = v.bride?.verified
    if (g && (!c.phoneBride && !c.bridePhone || b)) return SMUI.badge('تأیید پیامکی', 'success')
    if (g || b) return SMUI.badge('تأیید جزئی', 'warning')
    return SMUI.badge('تأیید نشده', 'danger')
  },

  _paymentsBlock(c) {
    if (typeof FinanceSync === 'undefined') return '<p style="font-size:.85rem;color:var(--sm-text-muted)">—</p>'
    const txs = FinanceSync.contractPayments(c.id)
    const invs = FinanceSync.contractInvoices(c.id)
    if (!txs.length) {
      return `<p style="font-size:.85rem;color:var(--sm-text-muted)">هنوز واریزی در حسابداری ثبت نشده. با «ثبت واریز» یا هنگام قرارداد جدید، خودکار می‌آید.</p>`
    }
    return `<div class="sm-contract-payments">${txs.map(t => {
      const inv = invs.find(i => i.transactionId === t.id || i.id === t.invoiceId)
      const cat = FinanceSync.DEPOSIT_CATS[t.purposeCategory] || t.purposeCategory || 'واریز'
      return `<div class="sm-contract-pay-row">
        <div class="sm-contract-pay-head">
          <strong>${SM.esc(cat)}</strong>
          <span>${SM.fmt(t.amount)} تومان</span>
        </div>
        <div class="sm-contract-pay-meta">
          <span><i class="fas fa-building-columns"></i> ${SM.esc(FinanceSync.bankLabel(t.bankId))}</span>
          <span><i class="fas fa-calendar"></i> ${SM.esc(t.date || '—')}</span>
          ${t.transactionRef ? `<span dir="ltr">پیگیری: ${SM.esc(t.transactionRef)}</span>` : ''}
        </div>
        <div class="sm-contract-pay-links">
          ${inv ? `<button type="button" class="sm-btn sm-btn-sm sm-btn-ghost" ${SMEvents.attrs('SMModules.contracts.openInvoice', [inv.number || ''])}><i class="fas fa-file-invoice"></i> فاکتور ${SM.esc(inv.number || '')}</button>` : ''}
          <button type="button" class="sm-btn sm-btn-sm sm-btn-ghost" ${SMEvents.attrs('SM.navigate', ["accounting"])}><i class="fas fa-book"></i> حسابداری</button>
        </div>
      </div>`
    }).join('')}</div>`
  },

  addPayment(contractId) {
    const c = this._all().find(x => x.id === contractId)
    if (!c) return
    const banks = window.ErpRuntime?.state?.().bankAccounts || []
    const bankOpts = [{ value: '', label: '— انتخاب حساب —' }, ...banks.map(b => ({
      value: b.id, label: typeof FinanceSync !== 'undefined' ? FinanceSync.bankLabel(b.id) : (b.name || b.bank)
    }))]
    SMUI.modal(`ثبت واریز — ${this._couple(c)}`, `
      <p style="font-size:.82rem;color:var(--sm-text-muted);margin:0 0 12px">واریز در <strong>حسابداری</strong> و <strong>فاکتورها</strong> خودکار ثبت می‌شود.</p>
      ${SMUI.formField('مبلغ (تومان)', 'cp-amt', { type: 'number', dir: 'ltr' })}
      ${SMUI.formField('واریز به حساب', 'cp-bank', { type: 'select', options: bankOpts })}
      ${SMUI.formField('بابت', 'cp-cat', { type: 'select', options: [
        { value: 'contract_payment', label: 'پرداخت قرارداد' },
        { value: 'contract_deposit', label: 'بیعانه (اگر قبلاً ثبت نشده)' }
      ]})}
      ${SMUI.formField('تاریخ', 'cp-date', { value: Utils.todayJalali() })}
      ${SMUI.formField('روش', 'cp-method', { type: 'select', options: [
        { value: 'transfer', label: 'انتقال / کارت' }, { value: 'cash', label: 'نقد' }, { value: 'pos', label: 'کارتخوان' }
      ]})}
      ${SMUI.formField('شماره پیگیری', 'cp-ref', { dir: 'ltr' })}
      ${SMUI.formField('شرح', 'cp-note', { type: 'textarea' })}`, {
      width: 480,
      onSave: async () => {
        const d = SMUI.readForm(['cp-amt', 'cp-bank', 'cp-cat', 'cp-date', 'cp-method', 'cp-ref', 'cp-note'])
        const amount = +d['cp-amt'] || 0
        if (!amount || !d['cp-bank']) return SM.toast('مبلغ و حساب بانکی الزامی است', 'error')
        if (typeof FinanceSync === 'undefined') return SM.toast('FinanceSync بارگذاری نشده', 'error')
        try {
          const res = await (d['cp-cat'] === 'contract_deposit'
            ? FinanceSync.recordContractInitialDeposit(c, d['cp-bank'], {
              paymentMethod: d['cp-method'], transactionRef: d['cp-ref'], date: d['cp-date'], notes: d['cp-note']
            })
            : FinanceSync.recordContractPayment({
              contractId: c.id, amount, bankId: d['cp-bank'],
              purposeCategory: 'contract_payment',
              date: d['cp-date'], paymentMethod: d['cp-method'], transactionRef: d['cp-ref'], notes: d['cp-note']
            }))
          if (!res.ok && !res.skipped) return SM.toast(res.error || 'خطا', 'error')
          SMUI.closeModal()
          SM.toast(res.skipped ? 'بیعانه قبلاً ثبت شده' : 'واریز ثبت شد — حسابداری و فاکتور', 'success')
          this.view(contractId)
        } catch (e) {
          SM.toast(e.message || 'خطا در ثبت واریز', 'error')
        }
      }
    })
  },

  selectRow(id) {
    this._selectedId = this._selectedId === id ? null : id
    document.querySelectorAll('.sm-contract-row').forEach(r => {
      r.classList.toggle('is-selected', r.dataset.id === this._selectedId)
    })
  },

  openInvoice(number) {
    SM.navigate('invoices')
    SM.setModuleSearch('invoices', number || '')
  },

  openEditor(id) {
    const q = id ? `?id=${encodeURIComponent(id)}` : ''
    window.location.href = `../contract.html${q}`
  },

  _sort(list) {
    return list.slice().sort((a, b) => {
      const da = this._eventDate(a)
      const db = this._eventDate(b)
      if (da === '—' && db === '—') return 0
      if (da === '—') return 1
      if (db === '—') return -1
      return da.localeCompare(db)
    })
  },

  render(el) {
    const q = SM.getModuleSearch('contracts')
    let contracts = this._all()
    if (q) {
      contracts = contracts.filter(c =>
        [c.couple, c.groom, c.bride, c.contractNum, c.eventDate, c.date].join(' ').toLowerCase().includes(q)
      )
    }
    contracts = this._sort(contracts)

    el.innerHTML = `
      ${SMUI.sectionHead('قراردادها', 'مرتب‌شده بر اساس تاریخ مراسم', `
        <button class="sm-btn sm-btn-primary" ${SMEvents.attrs('SMModules.contracts.openEditor')}><i class="fas fa-plus"></i> قرارداد جدید</button>`)}
      ${SMUI.moduleSearch('contracts', 'جستجو در قراردادها — نام، شماره، تاریخ...')}
      ${contracts.length ? `
        <div class="sm-contract-list">
          <div class="sm-contract-list-head">
            <span>شماره</span><span>زوج</span><span>تاریخ مراسم</span><span>مبلغ</span><span>وضعیت</span><span>عملیات</span>
          </div>
          ${contracts.map((c, i) => this._row(c, i)).join('')}
        </div>` : SMUI.empty('fa-file-signature', q ? 'قراردادی یافت نشد' : 'قراردادی ثبت نشده')}
    `
  },

  _row(c, i) {
    const color = this._color(i)
    const st = this._statusOf(c)
    const days = this._daysLeft(c)
    const num = c.contractNum || c.id || '—'
    const paid = (c.deposit || 0) + (c.paid || 0)
    const remain = Math.max(0, (c.total || 0) - paid)
    const isCancelled = c.status === 'cancelled'
    const selected = this._selectedId === c.id ? ' is-selected' : ''

    return `<div class="sm-contract-row${isCancelled ? ' is-cancelled' : ''}${selected}" style="--ct-color:${color}" data-id="${c.id}" ${SMEvents.elAttrs('SMModules.contracts.selectRow', [c.id])} role="button" tabindex="0">
      <div class="sm-contract-cell sm-contract-num" dir="ltr"><span class="sm-contract-pill">${SM.esc(num)}</span></div>
      <div class="sm-contract-cell sm-contract-couple">
        <span class="sm-couple-name">${SM.esc(this._bride(c))}</span>
        <span class="sm-couple-sep">و</span>
        <span class="sm-couple-name sm-couple-name-sub">${SM.esc(this._groom(c))}</span>
      </div>
      <div class="sm-contract-cell sm-contract-date">
        <strong>${SM.esc(this._eventDate(c))}</strong>
        ${days !== null ? `<div class="sm-contract-days">${this._daysBadge(days)}</div>` : ''}
      </div>
      <div class="sm-contract-cell sm-contract-amt">
        <div class="sm-contract-amt-val">${SM.fmt(c.total || 0)} <small>تومان</small></div>
        ${remain > 0 && !isCancelled ? `<div class="sm-contract-remain">مانده: ${SM.fmt(remain)}</div>` : ''}
      </div>
      <div class="sm-contract-cell sm-contract-status">
        <div class="sm-contract-status-stack">
          ${SMUI.badge(st.label, st.badge)}
          ${this._verifyLabel(c)}
        </div>
      </div>
      <div class="sm-contract-cell sm-contract-actions">
        <button type="button" class="sm-btn sm-btn-sm sm-btn-ghost sm-contract-act" title="مشاهده" ${SMEvents.attrs('SMModules.contracts.view', [c.id])} data-sm-stop="1"><i class="fas fa-eye"></i></button>
        <button type="button" class="sm-btn sm-btn-sm sm-btn-primary sm-contract-act" title="ویرایش" ${SMEvents.attrs('SMModules.contracts.edit', [c.id])} data-sm-stop="1"><i class="fas fa-pen"></i></button>
        ${!isCancelled ? `<button type="button" class="sm-btn sm-btn-sm sm-btn-danger sm-btn-outline sm-contract-act" title="لغو قرارداد" ${SMEvents.attrs('SMModules.contracts.quickCancel', [c.id])} data-sm-stop="1"><i class="fas fa-ban"></i></button>` : ''}
      </div>
    </div>`
  },

  quickCancel(id) {
    const c = this._all().find(x => x.id === id)
    if (!c) return
    if (!confirm(`قرارداد «${this._couple(c)}» لغو شود؟`)) return
    this.edit(id, true)
  },

  view(id) {
    const c = this._all().find(x => x.id === id)
    if (!c) return
    const paid = (c.deposit || 0) + (c.paid || 0)
    const remain = Math.max(0, (c.total || 0) - paid)
    const st = this._statusOf(c)
    const idx = this._sort(this._all()).findIndex(x => x.id === id)
    const color = this._color(Math.max(0, idx))

    SM.pushSubView(this._couple(c), () => `
      <div class="sm-contract-detail" style="--ct-color:${color}">
        <div class="sm-contract-detail-banner">
          <div>
            <div class="sm-detail-couple">
              <span class="sm-couple-name">${SM.esc(this._bride(c))}</span>
              <span class="sm-couple-sep">و</span>
              <span class="sm-couple-name sm-couple-name-sub">${SM.esc(this._groom(c))}</span>
            </div>
            <div class="sm-detail-meta">شماره: <span dir="ltr">${SM.esc(c.contractNum || c.id)}</span> · مراسم: ${SM.esc(this._eventDate(c))}</div>
          </div>
          ${SMUI.badge(st.label, st.badge)}
        </div>
        <div class="sm-grid-2">
          <div class="sm-card sm-contract-detail-card">
            <div class="sm-card-head"><div class="sm-card-title">اطلاعات مالی</div></div>
            <div class="sm-card-body">
              <p><strong>مبلغ کل:</strong> ${SM.fmt(c.total || 0)} تومان</p>
              <p style="margin-top:8px"><strong>بیعانه:</strong> ${SM.fmt(c.deposit || 0)} تومان</p>
              <p style="margin-top:8px"><strong>پرداخت‌های بعدی:</strong> ${SM.fmt(c.paid || 0)} تومان</p>
              <p style="margin-top:8px"><strong>جمع پرداخت‌شده:</strong> ${SM.fmt(paid)} تومان</p>
              <p style="margin-top:8px"><strong>مانده:</strong> ${SM.fmt(remain)} تومان</p>
              ${c.depositBankId && typeof FinanceSync !== 'undefined' ? `<p style="margin-top:8px"><strong>حساب بیعانه:</strong> ${SM.esc(FinanceSync.bankLabel(c.depositBankId))}</p>` : ''}
              ${c.venue ? `<p style="margin-top:8px"><strong>تالار:</strong> ${SM.esc(c.venue)}</p>` : ''}
              <p style="margin-top:12px"><strong>استعلام پیامکی:</strong> ${this._verifyLabel(c)}</p>
            </div>
          </div>
          <div class="sm-card sm-contract-detail-card">
            <div class="sm-card-head"><div class="sm-card-title">واریزی‌ها · حسابداری · فاکتور</div>
              <button type="button" class="sm-btn sm-btn-sm sm-btn-primary" ${SMEvents.attrs('SMModules.contracts.addPayment', [c.id])}><i class="fas fa-plus"></i> ثبت واریز</button>
            </div>
            <div class="sm-card-body">${this._paymentsBlock(c)}</div>
          </div>
          <div class="sm-card sm-contract-detail-card">
            <div class="sm-card-head"><div class="sm-card-title">عملیات</div></div>
            <div class="sm-card-body" style="display:flex;flex-direction:column;gap:10px">
              <button class="sm-btn sm-btn-primary" ${SMEvents.attrs('SMModules.contracts.edit', [c.id])}><i class="fas fa-pen"></i> ویرایش / وضعیت</button>
              <button class="sm-btn sm-btn-ghost" ${SMEvents.attrs('SMModules.contracts.openEditor', [c.id])}><i class="fas fa-file-contract"></i> فرم کامل قرارداد</button>
              <button class="sm-btn sm-btn-ghost" ${SMEvents.attrs('SM.navigate', ["timeline"])}><i class="fas fa-clock"></i> تایم‌لاین</button>
            </div>
          </div>
        </div>
        ${c.status === 'cancelled' && c.cancelRecord ? `
          <div class="sm-card sm-contract-cancel-card" style="margin-top:16px">
            <div class="sm-card-head"><div class="sm-card-title">📋 ثبت لغو (عملیاتی)</div></div>
            <div class="sm-card-body sm-cancel-record">
              <p><strong>مبلغ پرداخت‌شده:</strong> ${SM.fmt(c.cancelRecord.paidAmount || 0)} تومان</p>
              <p><strong>شماره حساب:</strong> <span dir="ltr">${SM.esc(c.cancelRecord.bankAccount || '—')}</span></p>
              <p><strong>دریافت‌کننده / واریز به:</strong> ${SM.esc(c.cancelRecord.paidTo || '—')}</p>
              <p><strong>نحوه برگشت:</strong> ${SM.esc(this._refundLabel(c.cancelRecord.refundMethod))}</p>
              ${c.cancelRecord.refundNotes ? `<p><strong>توضیحات:</strong> ${SM.esc(c.cancelRecord.refundNotes)}</p>` : ''}
              <p class="sm-cancel-meta">ثبت: ${SM.esc(c.cancelRecord.recordedAt || '—')} · ${SM.esc(c.cancelRecord.recordedBy || 'سیستم')}</p>
            </div>
          </div>` : ''}
      </div>`)
  },

  _toggleCancelFields() {
    const sel = document.getElementById('ct-status')
    const box = document.getElementById('ct-cancel-fields')
    if (sel && box) box.hidden = sel.value !== 'cancelled'
  },

  edit(id, focusCancel = false) {
    const c = this._all().find(x => x.id === id)
    if (!c) return
    const idx = this._sort(this._all()).findIndex(x => x.id === id)
    const color = this._color(Math.max(0, idx))
    if (!window.DomainApi || !window.ErpRuntime?.hasTypedData?.()) {
      return SM.toast('دادهٔ معتبر قرارداد هنوز از سرور دریافت نشده است', 'warning')
    }
    const banks = window.ErpRuntime.state().bankAccounts || []
    const bankOpts = [{ value: '', label: '— انتخاب حساب —' }, ...banks.map(b => ({
      value: b.id, label: `${b.title || b.bankName || 'حساب'} ${b.cardLast4 ? `••${b.cardLast4}` : ''}`
    }))]

    SMUI.modal('ویرایش قرارداد', `
      <div class="sm-contract-modal-banner" style="--ct-color:${color}">
        <span class="sm-couple-name">${SM.esc(this._bride(c))}</span>
        <span class="sm-couple-sep">و</span>
        <span class="sm-couple-name sm-couple-name-sub">${SM.esc(this._groom(c))}</span>
        <span class="sm-modal-banner-date">${SM.esc(this._eventDate(c))}</span>
      </div>
      ${SMUI.formField('وضعیت قرارداد', 'ct-status', { type: 'select', value: focusCancel ? 'cancelled' : (c.status || 'active'), options: [
        { value: 'active', label: 'فعال' },
        { value: 'done', label: 'اتمام یافته' },
        { value: 'cancelled', label: 'لغو شده' }
      ]})}
      <div id="ct-cancel-fields" class="sm-cancel-fields"${c.status !== 'cancelled' && !focusCancel ? ' hidden' : ''}>
        <div class="sm-cancel-fields-title">ثبت عملیات لغو — مالی</div>
        ${SMUI.formField('مبلغ استرداد (تومان)', 'ct-refund-amount', { type: 'number', value: 0, dir: 'ltr' })}
        ${SMUI.formField('مبلغ جریمه (تومان)', 'ct-penalty', { type: 'number', value: 0, dir: 'ltr' })}
        ${SMUI.formField('حساب پرداخت استرداد', 'ct-bank', { type: 'select', options: bankOpts })}
        ${SMUI.formField('علت و توضیحات لغو', 'ct-notes', { type: 'textarea' })}
      </div>
      ${SMUI.formField('یادداشت تغییر وضعیت', 'ct-note', { type: 'textarea', value: '' })}`, {
      width: 520,
      onSave: async () => {
        const d = SMUI.readForm(['ct-status', 'ct-refund-amount', 'ct-penalty', 'ct-bank', 'ct-notes', 'ct-note'])
        const status = d['ct-status']
        if (status === c.status) { SMUI.closeModal(); return }
        if (status === 'cancelled') {
          const refundToman = +d['ct-refund-amount'] || 0
          const penaltyToman = +d['ct-penalty'] || 0
          if (!d['ct-notes'] || (refundToman > 0 && !d['ct-bank'])) {
            return SM.toast('علت لغو و برای استرداد، حساب بانکی الزامی است', 'error')
          }
          await window.DomainApi.cancelContract({ contractId: c.id, expectedVersion: c.lifecycleVersion,
            refundIrr: refundToman * 10, penaltyIrr: penaltyToman * 10,
            bankId: d['ct-bank'], reason: d['ct-notes'] })
        } else {
          await window.DomainApi.transitionContract({ contractId: c.id, expectedVersion: c.lifecycleVersion,
            status, note: d['ct-note'] || '' })
        }
        await window.ErpRuntime.refresh({ force: true })
        SMUI.closeModal()
        SMH.refresh('contracts')
      }
    })
    setTimeout(() => {
      document.getElementById('ct-status')?.addEventListener('change', () => SMModules.contracts._toggleCancelFields())
      SMModules.contracts._toggleCancelFields()
    }, 40)
  }
}
