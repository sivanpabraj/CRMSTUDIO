/* Studio M — تجهیزات استودیو (فارسی + دسته‌بندی کامل) */

const SMEquipment = {
  _tab: 'all',

  CATEGORIES: {
    camera: { label: 'دوربین', icon: 'fa-camera', color: '#0071E3' },
    lens: { label: 'لنز', icon: 'fa-circle-dot', color: '#5856D6' },
    lighting: { label: 'نور و فلاش', icon: 'fa-lightbulb', color: '#FF9500' },
    drone: { label: 'پهپاد / FPV', icon: 'fa-helicopter', color: '#00A3BF' },
    computer: { label: 'سیستم / کامپیوتر', icon: 'fa-desktop', color: '#34C759' },
    monitor: { label: 'مانیتور', icon: 'fa-display', color: '#009688' },
    tv: { label: 'تلویزیون', icon: 'fa-tv', color: '#64748B' },
    storage: { label: 'هارد / ذخیره‌ساز', icon: 'fa-hard-drive', color: '#E68619' },
    audio: { label: 'صدا و میکروفون', icon: 'fa-microphone', color: '#FF375F' },
    grip: { label: 'سه‌پایه و گریپ', icon: 'fa-video', color: '#BF5AF2' },
    cable: { label: 'کابل و تبدیل', icon: 'fa-plug', color: '#94A3B8' },
    accessory: { label: 'لوازم جانبی', icon: 'fa-toolbox', color: '#30D158' },
    furniture: { label: 'مبلمان استودیو', icon: 'fa-couch', color: '#8B7355' },
    other: { label: 'سایر', icon: 'fa-box', color: '#64748B' }
  },

  STATUS: {
    available: { label: 'آماده / در انبار', badge: 'success' },
    in_use: { label: 'در حال استفاده', badge: 'info' },
    on_shoot: { label: 'روی لوکیشن', badge: 'warning' },
    maintenance: { label: 'تعمیر / سرویس', badge: 'warning' },
    retired: { label: 'خارج از سرویس', badge: 'muted' }
  },

  _normCat(id) {
    const m = { Camera: 'camera', Lens: 'lens', Lighting: 'lighting', Drone: 'drone', Other: 'other' }
    const k = String(id || 'other').toLowerCase()
    return this.CATEGORIES[k] ? k : (m[id] || 'other')
  },

  _catLabel(id) {
    return this.CATEGORIES[this._normCat(id)]?.label || id || '—'
  },

  _statusLabel(id) {
    return this.STATUS[id]?.label || id || '—'
  },

  _statusBadge(id) {
    const s = this.STATUS[id] || this.STATUS.available
    return SMUI.badge(s.label, s.badge)
  },

  setTab(tab) {
    this._tab = tab
    SM.navigate('equipment')
  },

  render(el) {
    if (SM.state.viewStack.length) return
    const items = SMH.filterBySearch(DB.active('equipment'), ['name', 'brand', 'model', 'serial', 'category', 'status', 'notes', 'location'], 'equipment')
    const filtered = this._tab === 'all' ? items : items.filter(e => this._normCat(e.category) === this._tab)
    const byCat = {}
    filtered.forEach(e => {
      const c = this._normCat(e.category)
      if (!byCat[c]) byCat[c] = []
      byCat[c].push(e)
    })

    el.innerHTML = `
      ${SMUI.sectionHead('تجهیزات استودیو', 'دوربین · سیستم · مانیتور · هارد و…', `
        <button type="button" class="sm-btn sm-btn-primary" onclick="SMEquipment.add()"><i class="fas fa-plus"></i> افزودن تجهیز</button>`)}
      ${SMUI.statCards([
        { label: 'کل تجهیزات', value: SM.fmt(items.length), color: 'var(--sm-accent)' },
        { label: 'آماده', value: SM.fmt(items.filter(e => e.status === 'available').length), color: 'var(--sm-success)' },
        { label: 'در استفاده', value: SM.fmt(items.filter(e => e.status === 'in_use' || e.status === 'on_shoot').length), color: 'var(--sm-warning)' },
        { label: 'تعمیر', value: SM.fmt(items.filter(e => e.status === 'maintenance').length), color: 'var(--sm-info)' }
      ])}
      ${SMUI.moduleSearch('equipment', 'جستجو — نام، برند، سریال، محل…')}
      <div class="sm-eq-cat-pills">${[{ id: 'all', label: 'همه' }, ...Object.entries(this.CATEGORIES).map(([id, c]) => ({ id, label: c.label }))].map(c =>
        `<button type="button" class="sm-eq-pill${this._tab === c.id ? ' active' : ''}" onclick="SMEquipment.setTab('${c.id}')">${SM.esc(c.label)}</button>`
      ).join('')}</div>
      <div style="margin-top:16px">${filtered.length ? this._listHtml(byCat) : SMUI.empty('fa-camera', 'تجهیزی ثبت نشده', 'دوربین، مانیتور، هارد و لوازم استودیو را اضافه کنید')}</div>`
  },

  _listHtml(byCat) {
    const order = Object.keys(this.CATEGORIES)
    const cats = Object.keys(byCat).sort((a, b) => order.indexOf(a) - order.indexOf(b))
    return cats.map(cat => {
      const meta = this.CATEGORIES[cat] || this.CATEGORIES.other
      return `<div class="sm-eq-group">
        <div class="sm-eq-group-head"><i class="fas ${meta.icon}" style="color:${meta.color}"></i> ${SM.esc(meta.label)} <span>${byCat[cat].length.toLocaleString('fa-IR')}</span></div>
        <div class="sm-eq-grid">${byCat[cat].map(e => this._card(e, meta)).join('')}</div>
      </div>`
    }).join('')
  },

  _card(e, meta) {
    return `<div class="sm-eq-card" style="--eq-color:${meta.color}" onclick="SMEquipment.view('${e.id}')">
      <div class="sm-eq-card-icon"><i class="fas ${meta.icon}"></i></div>
      <div class="sm-eq-card-body">
        <div class="sm-eq-name">${SM.esc(e.name)}</div>
        <div class="sm-eq-meta">${SM.esc(e.brand || '')}${e.model ? ` · ${SM.esc(e.model)}` : ''}</div>
        ${e.serial ? `<div class="sm-eq-serial" dir="ltr">${SM.esc(e.serial)}</div>` : ''}
        ${e.location ? `<div class="sm-eq-loc"><i class="fas fa-location-dot"></i> ${SM.esc(e.location)}</div>` : ''}
      </div>
      <div class="sm-eq-card-side">${this._statusBadge(e.status || 'available')}</div>
    </div>`
  },

  view(id) {
    const e = DB.find('equipment', x => x.id === id)
    if (!e) return
    const cat = this.CATEGORIES[this._normCat(e.category)] || this.CATEGORIES.other
    SM.pushSubView(e.name, () => `
      <div class="sm-card"><div class="sm-card-head">
        <div class="sm-card-title"><i class="fas ${cat.icon}" style="color:${cat.color}"></i> ${SM.esc(e.name)}</div>
        <button class="sm-btn sm-btn-sm sm-btn-primary" onclick="SMEquipment.edit('${e.id}')"><i class="fas fa-pen"></i></button>
      </div><div class="sm-card-body">
        <p><strong>دسته:</strong> ${SM.esc(cat.label)}</p>
        <p style="margin-top:8px"><strong>برند:</strong> ${SM.esc(e.brand || '—')}</p>
        <p style="margin-top:8px"><strong>مدل:</strong> ${SM.esc(e.model || '—')}</p>
        <p style="margin-top:8px"><strong>سریال:</strong> <span dir="ltr">${SM.esc(e.serial || '—')}</span></p>
        <p style="margin-top:8px"><strong>وضعیت:</strong> ${this._statusBadge(e.status || 'available')}</p>
        <p style="margin-top:8px"><strong>محل:</strong> ${SM.esc(e.location || '—')}</p>
        ${e.purchaseDate ? `<p style="margin-top:8px"><strong>تاریخ خرید:</strong> ${SM.esc(e.purchaseDate)}</p>` : ''}
        ${e.notes ? `<p style="margin-top:8px"><strong>یادداشت:</strong> ${SM.esc(e.notes)}</p>` : ''}
      </div></div>`)
  },

  add() { this._form(null) },
  edit(id) { this._form(DB.find('equipment', e => e.id === id)) },

  _form(item) {
    const catOpts = Object.entries(this.CATEGORIES).map(([k, v]) => ({ value: k, label: v.label }))
    const statusOpts = Object.entries(this.STATUS).map(([k, v]) => ({ value: k, label: v.label }))
    SMUI.modal(item ? 'ویرایش تجهیز' : 'تجهیز جدید', `
      ${SMUI.formField('نام تجهیز', 'eq-name', { value: item?.name || '', placeholder: 'مثلاً Sony A7IV' })}
      ${SMUI.formField('دسته', 'eq-cat', { type: 'select', value: this._normCat(item?.category), options: catOpts })}
      ${SMUI.formField('برند', 'eq-brand', { value: item?.brand || '' })}
      ${SMUI.formField('مدل', 'eq-model', { value: item?.model || '' })}
      ${SMUI.formField('شماره سریال', 'eq-serial', { value: item?.serial || '', dir: 'ltr' })}
      ${SMUI.formField('وضعیت', 'eq-status', { type: 'select', value: item?.status || 'available', options: statusOpts })}
      ${SMUI.formField('محل نگهداری', 'eq-loc', { value: item?.location || '', placeholder: 'مثلاً اتاق تدوین، قفسه ۲' })}
      ${SMUI.formField('تاریخ خرید', 'eq-pdate', { value: item?.purchaseDate || '' })}
      ${SMUI.formField('یادداشت', 'eq-notes', { type: 'textarea', value: item?.notes || '' })}`, {
      width: 480,
      onSave: async () => {
        const d = SMUI.readForm(['eq-name', 'eq-cat', 'eq-brand', 'eq-model', 'eq-serial', 'eq-status', 'eq-loc', 'eq-pdate', 'eq-notes'])
        if (!d['eq-name']) return SM.toast('نام تجهیز الزامی است', 'error')
        const data = {
          name: d['eq-name'],
          category: d['eq-cat'],
          brand: d['eq-brand'],
          model: d['eq-model'],
          serial: d['eq-serial'],
          status: d['eq-status'],
          location: d['eq-loc'],
          purchaseDate: d['eq-pdate'],
          notes: d['eq-notes']
        }
        if (item) await SecureDB.update('equipment', item.id, data)
        else await SecureDB.insert('equipment', { ...data, createdAt: Utils.todayJalali() })
        SMUI.closeModal()
        if (SM.state.viewStack.length && item) {
          SM.state.viewStack.pop()
          this.view(item.id)
        } else SM.navigate('equipment')
        SM.toast('ذخیره شد', 'success')
      },
      onDelete: item ? () => SMH.remove('equipment', item.id, 'equipment') : null
    })
  }
}

SMModules.equipment = {
  setTab(tab) { SMEquipment.setTab(tab) },
  render(el) { SMEquipment.render(el) },
  add() { SMEquipment.add() },
  edit(id) { SMEquipment.edit(id) }
}

window.SMEquipment = SMEquipment
