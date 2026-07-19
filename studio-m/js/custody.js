/* Studio M — ورود/خروج امانات مشتری (فلش، هارد، تبدیل…) */

const SMCustody = {
  _tab: 'active',

  ITEM_TYPES: {
    flash: { label: 'فلش / USB', icon: 'fa-usb-drive', color: '#0071E3' },
    hdd: { label: 'هارد اکسترنال', icon: 'fa-hard-drive', color: '#E68619' },
    ssd: { label: 'SSD', icon: 'fa-solid fa-hard-drive', color: '#5856D6' },
    memory_card: { label: 'کارت حافظه', icon: 'fa-sd-card', color: '#34C759' },
    adapter: { label: 'تبدیل / آداپتور', icon: 'fa-plug', color: '#00A3BF' },
    cable: { label: 'کابل', icon: 'fa-link', color: '#94A3B8' },
    phone: { label: 'موبایل', icon: 'fa-mobile-screen', color: '#FF375F' },
    laptop: { label: 'لپ‌تاپ', icon: 'fa-laptop', color: '#64748B' },
    disc: { label: 'CD / DVD', icon: 'fa-compact-disc', color: '#BF5AF2' },
    other: { label: 'سایر', icon: 'fa-box', color: '#64748B' }
  },

  STATUS: {
    in_studio: { label: 'در استودیو', badge: 'warning' },
    returned: { label: 'تحویل به مشتری', badge: 'success' },
    overdue: { label: 'سررسید گذشته', badge: 'danger' }
  },

  REASON: {
    deposit: { label: 'امانت (تحویل به استودیو)' },
    edit_material: { label: 'ماده خام تدوین' },
    backup: { label: 'پشتیبان / کپی' },
    pickup: { label: 'تحویل از استودیو' },
    other: { label: 'سایر' }
  },

  _typeLabel(id) {
    return this.ITEM_TYPES[id]?.label || id || '—'
  },

  _statusOf(item) {
    if (item.status === 'returned' || item.returnedAt) return 'returned'
    if (item.dueDate) {
      const d = Utils.daysUntil(item.dueDate)
      if (d !== null && d < 0) return 'overdue'
    }
    return 'in_studio'
  },

  _statusBadge(item) {
    const st = this.STATUS[this._statusOf(item)] || this.STATUS.in_studio
    return SMUI.badge(st.label, st.badge)
  },

  setTab(tab) {
    this._tab = tab
    SM.navigate('custody')
  },

  _items() {
    return (DB.active('customerCustody') || []).slice().sort((a, b) =>
      String(b.receivedAt || b.createdAt || '').localeCompare(String(a.receivedAt || a.createdAt || ''))
    )
  },

  render(el) {
    if (SM.state.viewStack.length) return
    let items = SMH.filterBySearch(this._items(), ['customerName', 'itemDesc', 'color', 'brand', 'serialLabel', 'notes', 'phone'], 'custody')
    if (this._tab === 'active') items = items.filter(i => this._statusOf(i) !== 'returned')
    else if (this._tab === 'returned') items = items.filter(i => this._statusOf(i) === 'returned')

    const active = this._items().filter(i => this._statusOf(i) !== 'returned')
    const overdue = active.filter(i => this._statusOf(i) === 'overdue')

    el.innerHTML = `
      ${SMUI.sectionHead('امانات مشتری', 'ورود و خروج فلش، هارد، تبدیل و…', `
        <button type="button" class="sm-btn sm-btn-primary" onclick="SMCustody.add()"><i class="fas fa-plus"></i> ثبت ورود</button>`)}
      ${SMUI.statCards([
        { label: 'در استودیو', value: SM.fmt(active.length), color: 'var(--sm-warning)' },
        { label: 'سررسید گذشته', value: SM.fmt(overdue.length), color: 'var(--sm-danger)' },
        { label: 'تحویل‌شده', value: SM.fmt(this._items().filter(i => this._statusOf(i) === 'returned').length), color: 'var(--sm-success)' },
        { label: 'کل ثبت', value: SM.fmt(this._items().length), color: 'var(--sm-accent)' }
      ])}
      ${SMUI.tabs([
        { id: 'active', fa: 'در استودیو', en: 'Active', icon: 'fa-inbox', onclick: "SMCustody.setTab('active')" },
        { id: 'returned', fa: 'تحویل‌شده', en: 'Returned', icon: 'fa-check', onclick: "SMCustody.setTab('returned')" },
        { id: 'all', fa: 'همه', en: 'All', icon: 'fa-list', onclick: "SMCustody.setTab('all')" }
      ], this._tab)}
      ${SMUI.moduleSearch('custody', 'جستجو — نام مشتری، فلش، هارد، رنگ…')}
      <div style="margin-top:16px">${items.length ? `<div class="sm-cust-list">${items.map(i => this._card(i)).join('')}</div>` :
        SMUI.empty('fa-right-left', 'امانتی ثبت نشده', 'وقتی مشتری فلش یا هارد می‌آورد، اینجا ثبت کنید')}</div>`
  },

  _card(item) {
    const type = this.ITEM_TYPES[item.itemType] || this.ITEM_TYPES.other
    const desc = [item.itemDesc, item.color, item.capacity].filter(Boolean).join(' · ')
    return `<div class="sm-cust-card" style="--cust-color:${type.color}" onclick="SMCustody.view('${item.id}')">
      <div class="sm-cust-icon"><i class="fas ${type.icon}"></i></div>
      <div class="sm-cust-body">
        <div class="sm-cust-title">${SM.esc(item.customerName || '—')} — ${SM.esc(type.label)}</div>
        <div class="sm-cust-desc">${SM.esc(desc || item.serialLabel || '—')}</div>
        <div class="sm-cust-meta">
          <span><i class="fas fa-sign-in-alt"></i> ورود: ${SM.esc(item.receivedAt || '—')}${item.receivedTime ? ` ${SM.esc(item.receivedTime)}` : ''}</span>
          ${item.dueDate ? `<span><i class="fas fa-calendar"></i> تحویل: ${SM.esc(item.dueDate)}</span>` : ''}
          ${item.returnedAt ? `<span><i class="fas fa-sign-out-alt"></i> برگشت: ${SM.esc(item.returnedAt)}</span>` : ''}
        </div>
      </div>
      <div class="sm-cust-side">
        ${this._statusBadge(item)}
        ${this._statusOf(item) !== 'returned' ? `<button type="button" class="sm-btn sm-btn-sm sm-btn-primary" onclick="event.stopPropagation();SMCustody.markReturned('${item.id}')">تحویل</button>` : ''}
      </div>
    </div>`
  },

  view(id) {
    const item = DB.find('customerCustody', x => x.id === id)
    if (!item) return
    const type = this.ITEM_TYPES[item.itemType] || this.ITEM_TYPES.other
    SM.pushSubView(item.customerName || 'امانت', () => `
      <div class="sm-card"><div class="sm-card-head">
        <div class="sm-card-title">${SM.esc(item.customerName)} — ${SM.esc(type.label)}</div>
        <button class="sm-btn sm-btn-sm sm-btn-primary" onclick="SMCustody.edit('${item.id}')"><i class="fas fa-pen"></i></button>
      </div><div class="sm-card-body">
        <p><strong>شرح:</strong> ${SM.esc(item.itemDesc || '—')}</p>
        ${item.color ? `<p style="margin-top:8px"><strong>رنگ:</strong> ${SM.esc(item.color)}</p>` : ''}
        ${item.capacity ? `<p style="margin-top:8px"><strong>ظرفیت:</strong> ${SM.esc(item.capacity)}</p>` : ''}
        ${item.brand ? `<p style="margin-top:8px"><strong>برند:</strong> ${SM.esc(item.brand)}</p>` : ''}
        ${item.serialLabel ? `<p style="margin-top:8px"><strong>برچسب / سریال:</strong> ${SM.esc(item.serialLabel)}</p>` : ''}
        <p style="margin-top:8px"><strong>بابت:</strong> ${SM.esc(this.REASON[item.reason]?.label || item.reason || '—')}</p>
        <p style="margin-top:8px"><strong>ورود:</strong> ${SM.esc(item.receivedAt || '—')} ${SM.esc(item.receivedTime || '')}</p>
        <p style="margin-top:8px"><strong>تاریخ تحویل به مشتری:</strong> ${SM.esc(item.dueDate || '—')}</p>
        ${item.returnedAt ? `<p style="margin-top:8px"><strong>تحویل داده شد:</strong> ${SM.esc(item.returnedAt)} ${SM.esc(item.returnedTime || '')}</p>` : ''}
        <p style="margin-top:8px"><strong>وضعیت:</strong> ${this._statusBadge(item)}</p>
        ${item.notes ? `<p style="margin-top:8px"><strong>یادداشت:</strong> ${SM.esc(item.notes)}</p>` : ''}
        ${this._statusOf(item) !== 'returned' ? `<button type="button" class="sm-btn sm-btn-primary" style="margin-top:14px" onclick="SMCustody.markReturned('${item.id}')"><i class="fas fa-hand-holding"></i> ثبت تحویل به مشتری</button>` : ''}
      </div></div>`)
  },

  _nowTime() {
    const d = new Date()
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  },

  markReturned(id) {
    const item = DB.find('customerCustody', x => x.id === id)
    if (!item) return
    DB.update('customerCustody', id, {
      status: 'returned',
      returnedAt: Utils.todayJalali(),
      returnedTime: this._nowTime()
    })
    SM.toast('تحویل به مشتری ثبت شد', 'success')
    if (SM.state.viewStack.length) {
      SM.state.viewStack.pop()
      this.view(id)
    } else SM.navigate('custody')
  },

  add() { this._form(null) },
  edit(id) { this._form(DB.find('customerCustody', x => x.id === id)) },

  _form(item) {
    const contracts = DB.active('contracts').filter(c => c.status !== 'cancelled').slice(0, 80)
    const typeOpts = Object.entries(this.ITEM_TYPES).map(([k, v]) => ({ value: k, label: v.label }))
    const reasonOpts = Object.entries(this.REASON).map(([k, v]) => ({ value: k, label: v.label }))
    const contractOpts = [{ value: '', label: '— بدون قرارداد —' }, ...contracts.map(c => ({
      value: c.id,
      label: `${c.couple || c.bride || 'قرارداد'} — ${c.eventDate || ''}`
    }))]

    SMUI.modal(item ? 'ویرایش امانت' : 'ثبت ورود امانت مشتری', `
      ${SMUI.formField('نام مشتری', 'cu-name', { value: item?.customerName || '', placeholder: 'نام عروس/داماد یا مشتری' })}
      ${SMUI.formField('موبایل', 'cu-phone', { value: item?.phone || '', dir: 'ltr' })}
      ${SMUI.formField('قرارداد (اختیاری)', 'cu-contract', { type: 'select', value: item?.contractId || '', options: contractOpts })}
      ${SMUI.formField('نوع وسیله', 'cu-type', { type: 'select', value: item?.itemType || 'flash', options: typeOpts })}
      ${SMUI.formField('شرح وسیله', 'cu-desc', { value: item?.itemDesc || '', placeholder: 'مثلاً فلش آبی ۶۰ گیگ بدون کابل' })}
      ${SMUI.formField('رنگ', 'cu-color', { value: item?.color || '', placeholder: 'آبی، مشکی…' })}
      ${SMUI.formField('ظرفیت', 'cu-cap', { value: item?.capacity || '', placeholder: '۶۰GB، ۱TB…' })}
      ${SMUI.formField('برند', 'cu-brand', { value: item?.brand || '' })}
      ${SMUI.formField('برچسب / سریال', 'cu-serial', { value: item?.serialLabel || '', dir: 'ltr' })}
      ${SMUI.formField('بابت', 'cu-reason', { type: 'select', value: item?.reason || 'deposit', options: reasonOpts })}
      ${SMUI.formField('تاریخ ورود', 'cu-in-date', { value: item?.receivedAt || Utils.todayJalali() })}
      ${SMUI.formField('ساعت ورود', 'cu-in-time', { value: item?.receivedTime || this._nowTime(), dir: 'ltr' })}
      ${SMUI.formField('تاریخ تحویل به مشتری', 'cu-due', { value: item?.dueDate || '', placeholder: 'موعد تحویل' })}
      ${item?.returnedAt ? SMUI.formField('تاریخ تحویل', 'cu-out-date', { value: item.returnedAt }) : ''}
      ${item?.returnedAt ? SMUI.formField('ساعت تحویل', 'cu-out-time', { value: item.returnedTime || '', dir: 'ltr' }) : ''}
      ${SMUI.formField('یادداشت', 'cu-notes', { type: 'textarea', value: item?.notes || '', placeholder: 'مثلاً بدون کابل، فقط بدنه هارد' })}`, {
      width: 520,
      onSave: () => {
        const ids = ['cu-name', 'cu-phone', 'cu-contract', 'cu-type', 'cu-desc', 'cu-color', 'cu-cap', 'cu-brand', 'cu-serial', 'cu-reason', 'cu-in-date', 'cu-in-time', 'cu-due', 'cu-notes']
        if (item?.returnedAt) ids.push('cu-out-date', 'cu-out-time')
        const d = SMUI.readForm(ids)
        if (!d['cu-name']) return SM.toast('نام مشتری الزامی است', 'error')
        if (!d['cu-desc'] && !d['cu-serial']) return SM.toast('شرح یا برچسب وسیله را وارد کنید', 'error')

        const contract = contracts.find(c => c.id === d['cu-contract'])
        const data = {
          customerName: d['cu-name'],
          phone: d['cu-phone'],
          contractId: d['cu-contract'] || '',
          contractCouple: contract?.couple || '',
          itemType: d['cu-type'],
          itemDesc: d['cu-desc'],
          color: d['cu-color'],
          capacity: d['cu-cap'],
          brand: d['cu-brand'],
          serialLabel: d['cu-serial'],
          reason: d['cu-reason'],
          receivedAt: d['cu-in-date'],
          receivedTime: d['cu-in-time'],
          dueDate: d['cu-due'],
          notes: d['cu-notes'],
          status: d['cu-out-date'] ? 'returned' : 'in_studio',
          returnedAt: d['cu-out-date'] || '',
          returnedTime: d['cu-out-time'] || ''
        }

        if (item) {
          DB.update('customerCustody', item.id, data)
        } else {
          DB.insert('customerCustody', { ...data, createdAt: Utils.todayJalali() })
        }
        SMUI.closeModal()
        if (SM.state.viewStack.length && item) {
          SM.state.viewStack.pop()
          this.view(item.id)
        } else SM.navigate('custody')
        SM.toast('ذخیره شد', 'success')
      },
      onDelete: item ? () => SMH.remove('customerCustody', item.id, 'custody') : null
    })

    document.getElementById('cu-contract')?.addEventListener('change', function () {
      const c = contracts.find(x => x.id === this.value)
      if (!c) return
      const nameEl = document.getElementById('cu-name')
      const phoneEl = document.getElementById('cu-phone')
      if (nameEl && !nameEl.value) nameEl.value = c.couple || `${c.groom || ''} ${c.bride || ''}`.trim()
      if (phoneEl && !phoneEl.value) phoneEl.value = c.phoneGroom || c.phoneBride || c.phone || ''
    })
  }
}

SMModules.custody = {
  setTab(tab) { SMCustody.setTab(tab) },
  render(el) { SMCustody.render(el) },
  add() { SMCustody.add() },
  edit(id) { SMCustody.edit(id) }
}

window.SMCustody = SMCustody
