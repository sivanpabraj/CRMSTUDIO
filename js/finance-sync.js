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

  normalizeBankFields(b) {
    if (!b) return null
    const account = b.account || b.accountNumber || ''
    const iban = b.iban || b.shaba || ''
    return {
      ...b,
      account,
      accountNumber: account,
      iban,
      shaba: iban,
      card: b.card || '',
      holder: b.holder || '',
      balance: Number(b.balance) || 0
    }
  },

  bankInfo(bankId) {
    const raw = DB.find('banks', x => x.id === bankId)
    const b = this.normalizeBankFields(raw)
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
    const rows = typeof DB.active === 'function' ? DB.active('invoices') : (DB.get('invoices') || []).filter(i => !i._deleted)
    const n = rows.length + 1
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

  _bankQueue: Promise.resolve(),

  /** Serialized bank balance updates — prevents lost updates under concurrent writes */
  async applyBankDelta(bankId, type, amount) {
    if (!bankId || !amount) return
    const run = async () => {
      const b = (typeof DB.findActive === 'function'
        ? DB.findActive('banks', x => x.id === bankId)
        : DB.find('banks', x => x.id === bankId && !x._deleted))
      if (!b) return
      const next = (b.balance || 0) + (type === 'deposit' ? amount : -amount)
      await SecureDB.update('banks', bankId, { balance: next })
    }
    this._bankQueue = this._bankQueue.then(run, run)
    return this._bankQueue
  },

  async _updateContractPaid(contractId, purposeCategory, amount, { reverse = false } = {}) {
    const c = DB.find('contracts', x => x.id === contractId && !x._deleted)
    if (!c || !amount) return
    // Initial deposit lives on contract.deposit — only installments update paid
    if (purposeCategory !== 'contract_payment') return
    const delta = reverse ? -amount : amount
    const paid = Math.max(0, (c.paid || 0) + delta)
    const balance = Math.max(0, (c.total || 0) - (c.deposit || 0) - paid)
    await SecureDB.update('contracts', contractId, { paid, balance })
  },

  applyContractPaid(contractId, purposeCategory, amount) {
    return this._updateContractPaid(contractId, purposeCategory, amount, { reverse: false })
  },

  reverseContractPaid(contractId, purposeCategory, amount) {
    return this._updateContractPaid(contractId, purposeCategory, amount, { reverse: true })
  },

  /**
   * انتقال واقعی بین دو حساب — کل عملیات داخل صف بانک + rollback روی خطا
   */
  async transferBetweenBanks(opts = {}) {
    const amount = +(opts.amount || 0)
    const fromId = opts.fromBankId
    const toId = opts.toBankId
    if (!amount) return { ok: false, error: 'مبلغ نامعتبر' }
    if (!fromId || !toId) return { ok: false, error: 'انتخاب هر دو حساب الزامی است' }
    if (fromId === toId) return { ok: false, error: 'حساب مبدأ و مقصد باید متفاوت باشند' }

    const run = async () => {
      const from = (typeof DB.findActive === 'function'
        ? DB.findActive('banks', b => b.id === fromId)
        : DB.find('banks', b => b.id === fromId && !b._deleted))
      const to = (typeof DB.findActive === 'function'
        ? DB.findActive('banks', b => b.id === toId)
        : DB.find('banks', b => b.id === toId && !b._deleted))
      if (!from || !to) return { ok: false, error: 'حساب بانکی یافت نشد' }
      const fromBefore = from.balance || 0
      const toBefore = to.balance || 0
      if (fromBefore < amount) return { ok: false, error: 'موجودی حساب مبدأ کافی نیست' }

      const date = opts.date || Utils.todayJalali()
      const note = opts.notes || opts.purpose || 'انتقال بین حساب'
      const pairId = opts.pairId || (`xfer_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`)
      let outRow, inRow
      let balancesTouched = false
      try {
        outRow = await SecureDB.insert('transactions', {
          type: 'withdrawal',
          amount,
          date,
          periodMonth: opts.periodMonth || '',
          bankId: fromId,
          sourceType: 'other',
          purposeCategory: 'transfer',
          purpose: note,
          paymentMethod: opts.paymentMethod || 'transfer',
          transactionRef: opts.transactionRef || '',
          notes: opts.notes || '',
          desc: `انتقال به ${this.bankLabel(toId)}`,
          transferPairId: pairId,
          transferLeg: 'out',
          transferToBankId: toId
        })

        inRow = await SecureDB.insert('transactions', {
          type: 'deposit',
          amount,
          date,
          periodMonth: opts.periodMonth || '',
          bankId: toId,
          sourceType: 'other',
          purposeCategory: 'transfer',
          purpose: note,
          paymentMethod: opts.paymentMethod || 'transfer',
          transactionRef: opts.transactionRef || '',
          notes: opts.notes || '',
          desc: `انتقال از ${this.bankLabel(fromId)}`,
          transferPairId: pairId,
          transferLeg: 'in',
          transferFromBankId: fromId,
          transferSiblingId: outRow.id
        })

        await SecureDB.update('transactions', outRow.id, { transferSiblingId: inRow.id })

        // Direct balance update inside queue (avoid nested queue deadlock)
        await SecureDB.update('banks', fromId, { balance: fromBefore - amount })
        balancesTouched = true
        await SecureDB.update('banks', toId, { balance: toBefore + amount })

        if (typeof DB.log === 'function') {
          DB.log('finance_transfer', `${amount.toLocaleString('fa-IR')} — ${this.bankLabel(fromId)} → ${this.bankLabel(toId)}`)
        }
        await DB.flush?.()
        return { ok: true, pairId, outTransactionId: outRow.id, inTransactionId: inRow.id }
      } catch (e) {
        try {
          if (outRow?.id) await SecureDB.delete('transactions', outRow.id)
          if (inRow?.id) await SecureDB.delete('transactions', inRow.id)
          if (balancesTouched) {
            await SecureDB.update('banks', fromId, { balance: fromBefore })
            await SecureDB.update('banks', toId, { balance: toBefore })
          }
        } catch { /* best-effort rollback */ }
        return { ok: false, error: e.message || 'خطا در انتقال — تغییرات برگشت داده شد' }
      }
    }

    this._bankQueue = this._bankQueue.then(run, run)
    return this._bankQueue
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

  /**
   * ثبت واریز یکپارچه: تراکنش + بانک + فاکتور (+ قرارداد) — با rollback
   */
  async recordDeposit(opts = {}) {
    const amount = +(opts.amount || 0)
    if (!amount) return { ok: false, error: 'مبلغ نامعتبر' }
    if (!opts.bankId) return { ok: false, error: 'انتخاب حساب بانکی الزامی است' }

    const contract = opts.contractId
      ? DB.find('contracts', c => c.id === opts.contractId && !c._deleted)
      : null
    const purposeCategory = opts.purposeCategory || (opts.isDeposit ? 'contract_deposit' : 'contract_payment')
    const client = opts.client || (contract ? this.couple(contract) : '')

    const data = {
      type: 'deposit',
      amount,
      date: opts.date || Utils.todayJalali(),
      periodMonth: opts.periodMonth || '',
      bankId: opts.bankId,
      sourceType: opts.sourceType || 'customer',
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

    const bank = DB.find('banks', b => b.id === opts.bankId && !b._deleted)
    const balBefore = bank?.balance || 0
    let row = null
    let invoiceId = null
    let bankTouched = false
    let paidTouched = false
    let contractMetaTouched = false

    try {
      row = await SecureDB.insert('transactions', data)
      await this.applyBankDelta(data.bankId, 'deposit', amount)
      bankTouched = true

      if (opts.syncInvoice !== false) {
        invoiceId = await this.createInvoiceFromTx(data, row.id, null)
        if (invoiceId) await SecureDB.update('transactions', row.id, { invoiceId })
      }

      if (opts.contractId) {
        await this._updateContractPaid(opts.contractId, purposeCategory, amount)
        if (purposeCategory === 'contract_payment') paidTouched = true
      }

      if (opts.contractId && purposeCategory === 'contract_deposit' && contract) {
        await SecureDB.update('contracts', opts.contractId, {
          depositBankId: opts.bankId,
          depositTransactionId: row.id,
          depositInvoiceId: invoiceId || '',
          depositRecordedAt: data.date
        })
        contractMetaTouched = true
      }

      if (typeof DB.log === 'function') {
        DB.log('finance_deposit', `${client || '—'} — ${amount.toLocaleString('fa-IR')} → ${this.bankLabel(opts.bankId)}`)
      }

      await DB.flush?.()
      return { ok: true, transactionId: row.id, invoiceId, bankId: opts.bankId }
    } catch (e) {
      try {
        if (invoiceId) await SecureDB.delete('invoices', invoiceId)
        if (row?.id) await SecureDB.delete('transactions', row.id)
        if (bankTouched) await SecureDB.update('banks', opts.bankId, { balance: balBefore })
        if (paidTouched) await this.reverseContractPaid(opts.contractId, purposeCategory, amount)
        if (contractMetaTouched && opts.contractId) {
          await SecureDB.update('contracts', opts.contractId, {
            depositBankId: contract.depositBankId || '',
            depositTransactionId: contract.depositTransactionId || '',
            depositInvoiceId: contract.depositInvoiceId || '',
            depositRecordedAt: contract.depositRecordedAt || ''
          })
        }
      } catch { /* best-effort rollback */ }
      return { ok: false, error: e.message || 'خطا در ثبت واریز — تغییرات برگشت داده شد' }
    }
  },

  /**
   * ثبت برداشت یکپارچه (حقوق / هزینه / …) با rollback
   */
  async recordWithdrawal(opts = {}) {
    const amount = +(opts.amount || 0)
    if (!amount) return { ok: false, error: 'مبلغ نامعتبر' }
    if (!opts.bankId) return { ok: false, error: 'انتخاب حساب بانکی الزامی است' }

    const bank = DB.find('banks', b => b.id === opts.bankId && !b._deleted)
    if (!bank) return { ok: false, error: 'حساب بانکی یافت نشد' }
    if ((bank.balance || 0) < amount && opts.allowOverdraft !== true) {
      return { ok: false, error: 'موجودی حساب کافی نیست' }
    }

    const data = {
      type: 'withdrawal',
      amount,
      date: opts.date || Utils.todayJalali(),
      periodMonth: opts.periodMonth || '',
      bankId: opts.bankId,
      sourceType: opts.sourceType || 'other',
      contractId: opts.contractId || '',
      personnelId: opts.personnelId || '',
      client: opts.client || '',
      purposeCategory: opts.purposeCategory || 'other',
      purpose: opts.purpose || 'برداشت',
      paymentMethod: opts.paymentMethod || 'transfer',
      transactionRef: opts.transactionRef || opts.ref || '',
      accountOrCard: opts.accountOrCard || '',
      notes: opts.notes || '',
      desc: opts.desc || opts.purpose || opts.notes || 'برداشت',
      expenseId: opts.expenseId || '',
      salaryPaymentId: opts.salaryPaymentId || ''
    }

    const balBefore = bank.balance || 0
    let row = null
    let invoiceId = null
    let bankTouched = false

    try {
      row = await SecureDB.insert('transactions', data)
      await this.applyBankDelta(data.bankId, 'withdrawal', amount)
      bankTouched = true

      if (opts.syncInvoice !== false) {
        invoiceId = await this.createInvoiceFromTx(data, row.id, null)
        if (invoiceId) await SecureDB.update('transactions', row.id, { invoiceId })
      }

      if (typeof DB.log === 'function') {
        DB.log('finance_withdrawal', `${data.client || '—'} — ${amount.toLocaleString('fa-IR')} ← ${this.bankLabel(opts.bankId)}`)
      }

      await DB.flush?.()
      return { ok: true, transactionId: row.id, invoiceId, bankId: opts.bankId }
    } catch (e) {
      try {
        if (invoiceId) await SecureDB.delete('invoices', invoiceId)
        if (row?.id) await SecureDB.delete('transactions', row.id)
        if (bankTouched) await SecureDB.update('banks', opts.bankId, { balance: balBefore })
      } catch { /* best-effort rollback */ }
      return { ok: false, error: e.message || 'خطا در ثبت برداشت — تغییرات برگشت داده شد' }
    }
  },

  /** بیعانه اولیه هنگام ثبت قرارداد */
  recordContractInitialDeposit(contract, bankId, meta = {}) {
    const amount = +(contract.deposit || 0)
    if (!amount) return { ok: true, skipped: true }
    if (!bankId) return { ok: false, error: 'برای بیعانه، حساب بانکی را انتخاب کنید' }

    const existing = (typeof DB.active === 'function' ? DB.active('transactions') : DB.filter('transactions', t => !t._deleted))
      .filter(t => t.contractId === contract.id && t.purposeCategory === 'contract_deposit')
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
    return (typeof DB.active === 'function' ? DB.active('transactions') : DB.get('transactions') || [])
      .filter(t => t.contractId === contractId && t.type === 'deposit')
      .slice()
      .reverse()
  },

  contractInvoices(contractId) {
    return (typeof DB.active === 'function' ? DB.active('invoices') : (DB.get('invoices') || []).filter(i => !i._deleted))
      .filter(i => i.contractId === contractId).slice().reverse()
  },

  hasSyncedDeposit(contractId) {
    return (typeof DB.active === 'function' ? DB.active('transactions') : (DB.get('transactions') || []).filter(t => !t._deleted))
      .some(t => t.contractId === contractId && t.purposeCategory === 'contract_deposit')
  },

  populateBankSelect(selectId, selectedId) {
    const el = document.getElementById(selectId)
    if (!el) return
    const banks = typeof DB.active === 'function' ? DB.active('banks') : (DB.get('banks') || []).filter(b => !b._deleted)
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
