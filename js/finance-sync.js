/* ══════════════════════════════════════════════
   FinanceSync — اتصال قرارداد · بانک · حسابداری · فاکتور
   ══════════════════════════════════════════════ */

const FinanceSync = {
  DEPOSIT_CATS: {
    contract_deposit: 'بیعانه قرارداد',
    contract_payment: 'پرداخت قرارداد',
    other_income: 'درآمد متفرقه',
    rent: 'دریافت اجاره',
    equipment_rent: 'کرایه تجهیزات',
    refund_received: 'بازگشت وجه دریافتی'
  },

  couple(c) {
    if (!c) return '—'
    return c.couple || (c.bride && c.groom ? `${c.bride} و ${c.groom}` : c.bride || c.groom || '—')
  },

  bankInfo(bankId) {
    const b = DB.find('banks', x => x.id === bankId)
    if (!b) return { id: '', name: '—', bank: '', account: '', card: '', iban: '', holder: '' }
    return {
      id: b.id,
      name: b.name || b.bank || 'حساب',
      bank: b.bank || '',
      account: b.account || '',
      card: b.card || '',
      iban: b.iban || '',
      holder: b.holder || ''
    }
  },

  bankLabel(bankId) {
    const b = this.bankInfo(bankId)
    const parts = [b.name, b.bank, b.account || b.card].filter(Boolean)
    return parts.join(' · ') || '—'
  },

  genInvoiceNumber() {
    const t = Utils.todayJalali().replace(/\//g, '')
    const n = (DB.get('invoices') || []).length + 1
    return `F-${t}-${String(n).padStart(3, '0')}`
  },

  mapInvoiceType(tx) {
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

  async applyBankDelta(bankId, type, amount) {
    if (!bankId || !amount) return
    const b = DB.find('banks', x => x.id === bankId)
    if (!b) return
    await SecureDB.update('banks', bankId, { balance: (b.balance || 0) + (type === 'deposit' ? amount : -amount) })
  },

  async createInvoiceFromTx(txData, txId, existingInvoiceId) {
    const bank = this.bankInfo(txData.bankId)
    const contract = txData.contractId ? DB.find('contracts', c => c.id === txData.contractId) : null
    const cats = txData.type === 'deposit' ? this.DEPOSIT_CATS : {}
    const catLabel = cats[txData.purposeCategory] || txData.purposeCategory || ''
    let client = txData.client || ''
    if (txData.personnelId) {
      const p = DB.find('personnel', x => x.id === txData.personnelId)
      if (p) client = p.name
    } else if (contract && !client) client = this.couple(contract)

    const invPayload = {
      type: this.mapInvoiceType(txData),
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
      bankName: bank.name || bank.bank || '',
      accountOrCard: txData.accountOrCard || bank.account || bank.card || '',
      paymentMethod: txData.paymentMethod || 'transfer',
      description: txData.notes || txData.desc || '',
      status: 'paid',
      transactionId: txId,
      syncLedger: true
    }

    if (existingInvoiceId) {
      const ex = DB.find('invoices', i => i.id === existingInvoiceId)
      if (ex) await SecureDB.update('invoices', existingInvoiceId, { ...invPayload, number: ex.number })
      return existingInvoiceId
    }
    const inv = await SecureDB.insert('invoices', { ...invPayload, number: this.genInvoiceNumber(), createdAt: Utils.todayJalali() })
    return inv.id
  },

  async _updateContractPaid(contractId, purposeCategory, amount) {
    const c = DB.find('contracts', x => x.id === contractId)
    if (!c || !amount) return
    if (purposeCategory === 'contract_payment') {
      await SecureDB.update('contracts', contractId, { paid: (c.paid || 0) + amount })
    }
  },

  /**
   * ثبت واریز یکپارچه: تراکنش + بانک + فاکتور (+ قرارداد)
   */
  async recordDeposit(opts = {}) {
    const amount = +(opts.amount || 0)
    if (!amount) return { ok: false, error: 'مبلغ نامعتبر' }
    if (!opts.bankId) return { ok: false, error: 'انتخاب حساب بانکی الزامی است' }

    const contract = opts.contractId ? DB.find('contracts', c => c.id === opts.contractId) : null
    const purposeCategory = opts.purposeCategory || (opts.isDeposit ? 'contract_deposit' : 'contract_payment')
    const client = opts.client || (contract ? this.couple(contract) : '')

    const data = {
      type: 'deposit',
      amount,
      date: opts.date || Utils.todayJalali(),
      periodMonth: opts.periodMonth || '',
      bankId: opts.bankId,
      sourceType: 'customer',
      contractId: opts.contractId || '',
      client,
      purposeCategory,
      purpose: opts.purpose || this.DEPOSIT_CATS[purposeCategory] || 'واریز',
      paymentMethod: opts.paymentMethod || 'transfer',
      transactionRef: opts.transactionRef || opts.ref || '',
      accountOrCard: opts.accountOrCard || '',
      notes: opts.notes || '',
      desc: opts.purpose || opts.notes || this.DEPOSIT_CATS[purposeCategory] || 'واریز'
    }

    const row = await SecureDB.insert('transactions', data)
    await this.applyBankDelta(data.bankId, 'deposit', amount)

    const invoiceId = opts.syncInvoice !== false
      ? await this.createInvoiceFromTx(data, row.id, null)
      : null
    if (invoiceId) await SecureDB.update('transactions', row.id, { invoiceId })

    if (opts.contractId && purposeCategory === 'contract_payment') {
      await this._updateContractPaid(opts.contractId, purposeCategory, amount)
    }

    if (opts.contractId && purposeCategory === 'contract_deposit' && contract) {
      await SecureDB.update('contracts', opts.contractId, {
        depositBankId: opts.bankId,
        depositTransactionId: row.id,
        depositInvoiceId: invoiceId || '',
        depositRecordedAt: data.date
      })
    }

    if (typeof DB.log === 'function') {
      DB.log('finance_deposit', `${client || '—'} — ${amount.toLocaleString('fa-IR')} → ${this.bankLabel(opts.bankId)}`)
    }

    return { ok: true, transactionId: row.id, invoiceId, bankId: opts.bankId }
  },

  /** بیعانه اولیه هنگام ثبت قرارداد */
  recordContractInitialDeposit(contract, bankId, meta = {}) {
    const amount = +(contract.deposit || 0)
    if (!amount) return { ok: true, skipped: true }
    if (!bankId) return { ok: false, error: 'برای بیعانه، حساب بانکی را انتخاب کنید' }

    const existing = DB.filter('transactions', t =>
      t.contractId === contract.id && t.purposeCategory === 'contract_deposit'
    )
    if (existing.length) return { ok: true, skipped: true, transactionId: existing[0].id }

    return this.recordDeposit({
      contractId: contract.id,
      amount,
      bankId,
      purposeCategory: 'contract_deposit',
      purpose: `بیعانه — ${this.couple(contract)}`,
      date: meta.date || contract.contractDate || contract.createdAt || Utils.todayJalali(),
      paymentMethod: meta.paymentMethod || 'transfer',
      transactionRef: meta.transactionRef || meta.ref || '',
      notes: meta.notes || `قرارداد ${contract.contractNum || contract.id}`,
      syncInvoice: true
    })
  },

  /** واریز بعدی مشتری (غیر از بیعانه اول) */
  recordContractPayment(opts) {
    const c = DB.find('contracts', x => x.id === opts.contractId)
    if (!c) return { ok: false, error: 'قرارداد یافت نشد' }
    return this.recordDeposit({
      ...opts,
      purposeCategory: 'contract_payment',
      purpose: opts.purpose || `پرداخت — ${this.couple(c)}`,
      client: this.couple(c)
    })
  },

  contractPayments(contractId) {
    return (DB.get('transactions') || [])
      .filter(t => t.contractId === contractId && t.type === 'deposit')
      .slice()
      .reverse()
  },

  contractInvoices(contractId) {
    return (DB.get('invoices') || []).filter(i => i.contractId === contractId).slice().reverse()
  },

  hasSyncedDeposit(contractId) {
    return (DB.get('transactions') || []).some(t =>
      t.contractId === contractId && t.purposeCategory === 'contract_deposit'
    )
  },

  populateBankSelect(selectId, selectedId) {
    const el = document.getElementById(selectId)
    if (!el) return
    const banks = DB.get('banks') || []
    el.innerHTML = banks.length
      ? `<option value="">— انتخاب حساب بانکی —</option>${banks.map(b =>
        `<option value="${b.id}"${b.id === selectedId ? ' selected' : ''}>${Utils.escapeHtml(this.bankLabel(b.id))}</option>`
      ).join('')}`
      : '<option value="">— ابتدا در Studio M → حسابداری حساب بانکی بسازید —</option>'
  },

  renderBankPreview(bankId, containerId) {
    const el = document.getElementById(containerId)
    if (!el) return
    if (!bankId) { el.innerHTML = ''; return }
    const b = this.bankInfo(bankId)
    el.innerHTML = `<div class="fin-bank-preview">
      <strong>${Utils.escapeHtml(b.name)}</strong>
      ${b.bank ? `<span>${Utils.escapeHtml(b.bank)}</span>` : ''}
      ${b.account ? `<code dir="ltr">حساب: ${Utils.escapeHtml(b.account)}</code>` : ''}
      ${b.card ? `<code dir="ltr">کارت: ${Utils.escapeHtml(b.card)}</code>` : ''}
      ${b.iban ? `<code dir="ltr">شبا: ${Utils.escapeHtml(b.iban)}</code>` : ''}
    </div>`
  }
}

window.FinanceSync = FinanceSync
