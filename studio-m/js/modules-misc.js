/* Studio M Pro — split module (loaded after modules.js) */
/* ── Files ── */
SMModules.files = {
  render(el) {
    const files = (typeof DB.active === 'function' ? DB.active('fileAssets') : (DB.get('fileAssets') || []).filter(f => !f._deleted))
    const cloud = typeof FileStorage !== 'undefined' && FileStorage.isAvailable?.()
    el.innerHTML = `
      ${SMUI.sectionHead(SM.t('files'), cloud ? 'ابر Supabase Storage' : 'محلی — برای ابر فعال کنید', `<button class="sm-btn sm-btn-primary" ${SMEvents.attrs('SMModules.files.pickUpload')}><i class="fas fa-upload"></i> ${SM.state.locale === 'fa' ? 'آپلود' : 'Upload'}</button>`)}
      <input type="file" id="sm-file-input" hidden data-sm-change-fn="SMModules.files.upload" data-sm-args='[]'/>
      ${files.length ? `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:12px">${files.map(f => `
        <div class="sm-card">
          <div class="sm-card-body" style="text-align:center">
            <i class="fas fa-file${f.type?.includes('image') || f.mime?.includes('image') ? '-image' : ''}" style="font-size:2rem;color:var(--sm-accent);margin-bottom:8px"></i>
            <div style="font-weight:700;font-size:.85rem;word-break:break-all">${SM.esc(f.name)}</div>
            <div style="font-size:.72rem;color:var(--sm-text-muted)">${SM.esc(f.size || '')} — ${SM.esc(f.createdAt || '')}</div>
            ${f.storagePath ? SMUI.badge('ابر', 'success') : ''}
            ${f.storagePath ? `<button class="sm-btn sm-btn-sm sm-btn-ghost" style="margin-top:8px" ${SMEvents.attrs('SMModules.files.openSecure', [f.id])}><i class="fas fa-eye"></i> مشاهده امن</button>` : ''}
            <button class="sm-btn sm-btn-sm sm-btn-danger" style="margin-top:8px" ${SMEvents.attrs('SMModules.files.remove', [f.id])}>${SM.t('delete')}</button>
          </div>
        </div>`).join('')}</div>` : SMUI.empty('fa-folder-open', SM.t('no_data'))}`
  },
  pickUpload() {
    document.getElementById('sm-file-input')?.click()
  },
  async upload(a, b) {
    const input = (b && b.files !== undefined) ? b : a
    const file = input?.files?.[0]
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
  async openSecure(id) {
    const asset = DB.find('fileAssets', file => file.id === id)
    if (!asset?.storagePath || typeof FileStorage === 'undefined') return SM.toast('فایل ابری یافت نشد', 'error')
    const link = await FileStorage.signedUrl(asset.storagePath, 300)
    if (!link.ok) return SM.toast(link.error, 'error')
    window.open(link.url, '_blank', 'noopener,noreferrer')
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
    const galleries = DB.active('galleries')
    el.innerHTML = `
      ${SMUI.sectionHead('کتابخانه رسانه', 'عکس، ویدیو و فایل‌های پروژه', `<button class="sm-btn sm-btn-primary" ${SMEvents.attrs('SMModules.media.add')}><i class="fas fa-plus"></i> ${SM.t('add')}</button>`)}
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
              <button class="sm-btn sm-btn-sm sm-btn-primary" style="margin-top:12px" ${SMEvents.attrs('SMModules.media.deliver', [g.id])}>تحویل به مشتری</button>
              <button class="sm-btn sm-btn-sm sm-btn-ghost" style="margin-top:8px" ${SMEvents.attrs('SMModules.media.edit', [g.id])}>${SM.t('edit')}</button>
              <button class="sm-btn sm-btn-sm sm-btn-danger" style="margin-top:8px" ${SMEvents.attrs('SMH.remove', ['galleries', g.id, 'media'])}>${SM.t('delete')}</button>
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
    const notifs = DB.active('notifications').slice().reverse()
    el.innerHTML = `
      ${SMUI.sectionHead(SM.t('notifications'), '', `<button class="sm-btn sm-btn-ghost" ${SMEvents.attrs('SMModules.notifications.markAll')}>${SM.state.locale === 'fa' ? 'خواندن همه' : 'Mark all read'}</button>`)}
      ${notifs.length ? notifs.map(n => `
        <div class="sm-card" style="margin-bottom:8px;${n.read ? 'opacity:.65' : ''}">
          <div class="sm-card-body" style="display:flex;gap:12px;align-items:flex-start">
            <i class="fas fa-bell" style="color:var(--sm-accent);margin-top:4px"></i>
            <div style="flex:1">
              <div style="font-weight:700">${SM.esc(n.title || '—')}</div>
              <div style="font-size:.85rem;color:var(--sm-text-muted);margin-top:4px">${SM.esc(n.text || '')}</div>
              <div style="font-size:.72rem;color:var(--sm-text-muted);margin-top:6px">${SM.esc(n.createdAt || '')}</div>
            </div>
            ${!n.read ? `<button class="sm-btn sm-btn-sm sm-btn-ghost" ${SMEvents.attrs('SMModules.notifications.read', [n.id])}>✓</button>` : ''}
          </div>
        </div>`).join('') : SMUI.empty('fa-bell', SM.t('no_data'))}`
  },
  async read(id) { (SecureDB.update ? await SecureDB.update('notifications', id, { read: true }) : DB.update('notifications', id, { read: true })); SM.navigate('notifications') },
  async markAll() { for (const n of DB.active('notifications')) { if (!n.read) { if (SecureDB.update) await SecureDB.update('notifications', n.id, { read: true }); else DB.update('notifications', n.id, { read: true }) } } SM.navigate('notifications') }
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
      ${SMUI.sectionHead('API', SM.state.locale === 'fa' ? 'لایه یکپارچه‌سازی' : 'Integration layer', `<button class="sm-btn sm-btn-primary" ${SMEvents.attrs('SMModules.api.generateKey')}><i class="fas fa-key"></i> ${SM.state.locale === 'fa' ? 'کلید جدید' : 'New Key'}</button>`)}
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
          <td><button class="sm-btn sm-btn-sm sm-btn-danger" ${SMEvents.attrs('SMModules.api.revoke', [k.id])}>${SM.t('delete')}</button></td>
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

/* SMModules is owned by modules.js — do not reassign window here */
