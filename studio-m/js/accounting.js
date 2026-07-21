/* Studio M — حسابداری: بانک · رفت‌وبرگشت · چک · فاکتور · PDF */

const SMAccounting = {
  _tab: 'banks',
  _flowFilter: 'all',
  _chequeFilter: 'all',
  _ledgerPage: 0,
  _ledgerPageSize: 40,

  MONTHS: ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'],

  BANK_COLORS: ['#0071E3', '#5856D6', '#009688', '#E68619', '#34C759', '#00A3BF', '#FF375F'],

  SOURCE_TYPES: {
    customer: 'مشتری / قرارداد',
    personnel: 'پرسنل',
    rent: 'اجاره / کرایه',
    other: 'سایر'
  },

  DEPOSIT_CATS: {
    contract_deposit: 'بیعانه قرارداد',
    contract_payment: 'پرداخت قرارداد',
    other_income: 'درآمد متفرقه',
    rent: 'دریافت اجاره',
    equipment_rent: 'کرایه تجهیزات',
    refund_received: 'بازگشت وجه دریافتی',
    transfer: 'انتقال بین حساب'
  },

  WITHDRAWAL_CATS: {
    cancellation_refund: 'کنسلی / استرداد مراسم',
    personnel: 'پرداخت پرسنل',
    equipment: 'خرید تجهیزات',
    print: 'چاپ / آلبوم',
    utility: 'قبض / آب برق گاز',
    rent: 'پرداخت اجاره',
    transfer: 'انتقال بین حساب',
    other: 'سایر هزینه'
  },

  CHEQUE_PURPOSES: {
    print: 'چاپ / آلبوم',
    equipment: 'خرید وسیله',
    contract: 'قرارداد / مشتری',
    personnel: 'پرسنل',
    rent: 'اجاره',
    utility: 'قبض',
    other: 'سایر'
  },

  setTab(tab) {
    this._tab = tab
    SM.navigate('accounting')
  },

  setFlowFilter(f) {
    this._flowFilter = f
    this._ledgerPage = 0
    SM.navigate('accounting')
  },

  setLedgerPage(p) {
    this._ledgerPage = Math.max(0, Number(p) || 0)
    SM.navigate('accounting')
  },

  setChequeFilter(f) {
    this._chequeFilter = f
    SM.navigate('accounting')
  },

  _couple(c) {
    if (!c) return '—'
    return c.couple || (c.bride && c.groom ? `${c.bride} و ${c.groom}` : c.bride || c.groom || '—')
  },

  _personName(id) {
    const p = DB.find('personnel', x => x.id === id)
    return p?.name || '—'
  },

  _bankName(id) {
    const b = DB.find('banks', x => x.id === id)
    return b ? (b.name || b.bank || 'حساب') : '—'
  },

  _bankAccount(b) {
    return b?.account || b?.accountNumber || ''
  },

  _bankIban(b) {
    return b?.iban || b?.shaba || ''
  },

  _chequeType(c) {
    return c?.type || c?.direction || 'incoming'
  },

  _chequeNumber(c) {
    return c?.number || c?.chequeNumber || ''
  },

  _chequeParty(c) {
    return c?.client || c?.drawer || c?.party || ''
  },

  _maskCard(num) {
    const s = String(num || '').replace(/\s/g, '')
    if (s.length < 8) return s || '—'
    return `${s.slice(0, 4)} •••• •••• ${s.slice(-4)}`
  },

  _fmtSheba(iban) {
    const s = String(iban || '').replace(/\s/g, '').toUpperCase()
    if (!s) return '—'
    return s.replace(/(.{4})/g, '$1 ').trim()
  },

  _txSummary(t) {
    const parts = []
    if (t.personnelId) parts.push(this._personName(t.personnelId))
    if (t.client) parts.push(t.client)
    if (t.purpose) parts.push(t.purpose)
    else if (t.purposeCategory) {
      const cats = t.type === 'deposit' ? this.DEPOSIT_CATS : this.WITHDRAWAL_CATS
      parts.push(cats[t.purposeCategory] || t.purposeCategory)
    }
    return parts.join(' — ') || t.desc || '—'
  },

  render(el) {
    const q = SM.getModuleSearch('accounting')
    const allTx = (typeof DB.active === 'function' ? DB.active('transactions') : (DB.get('transactions') || []).filter(t => !t._deleted))
    const income = allTx.filter(t => t.type === 'deposit' && t.purposeCategory !== 'transfer').reduce((s, t) => s + (t.amount || 0), 0)
    const expense = allTx.filter(t => t.type === 'withdrawal' && t.purposeCategory !== 'transfer').reduce((s, t) => s + (t.amount || 0), 0)
    const cheques = (typeof DB.active === 'function' ? DB.active('cheques') : (DB.get('cheques') || []).filter(c => !c._deleted))

    el.innerHTML = `
      ${SMUI.sectionHead('حسابداری', 'بانک · رفت‌وبرگشت · چک', this._headActions())}
      ${SMUI.moduleSearch('accounting', 'جستجو — بانک، مبلغ، مشتری، پرسنل...')}
      ${SMUI.statCards([
        { label: 'واریز کل', value: SM.fmt(income), icon: 'fa-arrow-down', color: 'var(--sm-success)' },
        { label: 'برداشت کل', value: SM.fmt(expense), icon: 'fa-arrow-up', color: 'var(--sm-danger)' },
        { label: 'مانده', value: SM.fmt(income - expense), icon: 'fa-scale-balanced', color: 'var(--sm-accent)' },
        { label: 'چک فعال', value: SM.fmt(cheques.filter(c => c.status !== 'passed' && c.status !== 'cancelled').length), icon: 'fa-money-check', color: 'var(--sm-warning)' }
      ])}
      ${SMUI.tabs([
        { id: 'banks', label: 'بانک', icon: 'fa-building-columns', fn: 'SMAccounting.setTab', args: ['banks'] },
        { id: 'ledger', label: 'رفت‌وبرگشت', icon: 'fa-book', fn: 'SMAccounting.setTab', args: ['ledger'] },
        { id: 'cheques', label: 'چک', icon: 'fa-money-check-alt', fn: 'SMAccounting.setTab', args: ['cheques'] }
      ], this._tab)}
      <div class="sm-acc-body">${this._renderTab(q)}</div>`
  },

  _headActions() {
    const flow = `<button type="button" class="sm-btn sm-btn-primary" ${SMEvents.attrs('SMAccounting.openFlowMenu')}><i class="fas fa-right-left"></i> واریز و برداشت</button>`
    let extra = ''
    if (this._tab === 'banks') {
      extra = `<button type="button" class="sm-btn sm-btn-ghost" ${SMEvents.attrs('SMAccounting.addBank')}><i class="fas fa-plus"></i> افزودن بانک</button>`
    } else if (this._tab === 'cheques') {
      extra = `<button type="button" class="sm-btn sm-btn-ghost" ${SMEvents.attrs('SMAccounting.addCheque')}><i class="fas fa-plus"></i> ثبت چک</button>`
    }
    return `<div class="sm-acc-head-actions">${flow}${extra}</div>`
  },

  openFlowMenu() {
    SMUI.modal('واریز و برداشت', `
      <p class="sm-acc-flow-hint">نوع تراکنش را انتخاب کنید — جزئیات در فرم بعدی ثبت می‌شود و در فاکتورها هم می‌آید.</p>
      <div class="sm-acc-flow-pick">
        <button type="button" class="sm-acc-flow-btn is-in" ${SMEvents.attrs('SMAccounting.flowDeposit')}>
          <i class="fas fa-arrow-down"></i>
          <div><strong>ثبت واریز</strong><span>مشتری، بیعانه، قرارداد، درآمد</span></div>
        </button>
        <button type="button" class="sm-acc-flow-btn is-out" ${SMEvents.attrs('SMAccounting.flowWithdrawal')}>
          <i class="fas fa-arrow-up"></i>
          <div><strong>ثبت برداشت</strong><span>کنسلی، پرسنل، اجاره، هزینه</span></div>
        </button>
        <button type="button" class="sm-acc-flow-btn" ${SMEvents.attrs('SMAccounting.flowTransfer')}>
          <i class="fas fa-exchange-alt"></i>
          <div><strong>انتقال بین حساب</strong><span>از یک بانک/صندوق به دیگری</span></div>
        </button>
      </div>`, { width: 440 })
  },

  flowDeposit() { SMUI.closeModal(); this.addDeposit() },
  flowWithdrawal() { SMUI.closeModal(); this.addWithdrawal() },
  flowTransfer() { SMUI.closeModal(); this.addTransfer() },

  _renderTab(q) {
    if (this._tab === 'banks') return this._banksView(q)
    if (this._tab === 'cheques') return this._chequesView(q)
    return this._ledgerView(q)
  },

  _banksView(q) {
    let banks = typeof DB.active === 'function' ? DB.active('banks') : (DB.get('banks') || []).filter(b => !b._deleted)
    if (q) {
      banks = banks.filter(b =>
        [b.name, b.bank, b.account, b.accountNumber, b.card, b.iban, b.shaba, b.holder, b.balance].join(' ').toLowerCase().includes(q)
      )
    }
    if (!banks.length) {
      return `${SMUI.empty('fa-building-columns', q ? 'بانکی یافت نشد' : 'هنوز حساب بانکی ثبت نشده', 'نام بانک، کارت، شبا و حساب را اضافه کنید')}
        ${!q ? `<div style="text-align:center;margin-top:12px"><button type="button" class="sm-btn sm-btn-primary" ${SMEvents.attrs('SMAccounting.addBank')}><i class="fas fa-plus"></i> اولین بانک</button></div>` : ''}`
    }
    return `<div class="sm-acc-bank-grid">${banks.map((b, i) => this._bankCard(b, i)).join('')}</div>`
  },

  _bankCard(b, i) {
    const color = this.BANK_COLORS[i % this.BANK_COLORS.length]
    const account = this._bankAccount(b)
    const iban = this._bankIban(b)
    return `<div class="sm-acc-bank" style="--bank-color:${color}">
      <div class="sm-acc-bank-top">
        <div class="sm-acc-bank-icon"><i class="fas fa-building-columns"></i></div>
        <div class="sm-acc-bank-title">
          <strong>${SM.esc(b.name || b.bank || 'حساب بانکی')}</strong>
          <span>${SM.esc(b.bank || '')}${b.holder ? ` · ${SM.esc(b.holder)}` : ''}</span>
        </div>
        <button type="button" class="sm-btn sm-btn-sm sm-btn-ghost" ${SMEvents.attrs('SMAccounting.editBank', [b.id])} title="ویرایش"><i class="fas fa-pen"></i></button>
      </div>
      <div class="sm-acc-bank-balance">${SM.fmt(b.balance || 0)} <small>تومان</small></div>
      <div class="sm-acc-bank-fields">
        <div class="sm-acc-bank-field"><span>شماره کارت</span><code dir="ltr">${SM.esc(b.card ? this._maskCard(b.card) : '—')}</code></div>
        <div class="sm-acc-bank-field"><span>شماره حساب</span><code dir="ltr">${SM.esc(account || '—')}</code></div>
        <div class="sm-acc-bank-field sm-acc-bank-field--full"><span>شماره شبا</span><code dir="ltr">${SM.esc(this._fmtSheba(iban))}</code></div>
      </div>
    </div>`
  },

  _ledgerView(q) {
    let tx = (typeof DB.active === 'function' ? DB.active('transactions') : (DB.get('transactions') || []).filter(t => !t._deleted)).slice().reverse()
    if (this._flowFilter === 'deposit') tx = tx.filter(t => t.type === 'deposit')
    if (this._flowFilter === 'withdrawal') tx = tx.filter(t => t.type === 'withdrawal')
    if (this._flowFilter === 'transfer') tx = tx.filter(t => t.purposeCategory === 'transfer')
    if (q) {
      tx = tx.filter(t => {
        const c = t.contractId ? DB.find('contracts', x => x.id === t.contractId) : null
        return [t.date, t.type, t.desc, t.amount, t.client, t.purpose, t.periodMonth, t.transactionRef,
          this._bankName(t.bankId), this._personName(t.personnelId), c && this._couple(c)].join(' ').toLowerCase().includes(q)
      })
    }

    const pageFn = (typeof paginate === 'function')
      ? paginate
      : (typeof ListPage !== 'undefined' ? ListPage.paginate : null)
    const page = pageFn
      ? pageFn(tx, this._ledgerPage, this._ledgerPageSize)
      : { items: tx.slice(0, this._ledgerPageSize), page: 0, pages: 1, total: tx.length, hasPrev: false, hasNext: tx.length > this._ledgerPageSize }

    const filters = [
      { id: 'all', label: 'همه' },
      { id: 'deposit', label: 'واریز', cls: 'is-in' },
      { id: 'withdrawal', label: 'برداشت', cls: 'is-out' },
      { id: 'transfer', label: 'انتقال' }
    ]

    return `
      <div class="sm-inv-cats">
        ${filters.map(f => `
          <button type="button" class="sm-inv-cat ${f.cls || ''}${this._flowFilter === f.id ? ' active' : ''}"
            ${SMEvents.attrs('SMAccounting.setFlowFilter', [f.id])}>${f.label}</button>`).join('')}
      </div>
      <div class="sm-acc-tx-list">
        ${page.items.length ? page.items.map(t => this._txRow(t)).join('') : SMUI.empty('fa-book', q ? 'تراکنشی یافت نشد' : 'تراکنشی ثبت نشده — از دکمه «واریز و برداشت» بالا استفاده کنید')}
      </div>
      ${page.pages > 1 ? `<div class="sm-pager" style="display:flex;gap:8px;justify-content:center;margin-top:12px;align-items:center">
        <button type="button" class="sm-btn sm-btn-sm sm-btn-ghost" ${page.hasPrev ? '' : 'disabled '}
          ${SMEvents.attrs('SMAccounting.setLedgerPage', [page.page - 1])}>قبلی</button>
        <span style="font-size:.85rem;color:var(--sm-text-muted)">${(page.page + 1).toLocaleString('fa-IR')} / ${page.pages.toLocaleString('fa-IR')} — ${page.total.toLocaleString('fa-IR')} مورد</span>
        <button type="button" class="sm-btn sm-btn-sm sm-btn-ghost" ${page.hasNext ? '' : 'disabled '}
          ${SMEvents.attrs('SMAccounting.setLedgerPage', [page.page + 1])}>بعدی</button>
      </div>` : ''}`
  },

  _txRow(t) {
    const isIn = t.type === 'deposit'
    const contract = t.contractId ? DB.find('contracts', x => x.id === t.contractId) : null
    const cats = isIn ? this.DEPOSIT_CATS : this.WITHDRAWAL_CATS
    const catLabel = cats[t.purposeCategory] || (isIn ? 'واریز' : 'برداشت')
    const srcLabel = this.SOURCE_TYPES[t.sourceType]
    const isTransfer = t.purposeCategory === 'transfer'

    return `<div class="sm-acc-tx${isIn ? ' is-in' : ' is-out'}">
      <div class="sm-acc-tx-stripe"></div>
      <div class="sm-acc-tx-icon"><i class="fas fa-${isTransfer ? 'exchange-alt' : (isIn ? 'arrow-down' : 'arrow-up')}"></i></div>
      <div class="sm-acc-tx-body">
        <div class="sm-acc-tx-top">
          ${SMUI.badge(catLabel, isTransfer ? 'info' : (isIn ? 'success' : 'danger'))}
          ${srcLabel ? SMUI.badge(srcLabel, 'muted') : ''}
          ${t.invoiceId ? SMUI.badge('در فاکتور', 'info') : ''}
          ${t.chequeId ? SMUI.badge('از چک', 'warning') : ''}
          <span class="sm-acc-tx-date">${SM.esc(t.date || '—')}</span>
        </div>
        <div class="sm-acc-tx-title">${SM.esc(this._txSummary(t))}</div>
        <div class="sm-acc-tx-meta">
          ${t.periodMonth ? `<span>📅 ${SM.esc(t.periodMonth)}</span>` : ''}
          ${t.client ? `<span>👤 ${SM.esc(t.client)}</span>` : ''}
          ${t.personnelId ? `<span>👷 ${SM.esc(this._personName(t.personnelId))}</span>` : ''}
          ${contract ? `<span>📄 ${SM.esc(this._couple(contract))}</span>` : ''}
          ${t.bankId ? `<span>🏦 ${SM.esc(this._bankName(t.bankId))}</span>` : ''}
          ${t.transactionRef ? `<span dir="ltr">🔖 ${SM.esc(t.transactionRef)}</span>` : ''}
        </div>
      </div>
      <div class="sm-acc-tx-side">
        <div class="sm-acc-tx-amt">${isIn ? '+' : '−'} ${SM.fmt(t.amount || 0)} <small>تومان</small></div>
        <div class="sm-acc-tx-btns">
          <button type="button" class="sm-btn sm-btn-sm sm-btn-ghost" title="PDF"
            ${SMEvents.attrs('SMAccounting.printReceipt', [t.id])}><i class="fas fa-file-pdf"></i></button>
          ${!isTransfer ? `<button type="button" class="sm-btn sm-btn-sm sm-btn-ghost"
            ${SMEvents.attrs('SMAccounting.editTx', [t.id])}><i class="fas fa-pen"></i></button>` : ''}
        </div>
      </div>
    </div>`
  },

  _payLabel(m) {
    return { transfer: 'کارت به کارت', cash: 'نقد', cheque: 'چک', card: 'کارت', pos: 'POS' }[m] || m
  },

  _chequesView(q) {
    const all = typeof DB.active === 'function' ? DB.active('cheques') : (DB.get('cheques') || []).filter(c => !c._deleted)
    let cheques = all.slice().reverse()
    if (this._chequeFilter === 'incoming') cheques = cheques.filter(c => this._chequeType(c) === 'incoming')
    if (this._chequeFilter === 'outgoing') cheques = cheques.filter(c => this._chequeType(c) === 'outgoing')
    if (this._chequeFilter === 'pending') cheques = cheques.filter(c => (c.status || 'pending') === 'pending')
    if (q) {
      cheques = cheques.filter(c =>
        [this._chequeNumber(c), c.bank, c.amount, c.dueDate, c.purpose, this._chequeParty(c), c.transactionRef, c.iban].join(' ').toLowerCase().includes(q)
      )
    }
    const incoming = all.filter(c => this._chequeType(c) === 'incoming')
    const outgoing = all.filter(c => this._chequeType(c) === 'outgoing')
    const pendingAmt = all.filter(c => (c.status || 'pending') === 'pending').reduce((s, c) => s + (c.amount || 0), 0)

    const filters = [
      { id: 'all', label: 'همه' },
      { id: 'incoming', label: 'دریافتی', cls: 'is-in' },
      { id: 'outgoing', label: 'پرداختی', cls: 'is-out' },
      { id: 'pending', label: 'در انتظار' }
    ]

    return `
      <div class="sm-acc-chq-summary">
        <div class="sm-acc-chq-sum is-in"><span>چک دریافتی</span><strong>${incoming.length.toLocaleString('fa-IR')}</strong><small>${SM.fmt(incoming.reduce((s, c) => s + (c.amount || 0), 0))} ت</small></div>
        <div class="sm-acc-chq-sum is-out"><span>چک پرداختی</span><strong>${outgoing.length.toLocaleString('fa-IR')}</strong><small>${SM.fmt(outgoing.reduce((s, c) => s + (c.amount || 0), 0))} ت</small></div>
        <div class="sm-acc-chq-sum"><span>در انتظار پاس</span><strong>${SM.fmt(pendingAmt)}</strong><small>تومان</small></div>
      </div>
      <div class="sm-inv-cats">
        ${filters.map(f => `
          <button type="button" class="sm-inv-cat ${f.cls || ''}${this._chequeFilter === f.id ? ' active' : ''}"
            ${SMEvents.attrs('SMAccounting.setChequeFilter', [f.id])}>${f.label}</button>`).join('')}
      </div>
      <div class="sm-acc-tx-list">
        ${cheques.length ? cheques.map(c => this._chequeRow(c)).join('') : SMUI.empty('fa-money-check', q ? 'چکی یافت نشد' : 'چکی ثبت نشده')}
      </div>`
  },

  _chequeRow(c) {
    const isIn = this._chequeType(c) === 'incoming'
    const purpose = this.CHEQUE_PURPOSES[c.purposeCategory] || c.purpose || '—'
    const st = { pending: 'در انتظار', passed: 'وصول شده', bounced: 'برگشتی', cancelled: 'ابطال' }[c.status] || c.status
    const status = c.status || 'pending'
    const party = this._chequeParty(c)
    const num = this._chequeNumber(c)

    let actions = `<button type="button" class="sm-btn sm-btn-sm sm-btn-ghost" title="ویرایش"
      ${SMEvents.attrs('SMAccounting.editCheque', [c.id])}><i class="fas fa-pen"></i></button>`
    if (status === 'pending') {
      actions = `
        <button type="button" class="sm-btn sm-btn-sm sm-btn-primary" title="وصول / پاس"
          ${SMEvents.attrs('SMAccounting.passCheque', [c.id])}><i class="fas fa-check"></i></button>
        <button type="button" class="sm-btn sm-btn-sm sm-btn-ghost" title="برگشتی"
          ${SMEvents.attrs('SMAccounting.bounceCheque', [c.id])}><i class="fas fa-undo"></i></button>
        <button type="button" class="sm-btn sm-btn-sm sm-btn-ghost" title="ابطال"
          ${SMEvents.attrs('SMAccounting.cancelCheque', [c.id])}><i class="fas fa-ban"></i></button>
        ${actions}`
    } else if (status === 'passed') {
      actions = `
        <button type="button" class="sm-btn sm-btn-sm sm-btn-ghost" title="لغو پاس"
          ${SMEvents.attrs('SMAccounting.revertPassCheque', [c.id])}><i class="fas fa-rotate-left"></i></button>
        ${actions}`
    }

    return `<div class="sm-acc-tx sm-acc-chq${isIn ? ' is-in' : ' is-out'}">
      <div class="sm-acc-tx-stripe"></div>
      <div class="sm-acc-tx-icon"><i class="fas fa-money-check"></i></div>
      <div class="sm-acc-tx-body">
        <div class="sm-acc-tx-top">
          ${SMUI.badge(isIn ? 'دریافت چک' : 'صدور چک', isIn ? 'success' : 'danger')}
          ${SMUI.badge(st, status === 'passed' ? 'success' : status === 'bounced' ? 'danger' : 'warning')}
          <span class="sm-acc-tx-date">${SM.esc(c.dueDate || c.issueDate || '—')}</span>
        </div>
        <div class="sm-acc-tx-title"><span dir="ltr">${SM.esc(num || '—')}</span> · ${SM.esc(c.bank || this._bankName(c.bankId))}</div>
        <div class="sm-acc-tx-meta">
          <span>📋 ${SM.esc(purpose)}</span>
          ${party ? `<span>👤 ${SM.esc(party)}</span>` : ''}
          ${c.bankId ? `<span>🏦 ${SM.esc(this._bankName(c.bankId))}</span>` : ''}
          ${c.transactionRef ? `<span dir="ltr">🔖 ${SM.esc(c.transactionRef)}</span>` : ''}
        </div>
      </div>
      <div class="sm-acc-tx-side">
        <div class="sm-acc-tx-amt">${isIn ? '+' : '−'} ${SM.fmt(c.amount || 0)} <small>تومان</small></div>
        <div class="sm-acc-tx-btns">${actions}</div>
      </div>
    </div>`
  },

  /* ── PDF رسید ── */
  printReceipt(txId) {
    const t = DB.find('transactions', x => x.id === txId)
    if (!t) return
    const studio = SM.studio()
    const bank = t.bankId ? DB.find('banks', b => b.id === t.bankId) : null
    const contract = t.contractId ? DB.find('contracts', c => c.id === t.contractId) : null
    const isIn = t.type === 'deposit'
    const cats = isIn ? this.DEPOSIT_CATS : this.WITHDRAWAL_CATS
    const catLabel = cats[t.purposeCategory] || (isIn ? 'واریز' : 'برداشت')
    const inv = t.invoiceId ? DB.find('invoices', i => i.id === t.invoiceId) : null

    const html = `
      <div id="sm-receipt-doc" class="sm-receipt-doc" dir="rtl">
        <div class="sm-receipt-head">
          <strong>${SM.esc(studio.name || 'Studio M')}</strong>
          <span>رسید ${isIn ? 'واریز' : 'برداشت'}</span>
        </div>
        <div class="sm-receipt-amt ${isIn ? 'in' : 'out'}">${isIn ? '+' : '−'} ${SM.fmt(t.amount || 0)} <small>تومان</small></div>
        <table class="sm-receipt-table">
          <tr><td>تاریخ</td><td>${SM.esc(t.date || '—')}</td></tr>
          ${t.periodMonth ? `<tr><td>ماه / دوره</td><td>${SM.esc(t.periodMonth)}</td></tr>` : ''}
          <tr><td>بابت</td><td>${SM.esc(catLabel)}${t.purpose ? ' — ' + SM.esc(t.purpose) : ''}</td></tr>
          ${t.client ? `<tr><td>طرف</td><td>${SM.esc(t.client)}</td></tr>` : ''}
          ${t.personnelId ? `<tr><td>پرسنل</td><td>${SM.esc(this._personName(t.personnelId))}</td></tr>` : ''}
          ${contract ? `<tr><td>قرارداد</td><td>${SM.esc(this._couple(contract))}</td></tr>` : ''}
          ${bank ? `<tr><td>حساب</td><td>${SM.esc(bank.name || bank.bank || '')}</td></tr>` : ''}
          ${t.transactionRef ? `<tr><td>پیگیری</td><td dir="ltr">${SM.esc(t.transactionRef)}</td></tr>` : ''}
          ${inv ? `<tr><td>شماره فاکتور</td><td dir="ltr">${SM.esc(inv.number)}</td></tr>` : ''}
          ${t.notes ? `<tr><td>توضیح</td><td>${SM.esc(t.notes)}</td></tr>` : ''}
        </table>
        <div class="sm-receipt-foot">Studio M Pro · ${Utils.todayJalali()}</div>
      </div>`

    const wrap = document.createElement('div')
    wrap.innerHTML = html
    document.body.appendChild(wrap)
    const el = document.getElementById('sm-receipt-doc')
    const fname = `رسید-${isIn ? 'واریز' : 'برداشت'}-${(t.date || '').replace(/\//g, '')}-${t.amount}.pdf`

    const done = () => { wrap.remove() }

    const runPdf = () => {
      if (typeof html2pdf !== 'undefined') {
        html2pdf().set({
          margin: 12,
          filename: fname,
          image: { type: 'jpeg', quality: 0.98 },
          html2canvas: { scale: 2, useCORS: true },
          jsPDF: { unit: 'mm', format: 'a5', orientation: 'portrait' }
        }).from(el).save().then(done).catch(() => { window.print(); done() })
        return
      }
      const w = window.open('', '_blank')
      if (w) {
        w.document.write(`<html dir="rtl"><head><title></title><style>
          body{font-family:Vazirmatn,Tahoma,sans-serif;padding:24px;color:#111}
          .sm-receipt-amt{font-size:28px;font-weight:800;margin:16px 0}
          .sm-receipt-amt.in{color:#34C759}.sm-receipt-amt.out{color:#FF3B30}
          table{width:100%;border-collapse:collapse} td{padding:8px;border-bottom:1px solid #eee;font-size:13px}
          td:first-child{color:#666;width:35%;font-weight:600}
        </style></head><body></body></html>`)
        w.document.close()
        w.document.title = fname
        w.document.body.innerHTML = html
        w.print()
      }
      done()
    }

    if (typeof SMExport !== 'undefined' && SMExport.ensurePdfLibs) {
      SMExport.ensurePdfLibs().then(runPdf).catch(runPdf)
    } else {
      runPdf()
    }
  },

  /* ── Bank ── */
  addBank() { this._bankForm(null) },
  editBank(id) { this._bankForm(DB.find('banks', b => b.id === id)) },

  _bankForm(item) {
    SMUI.modal(item ? 'ویرایش حساب بانکی' : 'افزودن حساب بانکی', `
      ${SMUI.formField('عنوان حساب', 'ab-title', { value: item?.name || '', placeholder: 'مثلاً: حساب اصلی استودیو' })}
      ${SMUI.formField('نام بانک', 'ab-bank', { value: item?.bank || '', placeholder: 'ملت، ملی، پاسارگاد...' })}
      ${SMUI.formField('نام صاحب حساب', 'ab-holder', { value: item?.holder || '' })}
      ${SMUI.formField('شماره کارت', 'ab-card', { value: item?.card || '', dir: 'ltr', placeholder: '6037…' })}
      ${SMUI.formField('شماره حساب', 'ab-account', { value: this._bankAccount(item) || '', dir: 'ltr' })}
      ${SMUI.formField('شماره شبا', 'ab-iban', { value: this._bankIban(item) || '', dir: 'ltr', placeholder: 'IR…' })}
      ${item
        ? `<p class="sm-hint" style="font-size:.78rem;color:var(--sm-text-muted);margin:0 0 8px">موجودی از طریق دفترکل (واریز/برداشت/انتقال) به‌روز می‌شود و از اینجا قابل ویرایش نیست.</p>
           <div class="sm-form-field"><label>موجودی فعلی</label><div dir="ltr">${SM.fmt(item.balance || 0)} تومان</div></div>`
        : SMUI.formField('موجودی اولیه (تومان)', 'ab-balance', { type: 'number', value: '', dir: 'ltr' })}`, {
      onSave: async () => {
        const d = SMUI.readForm(['ab-title', 'ab-bank', 'ab-holder', 'ab-card', 'ab-account', 'ab-iban', 'ab-balance'])
        if (!d['ab-title'] && !d['ab-bank']) return SM.toast('نام بانک یا عنوان حساب الزامی است', 'error')
        const account = d['ab-account'] || ''
        const iban = d['ab-iban'] || ''
        const data = {
          name: d['ab-title'], bank: d['ab-bank'], holder: d['ab-holder'],
          card: d['ab-card'], account, accountNumber: account, iban, shaba: iban
        }
        if (item) {
          // Metadata-only on edit — ledger-managed balance must not be clobbered here
          await SecureDB.update('banks', item.id, data)
        } else {
          await SecureDB.insert('banks', { ...data, balance: +d['ab-balance'] || 0 })
        }
        SMH.refresh('accounting')
      },
      onDelete: item ? () => SMH.remove('banks', item.id, 'accounting') : null,
      width: 480
    })
  },

  /* ── Transfer ── */
  addTransfer() {
    const banks = typeof DB.active === 'function' ? DB.active('banks') : (DB.get('banks') || []).filter(b => !b._deleted)
    if (banks.length < 2) {
      return SM.toast('برای انتقال حداقل دو حساب بانکی نیاز است', 'error')
    }
    const bankOpts = banks.map(b => ({
      value: b.id,
      label: `${b.name || b.bank || 'حساب'} — ${SM.fmt(b.balance || 0)} ت`
    }))
    const monthOpts = this.MONTHS.map(m => ({ value: m, label: m }))

    SMUI.modal('انتقال بین حساب', `
      ${SMUI.formField('از حساب', 'xf-from', { type: 'select', value: bankOpts[0]?.value || '', options: bankOpts })}
      ${SMUI.formField('به حساب', 'xf-to', { type: 'select', value: bankOpts[1]?.value || '', options: bankOpts })}
      ${SMUI.formField('مبلغ (تومان)', 'xf-amt', { type: 'number', value: '', dir: 'ltr' })}
      ${SMUI.formField('تاریخ', 'xf-date', { value: Utils.todayJalali() })}
      ${SMUI.formField('ماه / دوره', 'xf-month', { type: 'select', value: '', options: [{ value: '', label: '—' }, ...monthOpts] })}
      ${SMUI.formField('شماره پیگیری', 'xf-ref', { value: '', dir: 'ltr' })}
      ${SMUI.formField('شرح', 'xf-notes', { type: 'textarea', value: '', placeholder: 'مثلاً: شارژ صندوق نقدی' })}`, {
      onSave: async () => {
        const d = SMUI.readForm(['xf-from', 'xf-to', 'xf-amt', 'xf-date', 'xf-month', 'xf-ref', 'xf-notes'])
        const amount = +d['xf-amt'] || 0
        if (!amount) return SM.toast('مبلغ الزامی است', 'error')
        if (typeof FinanceSync === 'undefined') return SM.toast('ماژول مالی در دسترس نیست', 'error')
        const res = await FinanceSync.transferBetweenBanks({
          fromBankId: d['xf-from'],
          toBankId: d['xf-to'],
          amount,
          date: d['xf-date'] || Utils.todayJalali(),
          periodMonth: d['xf-month'] || '',
          transactionRef: d['xf-ref'] || '',
          notes: d['xf-notes'] || '',
          purpose: d['xf-notes'] || 'انتقال بین حساب'
        })
        if (!res.ok) return SM.toast(res.error || 'خطا در انتقال', 'error')
        SM.toast('انتقال بین حساب‌ها ثبت شد', 'success')
        this._tab = 'ledger'
        this._flowFilter = 'transfer'
        SMH.refresh('accounting')
      },
      width: 480
    })
  },

  /* ── Transactions ── */
  addDeposit() { this._txForm(null, 'deposit') },
  addWithdrawal() { this._txForm(null, 'withdrawal') },
  editTx(id) {
    const t = DB.find('transactions', x => x.id === id)
    if (t) this._txForm(t, t.type)
  },

  _bindTxFormFields(contracts, _personnel) {
    const syncPanels = () => {
      const src = document.getElementById('tx-source')?.value
      const cat = document.getElementById('tx-cat')?.value
      const cust = document.getElementById('tx-customer-fields')
      const pers = document.getElementById('tx-personnel-fields')
      const rent = document.getElementById('tx-rent-fields')
      if (cust) cust.style.display = src === 'customer' ? '' : 'none'
      if (pers) pers.style.display = (src === 'personnel' || cat === 'personnel') ? '' : 'none'
      if (rent) rent.style.display = src === 'rent' ? '' : 'none'
    }
    document.getElementById('tx-source')?.addEventListener('change', syncPanels)
    document.getElementById('tx-cat')?.addEventListener('change', syncPanels)
    document.getElementById('tx-contract')?.addEventListener('change', e => {
      const c = contracts.find(x => x.id === e.target.value)
      if (!c) return
      const client = document.getElementById('tx-client')
      if (client && !client.value) client.value = this._couple(c)
    })
    syncPanels()
  },

  _txForm(item, type) {
    const isIn = type === 'deposit'
    const banks = typeof DB.active === 'function' ? DB.active('banks') : (DB.get('banks') || []).filter(b => !b._deleted)
    const contracts = (typeof DB.active === 'function' ? DB.active('contracts') : DB.get('contracts')).filter(c => c.status !== 'cancelled' && !c._deleted)
    const personnel = (typeof DB.active === 'function' ? DB.active('personnel') : DB.get('personnel')).filter(p => p.status !== 'inactive' && !p._deleted)
    const cats = isIn ? this.DEPOSIT_CATS : this.WITHDRAWAL_CATS
    const bankOpts = [{ value: '', label: '— انتخاب حساب بانکی —' }, ...banks.map(b => ({
      value: b.id, label: `${b.name || b.bank} — ${this._bankAccount(b) || this._maskCard(b.card) || ''}`
    }))]
    const contractOpts = [{ value: '', label: '— انتخاب قرارداد —' }, ...contracts.map(c => ({
      value: c.id, label: `${this._couple(c)} (${c.contractNum || c.id})`
    }))]
    const personnelOpts = [{ value: '', label: '— انتخاب پرسنل —' }, ...personnel.map(p => ({
      value: p.id, label: p.name
    }))]
    const catOpts = Object.entries(cats)
      .filter(([k]) => k !== 'transfer')
      .map(([k, v]) => ({ value: k, label: v }))
    const monthOpts = this.MONTHS.map(m => ({ value: m, label: m }))
    const srcOpts = Object.entries(this.SOURCE_TYPES).map(([k, v]) => ({ value: k, label: v }))
    const src = item?.sourceType || (isIn ? 'customer' : 'other')
    const showPers = src === 'personnel' || item?.purposeCategory === 'personnel'
    const defaultCat = item?.purposeCategory && item.purposeCategory !== 'transfer'
      ? item.purposeCategory
      : (catOpts[0]?.value || '')

    SMUI.modal(isIn ? 'ثبت واریز' : 'ثبت برداشت', `
      ${SMUI.formField('مبلغ (تومان)', 'tx-amt', { type: 'number', value: item?.amount || '', dir: 'ltr' })}
      ${SMUI.formField('تاریخ', 'tx-date', { value: item?.date || Utils.todayJalali() })}
      ${SMUI.formField('ماه / دوره', 'tx-month', { type: 'select', value: item?.periodMonth || '', options: [{ value: '', label: '—' }, ...monthOpts] })}
      ${SMUI.formField(isIn ? 'واریز به حساب' : 'برداشت از حساب', 'tx-bank', { type: 'select', value: item?.bankId || '', options: bankOpts })}
      ${SMUI.formField('طرف / منبع', 'tx-source', { type: 'select', value: src, options: srcOpts })}
      <div id="tx-customer-fields"${src !== 'customer' ? ' style="display:none"' : ''}>
        ${SMUI.formField('قرارداد', 'tx-contract', { type: 'select', value: item?.contractId || '', options: contractOpts })}
        ${SMUI.formField('نام مشتری / زوج', 'tx-client', { value: item?.client || '' })}
      </div>
      <div id="tx-personnel-fields"${showPers ? '' : ' style="display:none"'}>
        ${SMUI.formField('پرسنل', 'tx-personnel', { type: 'select', value: item?.personnelId || '', options: personnelOpts })}
      </div>
      <div id="tx-rent-fields"${src !== 'rent' ? ' style="display:none"' : ''}>
        ${SMUI.formField('بابت اجاره / کرایه', 'tx-rent-desc', { value: item?.sourceType === 'rent' ? (item?.purpose || '') : '', placeholder: 'مثلاً: اجاره تالار، کرایه وسیله' })}
      </div>
      ${SMUI.formField('دسته / بابت', 'tx-cat', { type: 'select', value: defaultCat, options: catOpts })}
      ${SMUI.formField('شرح دقیق', 'tx-purpose', { value: item?.purpose || '', placeholder: isIn ? 'مثلاً: بیعانه مراسم' : 'مثلاً: استرداد کنسلی' })}
      ${SMUI.formField('روش پرداخت', 'tx-method', { type: 'select', value: item?.paymentMethod || 'transfer', options: [
        { value: 'transfer', label: 'کارت به کارت / انتقال' },
        { value: 'cash', label: 'نقد' },
        { value: 'cheque', label: 'چک' },
        { value: 'pos', label: 'کارتخوان' }
      ]})}
      ${SMUI.formField('شماره پیگیری', 'tx-ref', { value: item?.transactionRef || '', dir: 'ltr' })}
      ${SMUI.formField('شماره کارت / حساب طرف', 'tx-card', { value: item?.accountOrCard || '', dir: 'ltr' })}
      ${SMUI.formField('توضیحات', 'tx-notes', { type: 'textarea', value: item?.notes || item?.desc || '' })}
      <label class="sm-check-row"><input type="checkbox" id="tx-sync-inv" ${item?.invoiceId || !item ? 'checked' : ''}/> ثبت در بخش فاکتورها</label>`, {
      onSave: async () => {
        const d = SMUI.readForm(['tx-amt', 'tx-date', 'tx-month', 'tx-bank', 'tx-source', 'tx-contract', 'tx-client', 'tx-personnel', 'tx-rent-desc', 'tx-cat', 'tx-purpose', 'tx-method', 'tx-ref', 'tx-card', 'tx-notes'])
        const amount = +d['tx-amt'] || 0
        if (!amount) return SM.toast('مبلغ الزامی است', 'error')
        if (!d['tx-bank']) return SM.toast('انتخاب حساب بانکی الزامی است', 'error')

        const contract = contracts.find(c => c.id === d['tx-contract'])
        const sourceType = d['tx-source'] || 'other'
        const catsMap = isIn ? this.DEPOSIT_CATS : this.WITHDRAWAL_CATS
        const catLabel = catsMap[d['tx-cat']] || ''
        let client = d['tx-client'] || ''
        if (sourceType === 'customer' && contract && !client) client = this._couple(contract)
        if (sourceType === 'rent' && d['tx-rent-desc']) client = d['tx-rent-desc']

        let purpose = d['tx-purpose'] || ''
        if (sourceType === 'rent' && d['tx-rent-desc'] && !purpose) purpose = d['tx-rent-desc']

        const data = {
          type,
          amount,
          date: d['tx-date'] || Utils.todayJalali(),
          periodMonth: d['tx-month'] || '',
          bankId: d['tx-bank'],
          sourceType,
          contractId: sourceType === 'customer' ? (d['tx-contract'] || '') : '',
          personnelId: (sourceType === 'personnel' || d['tx-cat'] === 'personnel') ? (d['tx-personnel'] || '') : '',
          client,
          purposeCategory: d['tx-cat'] || '',
          purpose: purpose || catLabel,
          paymentMethod: d['tx-method'] || 'transfer',
          transactionRef: d['tx-ref'] || '',
          accountOrCard: d['tx-card'] || '',
          notes: d['tx-notes'] || '',
          desc: purpose || d['tx-notes'] || catLabel
        }

        const syncInv = !!document.getElementById('tx-sync-inv')?.checked

        // EDIT — atomic FinanceSync path
        if (item && typeof FinanceSync !== 'undefined') {
          const res = await FinanceSync.updateTransaction(item.id, data, {
            syncInvoice: syncInv,
            allowOverdraft: true
          })
          if (!res.ok) return SM.toast(res.error || 'خطا در ویرایش', 'error')
          SM.toast(res.invoiceId ? 'ویرایش شد و فاکتور به‌روز شد' : 'تراکنش ویرایش شد', 'success')
          SMH.refresh('accounting')
          return
        }

        // CREATE — atomic FinanceSync path (bank required by validation above)
        if (!item) {
          if (typeof FinanceSync === 'undefined') {
            return SM.toast('ماژول مالی در دسترس نیست', 'error')
          }
          const res = isIn
            ? await FinanceSync.recordDeposit({
              ...data,
              syncInvoice: syncInv,
              sourceType: data.sourceType
            })
            : await FinanceSync.recordWithdrawal({
              ...data,
              syncInvoice: syncInv,
              allowOverdraft: true
            })
          if (!res.ok) return SM.toast(res.error || 'خطا در ثبت', 'error')
          SM.toast(res.invoiceId ? 'ثبت شد و در فاکتورها قرار گرفت' : 'تراکنش ثبت شد', 'success')
          SMH.refresh('accounting')
          return
        }

        // EDIT without FinanceSync should never happen in Pro shell
        return SM.toast('ماژول مالی در دسترس نیست', 'error')
      },
      onDelete: item ? async () => {
        if (!SMH.confirmDelete()) return
        try {
          if (typeof FinanceSync === 'undefined') {
            return SM.toast('ماژول مالی در دسترس نیست', 'error')
          }
          const res = await FinanceSync.deleteTransaction(item.id)
          if (!res.ok) return SM.toast(res.error || 'خطا در حذف', 'error')
          SM.toast('تراکنش حذف و موجودی اصلاح شد', 'success')
          SMH.refresh('accounting')
        } catch (e) {
          SM.toast(e.message || 'خطا در حذف', 'error')
        }
      } : null,
      width: 540
    })

    this._bindTxFormFields(contracts, personnel)
  },

  /* ── Cheques ── */
  addCheque() { this._chequeForm(null) },
  editCheque(id) {
    const rows = typeof DB.active === 'function' ? DB.active('cheques') : (DB.get('cheques') || []).filter(c => !c._deleted)
    this._chequeForm(rows.find(c => c.id === id))
  },

  async passCheque(id) {
    if (typeof ChequeManager === 'undefined') return SM.toast('ماژول چک در دسترس نیست', 'error')
    if (!confirm('وصول این چک موجودی بانک و دفترکل را به‌روز می‌کند. ادامه؟')) return
    const res = await ChequeManager.passCheque(id)
    if (!res.ok) return SM.toast(res.msg || 'خطا', 'error')
    SM.toast('چک وصول و در حسابداری ثبت شد', 'success')
    SMH.refresh('accounting')
  },

  async bounceCheque(id) {
    if (typeof ChequeManager === 'undefined') return SM.toast('ماژول چک در دسترس نیست', 'error')
    const reason = prompt('دلیل برگشت چک (اختیاری):') ?? ''
    const res = await ChequeManager.bounceCheque(id, reason)
    if (!res.ok) return SM.toast(res.msg || 'خطا', 'error')
    SM.toast('وضعیت چک: برگشتی', 'warning')
    SMH.refresh('accounting')
  },

  async cancelCheque(id) {
    if (typeof ChequeManager === 'undefined') return SM.toast('ماژول چک در دسترس نیست', 'error')
    if (!confirm('این چک ابطال شود؟')) return
    const res = await ChequeManager.cancelCheque(id)
    if (!res.ok) return SM.toast(res.msg || 'خطا', 'error')
    SM.toast('چک ابطال شد', 'success')
    SMH.refresh('accounting')
  },

  async revertPassCheque(id) {
    if (typeof ChequeManager === 'undefined') return SM.toast('ماژول چک در دسترس نیست', 'error')
    if (!confirm('لغو پاس چک — موجودی بانک برمی‌گردد. ادامه؟')) return
    const res = await ChequeManager.revertPass(id)
    if (!res?.ok) return SM.toast(res?.msg || 'خطا', 'error')
    SM.toast('پاس چک لغو شد', 'success')
    SMH.refresh('accounting')
  },

  _chequeForm(item) {
    const banks = typeof DB.active === 'function' ? DB.active('banks') : (DB.get('banks') || []).filter(b => !b._deleted)
    const contracts = (typeof DB.active === 'function' ? DB.active('contracts') : DB.get('contracts')).filter(c => c.status !== 'cancelled' && !c._deleted)
    const bankOpts = [{ value: '', label: '—' }, ...banks.map(b => ({ value: b.id, label: b.name || b.bank }))]
    const contractOpts = [{ value: '', label: '—' }, ...contracts.map(c => ({ value: c.id, label: this._couple(c) }))]
    const purposeOpts = Object.entries(this.CHEQUE_PURPOSES).map(([k, v]) => ({ value: k, label: v }))
    const monthOpts = this.MONTHS.map(m => ({ value: m, label: m }))
    const type = this._chequeType(item) || 'incoming'
    const lockedStatus = item && (item.status === 'passed' || item.status === 'bounced')

    SMUI.modal(item ? 'ویرایش چک' : 'ثبت چک', `
      ${lockedStatus ? `<p class="sm-acc-flow-hint">وضعیت این چک با اکشن‌های وصول / برگشت / لغو پاس کنترل می‌شود.</p>` : ''}
      ${SMUI.formField('نوع چک', 'ch-type', { type: 'select', value: type, options: [
        { value: 'incoming', label: 'چک دریافتی' },
        { value: 'outgoing', label: 'چک پرداختی (صدور)' }
      ]})}
      ${SMUI.formField('شماره چک', 'ch-num', { value: this._chequeNumber(item) || '', dir: 'ltr' })}
      ${SMUI.formField('حساب بانکی', 'ch-bank-sel', { type: 'select', value: item?.bankId || '', options: bankOpts })}
      ${SMUI.formField('نام بانک', 'ch-bank', { value: item?.bank || '' })}
      ${SMUI.formField('مبلغ (تومان)', 'ch-amt', { type: 'number', value: item?.amount || '', dir: 'ltr' })}
      ${SMUI.formField('سررسید', 'ch-due', { value: item?.dueDate || '' })}
      ${SMUI.formField('تاریخ صدور / دریافت', 'ch-issue', { value: item?.issueDate || Utils.todayJalali() })}
      ${SMUI.formField('ماه / دوره', 'ch-month', { type: 'select', value: item?.periodMonth || '', options: [{ value: '', label: '—' }, ...monthOpts] })}
      ${SMUI.formField('بابت', 'ch-cat', { type: 'select', value: item?.purposeCategory || 'other', options: purposeOpts })}
      ${SMUI.formField('شرح', 'ch-purpose', { value: item?.purpose || '', placeholder: 'چاپ آلبوم، خرید دوربین...' })}
      ${SMUI.formField('قرارداد', 'ch-contract', { type: 'select', value: item?.contractId || '', options: contractOpts })}
      ${SMUI.formField('مشتری / طرف', 'ch-client', { value: this._chequeParty(item) || '' })}
      ${SMUI.formField('شماره پیگیری', 'ch-ref', { value: item?.transactionRef || '', dir: 'ltr' })}
      ${SMUI.formField('شماره شبا', 'ch-iban', { value: item?.iban || '', dir: 'ltr' })}
      ${SMUI.formField('شماره کارت', 'ch-card', { value: item?.cardNumber || '', dir: 'ltr' })}
      ${SMUI.formField('توضیحات', 'ch-notes', { type: 'textarea', value: item?.notes || '' })}`, {
      onSave: async () => {
        const d = SMUI.readForm(['ch-type', 'ch-num', 'ch-bank-sel', 'ch-bank', 'ch-amt', 'ch-due', 'ch-issue', 'ch-month', 'ch-cat', 'ch-purpose', 'ch-contract', 'ch-client', 'ch-ref', 'ch-iban', 'ch-card', 'ch-notes'])
        const amount = +d['ch-amt'] || 0
        if (!amount) return SM.toast('مبلغ الزامی است', 'error')
        if (!d['ch-bank-sel']) return SM.toast('انتخاب حساب بانکی الزامی است', 'error')
        const selBank = banks.find(b => b.id === d['ch-bank-sel'])
        const chType = d['ch-type'] || 'incoming'
        const number = d['ch-num'] || ''
        const client = d['ch-client'] || ''
        const data = {
          type: chType,
          direction: chType,
          number,
          chequeNumber: number,
          bankId: d['ch-bank-sel'] || '',
          bank: d['ch-bank'] || (selBank ? (selBank.bank || selBank.name) : ''),
          amount,
          dueDate: d['ch-due'],
          issueDate: d['ch-issue'],
          periodMonth: d['ch-month'] || '',
          purposeCategory: d['ch-cat'],
          purpose: d['ch-purpose'],
          contractId: d['ch-contract'] || '',
          client,
          drawer: client,
          party: client,
          transactionRef: d['ch-ref'],
          iban: d['ch-iban'],
          cardNumber: d['ch-card'],
          notes: d['ch-notes']
        }
        if (!item) data.status = 'pending'
        if (item) await SecureDB.update('cheques', item.id, data)
        else await SecureDB.insert('cheques', data)
        if (typeof ChequeManager !== 'undefined') ChequeManager.syncNotifications().catch(() => {})
        SMH.refresh('accounting')
      },
      onDelete: item && (item.status || 'pending') === 'pending'
        ? () => SMH.remove('cheques', item.id, 'accounting')
        : null,
      width: 540
    })
  }
}

SMModules.accounting = {
  setTab(tab) { SMAccounting.setTab(tab) },
  render(el) { SMAccounting.render(el) },
  addBank() { SMAccounting.addBank() },
  editBank(id) { SMAccounting.editBank(id) },
  addTx() { SMAccounting.openFlowMenu() },
  editTx(id) { SMAccounting.editTx(id) },
  addCheque() { SMAccounting.addCheque() },
  editCheque(id) { SMAccounting.editCheque(id) },
  addTransfer() { SMAccounting.addTransfer() },
  passCheque(id) { SMAccounting.passCheque(id) },
  bounceCheque(id) { SMAccounting.bounceCheque(id) },
  cancelCheque(id) { SMAccounting.cancelCheque(id) },
  revertPassCheque(id) { SMAccounting.revertPassCheque(id) }
}

window.SMAccounting = SMAccounting
