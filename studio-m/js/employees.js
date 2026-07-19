/* Studio M — پرسنل: چند نقش، حقوق، رنگ، قرارداد همکاری + SMS */

const SMEmployees = {
  _tab: 'list',
  PERSON_COLORS: ['#0071E3', '#5856D6', '#009688', '#E68619', '#34C759', '#00A3BF', '#FF375F', '#BF5AF2', '#64748B'],

  setTab(tab) {
    this._tab = tab
    SM.navigate('employees')
  },

  _color(p, i) {
    if (p.color) return p.color
    const roles = normalizeRoles(p.roles || [])
    if (roles.length && typeof getRoleColor === 'function') return getRoleColor(roles[0])
    return this.PERSON_COLORS[i % this.PERSON_COLORS.length]
  },

  _roleBadges(roles) {
    return normalizeRoles(roles || []).map(r => {
      const title = typeof getRoleTitle === 'function' ? getRoleTitle(r) : r
      const color = typeof getRoleColor === 'function' ? getRoleColor(r) : '#64748B'
      return `<span class="sm-emp-role-badge" style="--role-color:${color}">${SM.esc(title)}</span>`
    }).join('')
  },

  _paySummary(p) {
    const parts = []
    if (p.payMonthly) parts.push(`ماهانه ${SM.fmt(p.salaryMonthly || p.salary || 0)}`)
    if (p.payPerProject) {
      const ra = p.roleAmounts || {}
      const vals = Object.entries(ra).filter(([, v]) => v > 0).map(([k, v]) =>
        `${typeof getRoleTitle === 'function' ? getRoleTitle(k) : k}: ${SM.fmt(v)}`)
      if (vals.length) parts.push(`پروژه‌ای (${vals.join(' · ')})`)
      else parts.push('پروژه‌ای')
    }
    if (p.payMonthlyPercent && p.monthlyProjectPercent) {
      parts.push(`درصد ماهانه ${p.monthlyProjectPercent}٪`)
    }
    return parts.join(' + ') || '—'
  },

  render(el) {
    if (SM.state.viewStack.length) return
    el.innerHTML = `
      ${SMUI.sectionHead('پرسنل', 'چند نقش · حقوق ماهانه و پروژه‌ای · تأیید قرارداد', `
        <button class="sm-btn sm-btn-primary" onclick="SMEmployees.add()"><i class="fas fa-plus"></i> افزودن پرسنل</button>`)}
      ${this._tab === 'list' ? SMUI.moduleSearch('employees', 'جستجو — نام، موبایل، نقش...') : ''}
      ${SMUI.tabs([
        { id: 'list', fa: 'لیست پرسنل', en: 'List', icon: 'fa-list', onclick: "SMEmployees.setTab('list')" },
        { id: 'approvals', fa: 'تأیید قراردادها', en: 'Approvals', icon: 'fa-file-signature', onclick: "SMEmployees.setTab('approvals')" },
        { id: 'stats', fa: 'آمار', en: 'Stats', icon: 'fa-chart-pie', onclick: "SMEmployees.setTab('stats')" }
      ], this._tab)}
      <div style="margin-top:16px">${this._renderTab()}</div>`
  },

  _renderTab() {
    if (this._tab === 'approvals') return this._approvalsHtml()
    if (this._tab === 'stats') return this._statsHtml()
    return this._listHtml()
  },

  _listHtml() {
    const personnel = SMH.filterBySearch(DB.active('personnel'), ['name', 'phone', 'notes'], 'employees')
    if (!personnel.length) {
      return SMUI.empty('fa-users', 'پرسنلی ثبت نشده', 'نام، موبایل، نقش‌ها و نحوه پرداخت را اضافه کنید')
    }
    return `<div class="sm-emp-list">${personnel.map((p, i) => this._card(p, i)).join('')}</div>`
  },

  _card(p, i) {
    const color = this._color(p, i)
    const contract = this._latestContract(p.id)
    const contractBadge = contract?.status === 'verified'
      ? SMUI.badge('قرارداد تأییدشده', 'success')
      : contract?.status === 'pending' || contract?.status === 'sms_sent'
        ? SMUI.badge('در انتظار تأیید', 'warning') : ''

    return `<div class="sm-emp-card" style="--emp-color:${color}" onclick="SMEmployees.view('${p.id}')">
      <div class="sm-emp-stripe"></div>
      <div class="sm-emp-avatar" style="background:color-mix(in srgb, ${color} 18%, transparent);color:${color}">${SM.esc((p.name || '?').charAt(0))}</div>
      <div class="sm-emp-body">
        <div class="sm-emp-name">${SM.esc(p.name)}</div>
        <div class="sm-emp-roles">${this._roleBadges(p.roles)}</div>
        <div class="sm-emp-meta">
          <span dir="ltr">${SM.esc(p.phone || '—')}</span>
          <span>${SM.esc(this._paySummary(p))}</span>
        </div>
      </div>
      <div class="sm-emp-side">
        ${contractBadge}
        ${SMUI.badge(p.status === 'active' ? 'فعال' : 'غیرفعال', p.status === 'active' ? 'success' : 'muted')}
        <button type="button" class="sm-btn sm-btn-sm sm-btn-ghost" onclick="event.stopPropagation();SMEmployees.edit('${p.id}')"><i class="fas fa-pen"></i></button>
      </div>
    </div>`
  },

  _latestContract(personnelId) {
    return (DB.active('persContracts') || [])
      .filter(c => c.personnelId === personnelId && c.type === 'employment')
      .sort((a, b) => String(b.sentAt || b.createdAt || '').localeCompare(String(a.sentAt || a.createdAt || '')))[0]
  },

  _approvalsHtml() {
    const contracts = (DB.active('persContracts') || []).filter(c => c.type === 'employment')
      .sort((a, b) => String(b.sentAt || '').localeCompare(String(a.sentAt || '')))
    if (!contracts.length) {
      return SMUI.empty('fa-file-signature', 'قرارداد همکاری ارسال نشده', 'از صفحه پرسنل → «ارسال قرارداد به پنل» استفاده کنید')
    }
    return `<div class="sm-emp-contract-list">${contracts.map(c => {
      const p = DB.find('personnel', x => x.id === c.personnelId)
      const st = { pending: 'در انتظار', sms_sent: 'کد ارسال شد', verified: 'تأیید شده', rejected: 'رد شده' }[c.status] || c.status
      const stType = c.status === 'verified' ? 'success' : c.status === 'rejected' ? 'danger' : 'warning'
      return `<div class="sm-emp-contract-row">
        <div>
          <strong>${SM.esc(p?.name || c.personnelName || '—')}</strong>
          <div class="sm-emp-meta">${SM.esc(c.paySummary || '—')}</div>
          <div class="sm-emp-meta">ارسال: ${SM.esc(c.sentAt || '—')}${c.verification?.verifiedAt ? ` · تأیید: ${SM.esc(c.verification.verifiedAt)}` : ''}</div>
        </div>
        <div>${SMUI.badge(st, stType)}</div>
      </div>`
    }).join('')}</div>`
  },

  _statsHtml() {
    const personnel = DB.active('personnel')
    const active = personnel.filter(p => p.status === 'active')
    const byRole = {}
    active.forEach(p => {
      normalizeRoles(p.roles || []).forEach(r => {
        const t = typeof getRoleTitle === 'function' ? getRoleTitle(r) : r
        byRole[t] = (byRole[t] || 0) + 1
      })
    })
    const monthlyTotal = active.filter(p => p.payMonthly).reduce((s, p) => s + (p.salaryMonthly || p.salary || 0), 0)
    return `${SMUI.statCards([
      { label: 'کل پرسنل', value: SM.fmt(personnel.length), color: 'var(--sm-accent)' },
      { label: 'فعال', value: SM.fmt(active.length), color: 'var(--sm-success)' },
      { label: 'حقوق ماهانه', value: SM.fmt(monthlyTotal), color: 'var(--sm-warning)' },
      { label: 'قرارداد تأییدشده', value: SM.fmt((DB.active('persContracts') || []).filter(c => c.type === 'employment' && c.status === 'verified').length), color: 'var(--sm-info)' }
    ])}
    <div class="sm-card" style="margin-top:16px"><div class="sm-card-head"><div class="sm-card-title">توزیع نقش‌ها</div></div>
      <div class="sm-card-body">${Object.keys(byRole).length ? Object.entries(byRole).map(([role, count]) =>
        `<div style="display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--sm-border)"><span>${SM.esc(role)}</span>${SMUI.badge(String(count), 'info')}</div>`
      ).join('') : SMUI.empty('fa-users', 'داده‌ای نیست')}</div></div>`
  },

  view(id) {
    const p = DB.find('personnel', x => x.id === id)
    if (!p) return
    const projects = DB.filter('persProjects', pr => pr.personnelId === id)
    const contract = this._latestContract(id)
    const color = this._color(p, 0)

    SM.pushSubView(p.name, () => `
      <div class="sm-emp-view-head" style="--emp-color:${color}">
        <div class="sm-emp-view-avatar">${SM.esc((p.name || '?').charAt(0))}</div>
        <div>
          <h2>${SM.esc(p.name)}</h2>
          <div class="sm-emp-roles">${this._roleBadges(p.roles)}</div>
        </div>
      </div>
      <div class="sm-grid-2">
        <div class="sm-card"><div class="sm-card-head">
          <div class="sm-card-title">اطلاعات و پرداخت</div>
          <button class="sm-btn sm-btn-sm sm-btn-primary" onclick="SMEmployees.edit('${p.id}')"><i class="fas fa-pen"></i></button>
        </div><div class="sm-card-body">
          <p><strong>موبایل:</strong> <span dir="ltr">${SM.esc(p.phone || '—')}</span></p>
          <p style="margin-top:8px"><strong>نحوه پرداخت:</strong> ${SM.esc(this._paySummary(p))}</p>
          <p style="margin-top:8px"><strong>وضعیت:</strong> ${SMUI.badge(p.status === 'active' ? 'فعال' : 'غیرفعال', p.status === 'active' ? 'success' : 'muted')}</p>
          <p style="margin-top:8px"><strong>پروژه‌ها:</strong> ${p.jobs || 0}</p>
          ${p.notes ? `<p style="margin-top:8px"><strong>یادداشت:</strong> ${SM.esc(p.notes)}</p>` : ''}
        </div></div>
        <div class="sm-card"><div class="sm-card-head"><div class="sm-card-title">قرارداد همکاری</div></div>
          <div class="sm-card-body">
            ${contract ? `
              <p>${SMUI.badge(contract.status === 'verified' ? 'تأیید شده' : contract.status === 'sms_sent' ? 'منتظر کد SMS' : 'ارسال‌شده', contract.status === 'verified' ? 'success' : 'warning')}</p>
              <p style="margin-top:8px;font-size:.85rem;color:var(--sm-text-muted)">${SM.esc(contract.paySummary || '')}</p>
              <p style="margin-top:8px;font-size:.82rem">ارسال: ${SM.esc(contract.sentAt || '—')}</p>
            ` : '<p class="sm-emp-meta">هنوز قرارداد همکاری ارسال نشده</p>'}
            <button type="button" class="sm-btn sm-btn-primary sm-btn-sm" style="margin-top:12px" onclick="SMEmployees.sendContract('${p.id}')">
              <i class="fas fa-paper-plane"></i> ${contract?.status === 'verified' ? 'ارسال مجدد قرارداد' : 'ارسال قرارداد به پنل پرسنل'}
            </button>
          </div></div>
      </div>
      <div class="sm-card" style="margin-top:16px"><div class="sm-card-head"><div class="sm-card-title">پروژه‌های اخیر</div></div>
        <div class="sm-card-body">${projects.length ? projects.slice(0, 8).map(pr => `
          <div style="padding:10px 0;border-bottom:1px solid var(--sm-border)">
            <strong>${SM.esc(pr.couple || pr.contractName || '—')}</strong>
            <div style="font-size:.78rem;color:var(--sm-text-muted)">${SM.esc(pr.role || '')} — ${SM.fmt(pr.amount || 0)} تومان</div>
          </div>`).join('') : SMUI.empty('fa-briefcase', 'پروژه‌ای ثبت نشده')}</div>
      </div>`)
  },

  add() { this._form(null) },
  edit(id) { this._form(DB.find('personnel', p => p.id === id)) },

  _roleCheckboxes(selected) {
    const sel = new Set(normalizeRoles(selected || []))
    const roles = typeof getPersonnelRoles === 'function' ? getPersonnelRoles() : []
    return `<div class="sm-emp-role-grid">${roles.map(r => {
      const color = typeof getRoleColor === 'function' ? getRoleColor(r.id) : '#64748B'
      const checked = sel.has(r.id) ? ' checked' : ''
      return `<label class="sm-emp-role-check" style="--role-color:${color}">
        <input type="checkbox" name="emp-roles" value="${r.id}"${checked}/>
        <span>${SM.esc(r.emoji)} ${SM.esc(r.title)}</span>
      </label>`
    }).join('')}</div>`
  },

  _roleAmountFields(roles, roleAmounts) {
    const sel = normalizeRoles(roles || [])
    if (!sel.length) return ''
    return `<div id="emp-role-prices" class="sm-emp-role-prices">
      <div class="sm-label">مبلغ هر نقش (پروژه‌ای — تومان)</div>
      ${sel.map(r => {
        const title = typeof getRoleTitle === 'function' ? getRoleTitle(r) : r
        const val = (roleAmounts || {})[r] || ''
        return SMUI.formField(title, `emp-rate-${r}`, { type: 'number', value: val, dir: 'ltr', placeholder: 'مثلاً ۵۰۰۰۰۰۰' })
      }).join('')}
    </div>`
  },

  _form(item) {
    const roles = normalizeRoles(item?.roles || [])
    SMUI.modal(item ? 'ویرایش پرسنل' : 'پرسنل جدید', `
      ${SMUI.formField('نام و نام‌خانوادگی', 'emp-name', { value: item?.name || '' })}
      ${SMUI.formField('موبایل', 'emp-phone', { value: item?.phone || '', dir: 'ltr' })}
      <div class="sm-form-group"><label class="sm-label">نقش‌ها (چندتایی)</label>${this._roleCheckboxes(item?.roles)}</div>
      <label class="sm-check-row"><input type="checkbox" id="emp-pay-monthly" ${item?.payMonthly !== false ? 'checked' : ''}/> حقوق ماهانه</label>
      ${SMUI.formField('مبلغ حقوق ماهانه (تومان)', 'emp-salary', { type: 'number', value: item?.salaryMonthly ?? item?.salary ?? '', dir: 'ltr' })}
      <label class="sm-check-row"><input type="checkbox" id="emp-pay-project" ${item?.payPerProject ? 'checked' : ''}/> پرداخت پروژه‌ای (هر مراسم / پروژه)</label>
      <div id="emp-role-price-wrap">${item?.payPerProject ? this._roleAmountFields(roles, item?.roleAmounts) : ''}</div>
      <label class="sm-check-row"><input type="checkbox" id="emp-pay-pct" ${item?.payMonthlyPercent ? 'checked' : ''}/> سهم درصدی از پروژه‌های ماهانه</label>
      ${SMUI.formField('درصد ماهانه', 'emp-pct', { type: 'number', value: item?.monthlyProjectPercent || '', dir: 'ltr', placeholder: 'مثلاً ۱۵' })}
      ${SMUI.formField('وضعیت', 'emp-status', { type: 'select', value: item?.status || 'active', options: [
        { value: 'active', label: 'فعال' }, { value: 'inactive', label: 'غیرفعال' }
      ]})}
      ${SMUI.formField('یادداشت', 'emp-notes', { type: 'textarea', value: item?.notes || '' })}`, {
      width: 560,
      onSave: () => this._saveForm(item),
      onDelete: item ? () => SMH.remove('personnel', item.id, 'employees') : null
    })

    const syncPrices = () => {
      const checked = [...document.querySelectorAll('input[name="emp-roles"]:checked')].map(x => x.value)
      const wrap = document.getElementById('emp-role-price-wrap')
      const show = document.getElementById('emp-pay-project')?.checked
      if (wrap && show) {
        wrap.innerHTML = this._roleAmountFields(checked, item?.roleAmounts)
      } else if (wrap) wrap.innerHTML = ''
    }
    document.querySelectorAll('input[name="emp-roles"]').forEach(el => el.addEventListener('change', syncPrices))
    document.getElementById('emp-pay-project')?.addEventListener('change', syncPrices)
  },

  async _saveForm(item) {
    const d = SMUI.readForm(['emp-name', 'emp-phone', 'emp-salary', 'emp-pct', 'emp-status', 'emp-notes'])
    if (!d['emp-name']) return SM.toast('نام الزامی است', 'error')
    const phone = typeof Utils !== 'undefined' ? Utils.normalizePhone(d['emp-phone']) : d['emp-phone']
    const roles = [...document.querySelectorAll('input[name="emp-roles"]:checked')].map(x => x.value)
    if (!roles.length) return SM.toast('حداقل یک نقش انتخاب کنید', 'error')

    const roleAmounts = {}
    roles.forEach(r => {
      const el = document.getElementById(`emp-rate-${r}`)
      if (el && el.value) roleAmounts[r] = +el.value || 0
    })

    const idx = item ? DB.active('personnel').findIndex(x => x.id === item.id) : DB.active('personnel').length
    const data = {
      name: d['emp-name'],
      phone,
      roles: normalizeRoles(roles),
      color: item?.color || this.PERSON_COLORS[idx % this.PERSON_COLORS.length],
      payMonthly: document.getElementById('emp-pay-monthly')?.checked !== false,
      salaryMonthly: +d['emp-salary'] || 0,
      salary: +d['emp-salary'] || 0,
      payPerProject: !!document.getElementById('emp-pay-project')?.checked,
      payMonthlyPercent: !!document.getElementById('emp-pay-pct')?.checked,
      monthlyProjectPercent: +d['emp-pct'] || 0,
      roleAmounts,
      salaryType: document.getElementById('emp-pay-project')?.checked && document.getElementById('emp-pay-monthly')?.checked
        ? 'mixed' : document.getElementById('emp-pay-project')?.checked ? 'project' : 'monthly',
      status: d['emp-status'],
      notes: d['emp-notes']
    }

    if (item) {
      DB.update('personnel', item.id, data)
      SMUI.closeModal()
      if (SM.state.viewStack.length) {
        SM.state.viewStack.pop()
        this.view(item.id)
      } else SM.navigate('employees')
      SM.toast('ذخیره شد', 'success')
      return
    }

    if (phone && DB.active('personnel').some(p => p.phone === phone)) {
      return SM.toast('این موبایل قبلاً ثبت شده', 'error')
    }
    DB.insert('personnel', { ...data, jobs: 0 })
    SMUI.closeModal()
    SM.navigate('employees')
    SM.toast('پرسنل ذخیره شد', 'success')

    if (phone && typeof PortalInvite !== 'undefined' && PortalInvite.inviteWithCode) {
      const existingUser = DB.find('users', u => Utils.normalizePhone(u.phone) === phone)
      if (!existingUser) {
        const inv = await PortalInvite.inviteWithCode({
          name: data.name,
          phone,
          portalType: 'staff',
          roles: data.roles,
          invitedBy: SM.user()?.name || ''
        })
        if (inv.ok && typeof SMPortalMgmt !== 'undefined' && SMPortalMgmt._showInviteCode) {
          SMPortalMgmt._showInviteCode(inv)
        } else if (inv.ok) {
          SM.toast(`کد ورود: ${inv.code || inv.demoCode}`, 'info', 12000)
        } else {
          SM.toast(inv.error || 'پرسنل ذخیره شد ولی کد ورود ساخته نشد', 'warning')
        }
      }
    }
  },

  async sendContract(personnelId) {
    const p = DB.find('personnel', x => x.id === personnelId)
    if (!p?.phone) return SM.toast('موبایل پرسنل الزامی است', 'error')

    const studio = SM.studio().name || 'استودیو'
    const paySummary = this._paySummary(p)
    const roleList = normalizeRoles(p.roles || []).map(r => typeof getRoleTitle === 'function' ? getRoleTitle(r) : r).join('، ')
    const code = Utils.generateOtp6()
    const today = Utils.todayJalali()

    const contractBody = `قرارداد همکاری بین ${studio} و ${p.name} — نقش: ${roleList} — ${paySummary}`

    const contract = DB.insert('persContracts', {
      type: 'employment',
      personnelId: p.id,
      personnelName: p.name,
      studioName: studio,
      roles: p.roles,
      paySummary,
      body: contractBody,
      salaryMonthly: p.salaryMonthly || p.salary || 0,
      payMonthly: p.payMonthly,
      payPerProject: p.payPerProject,
      roleAmounts: p.roleAmounts || {},
      monthlyProjectPercent: p.monthlyProjectPercent,
      status: 'sms_sent',
      sentAt: today,
      verification: { code, sentAt: today, verified: false, phone: p.phone }
    })

    const smsText = `${studio}: قرارداد همکاری شما ثبت شد. کد تأیید: ${code}`
    if (typeof SmsProvider !== 'undefined' && SmsProvider.isConfigured()) {
      const res = await SmsProvider.sendStudio(p.phone, smsText)
      if (!res.ok) {
        SM.toast(res.error || 'خطا در SMS', 'error')
        return
      }
    } else {
      SM.toast(`SMS تنظیم نشده — کد تست: ${code}`, 'info')
    }

    DB.update('persContracts', contract.id, { status: 'sms_sent' })
    SM.toast('قرارداد به پنل پرسنل ارسال شد', 'success')
    if (SM.state.viewStack.length) {
      SM.state.viewStack.pop()
      this.view(personnelId)
    } else SM.navigate('employees')
  }
}

SMModules.employees = {
  setTab(tab) { SMEmployees.setTab(tab) },
  render(el) { SMEmployees.render(el) },
  add() { SMEmployees.add() },
  edit(id) { SMEmployees.edit(id) },
  view(id) { SMEmployees.view(id) }
}

window.SMEmployees = SMEmployees
