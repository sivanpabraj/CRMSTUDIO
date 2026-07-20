/* Studio M — مدیریت پرتال: ادمین · پرسنل · دعوت SMS */

const SMPortalMgmt = {
  _tab: 'all',

  setTab(tab) {
    this._tab = tab
    SM.navigate('portal')
  },

  _users() {
    let list = typeof PortalInvite !== 'undefined' ? PortalInvite.listPortalUsers() : []
    if (this._tab === 'admin') {
      list = list.filter(u => u.portalType === 'admin' || (Access.isManagement(u) && !Access.isStaffOnly(u)))
    } else if (this._tab === 'staff') {
      list = list.filter(u => u.portalType === 'staff' || Access.isStaffOnly(u))
    }
    const q = SM.getModuleSearch('portal')
    if (q) {
      list = list.filter(u =>
        [u.name, u.phone, PortalInvite?.statusLabel(u)].join(' ').toLowerCase().includes(q)
      )
    }
    return list
  },

  render(el) {
    const users = this._users()
    const admins = (PortalInvite?.listPortalUsers() || []).filter(u => u.portalType === 'admin').length
    const staff = (PortalInvite?.listPortalUsers() || []).filter(u => u.portalType === 'staff').length
    const pending = (PortalInvite?.listPortalUsers() || []).filter(u => u.portalStatus === 'pending_verify').length

    el.innerHTML = `
      ${SMUI.sectionHead('مدیریت پرتال', 'ادمین و پرسنل — بدون ثبت‌نام · دعوت با SMS', `
        <button type="button" class="sm-btn sm-btn-ghost" ${SMEvents.attrs('SMPortalMgmt.inviteAdmin')}><i class="fas fa-user-shield"></i> + ادمین</button>
        <button type="button" class="sm-btn sm-btn-primary" ${SMEvents.attrs('SMPortalMgmt.inviteStaff')}><i class="fas fa-user-tie"></i> + پرسنل</button>`)}

      <div class="sm-portal-note">
        <i class="fas fa-info-circle"></i>
        <strong>روش ساده:</strong> نام و موبایل را وارد کنید → همان لحظه یک <strong>کد ورود</strong> می‌گیرید و به کاربر می‌دهید.
        کاربر فقط با همان موبایل + تب «پیامک» در صفحه ورود وارد می‌شود — بدون ثبت‌نام و بدون join.html.
        <a href="../index.html" class="sm-portal-customer-link">صفحه ورود</a>
      </div>

      ${SMUI.statCards([
        { label: 'ادمین پرتال', value: SM.fmt(admins), color: '#5856D6' },
        { label: 'پرسنل پرتال', value: SM.fmt(staff), color: 'var(--sm-accent)' },
        { label: 'منتظر تأیید SMS', value: SM.fmt(pending), color: pending ? 'var(--sm-warning)' : 'var(--sm-success)' },
        { label: 'کل کاربران', value: SM.fmt((PortalInvite?.listPortalUsers() || []).length), color: 'var(--sm-info)' }
      ])}

      ${SMUI.tabs([
        { id: 'all', fa: 'همه', en: 'All', icon: 'fa-users', fn: 'SMPortalMgmt.setTab', args: ['all'] },
        { id: 'admin', fa: 'ادمین', en: 'Admin', icon: 'fa-user-shield', fn: 'SMPortalMgmt.setTab', args: ['admin'] },
        { id: 'staff', fa: 'پرسنل', en: 'Staff', icon: 'fa-user-tie', fn: 'SMPortalMgmt.setTab', args: ['staff'] }
      ], this._tab)}

      ${SMUI.moduleSearch('portal', 'جستجو — نام، موبایل...')}

      <div class="sm-portal-links">
        <a class="sm-btn sm-btn-ghost sm-btn-sm" href="../index.html?view=portal" target="_blank"><i class="fas fa-door-open"></i> پورتال پرسنل</a>
        <a class="sm-btn sm-btn-ghost sm-btn-sm" href="../admin.html?classic=1" target="_blank"><i class="fas fa-table-columns"></i> پنل کلاسیک (legacy)</a>
      </div>

      <div style="margin-top:16px">${users.length ? users.map(u => this._userCard(u)).join('') :
        SMUI.empty('fa-user-plus', 'کاربر پرتالی نیست', 'ادمین یا پرسنل اضافه کنید — SMS دعوت ارسال می‌شود')}</div>`
  },

  _userCard(u) {
    const st = PortalInvite.statusLabel(u)
    const badge = u.portalType === 'admin' ? 'info' : 'success'
    const roles = (u.roles || []).map(r => typeof getRoleTitle === 'function' ? getRoleTitle(r) : r).join('، ')
    const portal = PortalInvite.portalLabel(u)
    return `<div class="sm-portal-user">
      <div class="sm-portal-user-head">
        <div>
          <strong>${SM.esc(u.name || '—')}</strong>
          <div class="sm-portal-user-meta">
            ${SMUI.badge(portal, badge)}
            ${SMUI.badge(st, u.portalStatus === 'pending_verify' ? 'warning' : 'success')}
            <span dir="ltr">${SM.esc(u.phone || '')}</span>
          </div>
        </div>
        <div class="sm-portal-user-actions">
          <button type="button" class="sm-btn sm-btn-sm sm-btn-ghost" ${SMEvents.attrs('SMPortalMgmt.resend', [u.id])} title="ارسال مجدد کد"><i class="fas fa-sms"></i></button>
          <button type="button" class="sm-btn sm-btn-sm sm-btn-ghost" ${SMEvents.attrs('SMPortalMgmt.editUser', [u.id])} title="ویرایش"><i class="fas fa-pen"></i></button>
          <button type="button" class="sm-btn sm-btn-sm sm-btn-ghost" ${SMEvents.attrs('SMPortalMgmt.copyLink', [u.id])} title="کپی لینک"><i class="fas fa-link"></i></button>
          <button type="button" class="sm-btn sm-btn-sm sm-btn-ghost" ${SMEvents.attrs('SMPortalMgmt.deleteUser', [u.id])} title="حذف"><i class="fas fa-trash"></i></button>
        </div>
      </div>
      <div class="sm-portal-user-roles">${SM.esc(roles || '—')}</div>
      <div class="sm-portal-user-foot">
        <span>دعوت: ${SM.esc(u.invitedAt || '—')}</span>
        <a href="${SM.esc(PortalInvite.portalPath(u))}" target="_blank">${SM.esc(portal)} ←</a>
      </div>
    </div>`
  },

  inviteAdmin() {
    if (typeof Access !== 'undefined' &&
      !Access.isSystemAdmin?.(SM.user()) && !Access.isStudioManager?.(SM.user())) {
      return SM.toast('فقط مدیر استودیو مجاز به افزودن ادمین است', 'error')
    }
    const roleOpts = PortalInvite.ADMIN_ROLE_OPTIONS
    SMUI.modal('افزودن ادمین', `
      <p style="font-size:.82rem;color:var(--sm-text-muted);margin:0 0 12px">نام و موبایل کافی است. یک کد ورود ساخته می‌شود — همان را به کاربر بدهید.</p>
      ${SMUI.formField('نام', 'pi-name', { placeholder: 'مثلاً سارا هماهنگ‌کننده' })}
      ${SMUI.formField('موبایل', 'pi-phone', { dir: 'ltr', placeholder: '09...' })}
      ${SMUI.formField('نقش', 'pi-role', { type: 'select', options: roleOpts })}`, {
      width: 480,
      onSave: async () => {
        const d = SMUI.readForm(['pi-name', 'pi-phone', 'pi-role'])
        if (!d['pi-name'] || !d['pi-phone']) return SM.toast('نام و موبایل الزامی است', 'error')
        const res = await PortalInvite.inviteWithCode({
          name: d['pi-name'],
          phone: d['pi-phone'],
          portalType: 'admin',
          roles: [d['pi-role']],
          invitedBy: SM.user()?.name || ''
        })
        if (!res.ok) return SM.toast(res.error, 'error')
        SMUI.closeModal()
        SMPortalMgmt._showInviteCode(res)
        SM.navigate('portal')
      }
    })
  },

  inviteStaff() {
    const roleOpts = PERSONNEL_ROLE_IDS.map(id => ({ value: id, label: getRoleTitle(id) }))
    SMUI.modal('افزودن پرسنل', `
      <p style="font-size:.82rem;color:var(--sm-text-muted);margin:0 0 12px">نام و موبایل کافی است. کد ورود را کپی کنید و به پرسنل بدهید — ورود فقط با پیامک.</p>
      ${SMUI.formField('نام', 'ps-name')}
      ${SMUI.formField('موبایل', 'ps-phone', { dir: 'ltr', placeholder: '09...' })}
      ${SMUI.formField('نقش اصلی', 'ps-role', { type: 'select', options: roleOpts })}`, {
      width: 480,
      onSave: async () => {
        const d = SMUI.readForm(['ps-name', 'ps-phone', 'ps-role'])
        if (!d['ps-name'] || !d['ps-phone']) return SM.toast('نام و موبایل الزامی است', 'error')
        const res = await PortalInvite.inviteWithCode({
          name: d['ps-name'],
          phone: d['ps-phone'],
          portalType: 'staff',
          roles: [d['ps-role']],
          invitedBy: SM.user()?.name || ''
        })
        if (!res.ok) return SM.toast(res.error, 'error')
        SMUI.closeModal()
        SMPortalMgmt._showInviteCode(res)
        SM.navigate('portal')
      }
    })
  },

  _showInviteCode(res) {
    const code = res.code || res.demoCode || '—'
    const phone = res.user?.phone || ''
    const smsNote = res.smsSent
      ? 'پیامک هم ارسال شد.'
      : 'پیامک ارسال نشد — این کد را دستی به کاربر بدهید.'
    SMUI.modal('کد ورود کاربر', `
      <p style="margin:0 0 12px;color:var(--sm-text-muted);font-size:.88rem">${SM.esc(smsNote)}</p>
      <div style="text-align:center;padding:20px;border:2px dashed var(--sm-border);border-radius:14px;margin-bottom:12px">
        <div style="font-size:.75rem;color:var(--sm-text-muted)">موبایل</div>
        <div dir="ltr" style="font-weight:700;margin:4px 0 12px">${SM.esc(phone)}</div>
        <div style="font-size:.75rem;color:var(--sm-text-muted)">کد ورود (۶ رقمی)</div>
        <div dir="ltr" style="font-size:2rem;font-weight:800;letter-spacing:6px;margin-top:6px">${SM.esc(code)}</div>
      </div>
      <p style="font-size:.82rem;color:var(--sm-text-muted);margin:0">کاربر: صفحه ورود → تب پیامک → همین موبایل → همین کد</p>`, {
      width: 420,
      saveLabel: 'کپی کد',
      onSave: () => {
        navigator.clipboard?.writeText(String(code)).then(() => SM.toast('کد کپی شد', 'success')).catch(() => {})
        SMUI.closeModal()
      }
    })
  },

  async resend(userId) {
    const inv = await PortalInvite.sendInvite(userId)
    if (!inv.ok) return SM.toast(inv.error || 'خطا', 'error')
    SMPortalMgmt._showInviteCode({
      code: inv.code || inv.demoCode,
      demoCode: inv.demoCode,
      smsSent: inv.smsSent,
      user: DB.find('users', u => u.id === userId)
    })
  },

  copyLink(userId) {
    const u = DB.find('users', x => x.id === userId)
    if (!u) return
    const url = PortalInvite.portalUrl(u)
    navigator.clipboard?.writeText(url).then(() => SM.toast('لینک کپی شد', 'success')).catch(() => SM.toast(url, 'info'))
  },

  editUser(userId) {
    if (typeof Access !== 'undefined' && !Access.canManageUsers?.(SM.user()) && !Access.canManageStudioOps?.(SM.user())) {
      return SM.toast('دسترسی کافی ندارید', 'error')
    }
    const u = DB.find('users', x => x.id === userId && !x._deleted)
    if (!u) return
    const isAdmin = u.portalType === 'admin'
    const roleOpts = isAdmin
      ? PortalInvite.ADMIN_ROLE_OPTIONS
      : PERSONNEL_ROLE_IDS.map(id => ({ value: id, label: getRoleTitle(id) }))
    const currentRole = (u.roles || [])[0] || (isAdmin ? 'office_secretary' : 'other')
    SMUI.modal('ویرایش کاربر پرتال', `
      ${SMUI.formField('نام', 'eu-name', { value: u.name || '' })}
      ${SMUI.formField('موبایل', 'eu-phone', { value: u.phone || '', dir: 'ltr' })}
      ${SMUI.formField('نقش', 'eu-role', { type: 'select', value: currentRole, options: roleOpts })}
      ${SMUI.formField('وضعیت', 'eu-status', { type: 'select', value: u.status || 'active', options: [
        { value: 'active', label: 'فعال' },
        { value: 'inactive', label: 'غیرفعال' }
      ]})}
    `, {
      width: 480,
      onSave: async () => {
        const d = SMUI.readForm(['eu-name', 'eu-phone', 'eu-role', 'eu-status'])
        const phone = Utils.normalizePhone(d['eu-phone'])
        if (!d['eu-name'] || !Utils.isValidPhone(phone)) return SM.toast('نام و موبایل معتبر الزامی است', 'error')
        const dup = DB.find('users', x => x.id !== userId && Utils.normalizePhone(x.phone) === phone)
        if (dup) return SM.toast('این موبایل برای کاربر دیگری است', 'error')
        await SecureDB.update('users', userId, {
          name: d['eu-name'].trim(),
          phone,
          roles: normalizeRoles([d['eu-role']]),
          status: d['eu-status']
        })
        const person = DB.findPersonnelByPhone(phone) || DB.find('personnel', p => p.userId === userId)
        if (person) {
          await SecureDB.update('personnel', person.id, {
            name: d['eu-name'].trim(),
            phone,
            roles: normalizeRoles([d['eu-role']]),
            status: d['eu-status'] === 'active' ? 'active' : 'inactive'
          })
        }
        SMUI.closeModal()
        SM.toast('ذخیره شد', 'success')
        SM.navigate('portal')
      },
      onDelete: () => SMPortalMgmt.deleteUser(userId)
    })
  },

  async deleteUser(userId) {
    if (typeof Access !== 'undefined' &&
      !Access.isSystemAdmin?.(SM.user()) && !Access.isStudioManager?.(SM.user())) {
      return SM.toast('فقط مدیر استودیو مجاز به حذف کاربر است', 'error')
    }
    const u = DB.find('users', x => x.id === userId && !x._deleted)
    if (!u) return
    if (!confirm(`حذف «${u.name || u.phone}»؟`)) return
    await SecureDB.delete('users', userId)
    const person = DB.find('personnel', p => p.userId === userId || Utils.normalizePhone(p.phone) === Utils.normalizePhone(u.phone))
    if (person && confirm('پرسنل متناظر هم حذف شود؟')) {
      await SecureDB.delete('personnel', person.id)
    }
    SMUI.closeModal?.()
    SM.toast('حذف شد', 'success')
    SM.navigate('portal')
  }
}

SMModules.portal = {
  setTab(tab) { SMPortalMgmt.setTab(tab) },
  render(el) { SMPortalMgmt.render(el) }
}

window.SMPortalMgmt = SMPortalMgmt
