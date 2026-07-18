/* Studio M Pro — All Feature Modules */
const SMModules = {}

/** پالت رنگ قراردادها — متعادل و بدون تم صرفاً بنفش/صورتی */
const SM_CONTRACT_PALETTE = ['#0071E3', '#009688', '#E68619', '#34C759', '#5856D6', '#00A3BF', '#B8860B', '#64748B']

/* ── Dashboard ── */
SMModules.dashboard = {
  render(el) {
    if (typeof SMDashboard !== 'undefined') {
      SMDashboard.render(el)
      return
    }
    el.innerHTML = SMUI.empty('fa-gauge-high', 'داشبورد')
  }
}

/* placeholder removed */

/* ── Bookings & Calendar ── */
const BOOKING_STATUS = {
  scheduled: 'زمان‌بندی شده',
  confirmed: 'تأیید شده',
  cancelled: 'لغو شده'
}

SMModules.bookings = {
  _statusLabel(s) { return BOOKING_STATUS[s] || s || '—' },
  render(el) {
    const bookings = SMH.filterBySearch(DB.get('bookings'), ['title', 'client', 'date'])
    el.innerHTML = `
      ${SMUI.sectionHead('رزرو و مشاوره', '', SMH.addBtn('SMModules.bookings.add()'))}
      ${SMUI.moduleSearch('bookings', 'جستجو در رزروها — مشتری، عنوان، تاریخ...')}
      ${SMUI.table(
        ['عنوان', 'تاریخ', 'ساعت', 'مشتری', 'وضعیت', SM.t('actions')],
        bookings.map(b => `<tr>
          <td>${SM.esc(b.title)}</td><td>${SM.esc(b.date)}</td><td>${SM.esc(b.time || '—')}</td>
          <td>${SM.esc(b.client || '—')}</td><td>${SMUI.badge(this._statusLabel(b.status), b.status === 'confirmed' ? 'success' : b.status === 'cancelled' ? 'danger' : 'warning')}</td>
          ${SMUI.tableActionsCell(`SMModules.bookings.view('${b.id}')`, `SMModules.bookings.edit('${b.id}')`)}
        </tr>`)
      )}`
  },
  view(id) {
    const b = DB.find('bookings', x => x.id === id)
    if (!b) return
    SM.pushSubView(b.title, () => `
      <div class="sm-card"><div class="sm-card-body">
        <p><strong>تاریخ:</strong> ${SM.esc(b.date)} — ${SM.esc(b.time || '')}</p>
        <p style="margin-top:8px"><strong>مشتری:</strong> ${SM.esc(b.client || '—')}</p>
        <p style="margin-top:8px"><strong>وضعیت:</strong> ${SMUI.badge(this._statusLabel(b.status), 'info')}</p>
        <div style="margin-top:16px;display:flex;gap:8px">
          <button class="sm-btn sm-btn-primary" onclick="SMModules.bookings.edit('${b.id}')">${SM.t('edit')}</button>
        </div>
      </div></div>`)
  },
  add() { this._form(null) },
  edit(id) { this._form(DB.find('bookings', b => b.id === id)) },
  _form(item) {
    SMUI.modal(item ? 'ویرایش مشاوره' : 'افزودن مشاوره', `
      ${SMUI.formField('عنوان', 'bk-title', { value: item?.title || '', placeholder: 'مثلاً: مشاوره حضوری' })}
      ${SMUI.formField('تاریخ', 'bk-date', { value: item?.date || Utils.todayJalali() })}
      ${SMUI.formField('ساعت', 'bk-time', { value: item?.time || '14:00', dir: 'ltr' })}
      ${SMUI.formField('مشتری', 'bk-client', { value: item?.client || '' })}
      ${SMUI.formField('وضعیت', 'bk-status', { type: 'select', value: item?.status || 'scheduled', options: [
        { value: 'scheduled', label: 'زمان‌بندی شده' },
        { value: 'confirmed', label: 'تأیید شده' },
        { value: 'cancelled', label: 'لغو شده' }
      ]})}`, {
      onSave: async () => {
        const d = SMUI.readForm(['bk-title', 'bk-date', 'bk-time', 'bk-client', 'bk-status'])
        if (!d['bk-title']) return SM.toast(SM.t('error'), 'error')
        const data = { title: d['bk-title'], date: d['bk-date'], time: d['bk-time'], client: d['bk-client'], status: d['bk-status'] }
        if (item) await SecureDB.update('bookings', item.id, data)
        else await SecureDB.insert('bookings', data)
        SMH.refresh('bookings')
      },
      onDelete: item ? () => SMH.remove('bookings', item.id, 'bookings') : null
    })
  }
}

/* ── Wedding Timeline ── */
SMModules.timeline = {
  render(el) {
    const q = SM.getModuleSearch('timeline')
    let timelines = DB.get('timelines')
    const contracts = DB.get('contracts')
    if (q) {
      timelines = timelines.filter(t => {
        const contract = contracts.find(c => c.id === t.contractId)
        const hay = [t.title, contract?.couple, contract?.groom, contract?.bride, ...(t.events || []).map(e => `${e.time} ${e.title} ${e.desc}`)].join(' ').toLowerCase()
        return hay.includes(q)
      })
    }
    el.innerHTML = `
      ${SMUI.sectionHead('تایم‌لاین عروسی', 'برنامه روز مراسم', `<button class="sm-btn sm-btn-primary" onclick="SMModules.timeline.add()"><i class="fas fa-plus"></i> ${SM.t('add')}</button>`)}
      ${SMUI.moduleSearch('timeline', 'جستجو در تایم‌لاین — زوج، رویداد...')}
      <div class="sm-grid-2">${timelines.length ? timelines.map(t => {
        const contract = contracts.find(c => c.id === t.contractId)
        const events = t.events || []
        return `<div class="sm-card">
          <div class="sm-card-head">
            <div class="sm-card-title">${SM.esc(t.title || contract?.couple || 'تایم‌لاین')}</div>
            <button class="sm-btn sm-btn-sm sm-btn-ghost" onclick="SMModules.timeline.edit('${t.id}')">${SM.t('edit')}</button>
          </div>
          <div class="sm-card-body">
            <div class="sm-timeline">${events.map(ev => `
              <div class="sm-timeline-item">
                <div class="sm-timeline-dot"></div>
                <div class="sm-timeline-time">${SM.esc(ev.time || '')}</div>
                <div class="sm-timeline-title">${SM.esc(ev.title)}</div>
                <div class="sm-timeline-desc">${SM.esc(ev.desc || '')}</div>
              </div>`).join('') || SMUI.empty('fa-clock', SM.t('no_data'))}
            </div>
          </div></div>`
      }).join('') : SMUI.empty('fa-clock', q ? 'تایم‌لاینی یافت نشد' : 'تایم‌لاین عروسی بسازید')}</div>`
  },
  add() { this._form(null) },
  edit(id) { this._form(DB.find('timelines', t => t.id === id)) },
  _form(item) {
    const contracts = DB.get('contracts')
    SMUI.modal(item ? 'ویرایش تایم‌لاین' : 'تایم‌لاین عروسی', `
      ${SMUI.formField('عنوان', 'tl-title', { value: item?.title || '', placeholder: 'مثلاً: برنامه روز عروسی' })}
      ${SMUI.formField('قرارداد', 'tl-contract', { type: 'select', value: item?.contractId || '', options: [
        { value: '', label: '— انتخاب —' }, ...contracts.map(c => ({ value: c.id, label: c.couple || c.contractNum }))
      ]})}
      ${SMUI.formField('رویدادها (هر خط: ساعت|عنوان|توضیح)', 'tl-events', { type: 'textarea', value: (item?.events || []).map(e => `${e.time}|${e.title}|${e.desc || ''}`).join('\n'), placeholder: '14:00|ورود عروس|...\n15:30|عقد\n18:00|شام' })}`, {
      onSave: async () => {
        const d = SMUI.readForm(['tl-title', 'tl-contract', 'tl-events'])
        const events = d['tl-events'].split('\n').filter(Boolean).map(line => {
          const [time, title, desc] = line.split('|')
          return { time: time?.trim(), title: title?.trim(), desc: desc?.trim() || '' }
        }).filter(e => e.title)
        const data = { title: d['tl-title'], contractId: d['tl-contract'], events }
        if (item) await SecureDB.update('timelines', item.id, data)
        else await SecureDB.insert('timelines', data)
        SMH.refresh('timeline')
      }, width: 560,
      onDelete: item ? () => SMH.remove('timelines', item.id, 'timeline') : null
    })
  }
}

/* ── Contracts ── */
SMModules.contracts = {
  _cadres: SM_CONTRACT_PALETTE,
  _selectedId: null,
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
          ${inv ? `<button type="button" class="sm-btn sm-btn-sm sm-btn-ghost" onclick="SM.navigate('invoices');SM.setModuleSearch('invoices','${SM.esc(inv.number || '')}')"><i class="fas fa-file-invoice"></i> فاکتور ${SM.esc(inv.number || '')}</button>` : ''}
          <button type="button" class="sm-btn sm-btn-sm sm-btn-ghost" onclick="SM.navigate('accounting')"><i class="fas fa-book"></i> حسابداری</button>
        </div>
      </div>`
    }).join('')}</div>`
  },

  addPayment(contractId) {
    const c = DB.find('contracts', x => x.id === contractId)
    if (!c) return
    const banks = DB.get('banks') || []
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

  selectRow(id, ev) {
    if (ev.target.closest('button, a')) return
    this._selectedId = this._selectedId === id ? null : id
    document.querySelectorAll('.sm-contract-row').forEach(r => {
      r.classList.toggle('is-selected', r.dataset.id === this._selectedId)
    })
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
    let contracts = DB.get('contracts')
    if (q) {
      contracts = contracts.filter(c =>
        [c.couple, c.groom, c.bride, c.contractNum, c.eventDate, c.date].join(' ').toLowerCase().includes(q)
      )
    }
    contracts = this._sort(contracts)

    el.innerHTML = `
      ${SMUI.sectionHead('قراردادها', 'مرتب‌شده بر اساس تاریخ مراسم', `
        <button class="sm-btn sm-btn-primary" onclick="window.location.href='../contract.html'"><i class="fas fa-plus"></i> قرارداد جدید</button>`)}
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

    return `<div class="sm-contract-row${isCancelled ? ' is-cancelled' : ''}${selected}" style="--ct-color:${color}" data-id="${c.id}" onclick="SMModules.contracts.selectRow('${c.id}', event)">
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
        <button type="button" class="sm-btn sm-btn-sm sm-btn-ghost sm-contract-act" title="مشاهده" onclick="event.stopPropagation();SMModules.contracts.view('${c.id}')"><i class="fas fa-eye"></i></button>
        <button type="button" class="sm-btn sm-btn-sm sm-btn-primary sm-contract-act" title="ویرایش" onclick="event.stopPropagation();SMModules.contracts.edit('${c.id}')"><i class="fas fa-pen"></i></button>
        ${!isCancelled ? `<button type="button" class="sm-btn sm-btn-sm sm-btn-danger sm-btn-outline sm-contract-act" title="لغو قرارداد" onclick="event.stopPropagation();SMModules.contracts.quickCancel('${c.id}')"><i class="fas fa-ban"></i></button>` : ''}
      </div>
    </div>`
  },

  quickCancel(id) {
    const c = DB.find('contracts', x => x.id === id)
    if (!c) return
    if (!confirm(`قرارداد «${this._couple(c)}» لغو شود؟`)) return
    this.edit(id, true)
  },

  view(id) {
    const c = DB.find('contracts', x => x.id === id)
    if (!c) return
    const paid = (c.deposit || 0) + (c.paid || 0)
    const remain = Math.max(0, (c.total || 0) - paid)
    const st = this._statusOf(c)
    const idx = this._sort(DB.get('contracts')).findIndex(x => x.id === id)
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
              <button type="button" class="sm-btn sm-btn-sm sm-btn-primary" onclick="SMModules.contracts.addPayment('${c.id}')"><i class="fas fa-plus"></i> ثبت واریز</button>
            </div>
            <div class="sm-card-body">${this._paymentsBlock(c)}</div>
          </div>
          <div class="sm-card sm-contract-detail-card">
            <div class="sm-card-head"><div class="sm-card-title">عملیات</div></div>
            <div class="sm-card-body" style="display:flex;flex-direction:column;gap:10px">
              <button class="sm-btn sm-btn-primary" onclick="SMModules.contracts.edit('${c.id}')"><i class="fas fa-pen"></i> ویرایش / وضعیت</button>
              <button class="sm-btn sm-btn-ghost" onclick="window.location.href='../contract.html?id=${c.id}'"><i class="fas fa-file-contract"></i> فرم کامل قرارداد</button>
              <button class="sm-btn sm-btn-ghost" onclick="SM.navigate('timeline')"><i class="fas fa-clock"></i> تایم‌لاین</button>
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
    const c = DB.find('contracts', x => x.id === id)
    if (!c) return
    const idx = this._sort(DB.get('contracts')).findIndex(x => x.id === id)
    const color = this._color(Math.max(0, idx))
    const cr = c.cancelRecord || {}

    SMUI.modal('ویرایش قرارداد', `
      <div class="sm-contract-modal-banner" style="--ct-color:${color}">
        <span class="sm-couple-name">${SM.esc(this._bride(c))}</span>
        <span class="sm-couple-sep">و</span>
        <span class="sm-couple-name sm-couple-name-sub">${SM.esc(this._groom(c))}</span>
        <span class="sm-modal-banner-date">${SM.esc(this._eventDate(c))}</span>
      </div>
      ${SMUI.formField('وضعیت قرارداد', 'ct-status', { type: 'select', value: focusCancel ? 'cancelled' : (c.status || 'active'), options: [
        { value: 'active', label: 'فعال' },
        { value: 'draft', label: 'پیش‌نویس' },
        { value: 'done', label: 'اتمام یافته' },
        { value: 'cancelled', label: 'لغو شده' }
      ]})}
      <div id="ct-cancel-fields" class="sm-cancel-fields"${c.status !== 'cancelled' && !focusCancel ? ' hidden' : ''}>
        <div class="sm-cancel-fields-title">ثبت عملیات لغو — مالی</div>
        ${SMUI.formField('مبلغ پرداخت‌شده تا زمان لغو (تومان)', 'ct-paid', { value: cr.paidAmount != null ? cr.paidAmount : ((c.deposit || 0) + (c.paid || 0)), dir: 'ltr' })}
        ${SMUI.formField('شماره حساب / کارت', 'ct-bank', { value: cr.bankAccount || '', dir: 'ltr', placeholder: 'مثلاً IR...' })}
        ${SMUI.formField('واریز به / دریافت‌کننده', 'ct-paid-to', { value: cr.paidTo || '' })}
        ${SMUI.formField('نحوه برگشت وجه', 'ct-refund', { type: 'select', value: cr.refundMethod || '', options: [
          { value: '', label: '— انتخاب —' },
          { value: 'cash', label: 'نقدی' },
          { value: 'card', label: 'کارت به کارت' },
          { value: 'cheque', label: 'چک' },
          { value: 'partial', label: 'برگشت جزئی' },
          { value: 'none', label: 'بدون برگشت (جریمه)' }
        ]})}
        ${SMUI.formField('توضیحات عملیاتی', 'ct-notes', { type: 'textarea', value: cr.refundNotes || '' })}
      </div>
      ${SMUI.formField('یادداشت مدیر', 'ct-note', { type: 'textarea', value: c.managerNote || '' })}`, {
      width: 520,
      onSave: async () => {
        const d = SMUI.readForm(['ct-status', 'ct-paid', 'ct-bank', 'ct-paid-to', 'ct-refund', 'ct-notes', 'ct-note'])
        const status = d['ct-status']
        const patch = { status, managerNote: d['ct-note'] }
        if (status === 'cancelled') {
          patch.cancelRecord = {
            paidAmount: +d['ct-paid'] || 0,
            bankAccount: d['ct-bank'],
            paidTo: d['ct-paid-to'],
            refundMethod: d['ct-refund'],
            refundNotes: d['ct-notes'],
            recordedAt: typeof Utils !== 'undefined' ? Utils.todayJalali() : new Date().toISOString(),
            recordedBy: SM.user()?.name || 'مدیر'
          }
          patch.cancelledAt = patch.cancelRecord.recordedAt
          if (typeof DB.log === 'function') DB.log('contract_cancel', `${this._couple(c)} — ${SM.fmt(patch.cancelRecord.paidAmount)}`)
        }
        await SecureDB.update('contracts', id, patch)
        SM.log('contract_update', this._couple(c))
        SMH.refresh('contracts')
      }
    })
    setTimeout(() => {
      document.getElementById('ct-status')?.addEventListener('change', () => SMModules.contracts._toggleCancelFields())
      SMModules.contracts._toggleCancelFields()
    }, 40)
  }
}

/* ── Packages ── */
SMModules.packages = {
  render(el) {
    if (typeof PackageCatalog !== 'undefined') PackageCatalog.ensureDefaults()
    const pkgs = DB.get('packages')
    el.innerHTML = `
      ${SMUI.sectionHead('پکیج قیمت', 'سیلور، گلد، VIP و CBI — قابل ویرایش', `<button class="sm-btn sm-btn-primary" onclick="SMModules.packages.add()"><i class="fas fa-plus"></i> پکیج جدید</button>`)}
      <div class="sm-pkg-grid">
        ${pkgs.length ? pkgs.map(p => this._card(p)).join('') : SMUI.empty('fa-box-open', 'پکیجی تعریف نشده')}
      </div>`
  },

  _card(p) {
    const tier = PackageCatalog?.tierMeta(p.tier) || { label: p.name, color: p.color || '#64748B', icon: '📦' }
    const color = p.color || tier.color
    const total = PackageCatalog?.packageTotal(p) ?? (p.price || 0)
    const features = PackageCatalog?.featureLines(p) || p.features || []
    return `<div class="sm-pkg-card" style="--pkg-color:${color}">
      <div class="sm-pkg-card-banner">
        <span class="sm-pkg-tier-icon">${tier.icon}</span>
        <div>
          <div class="sm-pkg-tier-label">${SM.esc(tier.label)}</div>
          <div class="sm-pkg-name">${SM.esc(p.name)}</div>
        </div>
        ${p.featured ? SMUI.badge('پیشنهادی', 'warning') : ''}
      </div>
      <div class="sm-pkg-card-body">
        <div class="sm-pkg-price">${SM.fmt(total)} <small>تومان</small></div>
        <p class="sm-pkg-desc">${SM.esc(p.description || '')}</p>
        <ul class="sm-pkg-features">${features.map(f => `<li>${SM.esc(f)}</li>`).join('')}</ul>
        <div class="sm-pkg-actions">
          <button class="sm-btn sm-btn-sm sm-btn-primary" onclick="SMModules.packages.edit('${p.id}')"><i class="fas fa-pen"></i> ویرایش</button>
          <button class="sm-btn sm-btn-sm sm-btn-danger sm-btn-outline" onclick="SMH.remove('packages','${p.id}','packages')"><i class="fas fa-trash"></i></button>
        </div>
      </div>
    </div>`
  },

  add() { this._form(null) },
  edit(id) { this._form(DB.find('packages', p => p.id === id)) },

  _toggleRow(id) {
    const row = document.querySelector(`.sm-pkg-line[data-line="${id}"]`)
    const on = document.getElementById(`pl-en-${id}`)?.checked
    if (row) row.classList.toggle('is-off', !on)
    this._refreshEditorPreview()
  },

  _refreshEditorPreview() {
    const data = this._readEditor()
    const total = PackageCatalog.packageTotal(data)
    const feats = PackageCatalog.featureLines(data)
    const tier = PackageCatalog.tierMeta(data.tier)
    const el = id => document.getElementById(id)
    if (el('pkg-preview-total')) el('pkg-preview-total').innerHTML = `${SM.fmt(total)} <small>تومان</small>`
    if (el('pkg-preview-features')) el('pkg-preview-features').innerHTML = feats.length
      ? feats.map(f => `<li>${SM.esc(f)}</li>`).join('')
      : '<li class="muted">آیتمی فعال نیست</li>'
    const card = el('pkg-preview-card')
    if (card) card.style.setProperty('--pkg-color', tier.color)
    if (el('pkg-preview-tier')) el('pkg-preview-tier').textContent = `${tier.icon} ${tier.label}`
  },

  _lineRow(id, icon, title, enabled, price, note, extraHtml) {
    return `<div class="sm-pkg-line${enabled ? '' : ' is-off'}" data-line="${id}">
      <div class="sm-pkg-line-head">
        <label class="sm-pkg-line-toggle"><input type="checkbox" id="pl-en-${id}" ${enabled ? 'checked' : ''} onchange="SMModules.packages._toggleRow('${id}')"/><span>${icon} ${title}</span></label>
        <input type="number" id="pl-pr-${id}" class="sm-input ltr sm-pkg-line-price" dir="ltr" placeholder="قیمت (تومان)" value="${price || ''}" oninput="SMModules.packages._refreshEditorPreview()"/>
      </div>
      ${extraHtml || ''}
      <textarea id="pl-note-${id}" class="sm-textarea sm-pkg-line-note" rows="2" placeholder="توضیح این آیتم (اختیاری)" oninput="SMModules.packages._refreshEditorPreview()">${SM.esc(note || '')}</textarea>
    </div>`
  },

  _editorHtml(item) {
    const p = PackageCatalog.normalize(item || {})
    const tierOpts = Object.entries(PackageCatalog.TIERS).map(([k, v]) => ({
      value: k, label: `${v.icon} ${v.label}`
    }))
    const v = p.video || {}
    const album = p.album || {}
    const disk = p.disk || {}
    const tier = PackageCatalog.tierMeta(p.tier || 'gold')
    const total = PackageCatalog.packageTotal(p)
    const feats = PackageCatalog.featureLines(p)

    const addonLines = PackageCatalog.ADDONS.map(ad => {
      const row = p[ad.id] || {}
      return this._lineRow(ad.id, ad.icon, ad.label, row.enabled, row.price, row.note, '')
    }).join('')

    const customRows = (p.customItems?.length ? p.customItems : [{ label: '', desc: '', price: '' }]).map((c, i) => `
      <div class="sm-pkg-custom-row" data-idx="${i}">
        <input type="text" class="sm-input pkg-custom-label" placeholder="عنوان (مثلاً تدوین ویژه)" value="${SM.esc(c.label || '')}" oninput="SMModules.packages._refreshEditorPreview()"/>
        <input type="number" class="sm-input ltr pkg-custom-price" dir="ltr" placeholder="قیمت" value="${c.price || ''}" oninput="SMModules.packages._refreshEditorPreview()"/>
        <textarea class="sm-textarea pkg-custom-desc" rows="2" placeholder="توضیح" oninput="SMModules.packages._refreshEditorPreview()">${SM.esc(c.desc || c.note || '')}</textarea>
      </div>`).join('')

    return `
      <div class="sm-pkg-editor">
        <div class="sm-pkg-preview-wrap">
          <div id="pkg-preview-card" class="sm-pkg-card sm-pkg-preview-card" style="--pkg-color:${tier.color}">
            <div class="sm-pkg-card-banner">
              <span class="sm-pkg-tier-icon">${tier.icon}</span>
              <div>
                <div id="pkg-preview-tier" class="sm-pkg-tier-label">${tier.icon} ${tier.label}</div>
                <input id="pkg-name" class="sm-pkg-name-input" placeholder="نام پکیج" value="${SM.esc(p.name || '')}" oninput="SMModules.packages._refreshEditorPreview()"/>
              </div>
            </div>
            <div class="sm-pkg-card-body">
              <div id="pkg-preview-total" class="sm-pkg-price">${SM.fmt(total)} <small>تومان</small></div>
              <textarea id="pkg-desc" class="sm-textarea sm-pkg-desc-input" rows="2" placeholder="توضیحات پکیج">${SM.esc(p.description || '')}</textarea>
              <ul id="pkg-preview-features" class="sm-pkg-features">${feats.map(f => `<li>${SM.esc(f)}</li>`).join('')}</ul>
            </div>
          </div>
          <div class="sm-pkg-tier-pick">${SMUI.formField('سطح / رنگ', 'pkg-tier', { type: 'select', value: p.tier || 'gold', options: tierOpts })}</div>
        </div>

        <div class="sm-pkg-lines">
          <h4 class="sm-pkg-section-title">🎬 فیلمبرداری</h4>
          <div class="sm-pkg-line is-always-on" data-line="video">
            <div class="sm-pkg-line-head">
              <span class="sm-pkg-line-title">🎬 پکیج فیلم</span>
              <input type="number" id="pl-pr-video" class="sm-input ltr sm-pkg-line-price" dir="ltr" placeholder="قیمت پایه" value="${v.price || ''}" oninput="SMModules.packages._refreshEditorPreview()"/>
            </div>
            <div class="sm-pkg-line-grid">
              <label class="sm-label">تعداد دوربین</label>
              <select id="pl-cameras" class="sm-input" onchange="SMModules.packages._refreshEditorPreview()">
                ${[1, 2, 3, 4, 5].map(n => `<option value="${n}"${+v.cameras === n ? ' selected' : ''}>${n} دوربین</option>`).join('')}
              </select>
              <label class="sm-label">کیفیت</label>
              <select id="pl-quality" class="sm-input" onchange="SMModules.packages._refreshEditorPreview()">
                <option value="fullhd"${v.quality === 'fullhd' ? ' selected' : ''}>Full HD</option>
                <option value="4k"${v.quality !== 'fullhd' ? ' selected' : ''}>4K UHD</option>
              </select>
              <label class="sm-label">مکمل 4K</label>
              <input type="number" id="pl-price4k" class="sm-input ltr" dir="ltr" placeholder="اگر جدا" value="${v.price4k || ''}" oninput="SMModules.packages._refreshEditorPreview()"/>
            </div>
            <label class="sm-check-row"><input type="checkbox" id="pl-clip" ${v.clip !== false ? 'checked' : ''} onchange="SMModules.packages._refreshEditorPreview()"/> شامل کلیپ</label>
            <textarea id="pl-note-video" class="sm-textarea sm-pkg-line-note" rows="2" placeholder="توضیح فیلمبرداری">${SM.esc(v.note || '')}</textarea>
          </div>

          <h4 class="sm-pkg-section-title">📸 عکاسی و افزودنی‌های روز مراسم</h4>
          ${addonLines}

          <h4 class="sm-pkg-section-title">📔 آلبوم و تحویل</h4>
          ${this._lineRow('album', '📔', 'طراحی و چاپ آلبوم', album.enabled, album.price, album.note, `
            <div class="sm-pkg-line-grid">
              <label class="sm-label">سایز</label>
              <select id="pl-album-size" class="sm-input">
                <option value="20x20"${album.size === '20x20' ? ' selected' : ''}>۲۰×۲۰</option>
                <option value="25x25"${album.size === '25x25' ? ' selected' : ''}>۲۵×۲۵</option>
                <option value="30x30"${album.size === '30x30' ? ' selected' : ''}>۳۰×۳۰</option>
                <option value="luxury"${album.size === 'luxury' ? ' selected' : ''}>لوکس</option>
              </select>
              <label class="sm-label">تعداد عکس</label>
              <input type="number" id="pl-album-qty" class="sm-input ltr" dir="ltr" value="${album.photoCount || 10}" placeholder="مثلاً ۱۰"/>
            </div>`)}
          ${this._lineRow('disk', '💿', 'دیسک / فلش تحویل', disk.enabled, disk.price, disk.note, `
            <input type="text" id="pl-disk-label" class="sm-input" placeholder="نوع: USB، Blu-ray، …" value="${SM.esc(disk.label || '')}"/>`)}

          <h4 class="sm-pkg-section-title">➕ آیتم‌های سفارشی</h4>
          <div id="pkg-custom-rows">${customRows}</div>
          <button type="button" class="sm-btn sm-btn-sm sm-btn-ghost" onclick="SMModules.packages.addCustomRow()">+ ردیف سفارشی</button>
        </div>
      </div>`
  },

  addCustomRow() {
    const wrap = document.getElementById('pkg-custom-rows')
    if (!wrap) return
    wrap.insertAdjacentHTML('beforeend', `<div class="sm-pkg-custom-row">
      <input type="text" class="sm-input pkg-custom-label" placeholder="عنوان" oninput="SMModules.packages._refreshEditorPreview()"/>
      <input type="number" class="sm-input ltr pkg-custom-price" dir="ltr" placeholder="قیمت" oninput="SMModules.packages._refreshEditorPreview()"/>
      <textarea class="sm-textarea pkg-custom-desc" rows="2" placeholder="توضیح" oninput="SMModules.packages._refreshEditorPreview()"></textarea>
    </div>`)
  },

  _readRow(id) {
    return {
      enabled: document.getElementById(`pl-en-${id}`)?.checked || false,
      price: +(document.getElementById(`pl-pr-${id}`)?.value || 0),
      note: document.getElementById(`pl-note-${id}`)?.value?.trim() || ''
    }
  },

  _readEditor() {
    const tier = document.getElementById('pkg-tier')?.value || 'gold'
    const data = {
      tier,
      name: document.getElementById('pkg-name')?.value?.trim() || '',
      description: document.getElementById('pkg-desc')?.value?.trim() || '',
      video: {
        cameras: +(document.getElementById('pl-cameras')?.value || 3),
        quality: document.getElementById('pl-quality')?.value || '4k',
        price: +(document.getElementById('pl-pr-video')?.value || 0),
        price4k: +(document.getElementById('pl-price4k')?.value || 0),
        clip: document.getElementById('pl-clip')?.checked !== false,
        note: document.getElementById('pl-note-video')?.value?.trim() || ''
      },
      album: {
        ...this._readRow('album'),
        size: document.getElementById('pl-album-size')?.value || '20x20',
        photoCount: +(document.getElementById('pl-album-qty')?.value || 10)
      },
      disk: {
        ...this._readRow('disk'),
        label: document.getElementById('pl-disk-label')?.value?.trim() || 'دیسک'
      },
      customItems: [...document.querySelectorAll('#pkg-custom-rows .sm-pkg-custom-row')].map(row => ({
        label: row.querySelector('.pkg-custom-label')?.value?.trim() || '',
        desc: row.querySelector('.pkg-custom-desc')?.value?.trim() || '',
        price: +(row.querySelector('.pkg-custom-price')?.value || 0)
      })).filter(c => c.label && c.price > 0)
    }
    PackageCatalog.ADDONS.forEach(ad => { data[ad.id] = this._readRow(ad.id) })
    data.addons = PackageCatalog._toAddons(data)
    return data
  },

  _form(item) {
    SMUI.modal(item ? 'ویرایش پکیج قیمت' : 'پکیج قیمت جدید', this._editorHtml(item), {
      onSave: async () => {
        const data = this._readEditor()
        if (!data.name) return SM.toast('نام پکیج الزامی است', 'error')
        const tierMeta = PackageCatalog.tierMeta(data.tier)
        data.color = tierMeta.color
        data.features = PackageCatalog.featureLines(data)
        data.featured = item?.featured || false
        if (item) await SecureDB.update('packages', item.id, data)
        else await SecureDB.insert('packages', { ...data, createdAt: Utils.todayJalali() })
        SM.toast('پکیج ذخیره شد', 'success')
        SMH.refresh('packages')
      },
      onDelete: item ? () => SMH.remove('packages', item.id, 'packages') : null,
      width: 720
    })
    document.getElementById('pkg-tier')?.addEventListener('change', () => this._refreshEditorPreview())
    setTimeout(() => this._refreshEditorPreview(), 0)
  }
}

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
    const stored = DB.get('invoices').map(i => ({ ...i, _virtual: false }))
    const linked = new Set(stored.filter(i => i.contractId && i.type?.startsWith('customer')).map(i => `${i.contractId}-${i.type}`))

    DB.get('contracts').forEach(c => {
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
      const hasPayTx = (DB.get('transactions') || []).some(t =>
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
    const n = DB.get('invoices').length + 1
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
    const banks = DB.get('banks') || []
    const contracts = DB.get('contracts').filter(c => c.status !== 'cancelled')
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

        // Ledger sync only when creating, or first time enabling on an invoice without a linked tx
        const alreadyLinked = !!(item?.transactionId)
        if (data.syncLedger && !alreadyLinked) {
          const txType = data.direction === 'in' ? 'deposit' : 'withdrawal'
          const tx = await SecureDB.insert('transactions', {
            type: txType,
            amount: data.amount,
            desc: `${data.title}${data.purpose ? ' — ' + data.purpose : ''}`,
            date: data.date,
            bankId: data.bankId || '',
            invoiceRef: item?.number || data.number,
            invoiceId: invoiceId || '',
            purposeCategory: data.direction === 'in' ? 'other_income' : 'other',
            purpose: data.purpose || data.title,
            paymentMethod: data.paymentMethod || 'transfer'
          })
          if (data.bankId && typeof FinanceSync !== 'undefined') {
            await FinanceSync.applyBankDelta(data.bankId, txType, data.amount)
          }
          if (invoiceId) await SecureDB.update('invoices', invoiceId, { transactionId: tx.id })
        }

        SM.toast('فاکتور ثبت شد', 'success')
        SMH.refresh('invoices')
      },
      onDelete: item ? async () => {
        if (!SMH.confirmDelete()) return
        try {
          if (item.transactionId) {
            const t = DB.find('transactions', x => x.id === item.transactionId)
            if (t && !t._deleted && t.bankId && t.amount) {
              const rev = t.type === 'deposit' ? 'withdrawal' : 'deposit'
              await FinanceSync.applyBankDelta(t.bankId, rev, t.amount)
              await SecureDB.delete('transactions', t.id)
            }
          }
          await SecureDB.delete('invoices', item.id)
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
    const expenses = SMH.filterBySearch(DB.get('expenses'), ['title', 'desc', 'category', 'amount', 'date', 'periodMonth', 'notes'], 'expenses')
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
    const banks = (typeof DB.active === 'function' ? DB.active('banks') : DB.get('banks')).filter(b => !b._deleted)
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
          if (data.syncLedger) {
            const tx = await SecureDB.insert('transactions', {
              type: 'withdrawal',
              amount: data.amount,
              desc: `${data.title} — ${catLabel}`,
              date: data.date,
              periodMonth: data.periodMonth,
              bankId: data.bankId || '',
              purposeCategory: 'other',
              sourceType: 'other',
              purpose: catLabel,
              expenseId: exp.id
            })
            if (data.bankId && typeof FinanceSync !== 'undefined') {
              await FinanceSync.applyBankDelta(data.bankId, 'withdrawal', data.amount)
            }
            await SecureDB.update('expenses', exp.id, { transactionId: tx.id })
          }
        }
        SMH.refresh('expenses')
      },
      onDelete: item ? () => SMH.remove('expenses', item.id, 'expenses') : null,
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

/* ── Files ── */
SMModules.files = {
  render(el) {
    const files = (DB.get('fileAssets') || []).filter(f => !f._deleted)
    const cloud = typeof FileStorage !== 'undefined' && FileStorage.isAvailable?.()
    el.innerHTML = `
      ${SMUI.sectionHead(SM.t('files'), cloud ? 'ابر Supabase Storage' : 'محلی — برای ابر فعال کنید', `<button class="sm-btn sm-btn-primary" onclick="document.getElementById('sm-file-input').click()"><i class="fas fa-upload"></i> ${SM.state.locale === 'fa' ? 'آپلود' : 'Upload'}</button>`)}
      <input type="file" id="sm-file-input" hidden onchange="SMModules.files.upload(this)"/>
      ${files.length ? `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:12px">${files.map(f => `
        <div class="sm-card">
          <div class="sm-card-body" style="text-align:center">
            <i class="fas fa-file${f.type?.includes('image') || f.mime?.includes('image') ? '-image' : ''}" style="font-size:2rem;color:var(--sm-accent);margin-bottom:8px"></i>
            <div style="font-weight:700;font-size:.85rem;word-break:break-all">${SM.esc(f.name)}</div>
            <div style="font-size:.72rem;color:var(--sm-text-muted)">${SM.esc(f.size || '')} — ${SM.esc(f.createdAt || '')}</div>
            ${f.storagePath ? SMUI.badge('ابر', 'success') : ''}
            <button class="sm-btn sm-btn-sm sm-btn-danger" style="margin-top:8px" onclick="SMModules.files.remove(${JSON.stringify(String(f.id))})">${SM.t('delete')}</button>
          </div>
        </div>`).join('')}</div>` : SMUI.empty('fa-folder-open', SM.t('no_data'))}`
  },
  async upload(input) {
    const file = input.files?.[0]
    if (!file) return
    if (file.size > 5 * 1024 * 1024) return SM.toast(SM.state.locale === 'fa' ? 'حداکثر ۵ مگابایت' : 'Max 5MB', 'error')
    const assetId = crypto.randomUUID?.() || `${Date.now()}`

    const persist = async (item) => {
      if (SecureDB.insert) await SecureDB.insert('fileAssets', item)
      else DB.insert('fileAssets', item)
      SM.toast(SM.t('success'), 'success')
      SM.navigate('files')
      input.value = ''
    }

    if (typeof FileStorage !== 'undefined' && FileStorage.isAvailable?.()) {
      const up = await FileStorage.upload(file, assetId)
      if (!up.ok) return SM.toast(up.error || 'خطا در آپلود ابر', 'error')
      await persist({
        id: assetId,
        name: file.name,
        type: file.type,
        size: `${(file.size / 1024).toFixed(1)} KB`,
        data: '',
        storagePath: up.storagePath,
        mime: up.mime,
        cloudUrl: up.url || '',
        createdAt: Utils.todayJalali()
      })
      return
    }

    const reader = new FileReader()
    reader.onload = async () => {
      await persist({
        id: assetId,
        name: file.name,
        type: file.type,
        size: `${(file.size / 1024).toFixed(1)} KB`,
        data: reader.result ? 'local-stored' : '',
        createdAt: Utils.todayJalali()
      })
    }
    reader.onerror = () => SM.toast('خطا در خواندن فایل', 'error')
    reader.readAsDataURL(file)
  },
  async remove(id) {
    if (!confirm(SM.t('delete') + '?')) return
    const asset = DB.find('fileAssets', f => f.id === id)
    if (asset?.storagePath && typeof FileStorage !== 'undefined') {
      await FileStorage.remove(asset.storagePath)
    }
    if (SecureDB.update) await SecureDB.update('fileAssets', id, { _deleted: true })
    else DB.delete('fileAssets', id)
    SM.navigate('files')
  }
}

/* ── Workflow (see workflow.js) ── */

/* ── Media Library (کتابخانه رسانه) ── */
SMModules.media = {
  render(el) {
    const galleries = DB.get('galleries')
    el.innerHTML = `
      ${SMUI.sectionHead('کتابخانه رسانه', 'عکس، ویدیو و فایل‌های پروژه', `<button class="sm-btn sm-btn-primary" onclick="SMModules.media.add()"><i class="fas fa-plus"></i> ${SM.t('add')}</button>`)}
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:16px">
        ${galleries.length ? galleries.map(g => `
          <div class="sm-card">
            <div class="sm-card-head"><div class="sm-card-title">${SM.esc(g.title || g.couple || '—')}</div>${SMUI.badge(g.status === 'delivered' ? 'تحویل شده' : 'پیش‌نویس', g.status === 'delivered' ? 'success' : 'warning')}</div>
            <div class="sm-card-body">
              <div style="font-size:.85rem;color:var(--sm-text-muted)">${SM.esc(g.description || '')}</div>
              <div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap">
                <span class="sm-badge sm-badge-info">${g.photoCount || 0} فایل</span>
                ${g.downloadEnabled ? SMUI.badge('دانلود فعال', 'success') : ''}
              </div>
              <button class="sm-btn sm-btn-sm sm-btn-primary" style="margin-top:12px" onclick="SMModules.media.deliver('${g.id}')">تحویل به مشتری</button>
              <button class="sm-btn sm-btn-sm sm-btn-ghost" style="margin-top:8px" onclick="SMModules.media.edit('${g.id}')">${SM.t('edit')}</button>
              <button class="sm-btn sm-btn-sm sm-btn-danger" style="margin-top:8px" onclick="SMH.remove('galleries','${g.id}','media')">${SM.t('delete')}</button>
            </div>
          </div>`).join('') : SMUI.empty('fa-photo-film', 'رسانه‌ای ثبت نشده')}
      </div>`
  },
  add() {
    SMUI.modal('افزودن به کتابخانه رسانه', `
      ${SMUI.formField('عنوان', 'gal-title')}
      ${SMUI.formField('زوج / مشتری', 'gal-couple')}
      ${SMUI.formField('تعداد فایل', 'gal-count', { type: 'number', dir: 'ltr' })}
      ${SMUI.formField('توضیحات', 'gal-desc', { type: 'textarea' })}`, {
      onSave: async () => {
        const d = SMUI.readForm(['gal-title', 'gal-couple', 'gal-count', 'gal-desc'])
        await SecureDB.insert('galleries', { title: d['gal-title'], couple: d['gal-couple'], photoCount: +d['gal-count'] || 0, description: d['gal-desc'], status: 'draft', downloadEnabled: false })
        SMH.refresh('media')
      }
    })
  },
  edit(id) {
    const g = DB.find('galleries', x => x.id === id)
    if (!g) return
    SMUI.modal('ویرایش رسانه', `
      ${SMUI.formField('عنوان', 'gal-title', { value: g.title || '' })}
      ${SMUI.formField('زوج / مشتری', 'gal-couple', { value: g.couple || '' })}
      ${SMUI.formField('تعداد فایل', 'gal-count', { type: 'number', value: g.photoCount || '', dir: 'ltr' })}
      ${SMUI.formField('توضیحات', 'gal-desc', { type: 'textarea', value: g.description || '' })}`, {
      onSave: async () => {
        const d = SMUI.readForm(['gal-title', 'gal-couple', 'gal-count', 'gal-desc'])
        await SecureDB.update('galleries', id, { title: d['gal-title'], couple: d['gal-couple'], photoCount: +d['gal-count'] || 0, description: d['gal-desc'] })
        SMH.refresh('media')
      },
      onDelete: () => SMH.remove('galleries', id, 'media')
    })
  },
  async deliver(id) {
    await SecureDB.update('galleries', id, { status: 'delivered', downloadEnabled: true, deliveredAt: new Date().toISOString() })
    if (typeof NotifyHub !== 'undefined') {
      NotifyHub.notifyInApp('رسانه آماده', 'فایل‌های شما آماده دانلود است')
    }
    SM.toast(SM.t('success'), 'success')
    SM.navigate('media')
  }
}
SMModules.gallery = SMModules.media

/* ── Notifications ── */
SMModules.notifications = {
  render(el) {
    const notifs = DB.get('notifications').slice().reverse()
    el.innerHTML = `
      ${SMUI.sectionHead(SM.t('notifications'), '', `<button class="sm-btn sm-btn-ghost" onclick="SMModules.notifications.markAll()">${SM.state.locale === 'fa' ? 'خواندن همه' : 'Mark all read'}</button>`)}
      ${notifs.length ? notifs.map(n => `
        <div class="sm-card" style="margin-bottom:8px;${n.read ? 'opacity:.65' : ''}">
          <div class="sm-card-body" style="display:flex;gap:12px;align-items:flex-start">
            <i class="fas fa-bell" style="color:var(--sm-accent);margin-top:4px"></i>
            <div style="flex:1">
              <div style="font-weight:700">${SM.esc(n.title || '—')}</div>
              <div style="font-size:.85rem;color:var(--sm-text-muted);margin-top:4px">${SM.esc(n.text || '')}</div>
              <div style="font-size:.72rem;color:var(--sm-text-muted);margin-top:6px">${SM.esc(n.createdAt || '')}</div>
            </div>
            ${!n.read ? `<button class="sm-btn sm-btn-sm sm-btn-ghost" onclick="SMModules.notifications.read('${n.id}')">✓</button>` : ''}
          </div>
        </div>`).join('') : SMUI.empty('fa-bell', SM.t('no_data'))}`
  },
  async read(id) { (SecureDB.update ? await SecureDB.update('notifications', id, { read: true }) : DB.update('notifications', id, { read: true })); SM.navigate('notifications') },
  async markAll() { for (const n of DB.get('notifications')) { if (!n.read) { if (SecureDB.update) await SecureDB.update('notifications', n.id, { read: true }); else DB.update('notifications', n.id, { read: true }) } } SM.navigate('notifications') }
}

/* ── Customer Inbox (see inbox.js) ── */

/* ── Messaging (see messaging.js) ── */

/* ── Portal management (see portal-mgmt.js) ── */

/* ── Settings (see settings.js) ── */

/* ── Audit Logs ── */
SMModules.audit = {
  render(el) {
    const logs = DB.get('logs').slice().reverse()
    el.innerHTML = `
      ${SMUI.sectionHead(SM.t('audit'))}
      ${logs.length ? logs.slice(0, 100).map(l => `
        <div class="sm-card" style="margin-bottom:6px">
          <div class="sm-card-body" style="display:flex;justify-content:space-between;gap:12px;padding:12px 16px">
            <div><strong>${SM.esc(l.action)}</strong> — <span style="font-size:.85rem;color:var(--sm-text-muted)">${SM.esc(l.detail || '')}</span></div>
            <div style="font-size:.72rem;color:var(--sm-text-muted);white-space:nowrap">${SM.esc((l.timestamp || '').slice(0, 19).replace('T', ' '))}</div>
          </div>
        </div>`).join('') : SMUI.empty('fa-shield-halved', SM.t('no_data'))}`
  }
}

/* ── Users (مدیریت کاربران) ── */
SMModules.users = {
  render(el) {
    if (typeof SMPortalMgmt !== 'undefined') {
      SMPortalMgmt.render(el)
      return
    }
    el.innerHTML = SMUI.empty('fa-user-shield', SM.state.locale === 'fa' ? 'مدیریت کاربران در بخش پرتال' : 'User management in Portal section')
  }
}

/* ── API Layer ── */
SMModules.api = {
  render(el) {
    const keys = DB.get('apiKeys').filter(k => !k._deleted)
    el.innerHTML = `
      ${SMUI.sectionHead('API', SM.state.locale === 'fa' ? 'لایه یکپارچه‌سازی' : 'Integration layer', `<button class="sm-btn sm-btn-primary" onclick="SMModules.api.generateKey()"><i class="fas fa-key"></i> ${SM.state.locale === 'fa' ? 'کلید جدید' : 'New Key'}</button>`)}
      <div class="sm-card" style="margin-bottom:20px">
        <div class="sm-card-head"><div class="sm-card-title">${SM.state.locale === 'fa' ? 'نقاط پایانی' : 'Endpoints'}</div></div>
        <div class="sm-card-body">
          ${[
            { method: 'GET', path: '/api/contracts', desc: SM.state.locale === 'fa' ? 'لیست قراردادها' : 'List contracts' },
            { method: 'GET', path: '/api/leads', desc: SM.state.locale === 'fa' ? 'لیست لیدها' : 'List leads' },
            { method: 'POST', path: '/api/bookings', desc: SM.state.locale === 'fa' ? 'ایجاد رزرو' : 'Create booking' },
            { method: 'GET', path: '/api/invoices', desc: SM.state.locale === 'fa' ? 'لیست فاکتورها' : 'List invoices' },
            { method: 'POST', path: '/api/webhooks/notify', desc: SM.state.locale === 'fa' ? 'وب‌هوک اعلان' : 'Notification webhook' }
          ].map(e => `<div class="sm-api-endpoint"><span class="sm-api-method sm-api-${e.method.toLowerCase()}">${e.method}</span>${SM.esc(e.path)} — ${SM.esc(e.desc)}</div>`).join('')}
        </div>
      </div>
      ${keys.length ? SMUI.table(
        [SM.state.locale === 'fa' ? 'نام' : 'Name', SM.state.locale === 'fa' ? 'کلید' : 'Key', SM.state.locale === 'fa' ? 'ایجاد' : 'Created', ''],
        keys.map(k => `<tr>
          <td>${SM.esc(k.name)}</td><td dir="ltr" style="font-family:monospace;font-size:.78rem">${SM.esc(k.key?.slice(0, 12) + '...')}</td>
          <td>${SM.esc(k.createdAt || '—')}</td>
          <td><button class="sm-btn sm-btn-sm sm-btn-danger" onclick="SMModules.api.revoke('${k.id}')">${SM.t('delete')}</button></td>
        </tr>`)
      ) : SMUI.empty('fa-key', SM.state.locale === 'fa' ? 'کلید API بسازید' : 'Generate API keys')}`
  },
  async generateKey() {
    const name = prompt(SM.state.locale === 'fa' ? 'نام کلید:' : 'Key name:')
    if (!name) return
    const key = 'sm_' + crypto.randomUUID?.()?.replace(/-/g, '') || Date.now().toString(36)
    if (SecureDB.insert) await SecureDB.insert('apiKeys', { name, key, createdAt: new Date().toISOString(), scopes: ['read', 'write'] })
    else DB.insert('apiKeys', { name, key, createdAt: new Date().toISOString(), scopes: ['read', 'write'] })
    SM.log('api_key', name)
    SM.toast(`${SM.t('success')}: ${key.slice(0, 16)}...`, 'success')
    SM.navigate('api')
  },
  async revoke(id) {
    if (!confirm(SM.t('delete') + '?')) return
    if (SecureDB.update) {
      DB.delete('apiKeys', id)
      await DB.flush?.()
    } else DB.delete('apiKeys', id)
    SM.navigate('api')
  }
}

window.SMModules = SMModules
