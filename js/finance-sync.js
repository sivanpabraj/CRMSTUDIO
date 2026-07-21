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

  _newLocalId(prefix = 'tx') {
    try {
      if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID()
      }
    } catch { /* */ }
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
  },

  _reportMutate(op, payload) {
    try {
      if (typeof StudioMutateClient !== 'undefined' && StudioMutateClient.report) {
        StudioMutateClient.report(op, payload)
      }
    } catch { /* never block local ledger in optional mode */ }
  },

  /**
   * SaaS gate: when mutateRequiredWhenOnline, await Edge accept BEFORE local money writes.
   * Offline / no session while required → fail closed (outbox deferred to follow-up).
   */
  async _beforeMoneyCommit(op, payload, idempotencyKey) {
    try {
      if (typeof StudioMutateClient === 'undefined' || typeof StudioMutateClient.authorize !== 'function') {
        return { ok: true }
      }
      const required = typeof StudioMutateClient.requiredWhenOnline === 'function'
        && StudioMutateClient.requiredWhenOnline()
      const optional = typeof StudioMutateClient.enabled === 'function' && StudioMutateClient.enabled()
      if (!required && !optional) return { ok: true }
      if (!required && optional) return { ok: true, deferReport: true }

      const res = await StudioMutateClient.authorize(op, payload, { idempotencyKey })
      if (res.ok) return { ok: true, authorized: true, server: res }
      if (res.skipped && res.reason === 'not_required') return { ok: true }
      return {
        ok: false,
        error: res.error || 'تأیید سرور برای تراکنش مالی ناموفق بود',
        reason: res.reason || 'mutate_failed'
      }
    } catch (e) {
      return { ok: false, error: e.message || 'خطای دروازه مالی سرور' }
    }
  },

  _afterMoneyCommit(op, payload, gate) {
    if (gate?.deferReport) this._reportMutate(op, payload)
  },

  _logRollback(scope, err) {
    try {
      if (typeof SMObservability !== 'undefined') {
        SMObservability.captureError(`finance_rollback:${scope}`, err, { rollback: true })
      } else {
        console.error(`[FinanceSync rollback:${scope}]`, err)
      }
    } catch { /* never throw from logger */ }
  },

  _findActiveTx(txId) {
    return typeof DB.findActive === 'function'
      ? DB.findActive('transactions', t => t.id === txId)
      : DB.find('transactions', t => t.id === txId && !t._deleted)
  },

  _isTransferTx(tx) {
    return !!(tx && (tx.purposeCategory === 'transfer' || tx.transferPairId))
  },

  /**
   * ویرایش تراکنش با اصلاح موجودی بانک + paid قرارداد + فاکتور — صف بانک + rollback
   */
  async updateTransaction(txId, patch = {}, opts = {}) {
    const old = this._findActiveTx(txId)
    if (!old) return { ok: false, error: 'تراکنش یافت نشد' }
    if (this._isTransferTx(old)) {
      return { ok: false, error: 'ویرایش انتقال بین حساب از اینجا مجاز نیست' }
    }

    const amount = +(patch.amount != null ? patch.amount : old.amount) || 0
    if (!amount) return { ok: false, error: 'مبلغ نامعتبر' }
    const type = patch.type || old.type
    const bankId = patch.bankId != null ? patch.bankId : old.bankId
    if (!bankId) return { ok: false, error: 'انتخاب حساب بانکی الزامی است' }

    const data = {
      type,
      amount,
      date: patch.date != null ? patch.date : (old.date || Utils.todayJalali()),
      periodMonth: patch.periodMonth != null ? patch.periodMonth : (old.periodMonth || ''),
      bankId,
      sourceType: patch.sourceType != null ? patch.sourceType : (old.sourceType || 'other'),
      contractId: patch.contractId != null ? patch.contractId : (old.contractId || ''),
      personnelId: patch.personnelId != null ? patch.personnelId : (old.personnelId || ''),
      client: patch.client != null ? patch.client : (old.client || ''),
      purposeCategory: patch.purposeCategory != null ? patch.purposeCategory : (old.purposeCategory || ''),
      purpose: patch.purpose != null ? patch.purpose : (old.purpose || ''),
      paymentMethod: patch.paymentMethod != null ? patch.paymentMethod : (old.paymentMethod || 'transfer'),
      transactionRef: patch.transactionRef != null ? patch.transactionRef : (old.transactionRef || ''),
      accountOrCard: patch.accountOrCard != null ? patch.accountOrCard : (old.accountOrCard || ''),
      notes: patch.notes != null ? patch.notes : (old.notes || ''),
      desc: patch.desc != null ? patch.desc : (patch.purpose || patch.notes || old.desc || ''),
      invoiceId: old.invoiceId || '',
      expenseId: old.expenseId || '',
      salaryPaymentId: old.salaryPaymentId || '',
      chequeId: old.chequeId || ''
    }

    const oldBank = old.bankId
      ? (typeof DB.findActive === 'function'
        ? DB.findActive('banks', b => b.id === old.bankId)
        : DB.find('banks', b => b.id === old.bankId && !b._deleted))
      : null
    const newBank = typeof DB.findActive === 'function'
      ? DB.findActive('banks', b => b.id === bankId)
      : DB.find('banks', b => b.id === bankId && !b._deleted)
    if (!newBank) return { ok: false, error: 'حساب بانکی یافت نشد' }

    const oldBankBal = oldBank?.balance || 0
    const newBankBal = newBank.balance || 0
    const sameBank = old.bankId === bankId

    const oldContract = old.contractId
      ? DB.find('contracts', c => c.id === old.contractId && !c._deleted)
      : null
    const newContract = data.contractId
      ? DB.find('contracts', c => c.id === data.contractId && !c._deleted)
      : null
    const oldPaidSnap = oldContract ? { paid: oldContract.paid || 0, balance: oldContract.balance || 0 } : null
    const newPaidSnap = (newContract && newContract.id !== oldContract?.id)
      ? { paid: newContract.paid || 0, balance: newContract.balance || 0 }
      : null

    const oldTxSnap = { ...old }
    const invSnap = old.invoiceId
      ? (() => {
        const inv = DB.find('invoices', i => i.id === old.invoiceId)
        return inv ? { ...inv } : null
      })()
      : null

    const syncInvoice = opts.syncInvoice !== false || !!old.invoiceId
    const mutationId = opts.clientMutationId || this._newLocalId('mut')
    const idempotencyKey = `update_transaction:${txId}:${mutationId}`
    const gate = await this._beforeMoneyCommit('update_transaction', {
      transactionId: txId,
      amount,
      bankId,
      type,
      mutationId
    }, idempotencyKey)
    if (!gate.ok) return { ok: false, error: gate.error }

    const run = async () => {
      let txUpdated = false
      let invoiceId = old.invoiceId || null

      try {
        if (old.bankId && old.amount) {
          const revType = old.type === 'deposit' ? 'withdrawal' : 'deposit'
          const b = typeof DB.findActive === 'function'
            ? DB.findActive('banks', x => x.id === old.bankId)
            : DB.find('banks', x => x.id === old.bankId && !x._deleted)
          if (b) {
            const next = (b.balance || 0) + (revType === 'deposit' ? old.amount : -old.amount)
            await SecureDB.update('banks', old.bankId, { balance: next })
          }
        }

        if (old.contractId && old.type === 'deposit') {
          await this.reverseContractPaid(old.contractId, old.purposeCategory, old.amount)
        }

        const bCheck = typeof DB.findActive === 'function'
          ? DB.findActive('banks', x => x.id === bankId)
          : DB.find('banks', x => x.id === bankId && !x._deleted)
        if (type === 'withdrawal' && opts.allowOverdraft !== true) {
          if ((bCheck?.balance || 0) < amount) throw new Error('موجودی حساب کافی نیست')
        }

        await SecureDB.update('transactions', txId, data)
        txUpdated = true

        const bApply = typeof DB.findActive === 'function'
          ? DB.findActive('banks', x => x.id === bankId)
          : DB.find('banks', x => x.id === bankId && !x._deleted)
        if (bApply) {
          const next = (bApply.balance || 0) + (type === 'deposit' ? amount : -amount)
          await SecureDB.update('banks', bankId, { balance: next })
        }

        if (data.contractId && type === 'deposit') {
          await this.applyContractPaid(data.contractId, data.purposeCategory, amount)
        }

        if (syncInvoice) {
          invoiceId = await this.createInvoiceFromTx(data, txId, old.invoiceId || null)
          if (invoiceId) await SecureDB.update('transactions', txId, { invoiceId })
        }

        if (typeof DB.log === 'function') {
          DB.log('finance_tx_update', `${txId} — ${amount.toLocaleString('fa-IR')}`)
        }
        await DB.flush?.()
        this._afterMoneyCommit('update_transaction', { transactionId: txId, amount, bankId, mutationId }, gate)
        return { ok: true, transactionId: txId, invoiceId }
      } catch (e) {
        try {
          if (old.bankId) await SecureDB.update('banks', old.bankId, { balance: oldBankBal })
          if (!sameBank) await SecureDB.update('banks', bankId, { balance: newBankBal })
          if (txUpdated) {
            const restore = { ...oldTxSnap }
            delete restore.id
            await SecureDB.update('transactions', txId, restore)
          }
          if (oldPaidSnap && old.contractId) {
            await SecureDB.update('contracts', old.contractId, oldPaidSnap)
          }
          if (newPaidSnap && data.contractId) {
            await SecureDB.update('contracts', data.contractId, newPaidSnap)
          }
          if (invSnap?.id) {
            const invRestore = { ...invSnap }
            delete invRestore.id
            await SecureDB.update('invoices', invSnap.id, invRestore)
          }
        } catch (re) {
          this._logRollback('updateTransaction', re)
        }
        return { ok: false, error: e.message || 'خطا در ویرایش تراکنش — تغییرات برگشت داده شد' }
      }
    }

    this._bankQueue = this._bankQueue.then(run, run)
    return this._bankQueue
  },

  /**
   * حذف نرم تراکنش + فاکتور + برگشت موجودی/paid — صف بانک + rollback
   */
  async deleteTransaction(txId) {
    const old = this._findActiveTx(txId)
    if (!old) return { ok: false, error: 'تراکنش یافت نشد' }
    if (this._isTransferTx(old)) {
      return { ok: false, error: 'حذف انتقال بین حساب از اینجا مجاز نیست' }
    }

    const bank = old.bankId
      ? (typeof DB.findActive === 'function'
        ? DB.findActive('banks', b => b.id === old.bankId)
        : DB.find('banks', b => b.id === old.bankId && !b._deleted))
      : null
    const bankBal = bank?.balance || 0
    const contract = old.contractId
      ? DB.find('contracts', c => c.id === old.contractId && !c._deleted)
      : null
    const paidSnap = contract ? { paid: contract.paid || 0, balance: contract.balance || 0 } : null
    const oldTxSnap = { ...old }
    const invSnap = old.invoiceId
      ? (() => {
        const inv = DB.find('invoices', i => i.id === old.invoiceId)
        return inv ? { ...inv } : null
      })()
      : null

    const idempotencyKey = `delete_transaction:${txId}`
    const gate = await this._beforeMoneyCommit('delete_transaction', {
      transactionId: txId,
      amount: old.amount,
      bankId: old.bankId
    }, idempotencyKey)
    if (!gate.ok) return { ok: false, error: gate.error }

    const run = async () => {
      let txDeleted = false
      let invDeleted = false
      let bankTouched = false
      let paidTouched = false

      try {
        // Soft-delete first, then reverse ledger — avoids orphan reverse if delete fails
        await SecureDB.delete('transactions', txId)
        txDeleted = true
        if (old.invoiceId) {
          await SecureDB.delete('invoices', old.invoiceId)
          invDeleted = true
        }

        if (old.bankId && old.amount) {
          const revType = old.type === 'deposit' ? 'withdrawal' : 'deposit'
          const b = typeof DB.findActive === 'function'
            ? DB.findActive('banks', x => x.id === old.bankId)
            : DB.find('banks', x => x.id === old.bankId && !x._deleted)
          if (b) {
            const next = (b.balance || 0) + (revType === 'deposit' ? old.amount : -old.amount)
            await SecureDB.update('banks', old.bankId, { balance: next })
            bankTouched = true
          }
        }

        if (old.contractId && old.type === 'deposit') {
          await this.reverseContractPaid(old.contractId, old.purposeCategory, old.amount)
          paidTouched = true
        }

        if (typeof DB.log === 'function') {
          DB.log('finance_tx_delete', `${txId} — ${(old.amount || 0).toLocaleString('fa-IR')}`)
        }
        await DB.flush?.()
        this._afterMoneyCommit('delete_transaction', {
          transactionId: txId, amount: old.amount, bankId: old.bankId
        }, gate)
        return { ok: true, transactionId: txId }
      } catch (e) {
        try {
          if (txDeleted) {
            const restore = { ...oldTxSnap, _deleted: false, deletedAtIso: '' }
            delete restore.id
            await SecureDB.update('transactions', txId, restore)
          }
          if (invDeleted && invSnap?.id) {
            const invRestore = { ...invSnap, _deleted: false, deletedAtIso: '' }
            delete invRestore.id
            await SecureDB.update('invoices', invSnap.id, invRestore)
          }
          if (bankTouched && old.bankId) {
            await SecureDB.update('banks', old.bankId, { balance: bankBal })
          }
          if (paidTouched && paidSnap && old.contractId) {
            await SecureDB.update('contracts', old.contractId, paidSnap)
          }
        } catch (re) {
          this._logRollback('deleteTransaction', re)
        }
        return { ok: false, error: e.message || 'خطا در حذف تراکنش — تغییرات برگشت داده شد' }
      }
    }

    this._bankQueue = this._bankQueue.then(run, run)
    return this._bankQueue
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

    const pairId = opts.pairId || this._newLocalId('xfer')
    const outId = opts.outTransactionId || this._newLocalId('tx')
    const inId = opts.inTransactionId || this._newLocalId('tx')
    const idempotencyKey = `transfer_banks:${pairId}`
    const gate = await this._beforeMoneyCommit('transfer_banks', {
      pairId, amount, fromBankId: fromId, toBankId: toId,
      outTransactionId: outId, inTransactionId: inId
    }, idempotencyKey)
    if (!gate.ok) return { ok: false, error: gate.error }

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
      let outRow, inRow
      let balancesTouched = false
      try {
        outRow = await SecureDB.insert('transactions', {
          id: outId,
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
          id: inId,
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
        this._afterMoneyCommit('transfer_banks', {
          pairId, amount, fromBankId: fromId, toBankId: toId,
          outTransactionId: outRow.id, inTransactionId: inRow.id
        }, gate)
        return { ok: true, pairId, outTransactionId: outRow.id, inTransactionId: inRow.id }
      } catch (e) {
        try {
          if (outRow?.id) await SecureDB.delete('transactions', outRow.id)
          if (inRow?.id) await SecureDB.delete('transactions', inRow.id)
          if (balancesTouched) {
            await SecureDB.update('banks', fromId, { balance: fromBefore })
            await SecureDB.update('banks', toId, { balance: toBefore })
          }
        } catch (re) {
          this._logRollback('transferBetweenBanks', re)
        }
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
    const txId = opts.transactionId || this._newLocalId('tx')

    const data = {
      id: txId,
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

    const idempotencyKey = `record_deposit:${txId}`
    const gate = await this._beforeMoneyCommit('record_deposit', {
      transactionId: txId,
      bankId: opts.bankId,
      amount,
      purposeCategory,
      contractId: opts.contractId || ''
    }, idempotencyKey)
    if (!gate.ok) return { ok: false, error: gate.error }

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
      this._afterMoneyCommit('record_deposit', {
        transactionId: row.id, invoiceId, bankId: opts.bankId, amount
      }, gate)
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
      } catch (re) {
        this._logRollback('recordDeposit', re)
      }
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

    const txId = opts.transactionId || this._newLocalId('tx')
    const data = {
      id: txId,
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

    const idempotencyKey = `record_withdrawal:${txId}`
    const gate = await this._beforeMoneyCommit('record_withdrawal', {
      transactionId: txId,
      bankId: opts.bankId,
      amount,
      purposeCategory: data.purposeCategory
    }, idempotencyKey)
    if (!gate.ok) return { ok: false, error: gate.error }

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
      this._afterMoneyCommit('record_withdrawal', {
        transactionId: row.id, invoiceId, bankId: opts.bankId, amount
      }, gate)
      return { ok: true, transactionId: row.id, invoiceId, bankId: opts.bankId }
    } catch (e) {
      try {
        if (invoiceId) await SecureDB.delete('invoices', invoiceId)
        if (row?.id) await SecureDB.delete('transactions', row.id)
        if (bankTouched) await SecureDB.update('banks', opts.bankId, { balance: balBefore })
      } catch (re) {
        this._logRollback('recordWithdrawal', re)
      }
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
