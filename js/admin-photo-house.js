/* ══════════════════════════════════════════════
   MAN — Admin عکس‌خانه
   ══════════════════════════════════════════════ */

const PhotoHouseAdmin = {
  state: { tab: 'orders', filter: 'all', items: [], editingOrderId: null, editingAlbumId: null },

  render(container) {
    PhotoHouse.migrateLegacyOrders()
    const tab = this.state.tab
    container.innerHTML = `
      <div class="admin-section-header" style="--sec-clr:var(--clr-accent)">
        <div style="display:flex;align-items:center;gap:10px">
          <button class="btn-back-section" onclick="Admin.showSection('dashboard')" title="بازگشت">←</button>
          <div>
            <div class="admin-section-title"><i class="fas fa-images"></i> ${PhotoHouse.LABEL}</div>
            <div class="admin-section-sub">انتخاب عکس، چاپ، آلبوم و تحویل — با تعداد و قیمت</div>
          </div>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          ${tab === 'orders' ? `<button class="section-action blue" onclick="PhotoHouseAdmin.openOrderModal()"><i class="fas fa-plus-circle"></i> سفارش جدید</button>` : ''}
          ${tab === 'albums' ? `<button class="section-action blue" onclick="PhotoHouseAdmin.openAlbumModal()"><i class="fas fa-plus-circle"></i> آلبوم جدید</button>` : ''}
          ${tab === 'selections' ? `<button class="section-action blue" onclick="PhotoHouseAdmin.openSelectionModal()"><i class="fas fa-plus-circle"></i> دعوت به انتخاب</button>` : ''}
          ${tab === 'shops' ? `<button class="section-action" style="background:var(--clr-info)" onclick="PhotoHouseAdmin.openShopModal()"><i class="fas fa-store-alt"></i> چاپخانه</button>` : ''}
        </div>
      </div>
      <div class="ph-tabs" style="display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap">
        ${[
          { id: 'orders', label: 'سفارشات', icon: '📋' },
          { id: 'albums', label: 'آلبوم‌ها', icon: '📔' },
          { id: 'selections', label: 'انتخاب عکس', icon: '🖼️' },
          { id: 'shops', label: 'چاپخانه‌ها', icon: '🏭' }
        ].map(t => `<button class="btn btn-sm ${tab === t.id ? 'btn-primary' : 'btn-ghost'}" onclick="PhotoHouseAdmin.setTab('${t.id}')">${t.icon} ${t.label}</button>`).join('')}
      </div>
      <div id="ph-tab-content"></div>`

    const inner = document.getElementById('ph-tab-content')
    if (tab === 'orders') this._renderOrders(inner)
    else if (tab === 'albums') this._renderAlbums(inner)
    else if (tab === 'selections') this._renderSelections(inner)
    else this._renderShops(inner)
  },

  setTab(tab) {
    this.state.tab = tab
    this.render(document.getElementById('sec-print'))
  },

  _contracts() {
    return (DB.get('contracts') || []).filter(c => c.groom || c.bride)
  },

  _contractLabel(c) {
    if (!c) return '—'
    return `${c.groom || ''}${c.bride ? ' و ' + c.bride : ''} (#${c.contractNum || '—'})`
  },

  /* ── Orders ── */
  _renderOrders(container) {
    const orders = DB.get('printOrders') || []
    const filter = this.state.filter || 'all'
    const filtered = filter === 'all' ? orders : orders.filter(o => o.status === filter)
    const stats = {}
    Object.keys(PhotoHouse.ORDER_STATUS).forEach(k => { stats[k] = orders.filter(o => o.status === k).length })
    stats.all = orders.length

    container.innerHTML = `
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:10px;margin-bottom:16px">
        <div class="admin-card" style="text-align:center;cursor:pointer;${filter === 'all' ? 'box-shadow:0 0 0 2px var(--clr-primary)' : ''}" onclick="PhotoHouseAdmin.filterOrders('all')"><div style="font-size:24px;font-weight:900;color:var(--clr-info)">${stats.all}</div><div style="font-size:12px;color:var(--clr-text-muted)">همه</div></div>
        ${Object.entries(PhotoHouse.ORDER_STATUS).map(([k, v]) => `
          <div class="admin-card" style="text-align:center;cursor:pointer;${filter === k ? 'box-shadow:0 0 0 2px var(--clr-primary)' : ''}" onclick="PhotoHouseAdmin.filterOrders('${k}')">
            <div style="font-size:24px;font-weight:900">${stats[k] || 0}</div>
            <div style="font-size:11px;color:var(--clr-text-muted)">${v.icon} ${v.label}</div>
          </div>`).join('')}
      </div>
      <div class="admin-card">
        ${filtered.length ? filtered.slice().reverse().map(o => this._orderRow(o)).join('') : '<div style="text-align:center;padding:32px;color:var(--clr-text-muted)">سفارشی ثبت نشده</div>'}
      </div>
      ${this._orderModalHtml()}`
  },

  _orderRow(o) {
    const type = PhotoHouse.ORDER_TYPES[o.orderType] || PhotoHouse.ORDER_TYPES.print
    const st = PhotoHouse.ORDER_STATUS[o.status] || PhotoHouse.ORDER_STATUS.pending
    const items = (o.items || []).map(i => PhotoHouse.formatItemLine(i)).join('، ')
    const shop = o.printShopId ? DB.find('printShops', s => s.id === o.printShopId) : null
    return `<div class="ph-order-row" onclick="PhotoHouseAdmin.openOrderModal('${o.id}')">
      <div style="flex:1;min-width:0">
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          <span style="font-weight:700;color:#fff">${Utils.escapeHtml(o.customerName || '—')}</span>
          <span class="badge badge-gold">${type.icon} ${type.label}</span>
          <span class="badge">${st.icon} ${st.label}</span>
        </div>
        <div style="font-size:12px;color:rgba(255,255,255,0.5);margin-top:4px">${Utils.escapeHtml(items)}</div>
        <div style="font-size:11px;color:rgba(255,255,255,0.35);margin-top:4px">
          ${o.date || '—'} | مجموع: ${Utils.fmtNum(o.totalAmount || 0)} | بیعانه: ${Utils.fmtNum(o.deposit || 0)} | مانده: ${Utils.fmtNum(o.remaining || 0)}
          ${shop ? ` | 🏭 ${Utils.escapeHtml(shop.name)}` : ''}
        </div>
      </div>
      <div style="display:flex;gap:4px;flex-shrink:0" onclick="event.stopPropagation()">
        ${o.status === 'pending' ? `<button class="btn btn-sm btn-info" onclick="PhotoHouseAdmin.advanceOrder('${o.id}','selection')"><i class="fas fa-forward"></i></button>` : ''}
        ${['pending','selection','editing'].includes(o.status) ? `<button class="btn btn-sm btn-warning" onclick="PhotoHouseAdmin.advanceOrder('${o.id}','sent')"><i class="fas fa-paper-plane"></i></button>` : ''}
        ${o.status !== 'delivered' ? `<button class="btn btn-sm btn-success" onclick="PhotoHouseAdmin.advanceOrder('${o.id}','delivered')"><i class="fas fa-check"></i></button>` : ''}
        <button class="btn btn-sm btn-danger" onclick="PhotoHouseAdmin.deleteOrder('${o.id}')"><i class="fas fa-trash"></i></button>
      </div>
    </div>`
  },

  filterOrders(f) {
    this.state.filter = f
    this._renderOrders(document.getElementById('ph-tab-content'))
  },

  _defaultItems() {
    return [{ id: Date.now(), name: '', qty: 1, unitPrice: 0 }]
  },

  renderItemRows() {
    if (!this.state.items.length) this.state.items = this._defaultItems()
    return this.state.items.map((item, i) => {
      const n = PhotoHouse.normalizeItem(item)
      return `<div class="ph-item-row">
        <select class="form-select ph-preset" data-index="${i}" onchange="PhotoHouseAdmin.applyPreset(${i}, this.value)" style="max-width:140px;font-size:11px">
          <option value="">پیش‌فرض...</option>
          ${PhotoHouse.ITEM_PRESETS.map((p, pi) => `<option value="${pi}" ${p.name === n.name ? 'selected' : ''}>${Utils.escapeHtml(p.name)}</option>`).join('')}
        </select>
        <input class="form-input ph-item-name" data-index="${i}" placeholder="شرح" value="${Utils.escapeHtml(n.name)}" style="flex:1;min-width:100px" oninput="PhotoHouseAdmin.updateItem(${i})"/>
        <input class="form-input num-input ph-item-qty" data-index="${i}" type="text" inputmode="numeric" placeholder="تعداد" value="${n.qty}" style="width:56px" oninput="PhotoHouseAdmin.updateItem(${i})"/>
        <input class="form-input num-input ph-item-price" data-index="${i}" type="text" inputmode="numeric" placeholder="قیمت" value="${n.unitPrice || ''}" style="width:90px" oninput="PhotoHouseAdmin.updateItem(${i})"/>
        <span class="ph-item-total" id="ph-item-total-${i}" style="min-width:72px;font-weight:700;font-size:12px;color:var(--clr-primary)">${Utils.fmtNum(n.total)}</span>
        <button class="btn btn-sm btn-danger" onclick="PhotoHouseAdmin.removeItem(${i})"><i class="fas fa-times"></i></button>
      </div>`
    }).join('')
  },

  applyPreset(index, presetIdx) {
    const p = PhotoHouse.ITEM_PRESETS[parseInt(presetIdx, 10)]
    if (!p) return
    this.state.items[index] = { ...this.state.items[index], name: p.name, unitPrice: p.unitPrice }
    const list = document.getElementById('ph-items-list')
    if (list) list.innerHTML = this.renderItemRows()
    this.updateOrderTotals()
  },

  addItem() {
    this.state.items.push({ id: Date.now(), name: '', qty: 1, unitPrice: 0 })
    const list = document.getElementById('ph-items-list')
    if (list) list.innerHTML = this.renderItemRows()
    this.updateOrderTotals()
  },

  removeItem(index) {
    this.state.items.splice(index, 1)
    if (!this.state.items.length) this.state.items = this._defaultItems()
    const list = document.getElementById('ph-items-list')
    if (list) list.innerHTML = this.renderItemRows()
    this.updateOrderTotals()
  },

  updateItem(index) {
    const item = this.state.items[index]
    const nameEl = document.querySelector(`.ph-item-name[data-index="${index}"]`)
    const qtyEl = document.querySelector(`.ph-item-qty[data-index="${index}"]`)
    const priceEl = document.querySelector(`.ph-item-price[data-index="${index}"]`)
    item.name = nameEl?.value || ''
    item.qty = parseInt(Utils.parseNum(qtyEl?.value || '1')) || 1
    item.unitPrice = parseInt(Utils.parseNum(priceEl?.value || '0')) || 0
    const n = PhotoHouse.normalizeItem(item)
    this.state.items[index] = n
    const totalEl = document.getElementById(`ph-item-total-${index}`)
    if (totalEl) totalEl.textContent = Utils.fmtNum(n.total)
    this.updateOrderTotals()
  },

  updateOrderTotals() {
    const total = PhotoHouse.calcItemsTotal(this.state.items)
    const deposit = parseInt(Utils.parseNum(document.getElementById('ph-deposit')?.value || '0')) || 0
    const totalEl = document.getElementById('ph-total-display')
    const remEl = document.getElementById('ph-remaining-display')
    if (totalEl) totalEl.textContent = Utils.fmtNum(total)
    if (remEl) remEl.textContent = Utils.fmtNum(Math.max(0, total - deposit))
  },

  _orderModalHtml() {
    const contracts = this._contracts()
    const shops = DB.get('printShops') || []
    const banks = DB.get('banks') || []
    return `<div class="modal-backdrop" id="ph-order-modal">
      <div class="modal" style="max-width:680px;max-height:90vh;overflow-y:auto">
        <div class="modal-header"><div class="modal-title" id="ph-order-modal-title">سفارش عکس‌خانه</div><button class="modal-close" onclick="PhotoHouseAdmin.closeOrderModal()">✕</button></div>
        <div class="modal-body">
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
            <div class="form-group"><label>مشتری / قرارداد</label>
              <select class="form-select" id="ph-customer"><option value="">انتخاب...</option>
                ${contracts.map(c => `<option value="${c.id}">${Utils.escapeHtml(this._contractLabel(c))}</option>`).join('')}
              </select>
            </div>
            <div class="form-group"><label>نوع سفارش</label>
              <select class="form-select" id="ph-order-type">
                ${Object.entries(PhotoHouse.ORDER_TYPES).map(([k, v]) => `<option value="${k}">${v.icon} ${v.label}</option>`).join('')}
              </select>
            </div>
            <div class="form-group"><label>چاپخانه</label>
              <select class="form-select" id="ph-print-shop"><option value="">—</option>
                ${shops.map(s => `<option value="${s.id}">${Utils.escapeHtml(s.name)}</option>`).join('')}
              </select>
            </div>
            <div class="form-group"><label>تاریخ</label><input class="form-input" id="ph-date" value="${Utils.todayJalali()}"/></div>
          </div>
          <div class="form-group"><label>آیتم‌ها (نام × تعداد × قیمت واحد)</label>
            <div id="ph-items-list">${this.renderItemRows()}</div>
            <button class="btn btn-secondary btn-sm" onclick="PhotoHouseAdmin.addItem()" style="margin-top:8px;width:100%"><i class="fas fa-plus"></i> افزودن آیتم</button>
          </div>
          <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px">
            <div><label>مجموع</label><div id="ph-total-display" style="font-size:1.2em;font-weight:800;color:var(--clr-primary)">0</div></div>
            <div><label>بیعانه</label><input class="form-input num-input" id="ph-deposit" oninput="PhotoHouseAdmin.updateOrderTotals()"/></div>
            <div><label>مانده</label><div id="ph-remaining-display" style="font-size:1.2em;font-weight:800;color:var(--clr-danger)">0</div></div>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:12px">
            <div class="form-group"><label>روش پرداخت</label>
              <select class="form-select" id="ph-deposit-method"><option value="card">کارت</option><option value="pos">کارتخوان</option><option value="shaba">شبا</option></select>
            </div>
            <div class="form-group"><label>حساب</label>
              <select class="form-select" id="ph-deposit-bank">${banks.map(b => `<option value="${b.id}">${Utils.escapeHtml(b.name)}</option>`).join('')}</select>
            </div>
          </div>
          <div class="form-group"><label>توضیحات</label><textarea class="form-textarea" id="ph-notes" rows="2"></textarea></div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-ghost" onclick="PhotoHouseAdmin.closeOrderModal()">انصراف</button>
          <button class="btn btn-primary" onclick="PhotoHouseAdmin.saveOrder()">💾 ذخیره</button>
        </div>
      </div>
    </div>`
  },

  openOrderModal(id) {
    this.state.editingOrderId = id || null
    this.state.items = this._defaultItems()
    const modal = document.getElementById('ph-order-modal')
    if (!modal) {
      this.render(document.getElementById('sec-print'))
      return this.openOrderModal(id)
    }
    document.getElementById('ph-order-modal-title').textContent = id ? 'ویرایش سفارش' : 'سفارش جدید عکس‌خانه'
    if (id) {
      const o = DB.find('printOrders', x => x.id === id)
      if (o) {
        document.getElementById('ph-customer').value = o.customerId || ''
        document.getElementById('ph-order-type').value = o.orderType || 'print'
        document.getElementById('ph-print-shop').value = o.printShopId || ''
        document.getElementById('ph-date').value = o.date || Utils.todayJalali()
        document.getElementById('ph-deposit').value = o.deposit || ''
        document.getElementById('ph-notes').value = o.notes || ''
        this.state.items = (o.items || []).map(i => ({ ...PhotoHouse.normalizeItem(i) }))
        if (!this.state.items.length) this.state.items = this._defaultItems()
        const list = document.getElementById('ph-items-list')
        if (list) list.innerHTML = this.renderItemRows()
      }
    }
    modal.classList.add('open')
    this.updateOrderTotals()
  },

  closeOrderModal() {
    document.getElementById('ph-order-modal')?.classList.remove('open')
    this.state.editingOrderId = null
  },

  async saveOrder() {
    const customerId = document.getElementById('ph-customer')?.value
    if (!customerId) { Utils.toast('قرارداد را انتخاب کنید', 'error'); return }
    const contract = DB.find('contracts', c => c.id === customerId)
    const items = this.state.items.filter(i => i.name?.trim() || i.unitPrice > 0).map(i => PhotoHouse.normalizeItem(i))
    if (!items.length) { Utils.toast('حداقل یک آیتم وارد کنید', 'error'); return }
    const totalAmount = PhotoHouse.calcItemsTotal(items)
    const deposit = parseInt(Utils.parseNum(document.getElementById('ph-deposit')?.value || '0')) || 0
    const data = {
      customerId,
      customerName: contract ? `${contract.groom || ''}${contract.bride ? ' و ' + contract.bride : ''}` : '',
      contractNum: contract?.contractNum || '',
      orderType: document.getElementById('ph-order-type')?.value || 'print',
      printShopId: document.getElementById('ph-print-shop')?.value || '',
      items,
      totalAmount,
      deposit,
      depositMethod: document.getElementById('ph-deposit-method')?.value || 'card',
      depositBankId: document.getElementById('ph-deposit-bank')?.value || '',
      remaining: Math.max(0, totalAmount - deposit),
      date: document.getElementById('ph-date')?.value || Utils.todayJalali(),
      notes: document.getElementById('ph-notes')?.value?.trim() || '',
      status: 'pending'
    }

    if (this.state.editingOrderId) {
      const old = DB.find('printOrders', o => o.id === this.state.editingOrderId)
      data.status = old?.status || 'pending'
      await SecureDB.update('printOrders', this.state.editingOrderId, data)
      Utils.toast('✅ سفارش ویرایش شد', 'success')
    } else {
      if (deposit > 0 && data.depositBankId) {
        const bank = DB.find('banks', b => b.id === data.depositBankId)
        if (bank) await SecureDB.update('banks', data.depositBankId, { balance: (bank.balance || 0) + deposit })
        await SecureDB.insert('transactions', {
          type: 'deposit', bankId: data.depositBankId, bankName: bank?.name || '',
          amount: deposit, description: `بیعانه عکس‌خانه — ${data.customerName}`,
          date: Utils.todayJalali(), by: Auth.getUser()?.name || 'ادمین'
        })
      }
      data.createdAt = Utils.todayJalali()
      await SecureDB.insert('printOrders', data)
      Utils.toast('✅ سفارش ثبت شد', 'success')
    }
    this.closeOrderModal()
    this.render(document.getElementById('sec-print'))
  },

  async advanceOrder(id, status) {
    await SecureDB.update('printOrders', id, { status })
    Utils.toast('✅ وضعیت به‌روز شد', 'success')
    this.render(document.getElementById('sec-print'))
  },

  async deleteOrder(id) {
    if (!confirm('حذف شود؟')) return
    await SecureDB.update('printOrders', id, { _deleted: true })
    this.render(document.getElementById('sec-print'))
  },

  /* ── Albums ── */
  _renderAlbums(container) {
    const albums = DB.get('albums') || []
    container.innerHTML = `<div class="admin-card">
      ${albums.length ? albums.slice().reverse().map(a => {
        const st = PhotoHouse.ALBUM_STATUS[a.status] || PhotoHouse.ALBUM_STATUS.draft
        const items = (a.items || []).map(i => PhotoHouse.formatItemLine(i)).join('، ')
        return `<div class="ph-order-row" onclick="PhotoHouseAdmin.openAlbumModal('${a.id}')">
          <div style="flex:1">
            <div style="font-weight:700;color:#fff">📔 ${Utils.escapeHtml(a.title || a.couple || 'آلبوم')}</div>
            <div style="font-size:12px;color:rgba(255,255,255,0.5)">${Utils.escapeHtml(a.couple || '')} — ${st.label}</div>
            <div style="font-size:11px;color:rgba(255,255,255,0.35)">${Utils.escapeHtml(items)} | ${Utils.fmtNum(a.totalAmount || 0)} تومان</div>
          </div>
          <div onclick="event.stopPropagation()">
            <button class="btn btn-sm btn-success" onclick="PhotoHouseAdmin.advanceAlbum('${a.id}')"><i class="fas fa-forward"></i></button>
            <button class="btn btn-sm btn-danger" onclick="PhotoHouseAdmin.deleteAlbum('${a.id}')"><i class="fas fa-trash"></i></button>
          </div>
        </div>`
      }).join('') : '<div style="text-align:center;padding:32px;color:var(--clr-text-muted)">آلبومی ثبت نشده</div>'}
    </div>`
  },

  openAlbumModal(id) {
    const contracts = this._contracts()
    const designers = DB.get('personnel').filter(p => (p.roles || []).some(r => ['album_designer', 'editor_venue', 'photographer'].includes(normalizeRole(r))))
    const existing = id ? DB.find('albums', a => a.id === id) : null
    this.state.editingAlbumId = id || null
    this.state.items = existing?.items?.length ? existing.items.map(i => ({ ...PhotoHouse.normalizeItem(i) })) : this._defaultItems()

    const overlay = document.createElement('div')
    overlay.className = 'modal-backdrop open'
    overlay.id = 'ph-album-modal'
    overlay.innerHTML = `
      <div class="modal" style="max-width:640px;max-height:90vh;overflow-y:auto">
        <div class="modal-header"><div class="modal-title">${id ? 'ویرایش آلبوم' : 'آلبوم جدید'}</div><button class="modal-close" onclick="document.getElementById('ph-album-modal').remove()">✕</button></div>
        <div class="modal-body">
          <div class="form-group"><label>قرارداد</label>
            <select class="form-select" id="ph-album-contract">
              ${contracts.map(c => `<option value="${c.id}" ${existing?.contractId === c.id ? 'selected' : ''}>${Utils.escapeHtml(this._contractLabel(c))}</option>`).join('')}
            </select>
          </div>
          <div class="form-group"><label>عنوان آلبوم</label><input class="form-input" id="ph-album-title" value="${Utils.escapeHtml(existing?.title || '')}" placeholder="مثلاً آلبوم دیجیتال ۳۰×۳۰"/></div>
          <div class="form-group"><label>طراح / عکاس</label>
            <select class="form-select" id="ph-album-designer">
              <option value="">—</option>
              ${designers.map(p => `<option value="${p.id}" ${existing?.designerId === p.id ? 'selected' : ''}>${Utils.escapeHtml(p.name)}</option>`).join('')}
            </select>
          </div>
          <div class="form-group"><label>آیتم‌ها</label><div id="ph-items-list">${this.renderItemRows()}</div>
            <button class="btn btn-secondary btn-sm" onclick="PhotoHouseAdmin.addItem()" style="margin-top:8px;width:100%"><i class="fas fa-plus"></i> افزودن</button>
          </div>
          <div class="form-group"><label>حداکثر انتخاب عکس</label><input class="form-input num-input" id="ph-album-max-photos" value="${existing?.maxPhotos || 50}"/></div>
          <div class="form-group"><label>توضیحات</label><textarea class="form-textarea" id="ph-album-notes" rows="2">${Utils.escapeHtml(existing?.notes || '')}</textarea></div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-ghost" onclick="document.getElementById('ph-album-modal').remove()">انصراف</button>
          <button class="btn btn-primary" onclick="PhotoHouseAdmin.saveAlbum()">💾 ذخیره</button>
        </div>
      </div>`
    document.body.appendChild(overlay)
    this.updateOrderTotals()
  },

  saveAlbum() {
    const contractId = document.getElementById('ph-album-contract')?.value
    const contract = DB.find('contracts', c => c.id === contractId)
    const items = this.state.items.filter(i => i.name?.trim()).map(i => PhotoHouse.normalizeItem(i))
    const data = {
      contractId,
      contractNum: contract?.contractNum || '',
      couple: contract ? `${contract.bride || ''} و ${contract.groom || ''}` : '',
      title: document.getElementById('ph-album-title')?.value?.trim() || 'آلبوم',
      designerId: document.getElementById('ph-album-designer')?.value || '',
      items,
      totalAmount: PhotoHouse.calcItemsTotal(items),
      maxPhotos: parseInt(document.getElementById('ph-album-max-photos')?.value) || 50,
      selectedPhotos: [],
      notes: document.getElementById('ph-album-notes')?.value?.trim() || '',
      status: 'draft'
    }
    if (this.state.editingAlbumId) {
      const old = DB.find('albums', a => a.id === this.state.editingAlbumId)
      data.status = old?.status || 'draft'
      data.selectedPhotos = old?.selectedPhotos || []
      DB.update('albums', this.state.editingAlbumId, data)
    } else {
      data.createdAt = Utils.todayJalali()
      DB.insert('albums', data)
    }
    document.getElementById('ph-album-modal')?.remove()
    Utils.toast('✅ آلبوم ذخیره شد', 'success')
    this.render(document.getElementById('sec-print'))
  },

  advanceAlbum(id) {
    const a = DB.find('albums', x => x.id === id)
    if (!a) return
    const keys = Object.keys(PhotoHouse.ALBUM_STATUS)
    const idx = keys.indexOf(a.status)
    const next = keys[Math.min(idx + 1, keys.length - 1)]
    DB.update('albums', id, { status: next })
    Utils.toast(`✅ وضعیت: ${PhotoHouse.ALBUM_STATUS[next].label}`, 'success')
    this.render(document.getElementById('sec-print'))
  },

  deleteAlbum(id) {
    if (!confirm('حذف شود؟')) return
    DB.delete('albums', id)
    this.render(document.getElementById('sec-print'))
  },

  /* ── Photo selections ── */
  _renderSelections(container) {
    const list = DB.get('photoSelections') || []
    container.innerHTML = `<div class="admin-card">
      ${list.length ? list.slice().reverse().map(s => {
        const c = DB.find('contracts', x => x.id === s.contractId)
        const st = PhotoHouse.SELECTION_STATUS[s.status] || { label: s.status, icon: '—' }
        return `<div class="ph-order-row">
          <div style="flex:1">
            <div style="font-weight:700;color:#fff">${st.icon} ${Utils.escapeHtml(s.couple || this._contractLabel(c))}</div>
            <div style="font-size:12px;color:rgba(255,255,255,0.5)">${(s.selectedPhotos || []).length} / ${s.maxPhotos || '—'} عکس — ${st.label}</div>
            <div style="font-size:11px;color:rgba(255,255,255,0.35)">${s.createdAt || ''} ${s.notes ? '— ' + Utils.escapeHtml(s.notes) : ''}</div>
          </div>
          <div style="display:flex;gap:4px">
            ${s.status === 'submitted' ? `<button class="btn btn-sm btn-success" onclick="PhotoHouseAdmin.approveSelection('${s.id}')"><i class="fas fa-check"></i></button>
              <button class="btn btn-sm btn-warning" onclick="PhotoHouseAdmin.rejectSelection('${s.id}')"><i class="fas fa-times"></i></button>` : ''}
            <button class="btn btn-sm btn-ghost" onclick="PhotoHouseAdmin.viewSelection('${s.id}')"><i class="fas fa-eye"></i></button>
            <button class="btn btn-sm btn-danger" onclick="PhotoHouseAdmin.deleteSelection('${s.id}')"><i class="fas fa-trash"></i></button>
          </div>
        </div>`
      }).join('') : '<div style="text-align:center;padding:32px;color:var(--clr-text-muted)">انتخاب عکسی ثبت نشده — مشتری از پورتال یا دعوت دستی</div>'}
    </div>`
  },

  openSelectionModal() {
    const contracts = this._contracts()
    const overlay = document.createElement('div')
    overlay.className = 'modal-backdrop open'
    overlay.innerHTML = `
      <div class="modal">
        <div class="modal-header"><div class="modal-title">دعوت به انتخاب عکس</div><button class="modal-close" onclick="this.closest('.modal-backdrop').remove()">✕</button></div>
        <div class="modal-body">
          <div class="form-group"><label>قرارداد</label>
            <select class="form-select" id="ph-sel-contract">${contracts.map(c => `<option value="${c.id}">${Utils.escapeHtml(this._contractLabel(c))}</option>`).join('')}</select>
          </div>
          <div class="form-group"><label>حداکثر تعداد انتخاب</label><input class="form-input num-input" id="ph-sel-max" value="50"/></div>
          <div class="form-group"><label>پیام برای مشتری</label><textarea class="form-textarea" id="ph-sel-msg" rows="2" placeholder="لطفاً عکس‌های مورد نظر را انتخاب کنید..."></textarea></div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-ghost" onclick="this.closest('.modal-backdrop').remove()">انصراف</button>
          <button class="btn btn-primary" onclick="PhotoHouseAdmin.saveSelectionInvite()">ارسال دعوت</button>
        </div>
      </div>`
    document.body.appendChild(overlay)
  },

  async saveSelectionInvite() {
    const contractId = document.getElementById('ph-sel-contract')?.value
    const contract = DB.find('contracts', c => c.id === contractId)
    if (!contract) return
    PhotoHouse.upsertPhotoSelection({
      contractId,
      contractNum: contract.contractNum,
      couple: `${contract.bride || ''} و ${contract.groom || ''}`,
      maxPhotos: parseInt(document.getElementById('ph-sel-max')?.value) || 50,
      notes: document.getElementById('ph-sel-msg')?.value?.trim() || 'لطفاً عکس‌های مورد نظر را انتخاب کنید.'
    })
    await SecureDB.insert('notifications', {
      type: 'alert',
      title: '🖼️ دعوت انتخاب عکس',
      text: `دعوت انتخاب عکس برای ${contract.bride} و ${contract.groom} ثبت شد.`,
      read: false,
      createdAt: Utils.todayJalali()
    })
    document.querySelector('.modal-backdrop.open')?.remove()
    Utils.toast('✅ دعوت انتخاب عکس ثبت شد', 'success')
    this.render(document.getElementById('sec-print'))
  },

  viewSelection(id) {
    const s = DB.find('photoSelections', x => x.id === id)
    if (!s) return
    const photos = (s.selectedPhotos || []).map((p, i) =>
      `<div style="padding:8px 0;border-bottom:1px solid var(--clr-border)">${i + 1}. <strong>${Utils.escapeHtml(p.name || '—')}</strong>${p.note ? ' — ' + Utils.escapeHtml(p.note) : ''}</div>`
    ).join('') || '<p style="color:var(--clr-text-muted)">هنوز عکسی انتخاب نشده</p>'
    const overlay = document.createElement('div')
    overlay.className = 'modal-backdrop open'
    overlay.innerHTML = `
      <div class="modal" style="max-width:480px">
        <div class="modal-header"><div class="modal-title">انتخاب عکس — ${Utils.escapeHtml(s.couple || '')}</div>
          <button class="modal-close" onclick="this.closest('.modal-backdrop').remove()">✕</button></div>
        <div class="modal-body">${photos}</div>
        <div class="modal-footer"><button class="btn btn-primary" onclick="this.closest('.modal-backdrop').remove()">بستن</button></div>
      </div>`
    document.body.appendChild(overlay)
  },

  async approveSelection(id) {
    await SecureDB.update('photoSelections', id, { status: 'approved', approvedAt: Utils.todayJalali() })
    const s = DB.find('photoSelections', x => x.id === id)
    if (s?.contractId) {
      const albums = DB.filter('albums', a => a.contractId === s.contractId && a.status !== 'delivered')
      const album = albums.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))[0]
      if (album) {
        await SecureDB.update('albums', album.id, { selectedPhotos: s.selectedPhotos, status: 'design' })
      } else {
        await SecureDB.insert('albums', {
          contractId: s.contractId,
          contractNum: s.contractNum,
          couple: s.couple,
          title: 'آلبوم — انتخاب تأییدشده',
          items: [{ name: 'آلبوم دیجیتال', qty: 1, unitPrice: 0, total: 0 }],
          totalAmount: 0,
          maxPhotos: s.maxPhotos,
          selectedPhotos: s.selectedPhotos,
          status: 'design',
          createdAt: Utils.todayJalali()
        })
      }
    }
    Utils.toast('✅ انتخاب عکس تأیید شد — آلبوم به طراحی رفت', 'success')
    this.render(document.getElementById('sec-print'))
  },

  async rejectSelection(id) {
    if (!confirm('انتخاب رد شود تا مشتری اصلاح کند؟')) return
    await SecureDB.update('photoSelections', id, { status: 'rejected', rejectedAt: Utils.todayJalali() })
    const s = DB.find('photoSelections', x => x.id === id)
    if (s) {
      await SecureDB.insert('notifications', {
        type: 'alert',
        title: '❌ انتخاب عکس نیاز به اصلاح',
        text: `${s.couple} — لطفاً انتخاب عکس را اصلاح کنید.`,
        read: false,
        createdAt: Utils.todayJalali()
      })
    }
    Utils.toast('انتخاب رد شد — مشتری می‌تواند اصلاح کند', 'info')
    this.render(document.getElementById('sec-print'))
  },

  async deleteSelection(id) {
    if (!confirm('حذف شود؟')) return
    await SecureDB.update('photoSelections', id, { _deleted: true })
    this.render(document.getElementById('sec-print'))
  },

  /* ── Print shops ── */
  _renderShops(container) {
    const shops = DB.get('printShops') || []
    container.innerHTML = `<div class="admin-card">
      ${shops.length ? shops.map(s => `
        <div class="ph-order-row" onclick="PhotoHouseAdmin.openShopModal('${s.id}')">
          <div><div style="font-weight:700;color:#fff">🏭 ${Utils.escapeHtml(s.name)}</div>
            <div style="font-size:12px;color:rgba(255,255,255,0.5)">
              ${s.card ? '💳 ' + Utils.escapeHtml(s.card) + ' ' : ''}${s.shaba ? '🏦 ' + Utils.escapeHtml(s.shaba) : ''}
              ${s.phone ? ' 📞 ' + Utils.escapeHtml(s.phone) : ''}
            </div>
          </div>
          <button class="btn btn-sm btn-danger" onclick="event.stopPropagation();PhotoHouseAdmin.deleteShop('${s.id}')"><i class="fas fa-trash"></i></button>
        </div>`).join('') : '<div style="text-align:center;padding:32px;color:var(--clr-text-muted)">چاپخانه‌ای ثبت نشده</div>'}
    </div>`
  },

  openShopModal(id) {
    const s = id ? DB.find('printShops', x => x.id === id) : null
    const overlay = document.createElement('div')
    overlay.className = 'modal-backdrop open'
    overlay.innerHTML = `
      <div class="modal">
        <div class="modal-header"><div class="modal-title">${s ? 'ویرایش چاپخانه' : 'چاپخانه جدید'}</div><button class="modal-close" onclick="this.closest('.modal-backdrop').remove()">✕</button></div>
        <div class="modal-body">
          <div class="form-group"><label>نام</label><input class="form-input" id="ph-shop-name" value="${Utils.escapeHtml(s?.name || '')}"/></div>
          <div class="form-group"><label>کارت</label><input class="form-input ltr" id="ph-shop-card" value="${Utils.escapeHtml(s?.card || '')}"/></div>
          <div class="form-group"><label>شبا</label><input class="form-input ltr" id="ph-shop-shaba" value="${Utils.escapeHtml(s?.shaba || '')}"/></div>
          <div class="form-group"><label>تلفن</label><input class="form-input" id="ph-shop-phone" value="${Utils.escapeHtml(s?.phone || '')}"/></div>
          <div class="form-group"><label>آدرس</label><input class="form-input" id="ph-shop-address" value="${Utils.escapeHtml(s?.address || '')}"/></div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-ghost" onclick="this.closest('.modal-backdrop').remove()">انصراف</button>
          <button class="btn btn-primary" onclick="PhotoHouseAdmin.saveShop('${id || ''}')">ذخیره</button>
        </div>
      </div>`
    document.body.appendChild(overlay)
  },

  async saveShop(id) {
    const data = {
      name: document.getElementById('ph-shop-name')?.value?.trim(),
      card: document.getElementById('ph-shop-card')?.value?.trim(),
      shaba: document.getElementById('ph-shop-shaba')?.value?.trim(),
      phone: document.getElementById('ph-shop-phone')?.value?.trim(),
      address: document.getElementById('ph-shop-address')?.value?.trim()
    }
    if (!data.name) { Utils.toast('نام الزامی است', 'error'); return }
    if (id) await SecureDB.update('printShops', id, data)
    else await SecureDB.insert('printShops', data)
    document.querySelector('.modal-backdrop.open')?.remove()
    Utils.toast('✅ ذخیره شد', 'success')
    this.render(document.getElementById('sec-print'))
  },

  deleteShop(id) {
    if (!confirm('حذف شود؟')) return
    DB.delete('printShops', id)
    this.render(document.getElementById('sec-print'))
  }
}

window.PhotoHouseAdmin = PhotoHouseAdmin
