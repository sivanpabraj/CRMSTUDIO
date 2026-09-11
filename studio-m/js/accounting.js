/* Studio M — حسابداری: خزانه · کارت بانکی · رفت‌وبرگشت · چک · PDF */

const SMAccounting = {
  _tab: 'overview',
  _flowFilter: 'all',
  _selectedBankId: null,

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
    refund_received: 'بازگشت وجه دریافتی'
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

  _math() {
    return (typeof SMAccMath !== 'undefined' && SMAccMath) || (typeof window !== 'undefined' && window.SMAccMath) || null
  },

  setTab(tab) {
    this._tab = tab
    SM.navigate('accounting')
  },

  setFlowFilter(f) {
    this._flowFilter = f
    SM.navigate('accounting')
  },

  selectBank(id) {
    this._selectedBankId = this._selectedBankId === id ? null : id
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

  _maskCard(num) {
    const m = this._math()
    if (m?.maskCard) return m.maskCard(num)
    const s = String(num || '').replace(/\s/g, '')
    if (s.length < 8) return s || '—'
    return `${s.slice(0, 4)} •••• •••• ${s.slice(-4)}`
  },

  _fmtSheba(iban) {
    const m = this._math()
    if (m?.fmtSheba) return m.fmtSheba(iban)
    const s = String(iban || '').replace(/\s/g, '').toUpperCase()
    if (!s) return '—'
    return s.replace(/(.{4})/g, '$1 ').trim()
  },

  _cardOf(b) {
    return this._math()?.cardOf(b) || b?.card || b?.cardNumber || ''
  },

  _shebaOf(b) {
    return this._math()?.shebaOf(b) || b?.iban || b?.shaba || ''
  },

  _accountOf(b) {
    return this._math()?.accountOf(b) || b?.account || b?.accountNumber || ''
  },

  _effectiveBankId(banks) {
    if (this._selectedBankId && banks.some(b => b.id === this._selectedBankId)) return this._selectedBankId
    return banks[0]?.id || null
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

  _genInvoiceNumber() {
    const t = Utils.todayJalali().replace(/\//g, '')
    const n = DB.get('invoices').length + 1
    return `F-${t}-${String(n).padStart(3, '0')}`
  },

  _mapInvoiceType(tx) {
    if (tx.type === 'deposit') {
      if (tx.purposeCategory === 'contract_deposit') return 'customer_deposit'
      if (tx.purposeCategory === 'contract_payment') return 'customer_payment'
      return 'other'
    }
    if (tx.purposeCategory === 'personnel') return 'personnel'
    if (tx.purposeCategory === 'utility') return 'utility_electric'
    if (tx.purposeCategory === 'print') return 'expense'
    if (tx.purposeCategory === 'equipment') return 'expense'
    if (tx.purposeCategory === 'cancellation_refund') return 'transfer'
    return 'expense'
  },

  async _syncInvoice(txData, txId, existingInvoiceId) {
    if (!document.getElementById('tx-sync-inv')?.checked && !existingInvoiceId) return null
    if (typeof FinanceSync !== 'undefined') {
      return FinanceSync.createInvoiceFromTx(txData, txId, existingInvoiceId)
    }
    const bank = DB.find('banks', b => b.id === txData.bankId)
    const contract = txData.contractId ? DB.find('contracts', c => c.id === txData.contractId) : null
    const cats = txData.type === 'deposit' ? this.DEPOSIT_CATS : this.WITHDRAWAL_CATS
    const catLabel = cats[txData.purposeCategory] || ''
    let client = txData.client || ''
    if (txData.personnelId) client = this._personName(txData.personnelId)
    else if (contract && !client) client = this._couple(contract)

    const invPayload = {
      type: this._mapInvoiceType(txData),
      direction: txData.type === 'deposit' ? 'in' : 'out',
      title: txData.purpose || `${catLabel}${client ? ' — ' + client : ''}`,
      client,
      contractId: txData.contractId || '',
      personnelId: txData.personnelId || '',
      amount: txData.amount,
      date: txData.date,
      purpose: txData.purpose || catLabel,
      periodMonth: txData.periodMonth || '',
      bankId: txData.bankId || '',
      bankName: bank ? (bank.name || bank.bank || '') : '',
      accountOrCard: txData.accountOrCard || '',
      paymentMethod: txData.paymentMethod || 'transfer',
      description: txData.notes || '',
      status: 'paid',
      transactionId: txId,
      syncLedger: false
    }

    if (existingInvoiceId) {
      const ex = DB.find('invoices', i => i.id === existingInvoiceId)
      if (ex) await SecureDB.update('invoices', existingInvoiceId, { ...invPayload, number: ex.number })
      return existingInvoiceId
    }
    const num = this._genInvoiceNumber()
    const inv = await SecureDB.insert('invoices', { ...invPayload, number: num, createdAt: Utils.todayJalali() })
    return inv.id
  },

  render(el) {
    const q = SM.getModuleSearch('accounting')
    el.innerHTML = `
      ${SMUI.sectionHead('حسابداری', 'خزانه استودیو · کارت بانکی · گردش تولید', this._headActions())}
      ${SMUI.moduleSearch('accounting', 'جستجو — بانک، مبلغ، مشتری، پرسنل...')}
      ${SMUI.tabs([
        { id: 'overview', label: 'نمای کلی', icon: 'fa-wallet', onclick: "SMAccounting.setTab('overview')" },
        { id: 'banks', label: 'حساب‌ها', icon: 'fa-building-columns', onclick: "SMAccounting.setTab('banks')" },
        { id: 'ledger', label: 'رفت‌وبرگشت', icon: 'fa-right-left', onclick: "SMAccounting.setTab('ledger')" },
        { id: 'cheques', label: 'چک', icon: 'fa-money-check-alt', onclick: "SMAccounting.setTab('cheques')" }
      ], this._tab)}
      <div class="sm-acc-body">${this._renderTab(q)}</div>`
  },

  _headActions() {
    const flow = `<button type="button" class="sm-btn sm-btn-primary" onclick="SMAccounting.openFlowMenu()"><i class="fas fa-right-left"></i> واریز و برداشت</button>`
    let extra = ''
    if (this._tab === 'banks' || this._tab === 'overview') {
      extra = `<button type="button" class="sm-btn sm-btn-ghost" onclick="SMAccounting.addBank()"><i class="fas fa-plus"></i> افزودن بانک</button>`
    } else if (this._tab === 'cheques') {
      extra = `<button type="button" class="sm-btn sm-btn-ghost" onclick="SMAccounting.addCheque()"><i class="fas fa-plus"></i> ثبت چک</button>`
    }
    return `<div class="sm-acc-head-actions">${flow}${extra}</div>`
  },

  openFlowMenu() {
    SMUI.modal('واریز و برداشت', `
      <p class="sm-acc-flow-hint">نوع تراکنش را انتخاب کنید — جزئیات در فرم بعدی ثبت می‌شود و در فاکتورها هم می‌آید.</p>
      <div class="sm-acc-flow-pick">
        <button type="button" class="sm-acc-flow-btn is-in" onclick="SMUI.closeModal();SMAccounting.addDeposit()">
          <i class="fas fa-arrow-down"></i>
          <div><strong>ثبت واریز</strong><span>مشتری، بیعانه، قرارداد، درآمد</span></div>
        </button>
        <button type="button" class="sm-acc-flow-btn is-out" onclick="SMUI.closeModal();SMAccounting.addWithdrawal()">
          <i class="fas fa-arrow-up"></i>
          <div><strong>ثبت برداشت</strong><span>کنسلی، پرسنل، اجاره، هزینه</span></div>
        </button>
      </div>`, { width: 440 })
  },

  _renderTab(q) {
    if (this._tab === 'banks') return this._banksView(q)
    if (this._tab === 'cheques') return this._chequesView(q)
    if (this._tab === 'ledger') return this._ledgerView(q)
    return this._overviewView(q)
  },

  _overviewView(q) {
    const math = this._math()
    const banks = DB.get('banks') || []
    const allTx = DB.get('transactions') || []
    const cheques = DB.get('cheques') || []
    const today = Utils.todayJalali()
    const key = math ? math.monthKey(today) : String(today || '').slice(0, 7)
    const month = math ? math.monthTotals(allTx, key) : { deposit: 0, withdrawal: 0 }
    const totalBal = math ? math.bankBalanceSum(banks) : banks.reduce((s, b) => s + (+b.balance || 0), 0)
    const flow = math ? math.cashflow12(allTx, today) : []
    const mix = math ? math.expenseMix(allTx) : { total: 0, items: [] }
    const activeId = this._effectiveBankId(banks)
    const openCheques = cheques.filter(c => c.status !== 'passed' && c.status !== 'cancelled').length

    let tx = allTx.slice().reverse()
    if (activeId) tx = tx.filter(t => t.bankId === activeId)
    if (q) {
      tx = tx.filter(t => {
        const c = t.contractId ? DB.find('contracts', x => x.id === t.contractId) : null
        return [t.date, t.type, t.desc, t.amount, t.client, t.purpose, this._bankName(t.bankId), this._personName(t.personnelId), c && this._couple(c)].join(' ').toLowerCase().includes(q)
      })
    }
    tx = tx.slice(0, 8)

    const mixVisible = mix.items.filter(i => i.amount > 0)
    const mixBar = mixVisible.length
      ? mixVisible.map(i => `<span class="sm-vault-mix-seg" style="flex:${Math.max(i.pct, 2)};background:${i.color}" title="${SM.esc(i.label)}"></span>`).join('')
      : '<span class="sm-vault-mix-seg is-empty"></span>'

    return `
      <section class="sm-vault" aria-label="خزانه مالی استودیو">
        <div class="sm-vault-kpis">
          <article class="sm-vault-kpi">
            <span>موجودی کل</span>
            <strong>${SM.fmt(totalBal)}</strong>
            <small>تومان · مجموع حساب‌ها</small>
          </article>
          <article class="sm-vault-kpi is-in">
            <span>واریز این ماه</span>
            <strong>${SM.fmt(month.deposit)}</strong>
            <small>تومان · ${SM.esc(key)}</small>
          </article>
          <article class="sm-vault-kpi is-out">
            <span>برداشت این ماه</span>
            <strong>${SM.fmt(month.withdrawal)}</strong>
            <small>تومان · چک فعال ${SM.fmt(openCheques)}</small>
          </article>
        </div>

        <div class="sm-vault-block">
          <div class="sm-vault-block-head">
            <h3>کارت‌های من</h3>
            <span>شماره کارت پوشیده است — فقط موجودی و شبا</span>
          </div>
          ${banks.length ? `<div class="sm-vault-deck" role="list">${banks.map(b => this._physCard(b, b.id === activeId)).join('')}</div>` : `
            <div class="sm-vault-empty">
              ${SMUI.empty('fa-building-columns', 'هنوز حساب بانکی ثبت نشده', 'برای دیدن کارت فیزیکی، بانک را اضافه کنید')}
              <button type="button" class="sm-btn sm-btn-primary" onclick="SMAccounting.addBank()"><i class="fas fa-plus"></i> اولین بانک</button>
            </div>`}
        </div>

        <div class="sm-vault-split">
          <div class="sm-vault-panel">
            <div class="sm-vault-block-head">
              <h3>گردش ۱۲ ماه</h3>
              <span>واریز طلایی · برداشت آبی</span>
            </div>
            <div class="sm-vault-cf" role="img" aria-label="نمودار گردش دوازده ماه شمسی">
              ${flow.map(r => `
                <div class="sm-vault-cf-col" title="${SM.esc(r.label)}: واریز ${SM.fmt(r.deposit)} · برداشت ${SM.fmt(r.withdrawal)}">
                  <div class="sm-vault-cf-track">
                    <span class="sm-vault-cf-bar is-in" style="height:${Math.max(r.depositPct, r.deposit ? 4 : 0)}%"></span>
                    <span class="sm-vault-cf-bar is-out" style="height:${Math.max(r.withdrawalPct, r.withdrawal ? 4 : 0)}%"></span>
                  </div>
                  <small>${SM.esc(r.label)}</small>
                </div>`).join('')}
            </div>
          </div>
          <div class="sm-vault-panel">
            <div class="sm-vault-block-head">
              <h3>ترکیب برداشت</h3>
              <span>حقوق، چاپ، تجهیزات، اجاره</span>
            </div>
            <div class="sm-vault-mix-bar" aria-hidden="true">${mixBar}</div>
            <ul class="sm-vault-mix-list">
              ${(mixVisible.length ? mixVisible : mix.items).map(i => `
                <li>
                  <i style="background:${i.color}"></i>
                  <span>${SM.esc(i.label)}</span>
                  <strong>${SM.fmt(i.amount)} <small>${i.pct}٪</small></strong>
                </li>`).join('')}
            </ul>
          </div>
        </div>

        <div class="sm-vault-panel sm-vault-history">
          <div class="sm-vault-block-head">
            <h3>گردش حساب</h3>
            <button type="button" class="sm-vault-link" onclick="SMAccounting.setTab('ledger')">همه تراکنش‌ها</button>
          </div>
          <div class="sm-acc-tx-list sm-vault-tx">
            ${tx.length ? tx.map(t => this._txRow(t)).join('') : SMUI.empty('fa-book', q ? 'تراکنشی یافت نشد' : 'تراکنشی برای این حساب ثبت نشده')}
          </div>
        </div>
      </section>`
  },

  _physCard(b, selected) {
    const pan = this._cardOf(b)
    const sheba = this._fmtSheba(this._shebaOf(b))
    const holder = b.holder || b.name || 'صاحب حساب'
    const bank = b.bank || b.name || 'حساب بانکی'
    const cls = selected ? 'is-gold' : 'is-navy'
    return `<button type="button" class="sm-vault-card ${cls}" role="listitem" aria-pressed="${selected ? 'true' : 'false'}"
      onclick="SMAccounting.selectBank('${b.id}')">
      <div class="sm-vault-card-top">
        <span class="sm-vault-chip" aria-hidden="true"></span>
        <span class="sm-vault-nfc" aria-hidden="true"><i class="fas fa-wifi"></i></span>
      </div>
      <div class="sm-vault-pan" dir="ltr">${SM.esc(pan ? this._maskCard(pan) : 'بدون شماره کارت')}</div>
      <div class="sm-vault-sheba" dir="ltr">${SM.esc(sheba)}</div>
      <div class="sm-vault-card-foot">
        <div>
          <small>${SM.esc(bank)}</small>
          <strong>${SM.esc(holder)}</strong>
        </div>
        <div class="sm-vault-card-bal">
          <small>موجودی</small>
          <strong>${SM.fmt(b.balance || 0)}</strong>
        </div>
      </div>
      <span class="sm-vault-brand">Studio M</span>
    </button>`
  },

  _banksView(q) {
    let banks = DB.get('banks')
    if (q) {
      banks = banks.filter(b =>
        [b.name, b.bank, this._accountOf(b), this._cardOf(b), this._shebaOf(b), b.holder, b.balance].join(' ').toLowerCase().includes(q)
      )
    }
    if (!banks.length) {
      return `${SMUI.empty('fa-building-columns', q ? 'بانکی یافت نشد' : 'هنوز حساب بانکی ثبت نشده', 'نام بانک، کارت، شبا و حساب را اضافه کنید')}
        ${!q ? `<div style="text-align:center;margin-top:12px"><button type="button" class="sm-btn sm-btn-primary" onclick="SMAccounting.addBank()"><i class="fas fa-plus"></i> اولین بانک</button></div>` : ''}`
    }
    return `<div class="sm-acc-bank-grid">${banks.map((b, i) => this._bankCard(b, i)).join('')}</div>`
  },

  _bankCard(b, i) {
    const color = b.color || this.BANK_COLORS[i % this.BANK_COLORS.length]
    return `<div class="sm-acc-bank" style="--bank-color:${color}">
      <div class="sm-acc-bank-top">
        <div class="sm-acc-bank-icon"><i class="fas fa-building-columns"></i></div>
        <div class="sm-acc-bank-title">
          <strong>${SM.esc(b.name || b.bank || 'حساب بانکی')}</strong>
          <span>${SM.esc(b.bank || '')}${b.holder ? ` · ${SM.esc(b.holder)}` : ''}</span>
        </div>
        <button type="button" class="sm-btn sm-btn-sm sm-btn-ghost" onclick="SMAccounting.editBank('${b.id}')" title="ویرایش"><i class="fas fa-pen"></i></button>
      </div>
      <div class="sm-acc-bank-balance">${SM.fmt(b.balance || 0)} <small>تومان</small></div>
      <div class="sm-acc-bank-fields">
        <div class="sm-acc-bank-field"><span>شماره کارت</span><code dir="ltr">${SM.esc(this._cardOf(b) ? this._maskCard(this._cardOf(b)) : '—')}</code></div>
        <div class="sm-acc-bank-field"><span>شماره حساب</span><code dir="ltr">${SM.esc(this._accountOf(b) || '—')}</code></div>
        <div class="sm-acc-bank-field sm-acc-bank-field--full"><span>شماره شبا</span><code dir="ltr">${SM.esc(this._fmtSheba(this._shebaOf(b)))}</code></div>
      </div>
    </div>`
  },

  _ledgerView(q) {
    let tx = DB.get('transactions').slice().reverse()
    if (this._flowFilter === 'deposit') tx = tx.filter(t => t.type === 'deposit')
    if (this._flowFilter === 'withdrawal') tx = tx.filter(t => t.type === 'withdrawal')
    if (q) {
      tx = tx.filter(t => {
        const c = t.contractId ? DB.find('contracts', x => x.id === t.contractId) : null
        return [t.date, t.type, t.desc, t.amount, t.client, t.purpose, t.periodMonth, t.transactionRef,
          this._bankName(t.bankId), this._personName(t.personnelId), c && this._couple(c)].join(' ').toLowerCase().includes(q)
      })
    }

    const filters = [
      { id: 'all', label: 'همه' },
      { id: 'deposit', label: 'واریز', cls: 'is-in' },
      { id: 'withdrawal', label: 'برداشت', cls: 'is-out' }
    ]

    return `
      <div class="sm-inv-cats">
        ${filters.map(f => `
          <button type="button" class="sm-inv-cat ${f.cls || ''}${this._flowFilter === f.id ? ' active' : ''}"
            onclick="SMAccounting.setFlowFilter('${f.id}')">${f.label}</button>`).join('')}
      </div>
      <div class="sm-acc-tx-list">
        ${tx.length ? tx.map(t => this._txRow(t)).join('') : SMUI.empty('fa-book', q ? 'تراکنشی یافت نشد' : 'تراکنشی ثبت نشده — از دکمه «واریز و برداشت» بالا استفاده کنید')}
      </div>`
  },

  _txRow(t) {
    const isIn = t.type === 'deposit'
    const contract = t.contractId ? DB.find('contracts', x => x.id === t.contractId) : null
    const cats = isIn ? this.DEPOSIT_CATS : this.WITHDRAWAL_CATS
    const catLabel = cats[t.purposeCategory] || (isIn ? 'واریز' : 'برداشت')
    const srcLabel = this.SOURCE_TYPES[t.sourceType]

    return `<div class="sm-acc-tx${isIn ? ' is-in' : ' is-out'}">
      <div class="sm-acc-tx-stripe"></div>
      <div class="sm-acc-tx-icon"><i class="fas fa-${isIn ? 'arrow-down' : 'arrow-up'}"></i></div>
      <div class="sm-acc-tx-body">
        <div class="sm-acc-tx-top">
          ${SMUI.badge(catLabel, isIn ? 'success' : 'danger')}
          ${srcLabel ? SMUI.badge(srcLabel, 'muted') : ''}
          ${t.invoiceId ? SMUI.badge('در فاکتور', 'info') : ''}
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
          <button type="button" class="sm-btn sm-btn-sm sm-btn-ghost" onclick="SMAccounting.printReceipt('${t.id}')" title="PDF"><i class="fas fa-file-pdf"></i></button>
          <button type="button" class="sm-btn sm-btn-sm sm-btn-ghost" onclick="SMAccounting.editTx('${t.id}')"><i class="fas fa-pen"></i></button>
        </div>
      </div>
    </div>`
  },

  _payLabel(m) {
    return { transfer: 'کارت به کارت', cash: 'نقد', cheque: 'چک', card: 'کارت', pos: 'POS' }[m] || m
  },

  _chequesView(q) {
    let cheques = (DB.get('cheques') || []).slice().reverse()
    if (q) {
      cheques = cheques.filter(c =>
        [c.number, c.bank, c.amount, c.dueDate, c.purpose, c.client, c.transactionRef, c.iban, c.drawer].join(' ').toLowerCase().includes(q)
      )
    }
    const incoming = cheques.filter(c => c.type === 'incoming')
    const outgoing = cheques.filter(c => c.type === 'outgoing')

    return `
      <div class="sm-acc-chq-summary">
        <div class="sm-acc-chq-sum is-in"><span>چک دریافتی</span><strong>${incoming.length.toLocaleString('fa-IR')}</strong><small>${SM.fmt(incoming.reduce((s, c) => s + (c.amount || 0), 0))} ت</small></div>
        <div class="sm-acc-chq-sum is-out"><span>چک پرداختی</span><strong>${outgoing.length.toLocaleString('fa-IR')}</strong><small>${SM.fmt(outgoing.reduce((s, c) => s + (c.amount || 0), 0))} ت</small></div>
      </div>
      <div class="sm-acc-tx-list">
        ${cheques.length ? cheques.map(c => this._chequeRow(c)).join('') : SMUI.empty('fa-money-check', q ? 'چکی یافت نشد' : 'چکی ثبت نشده')}
      </div>`
  },

  _chequeRow(c) {
    const isIn = c.type === 'incoming'
    const purpose = this.CHEQUE_PURPOSES[c.purposeCategory] || c.purpose || '—'
    const st = { pending: 'در انتظار', passed: 'وصول شده', bounced: 'برگشتی', cancelled: 'ابطال' }[c.status] || c.status

    return `<div class="sm-acc-tx sm-acc-chq${isIn ? ' is-in' : ' is-out'}">
      <div class="sm-acc-tx-stripe"></div>
      <div class="sm-acc-tx-icon"><i class="fas fa-money-check"></i></div>
      <div class="sm-acc-tx-body">
        <div class="sm-acc-tx-top">
          ${SMUI.badge(isIn ? 'دریافت چک' : 'صدور چک', isIn ? 'success' : 'danger')}
          ${SMUI.badge(st, c.status === 'passed' ? 'success' : c.status === 'bounced' ? 'danger' : 'warning')}
          <span class="sm-acc-tx-date">${SM.esc(c.dueDate || c.issueDate || '—')}</span>
        </div>
        <div class="sm-acc-tx-title"><span dir="ltr">${SM.esc(c.number || '—')}</span> · ${SM.esc(c.bank || this._bankName(c.bankId))}</div>
        <div class="sm-acc-tx-meta">
          <span>📋 ${SM.esc(purpose)}</span>
          ${c.client || c.drawer ? `<span>👤 ${SM.esc(c.client || c.drawer)}</span>` : ''}
          ${c.transactionRef ? `<span dir="ltr">🔖 ${SM.esc(c.transactionRef)}</span>` : ''}
        </div>
      </div>
      <div class="sm-acc-tx-side">
        <div class="sm-acc-tx-amt">${isIn ? '+' : '−'} ${SM.fmt(c.amount || 0)} <small>تومان</small></div>
        <button type="button" class="sm-btn sm-btn-sm sm-btn-ghost" onclick="SMAccounting.editCheque('${c.id}')"><i class="fas fa-pen"></i></button>
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
    const receiptEl = document.getElementById('sm-receipt-doc')
    const fname = `رسید-${isIn ? 'واریز' : 'برداشت'}-${(t.date || '').replace(/\//g, '')}-${t.amount}.pdf`

    const done = () => { wrap.remove() }

    if (typeof html2pdf !== 'undefined') {
      html2pdf().set({
        margin: 12,
        filename: fname,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: 'mm', format: 'a5', orientation: 'portrait' }
      }).from(receiptEl).save().then(done).catch(() => { window.print(); done() })
    } else {
      const w = window.open('', '_blank')
      if (w) {
        w.document.write(`<html dir="rtl"><head><title>${fname}</title><style>
          body{font-family:Vazirmatn,Tahoma,sans-serif;padding:24px;color:#111}
          .sm-receipt-amt{font-size:28px;font-weight:800;margin:16px 0}
          .sm-receipt-amt.in{color:#34C759}.sm-receipt-amt.out{color:#FF3B30}
          table{width:100%;border-collapse:collapse} td{padding:8px;border-bottom:1px solid #eee;font-size:13px}
          td:first-child{color:#666;width:35%;font-weight:600}
        </style></head><body>${html}</body></html>`)
        w.document.close()
        w.print()
      }
      done()
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
      ${SMUI.formField('شماره کارت', 'ab-card', { value: this._cardOf(item) || '', dir: 'ltr', placeholder: '6037…' })}
      ${SMUI.formField('شماره حساب', 'ab-account', { value: this._accountOf(item) || '', dir: 'ltr' })}
      ${SMUI.formField('شماره شبا', 'ab-iban', { value: this._shebaOf(item) || '', dir: 'ltr', placeholder: 'IR…' })}
      ${SMUI.formField('موجودی فعلی (تومان)', 'ab-balance', { type: 'number', value: item?.balance ?? '', dir: 'ltr' })}`, {
      onSave: async () => {
        const d = SMUI.readForm(['ab-title', 'ab-bank', 'ab-holder', 'ab-card', 'ab-account', 'ab-iban', 'ab-balance'])
        if (!d['ab-title'] && !d['ab-bank']) return SM.toast('نام بانک یا عنوان حساب الزامی است', 'error')
        const data = {
          name: d['ab-title'], bank: d['ab-bank'], holder: d['ab-holder'],
          card: d['ab-card'], account: d['ab-account'], iban: d['ab-iban'],
          balance: +d['ab-balance'] || 0
        }
        if (item) await SecureDB.update('banks', item.id, data)
        else await SecureDB.insert('banks', data)
        SMH.refresh('accounting')
      },
      onDelete: item ? () => SMH.remove('banks', item.id, 'accounting') : null,
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
    const banks = DB.get('banks')
    const contracts = DB.get('contracts').filter(c => c.status !== 'cancelled')
    const personnel = DB.get('personnel').filter(p => p.status !== 'inactive')
    const cats = isIn ? this.DEPOSIT_CATS : this.WITHDRAWAL_CATS
    const bankOpts = [{ value: '', label: '— انتخاب حساب بانکی —' }, ...banks.map(b => ({
      value: b.id, label: `${b.name || b.bank} — ${this._accountOf(b) || this._maskCard(this._cardOf(b)) || ''}`
    }))]
    const contractOpts = [{ value: '', label: '— انتخاب قرارداد —' }, ...contracts.map(c => ({
      value: c.id, label: `${this._couple(c)} (${c.contractNum || c.id})`
    }))]
    const personnelOpts = [{ value: '', label: '— انتخاب پرسنل —' }, ...personnel.map(p => ({
      value: p.id, label: p.name
    }))]
    const catOpts = Object.entries(cats).map(([k, v]) => ({ value: k, label: v }))
    const monthOpts = this.MONTHS.map(m => ({ value: m, label: m }))
    const srcOpts = Object.entries(this.SOURCE_TYPES).map(([k, v]) => ({ value: k, label: v }))
    const src = item?.sourceType || (isIn ? 'customer' : 'customer')
    const showPers = src === 'personnel' || item?.purposeCategory === 'personnel'

    SMUI.modal(isIn ? 'ثبت واریز' : 'ثبت برداشت', `
      ${SMUI.formField('مبلغ (تومان)', 'tx-amt', { type: 'number', value: item?.amount || '', dir: 'ltr' })}
      ${SMUI.formField('تاریخ', 'tx-date', { value: item?.date || Utils.todayJalali() })}
      ${SMUI.formField('ماه / دوره', 'tx-month', { type: 'select', value: item?.periodMonth || '', options: [{ value: '', label: '—' }, ...monthOpts] })}
      ${SMUI.formField(isIn ? 'واریز به حساب' : 'برداشت از حساب', 'tx-bank', { type: 'select', value: item?.bankId || this._effectiveBankId(banks) || '', options: bankOpts })}
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
      ${SMUI.formField('دسته / بابت', 'tx-cat', { type: 'select', value: item?.purposeCategory || Object.keys(cats)[0], options: catOpts })}
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

        let txId
        if (item) {
          await SecureDB.update('transactions', item.id, data)
          await this._adjustBankBalance(item, data)
          txId = item.id
        } else {
          const row = await SecureDB.insert('transactions', data)
          txId = row.id
          await this._applyBankDelta(data.bankId, data.type, data.amount)
        }

        const invId = await this._syncInvoice(data, txId, item?.invoiceId)
        if (invId) await SecureDB.update('transactions', txId, { invoiceId: invId })

        SM.toast(invId ? 'ثبت شد و در فاکتورها قرار گرفت' : 'تراکنش ثبت شد', 'success')
        SMH.refresh('accounting')
      },
      onDelete: item ? () => {
        if (item.invoiceId) DB.delete('invoices', item.invoiceId)
        SMH.remove('transactions', item.id, 'accounting')
      } : null,
      width: 540
    })

    this._bindTxFormFields(contracts, personnel)
  },

  async _applyBankDelta(bankId, type, amount) {
    if (typeof FinanceSync !== 'undefined') return FinanceSync.applyBankDelta(bankId, type, amount)
    if (!bankId || !amount) return
    const b = DB.find('banks', x => x.id === bankId)
    if (!b) return
    await SecureDB.update('banks', bankId, { balance: (b.balance || 0) + (type === 'deposit' ? amount : -amount) })
  },

  async _adjustBankBalance(oldItem, newItem) {
    if (oldItem.bankId) {
      const b = DB.find('banks', x => x.id === oldItem.bankId)
      if (b) {
        const rev = oldItem.type === 'deposit' ? -(oldItem.amount || 0) : (oldItem.amount || 0)
        await SecureDB.update('banks', oldItem.bankId, { balance: (b.balance || 0) + rev })
      }
    }
    await this._applyBankDelta(newItem.bankId, newItem.type, newItem.amount)
  },

  /* ── Cheques ── */
  addCheque() { this._chequeForm(null) },
  editCheque(id) { this._chequeForm((DB.get('cheques') || []).find(c => c.id === id)) },

  _chequeForm(item) {
    const banks = DB.get('banks')
    const contracts = DB.get('contracts').filter(c => c.status !== 'cancelled')
    const bankOpts = [{ value: '', label: '—' }, ...banks.map(b => ({ value: b.id, label: b.name || b.bank }))]
    const contractOpts = [{ value: '', label: '—' }, ...contracts.map(c => ({ value: c.id, label: this._couple(c) }))]
    const purposeOpts = Object.entries(this.CHEQUE_PURPOSES).map(([k, v]) => ({ value: k, label: v }))
    const monthOpts = this.MONTHS.map(m => ({ value: m, label: m }))
    const type = item?.type || 'incoming'

    SMUI.modal(item ? 'ویرایش چک' : 'ثبت چک', `
      ${SMUI.formField('نوع چک', 'ch-type', { type: 'select', value: type, options: [
        { value: 'incoming', label: 'چک دریافتی' },
        { value: 'outgoing', label: 'چک پرداختی (صدور)' }
      ]})}
      ${SMUI.formField('شماره چک', 'ch-num', { value: item?.number || '', dir: 'ltr' })}
      ${SMUI.formField('حساب بانکی', 'ch-bank-sel', { type: 'select', value: item?.bankId || '', options: bankOpts })}
      ${SMUI.formField('نام بانک', 'ch-bank', { value: item?.bank || '' })}
      ${SMUI.formField('مبلغ (تومان)', 'ch-amt', { type: 'number', value: item?.amount || '', dir: 'ltr' })}
      ${SMUI.formField('سررسید', 'ch-due', { value: item?.dueDate || '' })}
      ${SMUI.formField('تاریخ صدور / دریافت', 'ch-issue', { value: item?.issueDate || Utils.todayJalali() })}
      ${SMUI.formField('ماه / دوره', 'ch-month', { type: 'select', value: item?.periodMonth || '', options: [{ value: '', label: '—' }, ...monthOpts] })}
      ${SMUI.formField('بابت', 'ch-cat', { type: 'select', value: item?.purposeCategory || 'other', options: purposeOpts })}
      ${SMUI.formField('شرح', 'ch-purpose', { value: item?.purpose || '', placeholder: 'چاپ آلبوم، خرید دوربین...' })}
      ${SMUI.formField('قرارداد', 'ch-contract', { type: 'select', value: item?.contractId || '', options: contractOpts })}
      ${SMUI.formField('مشتری / طرف', 'ch-client', { value: item?.client || item?.drawer || '' })}
      ${SMUI.formField('شماره پیگیری', 'ch-ref', { value: item?.transactionRef || '', dir: 'ltr' })}
      ${SMUI.formField('شماره شبا', 'ch-iban', { value: item?.iban || '', dir: 'ltr' })}
      ${SMUI.formField('شماره کارت', 'ch-card', { value: item?.cardNumber || '', dir: 'ltr' })}
      ${SMUI.formField('وضعیت', 'ch-status', { type: 'select', value: item?.status || 'pending', options: [
        { value: 'pending', label: 'در انتظار' },
        { value: 'passed', label: 'وصول شده' },
        { value: 'bounced', label: 'برگشتی' },
        { value: 'cancelled', label: 'ابطال' }
      ]})}
      ${SMUI.formField('توضیحات', 'ch-notes', { type: 'textarea', value: item?.notes || '' })}`, {
      onSave: async () => {
        const d = SMUI.readForm(['ch-type', 'ch-num', 'ch-bank-sel', 'ch-bank', 'ch-amt', 'ch-due', 'ch-issue', 'ch-month', 'ch-cat', 'ch-purpose', 'ch-contract', 'ch-client', 'ch-ref', 'ch-iban', 'ch-card', 'ch-status', 'ch-notes'])
        const amount = +d['ch-amt'] || 0
        if (!amount) return SM.toast('مبلغ الزامی است', 'error')
        const selBank = banks.find(b => b.id === d['ch-bank-sel'])
        const data = {
          type: d['ch-type'] || 'incoming',
          number: d['ch-num'],
          bankId: d['ch-bank-sel'] || '',
          bank: d['ch-bank'] || (selBank ? (selBank.bank || selBank.name) : ''),
          amount,
          dueDate: d['ch-due'],
          issueDate: d['ch-issue'],
          periodMonth: d['ch-month'] || '',
          purposeCategory: d['ch-cat'],
          purpose: d['ch-purpose'],
          contractId: d['ch-contract'] || '',
          client: d['ch-client'],
          drawer: d['ch-client'],
          transactionRef: d['ch-ref'],
          iban: d['ch-iban'],
          cardNumber: d['ch-card'],
          status: d['ch-status'] || 'pending',
          notes: d['ch-notes']
        }
        if (item) await SecureDB.update('cheques', item.id, data)
        else await SecureDB.insert('cheques', data)
        SMH.refresh('accounting')
      },
      onDelete: item ? () => SMH.remove('cheques', item.id, 'accounting') : null,
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
  selectBank(id) { SMAccounting.selectBank(id) }
}

window.SMAccounting = SMAccounting
