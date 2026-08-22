/* Studio M Pro — split module (loaded after modules.js) */
/* ── Packages ── */
SMModules.packages = {
  render(el) {
    if (typeof PackageCatalog !== 'undefined') PackageCatalog.ensureDefaults()
    const pkgs = DB.active('packages')
    el.innerHTML = `
      ${SMUI.sectionHead('پلن‌ها و قیمت‌گذاری', 'پلن‌های آماده و سفارشی — کاملاً قابل ویرایش', `<button class="sm-btn sm-btn-primary" ${SMEvents.attrs('SMModules.packages.add')}><i class="fas fa-plus"></i> پلن جدید</button>`)}
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
          <button class="sm-btn sm-btn-sm sm-btn-primary" ${SMEvents.attrs('SMModules.packages.edit', [p.id])}><i class="fas fa-pen"></i> ویرایش</button>
          <button class="sm-btn sm-btn-sm sm-btn-danger sm-btn-outline" ${SMEvents.attrs('SMH.remove', ['packages', p.id, 'packages'])}><i class="fas fa-trash"></i></button>
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
        <label class="sm-pkg-line-toggle"><input type="checkbox" id="pl-en-${id}" ${enabled ? 'checked' : ''} data-sm-change-fn="SMModules.packages._toggleRow" data-sm-args='${JSON.stringify([id]).replace(/'/g, '&#39;')}'/><span>${icon} ${title}</span></label>
        <input type="number" id="pl-pr-${id}" class="sm-input ltr sm-pkg-line-price" dir="ltr" placeholder="قیمت (تومان)" value="${price || ''}" data-sm-input-fn="SMModules.packages._refreshEditorPreview" data-sm-args='[]'/>
      </div>
      ${extraHtml || ''}
      <textarea id="pl-note-${id}" class="sm-textarea sm-pkg-line-note" rows="2" placeholder="توضیح این آیتم (اختیاری)" data-sm-input-fn="SMModules.packages._refreshEditorPreview" data-sm-args='[]'>${SM.esc(note || '')}</textarea>
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
        <input type="text" class="sm-input pkg-custom-label" placeholder="عنوان (مثلاً تدوین ویژه)" value="${SM.esc(c.label || '')}" data-sm-input-fn="SMModules.packages._refreshEditorPreview" data-sm-args='[]'/>
        <input type="number" class="sm-input ltr pkg-custom-price" dir="ltr" placeholder="قیمت" value="${c.price || ''}" data-sm-input-fn="SMModules.packages._refreshEditorPreview" data-sm-args='[]'/>
        <textarea class="sm-textarea pkg-custom-desc" rows="2" placeholder="توضیح" data-sm-input-fn="SMModules.packages._refreshEditorPreview" data-sm-args='[]'>${SM.esc(c.desc || c.note || '')}</textarea>
      </div>`).join('')

    return `
      <div class="sm-pkg-editor">
        <div class="sm-pkg-preview-wrap">
          <div id="pkg-preview-card" class="sm-pkg-card sm-pkg-preview-card" style="--pkg-color:${tier.color}">
            <div class="sm-pkg-card-banner">
              <span class="sm-pkg-tier-icon">${tier.icon}</span>
              <div>
                <div id="pkg-preview-tier" class="sm-pkg-tier-label">${tier.icon} ${tier.label}</div>
                <input id="pkg-name" class="sm-pkg-name-input" placeholder="نام پکیج" value="${SM.esc(p.name || '')}" data-sm-input-fn="SMModules.packages._refreshEditorPreview" data-sm-args='[]'/>
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
              <input type="number" id="pl-pr-video" class="sm-input ltr sm-pkg-line-price" dir="ltr" placeholder="قیمت پایه" value="${v.price || ''}" data-sm-input-fn="SMModules.packages._refreshEditorPreview" data-sm-args='[]'/>
            </div>
            <div class="sm-pkg-line-grid">
              <label class="sm-label">تعداد دوربین</label>
              <select id="pl-cameras" class="sm-input" data-sm-change-fn="SMModules.packages._refreshEditorPreview" data-sm-args='[]'>
                ${[1, 2, 3, 4, 5].map(n => `<option value="${n}"${+v.cameras === n ? ' selected' : ''}>${n} دوربین</option>`).join('')}
              </select>
              <label class="sm-label">کیفیت</label>
              <select id="pl-quality" class="sm-input" data-sm-change-fn="SMModules.packages._refreshEditorPreview" data-sm-args='[]'>
                <option value="fullhd"${v.quality === 'fullhd' ? ' selected' : ''}>Full HD</option>
                <option value="4k"${v.quality !== 'fullhd' ? ' selected' : ''}>4K UHD</option>
              </select>
              <label class="sm-label">مکمل 4K</label>
              <input type="number" id="pl-price4k" class="sm-input ltr" dir="ltr" placeholder="اگر جدا" value="${v.price4k || ''}" data-sm-input-fn="SMModules.packages._refreshEditorPreview" data-sm-args='[]'/>
            </div>
            <label class="sm-check-row"><input type="checkbox" id="pl-clip" ${v.clip !== false ? 'checked' : ''} data-sm-change-fn="SMModules.packages._refreshEditorPreview" data-sm-args='[]'/> شامل کلیپ</label>
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
          <button type="button" class="sm-btn sm-btn-sm sm-btn-ghost" ${SMEvents.attrs('SMModules.packages.addCustomRow')}>+ ردیف سفارشی</button>
        </div>
      </div>`
  },

  addCustomRow() {
    const wrap = document.getElementById('pkg-custom-rows')
    if (!wrap) return
    wrap.insertAdjacentHTML('beforeend', `<div class="sm-pkg-custom-row">
      <input type="text" class="sm-input pkg-custom-label" placeholder="عنوان" data-sm-input-fn="SMModules.packages._refreshEditorPreview" data-sm-args='[]'/>
      <input type="number" class="sm-input ltr pkg-custom-price" dir="ltr" placeholder="قیمت" data-sm-input-fn="SMModules.packages._refreshEditorPreview" data-sm-args='[]'/>
      <textarea class="sm-textarea pkg-custom-desc" rows="2" placeholder="توضیح" data-sm-input-fn="SMModules.packages._refreshEditorPreview" data-sm-args='[]'></textarea>
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
      })).filter(c => c.label)
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
        data.active = item?.active !== false
        data.version = item ? (Number(item.version) || 1) + 1 : 1
        data.updatedAtIso = new Date().toISOString()
        data.revisions = item
          ? [...(item.revisions || []), PackageCatalog.snapshot(item)].slice(-20)
          : []
        if (item) await SecureDB.update('packages', item.id, data)
        else await SecureDB.insert('packages', { ...data, createdAt: Utils.todayJalali(), createdAtIso: data.updatedAtIso })
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

