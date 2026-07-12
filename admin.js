/* Studio M — Admin extensions (onboarding, tools, requests) */

if (typeof Admin === 'undefined') {
  console.error('[admin.js] Admin core not loaded — check script order in admin.html')
} else Object.assign(Admin, {
  showAdminOnboarding() {
    const user = Auth.getUser()
    const info = DB.get('studioInfo') || {}
    document.getElementById('admin-onboarding-overlay')?.remove()
    const overlay = document.createElement('div')
    overlay.id = 'admin-onboarding-overlay'
    overlay.className = 'admin-onboarding-overlay'
    overlay.innerHTML = `
      <div class="admin-onboarding-modal" role="dialog" aria-modal="true">
        <div class="admin-onboarding-icon"><i class="fas fa-shield-halved"></i></div>
        <h2>تکمیل اطلاعات مدیر استودیو</h2>
        <p class="admin-onboarding-lead">رمز اولیه را تغییر دهید و مشخصات خود و استودیو را تکمیل کنید.</p>
        <div class="admin-onboarding-note">
          <i class="fas fa-key"></i>
          اگر رمز را در راه‌اندازی اول عوض نکرده‌اید، همان رمزی را که هنگام ساخت استودیو تعیین کردید وارد کنید.
        </div>
        <div class="form-group">
          <label class="form-label">نام و نام‌خانوادگی</label>
          <input class="form-input" id="onb-name" value="${Utils.escapeHtml(user?.name || '')}" autocomplete="name"/>
        </div>
        <div class="form-group">
          <label class="form-label">نام استودیو</label>
          <input class="form-input" id="onb-studio" value="${Utils.escapeHtml(info.name || AppConfig.DEFAULT_STUDIO_NAME)}"/>
        </div>
        <div class="form-group">
          <label class="form-label">تلفن استودیو</label>
          <input class="form-input ltr" id="onb-phone" value="${Utils.escapeHtml(info.phone || user?.phone || '')}" inputmode="tel"/>
        </div>
        <div class="form-group">
          <label class="form-label">رمز فعلی (اولیه)</label>
          <input class="form-input ltr" id="onb-current-pw" type="password" autocomplete="current-password" dir="ltr" lang="en"/>
        </div>
        <div class="form-row" style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
          <div class="form-group" style="margin:0">
            <label class="form-label">رمز جدید</label>
            <input class="form-input ltr" id="onb-new-pw" type="password" autocomplete="new-password" dir="ltr" lang="en"/>
          </div>
          <div class="form-group" style="margin:0">
            <label class="form-label">تکرار رمز جدید</label>
            <input class="form-input ltr" id="onb-new-pw2" type="password" autocomplete="new-password" dir="ltr" lang="en"/>
          </div>
        </div>
        ${typeof PasswordSecurity !== 'undefined' ? PasswordSecurity.meterHtml('onb-new') : ''}
        <p class="admin-onboarding-error" id="onb-error"></p>
        <button type="button" class="btn btn-primary" style="width:100%;margin-top:8px;padding:14px" onclick="Admin.completeAdminOnboarding()">
          <i class="fas fa-check"></i> ذخیره، خروج و ورود مجدد
        </button>
      </div>`
    document.body.appendChild(overlay)
    document.getElementById('onb-current-pw')?.focus()
    if (typeof PasswordSecurity !== 'undefined') PasswordSecurity.bind('onb-new-pw', 'onb-new')
  },

  async completeAdminOnboarding() {
    const user = Auth.getUser()
    if (!user) return
    const errEl = document.getElementById('onb-error')
    const showErr = msg => { if (errEl) { errEl.textContent = msg; errEl.style.display = 'block' } }

    const name = document.getElementById('onb-name')?.value?.trim()
    const studioName = document.getElementById('onb-studio')?.value?.trim()
    const studioPhone = document.getElementById('onb-phone')?.value?.trim()
    const currentPw = Utils.normalizePassword(document.getElementById('onb-current-pw')?.value || '')
    const newPw = Utils.normalizePassword(document.getElementById('onb-new-pw')?.value || '')
    const newPw2 = Utils.normalizePassword(document.getElementById('onb-new-pw2')?.value || '')

    if (!name) { showErr('نام مدیر الزامی است'); return }
    if (!studioName) { showErr('نام استودیو الزامی است'); return }
    if (!currentPw) { showErr('رمز فعلی را وارد کنید'); return }
    if (newPw !== newPw2) { showErr('رمز جدید و تکرار آن یکسان نیست'); return }
    if (newPw === currentPw) { showErr('رمز جدید باید متفاوت باشد'); return }

    const pwErr = Auth.validatePassword(newPw)
    if (pwErr) { showErr(pwErr); return }

    const pwResult = await Auth.updatePassword(user.id, currentPw, newPw)
    if (!pwResult.ok) { showErr(pwResult.error || 'خطا در تغییر رمز'); return }

    await SecureDB.update('users', user.id, { name, avatar: name.charAt(0), profileCompleted: true })
    await SecureDB.merge('studioInfo', { name: studioName, phone: studioPhone, manager: name, setupCompleted: true })
    DB.syncPersonnelFromUser(DB.find('users', u => u.id === user.id))
    DB.log('admin_onboarding', `تکمیل پروفایل: ${name}`)
    if (typeof FirstSetup !== 'undefined') FirstSetup.clearLoginHint()
    await DB.flush()

    this._exitOnboardingMode()
    Auth.logout()
    window.location.href = 'index.html?setup=done'
  },

  searchAll(q) {
    AdminTools.searchAll(q)
  },

  async approveCustomerRequest(id) {
    await AdminTools.approveCustomerRequest(id)
  },

  rejectCustomerRequest(id) {
    AdminTools.rejectCustomerRequest(id)
  },

  openTransactionModal(presetType = 'deposit') {
    AdminTools.openTransactionModal(presetType)
  },

  renderSettings(container) {
    AdminTools.renderSettings(container)
  }
})

const AdminTools = {
  searchAll(q) {
    const results = document.getElementById('global-search-results')
    if (!results) return
    q = (q || '').trim().toLowerCase()
    if (!q) { results.innerHTML = ''; return }

    const items = []
    DB.get('contracts').forEach(c => {
      const hay = `${c.couple || ''} ${c.groom || ''} ${c.bride || ''} ${c.contractNum || ''} ${c.groomPhone || ''}`.toLowerCase()
      if (hay.includes(q)) items.push({ type: 'contract', label: c.couple || `${c.groom} و ${c.bride}`, sub: `قرارداد ${c.contractNum}`, action: () => Admin.showSection('contracts') })
    })
    DB.get('users').forEach(u => {
      const hay = `${u.name || ''} ${u.phone || ''}`.toLowerCase()
      if (hay.includes(q)) items.push({ type: 'user', label: u.name, sub: u.phone, action: () => Admin.showSection('users') })
    })
    DB.get('personnel').forEach(p => {
      const hay = `${p.name || ''} ${p.phone || ''}`.toLowerCase()
      if (hay.includes(q)) items.push({ type: 'personnel', label: p.name, sub: p.phone, action: () => Admin.showSection('personnel') })
    })

    results.innerHTML = items.length
      ? items.slice(0, 12).map((r, i) => `<button type="button" class="search-result-item" data-idx="${i}">${Utils.escapeHtml(r.label)}<small>${Utils.escapeHtml(r.sub || '')}</small></button>`).join('')
      : '<div class="search-empty">نتیجه‌ای یافت نشد</div>'

    results.querySelectorAll('[data-idx]').forEach(el => {
      el.addEventListener('click', () => {
        items[+el.dataset.idx]?.action?.()
        Admin.closeGlobalSearch()
      })
    })
  },

  renderFinance(container) {
    AdminSections.renderFinance(container)
  },

  renderSettings(container) {
    const info = DB.get('studioInfo') || {}
    container.innerHTML = `
      <div class="admin-section-header" style="--sec-clr:var(--clr-success)">
        <div class="admin-section-title"><i class="fas fa-sliders"></i> تنظیمات استودیو</div>
      </div>
      <div class="admin-card">
        <div class="admin-card-body">
          <div class="form-group"><label class="form-label">نام استودیو</label><input class="form-input" id="set-name" value="${Utils.escapeHtml(info.name || '')}"/></div>
          <div class="form-group"><label class="form-label">تلفن</label><input class="form-input ltr" id="set-phone" value="${Utils.escapeHtml(info.phone || '')}" dir="ltr"/></div>
          <div class="form-group"><label class="form-label">آدرس</label><textarea class="form-input" id="set-address" rows="2">${Utils.escapeHtml(info.address || '')}</textarea></div>
          <div class="form-group"><label class="form-label">کد عضویت پرسنل</label><input class="form-input ltr" value="${Utils.escapeHtml(info.joinCode || '')}" readonly dir="ltr"/></div>
          <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:16px">
            <button class="btn btn-primary" onclick="AdminTools.saveSettings()"><i class="fas fa-save"></i> ذخیره</button>
            <button class="btn btn-ghost" onclick="AdminTools.exportBackup()"><i class="fas fa-download"></i> پشتیبان</button>
            <button class="btn btn-ghost" onclick="window.location.href='studio-m/'"><i class="fas fa-rocket"></i> Studio M Pro</button>
          </div>
        </div>
      </div>`
  },

  async saveSettings() {
    await SecureDB.merge('studioInfo', {
      name: document.getElementById('set-name')?.value?.trim() || undefined,
      phone: document.getElementById('set-phone')?.value?.trim() || undefined,
      address: document.getElementById('set-address')?.value?.trim() || undefined
    })
    Utils.toast('تنظیمات ذخیره شد', 'success')
    Admin.renderShell()
  },

  exportBackup() {
    const blob = new Blob([DB.exportJSON()], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `studio-backup-${Date.now()}.json`
    a.click()
    Utils.toast('پشتیبان دانلود شد', 'success')
  },

  openTransactionModal(presetType = 'deposit') {
    AdminTools._openTransactionForm(presetType)
  },

  async _openTransactionForm(presetType = 'deposit') {
    const type = presetType === 'withdrawal' ? 'withdrawal' : 'deposit'
    const data = await UiKit.form({
      title: type === 'deposit' ? 'تراکنش واریز' : 'تراکنش برداشت',
      fields: [
        { id: 'amount', label: 'مبلغ (تومان)', type: 'number', required: true, dir: 'ltr', inputmode: 'numeric' },
        { id: 'desc', label: 'شرح', type: 'textarea', rows: 2 }
      ]
    })
    if (!data) return
    const num = +String(data.amount).replace(/[^0-9]/g, '')
    if (!num) return Utils.toast('مبلغ نامعتبر است', 'error')
    await UiKit.withLoading(async () => {
      await SecureDB.insert('transactions', { type, amount: num, desc: data.desc || '', date: Utils.todayJalali() })
    })
    Utils.toast('تراکنش ثبت شد', 'success')
    Admin.invalidateSection('finance')
    Admin.showSection('finance', true)
  },

  async approveCustomerRequest(id) {
    const req = DB.find('customerRequests', r => r.id === id)
    if (!req) return
    const contract = DB.find('contracts', c => c.id === req.contractId)
    const dest = ['photo_select', 'album', 'print'].includes(req.type) ? 'عکس‌خانه' : 'تدوین'
    if (typeof InboxShared !== 'undefined') {
      InboxShared.appendThread(id, {
        author: 'manager',
        authorName: 'مدیر',
        text: `تأیید شد — ارجاع به ${dest}`,
        action: 'approve',
        status: 'sent_to_editing',
        read: true
      })
    } else {
      await SecureDB.update('customerRequests', id, { status: 'sent_to_editing', read: true, approvedAt: Utils.todayJalali() })
    }
    await SecureDB.update('customerRequests', id, { approvedAt: Utils.todayJalali() })

    if (['photo_select', 'album', 'print'].includes(req.type) && typeof PhotoHouse !== 'undefined') {
      if (req.type === 'photo_select') {
        PhotoHouse.upsertPhotoSelection({
          contractId: req.contractId, contractNum: req.contractNum,
          couple: req.customerName || '', maxPhotos: 50, notes: req.text
        })
      }
      if (typeof NotifyHub !== 'undefined') await NotifyHub.customerRequestApproved(req, contract)
      Utils.toast('درخواست به عکس‌خانه ارجاع شد', 'success')
    } else {
      await SecureDB.insert('tasks', {
        title: `درخواست مشتری: ${PortalShared.REQUEST_TYPES[req.type]?.label || ''}`,
        text: req.text, contractId: req.contractId, status: 'pending', createdAt: Utils.todayJalali()
      })
      if (typeof NotifyHub !== 'undefined') await NotifyHub.customerRequestApproved(req, contract)
      Utils.toast('درخواست تأیید شد', 'success')
    }
    Admin.invalidateSection('requests')
    Admin.showSection('requests', true)
  },

  async rejectCustomerRequest(id) {
    if (!(await UiKit.confirm('درخواست رد شود؟', { title: 'رد درخواست', confirmText: 'رد شود', danger: true }))) return
    if (typeof InboxShared !== 'undefined') {
      InboxShared.appendThread(id, {
        author: 'manager',
        authorName: 'مدیر',
        text: 'درخواست رد شد.',
        action: 'reject',
        status: 'rejected',
        read: true
      })
    } else {
    await SecureDB.update('customerRequests', id, { status: 'rejected', read: true })
    }
    Utils.toast('درخواست رد شد', 'info')
    Admin.invalidateSection('requests')
    Admin.showSection('requests', true)
  }
}

window.AdminTools = AdminTools
