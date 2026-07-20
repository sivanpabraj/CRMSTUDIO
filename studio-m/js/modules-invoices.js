/* Studio M Pro — split module (loaded after modules.js) */
/* ── Invoices ── */
SMModules.invoices = {
  _tab: 'all',

  TYPES: {
    customer_deposit: { label: 'بیعانه مشتری', icon: 'fa-hand-holding-dollar', color: '#34C759', dir: 'in' },
    customer_payment: { label: 'واریز مشتری', icon: 'fa-heart', color: '#5856D6', dir: 'in' },
    utility_electric: { label: 'قبض برق', icon: 'fa-bolt', color: '#FF9500', dir: 'out' },
    utility_water: { label: 'قبض آب', icon: 'fa-droplet', color: '#0071E3', dir: 'out' },
    utility_gas: { label: 'قبض گاز', icon: 'fa-fire', color: '#FF3B30', dir: 'out' },
    personnel: { label: 'پرداخت پرسنل', icon: 'fa-users', color: '#00A3BF', dir: 'out' },
    transfer: { label: 'انتقال / کارت', icon: 'fa-credit-card', color: '#64748B', dir: 'out' },
    expense: { label: 'هزینه عمومی', icon: 'fa-receipt', color: '#94A3B8', dir: 'out' },
    other: { label: 'سایر', icon: 'fa-file-invoice', color: '#64748B', dir: 'out' }
  },

  MONTHS: ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'],

  setTab(tab) { this._tab = tab; SM.navigate('invoices') },

  _getPinned() {
    try { return JSON.parse(localStorage.getItem('sm_inv_pinned') || '[]') } catch { return [] }
  },

  _isPinned(id) { return this._getPinned().includes(id) },

  togglePin(id) {
    const pins = this._getPinned()
    const i = pins.indexOf(id)
    if (i >= 0) pins.splice(i, 1)
    else pins.push(id)
    localStorage.setItem('sm_inv_pinned', JSON.stringify(pins))
    SM.navigate('invoices')
  },

  _dirOf(i) {
    return i.direction || this._meta(i.type).dir
  },

  _catsHtml() {
    const tabs = [
      { id: 'all', label: 'همه', icon: 'fa-list', cls: '' },
      { id: 'in', label: 'واریزی', icon: 'fa-arrow-down', cls: 'is-in' },
      { id: 'out', label: 'برداشت', icon: 'fa-arrow-up', cls: 'is-out' },
      { id: 'personnel', label: 'پرسنل', icon: 'fa-users', cls: 'is-personnel' },
      { id: 'utility', label: 'آب · برق · گاز', icon: 'fa-bolt', cls: 'is-utility' }
    ]
    return `<div class="sm-inv-cats">${tabs.map(t => `
      <button type="button" class="sm-inv-cat ${t.cls}${this._tab === t.id ? ' active' : ''}"
        onclick="SMModules.invoices.setTab('${t.id}')">
        <i class="fas ${t.icon}"></i> ${t.label}
      </button>`).join('')}</div>`
  },

  _meta(type) {
    return this.TYPES[type] || this.TYPES.other
  },

  _couple(c) {
    return c.couple || (c.bride && c.groom ? `${c.bride} و ${c.groom}` : c.bride || c.groom || '—')
  },

  _collectAll() {
    const stored = DB.active('invoices').map(i => ({ ...i, _virtual: false }))
    const linked = new Set(stored.filter(i => i.contractId && i.type?.startsWith('customer')).map(i => `${i.contractId}-${i.type}`))

    DB.active('contracts').forEach(c => {
      if (c.status === 'cancelled') return
      const hasSynced = typeof FinanceSync !== 'undefined' && FinanceSync.hasSyncedDeposit(c.id)
      const dep = +(c.deposit || 0)
      if (dep > 0 && !linked.has(`${c.id}-customer_deposit`) && !hasSynced) {
        stored.push({
          id: `virt-dep-${c.id}`,
          _virtual: true,
          number: '—',
          type: 'customer_deposit',
          direction: 'in',
          title: `بیعانه — ${this._couple(c)}`,
          client: this._couple(c),
          contractId: c.id,
          amount: dep,
          date: c.contractDate || c.createdAt || '—',
          purpose: 'بیعانه قرارداد',
          status: 'paid',
          bankName: '',
          accountOrCard: '',
          periodMonth: ''
        })
      }
      const extra = +(c.paid || 0)
      const hasPayTx = (DB.active('transactions') || []).some(t =>
        t.contractId === c.id && t.purposeCategory === 'contract_payment'
      )
      if (extra > 0 && !linked.has(`${c.id}-customer_payment`) && !hasPayTx) {
        stored.push({
          id: `virt-pay-${c.id}`,
          _virtual: true,
          number: '—',
          type: 'customer_payment',
          direction: 'in',
          title: `پرداخت — ${this._couple(c)}`,
          client: this._couple(c),
          contractId: c.id,
          amount: extra,
          date: c.contractDate || c.createdAt || '—',
          purpose: 'پرداخت قرارداد',
          status: 'paid'
        })
      }
    })

    return stored.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))
  },

  _filter(list) {
    if (this._tab === 'all') return list
    if (this._tab === 'in') return list.filter(i => this._dirOf(i) === 'in')
    if (this._tab === 'out') return list.filter(i => this._dirOf(i) === 'out' && i.type !== 'personnel' && !i.type?.startsWith('utility'))
    if (this._tab === 'personnel') return list.filter(i => i.type === 'personnel')
    if (this._tab === 'utility') return list.filter(i => i.type?.startsWith('utility'))
    return list
  },

  _genNumber() {
    const t = Utils.todayJalali().replace(/\//g, '')
    const n = DB.active('invoices').length + 1
    return `F-${t}-${String(n).padStart(3, '0')}`
  },

  render(el) {
    const all = this._collectAll()
    const pinnedIds = this._getPinned()
    const pinned = pinnedIds.map(id => all.find(i => i.id === id)).filter(Boolean)
    const list = this._filter(all)
    const q = SM.getModuleSearch('invoices')
    const filtered = q ? list.filter(i =>
      [i.number, i.title, i.client, i.purpose, i.description, i.bankName, i.accountOrCard, i.periodMonth].join(' ').toLowerCase().includes(q)
    ) : list

    const totalIn = all.filter(i => this._dirOf(i) === 'in').reduce((s, i) => s + (i.amount || 0), 0)
    const totalOut = all.filter(i => this._dirOf(i) === 'out').reduce((s, i) => s + (i.amount || 0), 0)

    el.innerHTML = `
      ${SMUI.sectionHead('فاکتورها', 'واریزی سبز · برداشت قرمز · قبض · پرسنل · بیعانه', `
        <button class="sm-btn sm-btn-primary" onclick="SMModules.invoices.add()"><i class="fas fa-plus"></i> ثبت فاکتور</button>`)}
      ${SMUI.moduleSearch('invoices', 'جستجو در فاکتورها — مشتری، مبلغ، بابت، شماره...')}
      <div class="sm-inv-stats">
        <div class="sm-inv-stat in"><span>واریزی</span><strong>${SM.fmt(totalIn)} <small>تومان</small></strong></div>
        <div class="sm-inv-stat out"><span>برداشت</span><strong>${SM.fmt(totalOut)} <small>تومان</small></strong></div>
        <div class="sm-inv-stat"><span>تعداد</span><strong>${filtered.length.toLocaleString('fa-IR')}</strong></div>
      </div>
      ${this._catsHtml()}
      ${pinned.length ? `
        <div class="sm-inv-pinned">
          <div class="sm-inv-pinned-head"><i class="fas fa-heart"></i> ویژه — ${pinned.length.toLocaleString('fa-IR')} فاکتور</div>
          <div class="sm-inv-list" style="margin-top:0">
            ${pinned.map(i => this._row(i, true)).join('')}
          </div>
        </div>` : ''}
      <div class="sm-inv-list">
        ${filtered.filter(i => !pinnedIds.includes(i.id)).length
          ? filtered.filter(i => !pinnedIds.includes(i.id)).map(i => this._row(i, false)).join('')
          : (q || this._tab !== 'all' ? SMUI.empty('fa-file-invoice-dollar', q ? 'نتیجه‌ای یافت نشد' : 'فاکتوری در این دسته نیست') : (pinned.length ? '' : SMUI.empty('fa-file-invoice-dollar', 'فاکتوری ثبت نشده')))}
      </div>`
  },

  _row(i, inPinnedSection = false) {
    const meta = this._meta(i.type)
    const isIn = this._dirOf(i) === 'in'
    const pinned = this._isPinned(i.id)
    const canEdit = !i._virtual

    return `<div class="sm-inv-row${isIn ? ' is-in' : ' is-out'}${i._virtual ? ' is-virtual' : ''}${pinned && inPinnedSection ? ' is-pinned-highlight' : ''}">
      <div class="sm-inv-stripe"></div>
      <div class="sm-inv-icon"><i class="fas ${meta.icon}"></i></div>
      <div class="sm-inv-body">
        <div class="sm-inv-top">
          ${SMUI.badge(meta.label, isIn ? 'success' : 'danger')}
          ${i._virtual ? SMUI.badge('از قرارداد', 'info') : ''}
          ${pinned ? SMUI.badge('ویژه', 'danger') : ''}
          <span class="sm-inv-num" dir="ltr">${SM.esc(i.number || '—')}</span>
        </div>
        <div class="sm-inv-title">${SM.esc(i.title || i.purpose || i.client || '—')}</div>
        <div class="sm-inv-meta">
          ${i.client && i.client !== i.title ? `<span>👤 ${SM.esc(i.client)}</span>` : ''}
          ${i.purpose ? `<span>📋 ${SM.esc(i.purpose)}</span>` : ''}
          ${i.periodMonth ? `<span>📅 ${SM.esc(i.periodMonth)}</span>` : ''}
          ${i.personnelId ? `<span>👷 ${SM.esc(DB.find('personnel', p => p.id === i.personnelId)?.name || '')}</span>` : ''}
          ${i.bankName ? `<span>🏦 ${SM.esc(i.bankName)}</span>` : ''}
          ${i.accountOrCard ? `<span dir="ltr">💳 ${SM.esc(i.accountOrCard)}</span>` : ''}
        </div>
      </div>
      <button type="button" class="sm-inv-heart${pinned ? ' is-on' : ''}" onclick="SMModules.invoices.togglePin('${i.id}')" title="${pinned ? 'حذف از ویژه' : 'افزودن به ویژه'}"><i class="fas fa-heart"></i></button>
      <div class="sm-inv-side">
        <div class="sm-inv-amt ${isIn ? 'in' : 'out'}">${isIn ? '+' : '−'} ${SM.fmt(i.amount || 0)} <small>تومان</small></div>
        <div class="sm-inv-date">${SM.esc(i.date || '—')}</div>
        <div class="sm-inv-actions">
          ${i.contractId ? `<button type="button" class="sm-btn sm-btn-sm sm-btn-ghost" onclick="SMModules.contracts.view('${i.contractId}')" title="قرارداد"><i class="fas fa-file-contract"></i></button>` : ''}
          ${i._virtual ? `<button type="button" class="sm-btn sm-btn-sm sm-btn-primary" onclick="SMModules.invoices.registerVirtual('${i.id}')" title="ثبت فاکتور رسمی"><i class="fas fa-file-circle-plus"></i></button>` : ''}
          ${canEdit ? `<button type="button" class="sm-btn sm-btn-sm sm-btn-primary" onclick="SMModules.invoices.edit('${i.id}')"><i class="fas fa-pen"></i></button>` : ''}
          ${canEdit ? `<button type="button" class="sm-btn sm-btn-sm sm-btn-ghost" onclick="SMModules.invoices.view('${i.id}')"><i class="fas fa-eye"></i></button>` : ''}
        </div>
      </div>
    </div>`
  },

  view(id) {
    const i = DB.find('invoices', x => x.id === id)
    if (!i) return
    const meta = this._meta(i.type)
    SMUI.modal('مشاهده فاکتور', `
      <div class="sm-inv-view">
        <p><strong>شماره:</strong> <span dir="ltr">${SM.esc(i.number)}</span></p>
        <p><strong>نوع:</strong> ${SMUI.badge(meta.label, 'muted')}</p>
        <p><strong>مبلغ:</strong> ${SM.fmt(i.amount || 0)} تومان</p>
        <p><strong>تاریخ:</strong> ${SM.esc(i.date || '—')}</p>
        ${i.client ? `<p><strong>مشتری / طرف:</strong> ${SM.esc(i.client)}</p>` : ''}
        ${i.purpose ? `<p><strong>بابت:</strong> ${SM.esc(i.purpose)}</p>` : ''}
        ${i.periodMonth ? `<p><strong>دوره:</strong> ${SM.esc(i.periodMonth)}</p>` : ''}
        ${i.bankName ? `<p><strong>بانک:</strong> ${SM.esc(i.bankName)}</p>` : ''}
        ${i.accountOrCard ? `<p><strong>حساب / کارت:</strong> <span dir="ltr">${SM.esc(i.accountOrCard)}</span></p>` : ''}
        ${i.description ? `<p><strong>توضیح:</strong> ${SM.esc(i.description)}</p>` : ''}
      </div>`, { width: 480 })
  },

  add() { this._form(null) },
  edit(id) { this._form(DB.find('invoices', x => x.id === id)) },

  registerVirtual(id) {
    const v = this._collectAll().find(i => i.id === id && i._virtual)
    if (!v) return
    this._form(null, v)
  },

  _form(item, prefilled) {
    const seed = prefilled || item
    const banks = DB.active('banks') || []
    const contracts = DB.active('contracts').filter(c => c.status !== 'cancelled')
    const typeOpts = Object.entries(this.TYPES).map(([k, v]) => ({ value: k, label: `${v.label}` }))
    const monthOpts = this.MONTHS.map(m => ({ value: m, label: m }))
    const bankOpts = [{ value: '', label: '— انتخاب حساب —' }, ...banks.map(b => ({
      value: b.id, label: `${b.name || b.bank || 'حساب'} — ${b.account || ''}`
    }))]
    const contractOpts = [{ value: '', label: '— بدون قرارداد —' }, ...contracts.map(c => ({
      value: c.id, label: `${this._couple(c)} (${c.contractNum || c.id})`
    }))]

    SMUI.modal(item ? 'ویرایش فاکتور' : 'ثبت فاکتور جدید', `
      ${SMUI.formField('نوع فاکتور', 'inv-type', { type: 'select', value: seed?.type || 'customer_deposit', options: typeOpts })}
      ${SMUI.formField('عنوان', 'inv-title', { value: seed?.title || '', placeholder: 'مثال: بیعانه مراسم — مریم و رضا' })}
      ${SMUI.formField('مشتری / طرف حساب', 'inv-client', { value: seed?.client || '' })}
      ${SMUI.formField('قرارداد مرتبط', 'inv-contract', { type: 'select', value: seed?.contractId || '', options: contractOpts })}
      ${SMUI.formField('مبلغ (تومان)', 'inv-amount', { type: 'number', value: seed?.amount || '', dir: 'ltr' })}
      ${SMUI.formField('تاریخ', 'inv-date', { value: seed?.date && seed.date !== '—' ? seed.date : Utils.todayJalali() })}
      ${SMUI.formField('بابت / شرح پرداخت', 'inv-purpose', { value: seed?.purpose || '', placeholder: 'مثال: قبض برق، بیعانه، حقوق' })}
      ${SMUI.formField('ماه / دوره', 'inv-period', { type: 'select', value: seed?.periodMonth || '', options: [{ value: '', label: '—' }, ...monthOpts] })}
      ${SMUI.formField('پرداخت از حساب', 'inv-bank', { type: 'select', value: seed?.bankId || '', options: bankOpts })}
      ${SMUI.formField('شماره کارت / حساب', 'inv-card', { value: seed?.accountOrCard || '', dir: 'ltr', placeholder: '6037…' })}
      ${SMUI.formField('روش پرداخت', 'inv-method', { type: 'select', value: seed?.paymentMethod || 'transfer', options: [
        { value: 'transfer', label: 'کارت به کارت / انتقال' },
        { value: 'cash', label: 'نقد' },
        { value: 'cheque', label: 'چک' },
        { value: 'pos', label: 'کارتخوان' }
      ]})}
      ${SMUI.formField('توضیحات', 'inv-desc', { type: 'textarea', value: seed?.description || '' })}
      <label class="sm-check-row"><input type="checkbox" id="inv-ledger" ${item?.syncLedger ? 'checked' : ''}/> ثبت همزمان در دفترکل (حسابداری)</label>`, {
      onSave: async () => {
        const d = SMUI.readForm(['inv-type', 'inv-title', 'inv-client', 'inv-contract', 'inv-amount', 'inv-date', 'inv-purpose', 'inv-period', 'inv-bank', 'inv-card', 'inv-method', 'inv-desc'])
        const type = d['inv-type'] || 'other'
        const meta = this._meta(type)
        const bank = banks.find(b => b.id === d['inv-bank'])
        const contract = contracts.find(c => c.id === d['inv-contract'])
        const amount = +d['inv-amount'] || 0
        if (!amount) return SM.toast('مبلغ الزامی است', 'error')

        const data = {
          type,
          direction: meta.dir,
          title: d['inv-title'] || d['inv-purpose'] || meta.label,
          client: d['inv-client'] || (contract ? this._couple(contract) : ''),
          contractId: d['inv-contract'] || '',
          amount,
          date: d['inv-date'] || Utils.todayJalali(),
          purpose: d['inv-purpose'] || '',
          periodMonth: d['inv-period'] || '',
          bankId: d['inv-bank'] || '',
          bankName: bank ? (bank.name || bank.bank || '') : '',
          accountOrCard: d['inv-card'] || '',
          paymentMethod: d['inv-method'] || 'transfer',
          description: d['inv-desc'] || '',
          status: 'paid',
          syncLedger: document.getElementById('inv-ledger')?.checked || false
        }

        let invoiceId = item?.id
        if (item) {
          await SecureDB.update('invoices', item.id, { ...data, number: item.number })
        } else {
          const num = this._genNumber()
          const inv = await SecureDB.insert('invoices', { ...data, number: num, createdAt: Utils.todayJalali() })
          data.number = num
          invoiceId = inv.id
        }

        // Ledger sync via FinanceSync (atomic bank + optional contract paid)
        const alreadyLinked = !!(item?.transactionId)
        if (data.syncLedger && !alreadyLinked && data.bankId && typeof FinanceSync !== 'undefined') {
          const purposeCategory = type === 'customer_deposit' ? 'contract_deposit'
            : (type === 'customer_payment' ? 'contract_payment'
              : (data.direction === 'in' ? 'other_income' : 'other'))
          const ledgerOpts = {
            amount: data.amount,
            bankId: data.bankId,
            date: data.date,
            periodMonth: data.periodMonth,
            contractId: data.contractId || '',
            client: data.client || '',
            purposeCategory,
            purpose: data.purpose || data.title,
            paymentMethod: data.paymentMethod || 'transfer',
            accountOrCard: data.accountOrCard || '',
            notes: data.description || '',
            syncInvoice: false,
            allowOverdraft: true
          }
          const res = data.direction === 'in'
            ? await FinanceSync.recordDeposit(ledgerOpts)
            : await FinanceSync.recordWithdrawal(ledgerOpts)
          if (!res.ok) {
            if (!item && invoiceId) {
              try {
                await SecureDB.delete('invoices', invoiceId)
              } catch (re) {
                if (typeof SMObservability !== 'undefined') {
                  SMObservability.captureError('finance_rollback:invoiceCreate', re, { rollback: true })
                }
              }
            }
            return SM.toast(res.error || 'خطا در ثبت دفترکل', 'error')
          }
          if (invoiceId) await SecureDB.update('invoices', invoiceId, { transactionId: res.transactionId })
          if (res.transactionId) {
            await SecureDB.update('transactions', res.transactionId, {
              invoiceId,
              invoiceRef: item?.number || data.number
            })
          }
        } else if (data.syncLedger && !alreadyLinked && !data.bankId) {
          return SM.toast('برای ثبت در دفترکل، حساب بانکی را انتخاب کنید', 'error')
        }

        SM.toast('فاکتور ثبت شد', 'success')
        SMH.refresh('invoices')
      },
      onDelete: item ? async () => {
        if (!SMH.confirmDelete()) return
        try {
          if (item.transactionId && typeof FinanceSync !== 'undefined') {
            const t = DB.find('transactions', x => x.id === item.transactionId)
            if (t && !t._deleted) {
              const res = await FinanceSync.deleteTransaction(t.id)
              if (!res.ok) return SM.toast(res.error || 'خطا در حذف تراکنش مرتبط', 'error')
            }
          } else if (item.transactionId) {
            return SM.toast('ماژول مالی در دسترس نیست', 'error')
          }
          // Invoice may already be tombstoned if linked via deleteTransaction path
          const inv = DB.find('invoices', x => x.id === item.id)
          if (inv && !inv._deleted) await SecureDB.delete('invoices', item.id)
          SM.toast('فاکتور حذف شد', 'success')
          SMH.refresh('invoices')
        } catch (e) {
          SM.toast(e.message || 'خطا', 'error')
        }
      } : null,
      width: 520
    })

    document.getElementById('inv-contract')?.addEventListener('change', e => {
      const c = contracts.find(x => x.id === e.target.value)
      if (!c) return
      const client = document.getElementById('inv-client')
      const title = document.getElementById('inv-title')
      const type = document.getElementById('inv-type')
      if (client && !client.value) client.value = this._couple(c)
      if (title && !title.value) {
        const t = type?.value
        title.value = t === 'customer_deposit' ? `بیعانه — ${this._couple(c)}` : `پرداخت — ${this._couple(c)}`
      }
    })
  }
}


