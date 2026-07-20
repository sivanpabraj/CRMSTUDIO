/* Studio M Pro — split module (loaded after modules.js) */
/* ── Accounting (see accounting.js) — legacy block removed ── */

/* ── Expenses — ثبت سریع هزینه‌های جاری (متفاوت از فرم کامل حسابداری) ── */
SMModules.expenses = {
  CATEGORIES: {
    general: 'متفرقه / عمومی',
    equipment: 'تجهیزات و لوازم',
    print: 'چاپ و آلبوم',
    travel: 'ایاب و ذهاب',
    marketing: 'تبلیغات',
    rent: 'اجاره و قبوض',
    personnel: 'پرسنل و همکار',
    food: 'پذیرایی',
    maintenance: 'تعمیر و نگهداری'
  },

  MONTHS: ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'],

  _catLabel(key) {
    return this.CATEGORIES[key] || key || '—'
  },

  render(el) {
    const expenses = SMH.filterBySearch(DB.active('expenses'), ['title', 'desc', 'category', 'amount', 'date', 'periodMonth', 'notes'], 'expenses')
    const total = expenses.reduce((s, e) => s + (e.amount || 0), 0)
    const byCat = {}
    expenses.forEach(e => {
      const k = e.category || 'general'
      byCat[k] = (byCat[k] || 0) + (e.amount || 0)
    })
    const topCat = Object.entries(byCat).sort((a, b) => b[1] - a[1])[0]

    el.innerHTML = `
      ${SMUI.sectionHead('هزینه‌های جاری', 'ثبت سریع — خرید جزء، تبلیغ، اجاره و هزینه‌های روزمره استودیو', `
        <button class="sm-btn sm-btn-primary" onclick="SMModules.expenses.add()"><i class="fas fa-plus"></i> ثبت هزینه</button>`)}
      <div class="sm-exp-info">
        <i class="fas fa-circle-info"></i>
        <div>
          <strong>این بخش برای چیست؟</strong>
          <p>ثبت <em>سریع و ساده</em> هزینه‌های روزمره استودیو — بدون فرم طولانی.
          برای برداشت با جزئیات کامل (مشتری، قرارداد، پرسنل، PDF و فاکتور) از
          <button type="button" class="sm-link-btn" onclick="SM.navigate('accounting')">حسابداری → واریز و برداشت</button> استفاده کنید.</p>
        </div>
      </div>
      ${SMUI.moduleSearch('expenses', 'جستجو — عنوان، دسته، مبلغ، ماه...')}
      ${SMUI.statCards([
        { label: 'جمع هزینه‌ها', value: SM.fmt(total), icon: 'fa-receipt', color: 'var(--sm-danger)' },
        { label: 'تعداد', value: SM.fmt(expenses.length), icon: 'fa-list', color: 'var(--sm-accent)' },
        { label: 'بیشترین دسته', value: topCat ? SM.fmt(topCat[1]) : '۰', icon: 'fa-chart-pie', color: 'var(--sm-warning)' }
      ])}
      ${topCat ? `<p class="sm-exp-top-cat">بیشترین هزینه: <strong>${SM.esc(this._catLabel(topCat[0]))}</strong></p>` : ''}
      ${expenses.length ? `<div class="sm-exp-list">${expenses.map(e => this._row(e)).join('')}</div>` :
        SMUI.empty('fa-receipt', 'هزینه‌ای ثبت نشده', 'مثلاً: خرید باتری، بنر تبلیغ، اجاره انبار')}
    `
  },

  _row(e) {
    const cat = this._catLabel(e.category)
    return `<div class="sm-exp-row">
      <div class="sm-exp-row-icon"><i class="fas fa-receipt"></i></div>
      <div class="sm-exp-row-body">
        <div class="sm-exp-row-top">
          ${SMUI.badge(cat, 'muted')}
          ${e.periodMonth ? SMUI.badge(e.periodMonth, 'info') : ''}
          <span class="sm-exp-date">${SM.esc(e.date || e.createdAt || '—')}</span>
        </div>
        <div class="sm-exp-title">${SM.esc(e.title || e.desc || '—')}</div>
        ${e.notes ? `<div class="sm-exp-notes">${SM.esc(e.notes)}</div>` : ''}
      </div>
      <div class="sm-exp-row-side">
        <div class="sm-exp-amt">− ${SM.fmt(e.amount || 0)} <small>تومان</small></div>
        <button type="button" class="sm-btn sm-btn-sm sm-btn-ghost" onclick="SMModules.expenses.edit('${e.id}')"><i class="fas fa-pen"></i></button>
      </div>
    </div>`
  },

  add() { this._form(null) },
  edit(id) { this._form(DB.find('expenses', e => e.id === id)) },

  _form(item) {
    const catOpts = Object.entries(this.CATEGORIES).map(([k, v]) => ({ value: k, label: v }))
    const monthOpts = this.MONTHS.map(m => ({ value: m, label: m }))
    const banks = (typeof DB.active === 'function' ? DB.active('banks') : (DB.get('banks') || [])).filter(b => !b._deleted)
    const bankOpts = [{ value: '', label: '— بدون کسر از بانک —' }, ...banks.map(b => ({
      value: b.id, label: `${b.name || b.bank || 'حساب'} — ${SM.fmt(b.balance || 0)} ت`
    }))]

    SMUI.modal(item ? 'ویرایش هزینه' : 'ثبت هزینه جاری', `
      ${SMUI.formField('عنوان هزینه', 'exp-title', { value: item?.title || item?.desc || '', placeholder: 'مثلاً: خرید باتری دوربین، بنر تبلیغ' })}
      ${SMUI.formField('دسته‌بندی', 'exp-cat', { type: 'select', value: item?.category || 'general', options: catOpts })}
      ${SMUI.formField('مبلغ (تومان)', 'exp-amount', { type: 'number', value: item?.amount || '', dir: 'ltr' })}
      ${SMUI.formField('پرداخت از حساب', 'exp-bank', { type: 'select', value: item?.bankId || '', options: bankOpts })}
      ${SMUI.formField('تاریخ', 'exp-date', { value: item?.date || Utils.todayJalali() })}
      ${SMUI.formField('ماه / دوره', 'exp-month', { type: 'select', value: item?.periodMonth || '', options: [{ value: '', label: '—' }, ...monthOpts] })}
      ${SMUI.formField('توضیحات', 'exp-notes', { type: 'textarea', value: item?.notes || '', placeholder: 'اختیاری — جزئیات بیشتر' })}
      <label class="sm-check-row"><input type="checkbox" id="exp-ledger" ${item?.syncLedger !== false ? 'checked' : ''}/> ثبت همزمان در حسابداری (رفت‌وبرگشت)</label>`, {
      onSave: async () => {
        const d = SMUI.readForm(['exp-title', 'exp-cat', 'exp-amount', 'exp-bank', 'exp-date', 'exp-month', 'exp-notes'])
        const amount = +d['exp-amount'] || 0
        if (!d['exp-title']) return SM.toast('عنوان هزینه الزامی است', 'error')
        if (!amount) return SM.toast('مبلغ الزامی است', 'error')

        const catLabel = this._catLabel(d['exp-cat'])
        const data = {
          title: d['exp-title'],
          category: d['exp-cat'],
          amount,
          bankId: d['exp-bank'] || '',
          date: d['exp-date'] || Utils.todayJalali(),
          periodMonth: d['exp-month'] || '',
          notes: d['exp-notes'] || '',
          syncLedger: document.getElementById('exp-ledger')?.checked !== false
        }

        if (item) {
          await SecureDB.update('expenses', item.id, data)
        } else {
          const exp = await SecureDB.insert('expenses', data)
          if (data.syncLedger && data.bankId) {
            if (typeof FinanceSync === 'undefined') {
              try { await SecureDB.delete('expenses', exp.id) } catch (re) {
                if (typeof SMObservability !== 'undefined') {
                  SMObservability.captureError('finance_rollback:expenseCreate', re, { rollback: true })
                }
              }
              return SM.toast('ماژول مالی در دسترس نیست', 'error')
            }
            const res = await FinanceSync.recordWithdrawal({
              amount: data.amount,
              bankId: data.bankId,
              date: data.date,
              periodMonth: data.periodMonth,
              purposeCategory: 'other',
              purpose: catLabel,
              desc: `${data.title} — ${catLabel}`,
              notes: data.notes || '',
              expenseId: exp.id,
              syncInvoice: false,
              allowOverdraft: true
            })
            if (!res.ok) {
              try { await SecureDB.delete('expenses', exp.id) } catch (re) {
                if (typeof SMObservability !== 'undefined') {
                  SMObservability.captureError('finance_rollback:expenseCreate', re, { rollback: true })
                }
              }
              return SM.toast(res.error || 'خطا در ثبت دفترکل', 'error')
            }
            await SecureDB.update('expenses', exp.id, { transactionId: res.transactionId })
          } else if (data.syncLedger && !data.bankId) {
            return SM.toast('برای ثبت در دفترکل، حساب بانکی را انتخاب کنید', 'error')
          }
        }
        SMH.refresh('expenses')
      },
      onDelete: item ? async () => {
        if (!SMH.confirmDelete()) return
        try {
          if (item.transactionId) {
            if (typeof FinanceSync === 'undefined') {
              return SM.toast('ماژول مالی در دسترس نیست', 'error')
            }
            const t = DB.find('transactions', x => x.id === item.transactionId)
            if (t && !t._deleted) {
              const res = await FinanceSync.deleteTransaction(t.id)
              if (!res.ok) return SM.toast(res.error || 'خطا در حذف تراکنش مرتبط', 'error')
            }
          }
          await SecureDB.delete('expenses', item.id)
          SM.toast('هزینه حذف و موجودی اصلاح شد', 'success')
          SMH.refresh('expenses')
        } catch (e) {
          SM.toast(e.message || 'خطا در حذف', 'error')
        }
      } : null,
      width: 480
    })
  }
}

/* ── Reports ── */
/* ── Reports (see reports.js) ── */

/* ── Employees (see employees.js) ── */

/* ── Attendance (see attendance.js) ── */

/* ── Payroll (see payroll.js) ── */

/* ── Equipment (see equipment.js) ── */

