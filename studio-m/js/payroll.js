/* Studio M — حقوق: محاسبه خودکار + پرداخت از بانک */

const SMPayroll = {
  _maskCard(card) {
    const c = String(card || '').replace(/\D/g, '')
    if (c.length < 8) return card || '—'
    return `${c.slice(0, 4)} **** **** ${c.slice(-4)}`
  },

  calculate(personId, month) {
    return typeof PortalShared !== 'undefined'
      ? PortalShared.calculatePayroll(personId, month)
      : null
  },

  _breakdownHtml(calc) {
    if (!calc) return '<p class="sm-pay-empty">پرسنل را انتخاب کنید</p>'
    if (calc.alreadyPaid) {
      return `<div class="sm-pay-warn">⚠️ برای ${SM.esc(calc.monthLabel)} قبلاً پرداخت ثبت شده (${SM.fmt(calc.paymentRecord?.amount || 0)} تومان)</div>`
    }
    let html = `<div class="sm-pay-breakdown">
      <div class="sm-pay-breakdown-head"><strong>${SM.esc(calc.monthLabel)}</strong><span>محاسبه خودکار</span></div>`
    if (calc.monthly > 0) {
      html += `<div class="sm-pay-line"><span>حقوق ماهانه</span><strong>${SM.fmt(calc.monthly)}</strong></div>`
    }
    if (calc.projects.length) {
      html += `<div class="sm-pay-subtitle">پروژه‌های ${calc.monthLabel} (${calc.projects.length})</div>`
      calc.projects.forEach(p => {
        html += `<div class="sm-pay-line sm-pay-line--sub"><span>${SM.esc(p.couple || '—')} · ${SM.esc(p.role || '')}</span><strong>${SM.fmt(p.amount)}</strong></div>`
      })
      html += `<div class="sm-pay-line"><span>جمع پروژه‌ای</span><strong>${SM.fmt(calc.projectTotal)}</strong></div>`
    }
    if (calc.percent > 0) {
      html += `<div class="sm-pay-line"><span>سهم درصدی (${calc.percentRate}٪ از قراردادهای ماه)</span><strong>${SM.fmt(calc.percent)}</strong></div>`
    }
    if (!calc.monthly && !calc.projects.length && !calc.percent) {
      html += `<p class="sm-pay-empty">برای این ماه مبلغی محاسبه نشد — قرارداد پرسنل یا حقوق ماهانه را بررسی کنید.</p>`
    }
    html += `<div class="sm-pay-total-row"><span>جمع قابل پرداخت</span><strong>${SM.fmt(calc.total)} تومان</strong></div></div>`
    return html
  },

  _monthOptions(selected) {
    const t = Utils.parseJalaliToday()
    const opts = []
    for (let i = 0; i < 14; i++) {
      let jm = t.jm - i
      let jy = t.jy
      while (jm < 1) { jm += 12; jy-- }
      const val = Utils.formatJalali(jy, jm, 1).slice(0, 7)
      const label = `${Utils.jalaliMonthName(jm)} ${jy.toLocaleString('fa-IR')}`
      opts.push({ value: val, label, selected: val === (selected || val) })
    }
    return opts
  },

  _bankOptions(selected) {
    const banks = typeof DB.active === 'function' ? DB.active('banks') : (DB.get('banks') || []).filter(b => !b._deleted)
    return [{ value: '', label: '— انتخاب حساب بانکی —' }, ...banks.map(b => ({
      value: b.id,
      label: `${b.name || b.bank || 'بانک'} — ${b.account || this._maskCard(b.card) || ''}`,
      selected: b.id === selected
    }))]
  },

  _bankInfoHtml(bankId) {
    const b = (typeof DB.findActive === 'function'
      ? DB.findActive('banks', x => x.id === bankId)
      : DB.find('banks', x => x.id === bankId && !x._deleted))
    if (!b) return ''
    return `<div class="sm-pay-bank-info">
      <div><span>بانک</span><strong>${SM.esc(b.bank || b.name || '—')}</strong></div>
      <div><span>کارت</span><code dir="ltr">${SM.esc(b.card ? this._maskCard(b.card) : '—')}</code></div>
      <div><span>حساب</span><code dir="ltr">${SM.esc(b.account || '—')}</code></div>
      <div><span>موجودی</span><strong>${SM.fmt(b.balance || 0)} تومان</strong></div>
    </div>`
  },

  render(el) {
    const payments = (typeof DB.active === 'function' ? DB.active('salaryPayments') : (DB.get('salaryPayments') || []).filter(p => !p._deleted)).slice().reverse()
    const personnel = (typeof DB.active === 'function' ? DB.active('personnel') : DB.get('personnel')).filter(p => p.status === 'active' && !p._deleted)
    const totalPaid = payments.reduce((s, p) => s + (p.amount || 0), 0)
    const thisMonth = Utils.todayJalali().slice(0, 7)
    const paidThisMonth = payments.filter(p => p.month === thisMonth).reduce((s, p) => s + (p.amount || 0), 0)

    el.innerHTML = `
      ${SMUI.sectionHead('حقوق', 'محاسبه از پروژه و حقوق ماهانه · پرداخت از بانک', `
        <button type="button" class="sm-btn sm-btn-primary" ${SMEvents.attrs('SMPayroll.add')}><i class="fas fa-plus"></i> افزودن پرداخت</button>`)}
      ${SMUI.statCards([
        { label: 'پرداخت‌ها', value: SM.fmt(payments.length), color: 'var(--sm-accent)' },
        { label: 'مجموع پرداختی', value: SM.fmt(totalPaid), color: 'var(--sm-success)' },
        { label: 'پرداخت این ماه', value: SM.fmt(paidThisMonth), color: 'var(--sm-warning)' },
        { label: 'پرسنل فعال', value: SM.fmt(personnel.length), color: 'var(--sm-info)' }
      ])}
      ${SMUI.moduleSearch('payroll', 'جستجو — نام، ماه، بانک...')}
      ${this._paymentsTable(payments)}`
  },

  _paymentsTable(payments) {
    const q = SM.getModuleSearch('payroll')
    let rows = payments
    if (q) rows = rows.filter(p => JSON.stringify(p).toLowerCase().includes(q))
    if (!rows.length) return SMUI.empty('fa-money-check-alt', 'پرداخت حقوق ثبت نشده')

    return SMUI.table(
      ['پرسنل', 'ماه', 'مبلغ', 'بانک', 'تاریخ پرداخت', ''],
      rows.slice(0, 50).map(p => `<tr>
        <td><strong>${SM.esc(p.personName || '—')}</strong></td>
        <td>${SM.esc(p.monthLabel || p.month || '—')}</td>
        <td>${SM.fmt(p.amount || 0)}</td>
        <td>${SM.esc(p.bankName || '—')}</td>
        <td>${SM.esc(p.date || '—')}</td>
        ${SMUI.tableActionsCell(null, { fn: 'SMPayroll.view', args: [p.id] })}
      </tr>`)
    )
  },

  view(id) {
    const p = (typeof DB.active === 'function' ? DB.active('salaryPayments') : (DB.get('salaryPayments') || []).filter(x => !x._deleted)).find(x => x.id === id)
    if (!p) return
    const b = p.breakdown || {}
    SM.pushSubView(`حقوق ${p.personName}`, () => `
      <div class="sm-card"><div class="sm-card-head"><div class="sm-card-title">${SM.esc(p.personName)} — ${SM.esc(p.monthLabel || p.month)}</div></div>
        <div class="sm-card-body">
          <p><strong>مبلغ پرداختی:</strong> ${SM.fmt(p.amount || 0)} تومان</p>
          <p style="margin-top:8px"><strong>تاریخ:</strong> ${SM.esc(p.date || '—')}</p>
          <p style="margin-top:8px"><strong>بانک:</strong> ${SM.esc(p.bankName || '—')}</p>
          ${p.card ? `<p style="margin-top:8px"><strong>کارت:</strong> <span dir="ltr">${SM.esc(this._maskCard(p.card))}</span></p>` : ''}
          ${b.monthly ? `<p style="margin-top:8px"><strong>ماهانه:</strong> ${SM.fmt(b.monthly)}</p>` : ''}
          ${b.projectTotal ? `<p style="margin-top:8px"><strong>پروژه‌ای:</strong> ${SM.fmt(b.projectTotal)}</p>` : ''}
          ${b.percent ? `<p style="margin-top:8px"><strong>درصدی:</strong> ${SM.fmt(b.percent)}</p>` : ''}
        </div></div>`)
  },

  add() {
    const personnel = DB.active('personnel').filter(p => p.status === 'active')
    if (!personnel.length) return SM.toast('پرسنل فعالی نیست', 'error')
    const defaultMonth = Utils.todayJalali().slice(0, 7)
    const defaultPerson = personnel[0]?.id || ''
    const calc = this.calculate(defaultPerson, defaultMonth)

    SMUI.modal('پرداخت حقوق', `
      ${SMUI.formField('پرسنل', 'pay-person', { type: 'select', value: defaultPerson, options: personnel.map(x => ({ value: x.id, label: x.name })) })}
      ${SMUI.formField('ماه حقوق', 'pay-month', { type: 'select', value: defaultMonth, options: this._monthOptions(defaultMonth) })}
      <div id="pay-breakdown-wrap">${this._breakdownHtml(calc)}</div>
      <input type="hidden" id="pay-amount" value="${calc?.total || 0}"/>
      ${SMUI.formField('پرداخت از حساب', 'pay-bank', { type: 'select', options: this._bankOptions('') })}
      <div id="pay-bank-info"></div>
      ${SMUI.formField('روش', 'pay-method', { type: 'select', value: 'transfer', options: [
        { value: 'transfer', label: 'کارت به کارت / انتقال' },
        { value: 'cash', label: 'نقد' },
        { value: 'pos', label: 'کارتخوان' }
      ]})}
      ${SMUI.formField('شماره پیگیری', 'pay-ref', { dir: 'ltr' })}
      ${SMUI.formField('تاریخ پرداخت', 'pay-date', { value: Utils.todayJalali() })}
      ${SMUI.formField('یادداشت', 'pay-notes', { type: 'textarea' })}`, {
      width: 520,
      onSave: async () => { await this._savePayment(null) }
    })

    const recalc = () => {
      const personId = document.getElementById('pay-person')?.value
      const month = document.getElementById('pay-month')?.value
      const c = this.calculate(personId, month)
      const wrap = document.getElementById('pay-breakdown-wrap')
      const amt = document.getElementById('pay-amount')
      if (wrap) wrap.innerHTML = this._breakdownHtml(c)
      if (amt) amt.value = c?.total || 0
    }
    document.getElementById('pay-person')?.addEventListener('change', recalc)
    document.getElementById('pay-month')?.addEventListener('change', recalc)
    document.getElementById('pay-bank')?.addEventListener('change', () => {
      const info = document.getElementById('pay-bank-info')
      if (info) info.innerHTML = this._bankInfoHtml(document.getElementById('pay-bank')?.value)
    })
  },

  async _savePayment(existingId) {
    const d = SMUI.readForm(['pay-person', 'pay-month', 'pay-amount', 'pay-bank', 'pay-method', 'pay-ref', 'pay-date', 'pay-notes'])
    const person = DB.find('personnel', p => p.id === d['pay-person'])
    if (!person) return SM.toast('پرسنل را انتخاب کنید', 'error')
    if (!d['pay-bank']) return SM.toast('حساب بانکی را انتخاب کنید', 'error')

    const calc = this.calculate(person.id, d['pay-month'])
    const amount = calc?.total || (+d['pay-amount'] || 0)
    if (amount <= 0) return SM.toast('مبلغ قابل پرداخت صفر است', 'error')

    if (!existingId && calc?.alreadyPaid) {
      return SM.toast('برای این پرسنل در این ماه قبلاً پرداخت ثبت شده', 'error')
    }

    const bank = DB.find('banks', b => b.id === d['pay-bank'])
    const payload = {
      personId: person.id,
      personName: person.name,
      month: d['pay-month'],
      monthLabel: calc?.monthLabel || d['pay-month'],
      amount,
      date: d['pay-date'] || Utils.todayJalali(),
      bankId: d['pay-bank'],
      bankName: bank?.name || bank?.bank || '',
      card: bank?.card || '',
      account: bank?.account || '',
      accountOrCard: bank?.card || bank?.account || '',
      paymentMethod: d['pay-method'] || 'transfer',
      ref: d['pay-ref'] || '',
      notes: d['pay-notes'] || '',
      breakdown: {
        monthly: calc?.monthly || 0,
        projectTotal: calc?.projectTotal || 0,
        percent: calc?.percent || 0,
        projectIds: (calc?.projects || []).map(p => p.id)
      },
      status: 'paid'
    }

    if (existingId) {
      await SecureDB.update('salaryPayments', existingId, payload)
    } else {
      const row = await SecureDB.insert('salaryPayments', payload)
      const paymentId = row.id
      let txId
      try {
        if (typeof FinanceSync === 'undefined') {
          throw new Error('ماژول مالی در دسترس نیست')
        }
        const res = await FinanceSync.recordWithdrawal({
          amount: payload.amount,
          bankId: payload.bankId,
          date: payload.date,
          periodMonth: payload.month,
          personnelId: payload.personId,
          client: payload.personName,
          purposeCategory: 'personnel',
          purpose: `حقوق ${payload.personName} — ${payload.monthLabel || payload.month}`,
          paymentMethod: payload.paymentMethod || 'transfer',
          transactionRef: payload.ref || '',
          accountOrCard: payload.accountOrCard || '',
          notes: payload.notes || '',
          desc: `حقوق پرسنل — ${payload.personName}`,
          salaryPaymentId: paymentId,
          syncInvoice: true
        })
        if (!res.ok) throw new Error(res.error || 'خطا در ثبت دفترکل')
        txId = res.transactionId
        await this._markProjectsPaid(calc, d['pay-month'])
        if (txId) await SecureDB.update('salaryPayments', paymentId, { transactionId: txId })
      } catch (e) {
        try { await SecureDB.delete('salaryPayments', paymentId) } catch (re) {
          if (typeof SMObservability !== 'undefined') {
            SMObservability.captureError('finance_rollback:payrollPay', re, { rollback: true })
          }
        }
        return SM.toast(e.message || 'خطا در پرداخت حقوق', 'error')
      }
    }

    SMUI.closeModal()
    SM.log('payroll_pay', `${person.name} ${d['pay-month']}`)
    SM.toast('حقوق ثبت و از بانک کسر شد', 'success')
    if (SM.state.viewStack.length) {
      SM.state.viewStack.pop()
      SM.navigate('payroll')
    } else SM.navigate('payroll')
  },

  async _markProjectsPaid(calc, month) {
    for (const p of (calc?.projects || [])) {
      await SecureDB.update('persProjects', p.id, {
        paid: p.amount,
        payrollMonth: month,
        paidAt: Utils.todayJalali()
      })
    }
  }
}

SMModules.payroll = {
  render(el) { SMPayroll.render(el) },
  add() { SMPayroll.add() },
  edit(id) { SMPayroll.view(id) },
  run() { SMPayroll.add() }
}

window.SMPayroll = SMPayroll
