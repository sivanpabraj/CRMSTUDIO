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
    const allPersonnel = DB.get('personnel') || []
    const pendingRequests = allPersonnel.filter(p => p.status === 'pending_approval' || p.status === 'pending')
    const activePersonnel = SMH.filterBySearch(allPersonnel.filter(p => p.status !== 'pending_approval' && p.status !== 'pending'), ['name', 'phone', 'notes'], 'employees')

    let pendingHtml = ''
    if (pendingRequests.length) {
      pendingHtml = `
        <div class="sm-card" style="margin-bottom:20px;border:1px solid #f59e0b;background:linear-gradient(180deg, rgba(245,158,11,0.08) 0%, rgba(20,20,24,0.6) 100%)">
          <div class="sm-card-head" style="border-bottom:1px solid rgba(245,158,11,0.2)">
            <div class="sm-card-title" style="color:#f59e0b;display:flex;align-items:center;gap:8px">
              <i class="fas fa-user-clock"></i> درخواست‌های جدید اتصال پرسنل (تأیید دوطرفه)
            </div>
            <span class="sm-badge sm-badge-warning">${pendingRequests.length} درخواست</span>
          </div>
          <div class="sm-card-body" style="display:flex;flex-direction:column;gap:12px">
            ${pendingRequests.map(p => `
              <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;padding:12px;background:rgba(255,255,255,0.03);border-radius:10px;border:1px solid rgba(255,255,255,0.08)">
                <div>
                  <strong style="font-size:1rem">${SM.esc(p.name)}</strong>
                  <div style="font-size:12px;color:var(--sm-text-muted);margin-top:4px">
                    <span dir="ltr">${SM.esc(p.phone || '—')}</span> · نقش انتخابی: <strong>${SM.esc(p.role || (p.roles || []).join('، ') || 'همکار')}</strong>
                  </div>
                  <div style="font-size:11px;color:rgba(255,255,255,0.4);margin-top:2px">ثبت‌نام با کد اختصاصی استودیو</div>
                </div>
                <div style="display:flex;gap:8px">
                  <button type="button" class="sm-btn sm-btn-primary sm-btn-sm" onclick="SMEmployees.approvePendingStaff('${p.id}')">
                    <i class="fas fa-check"></i> تأیید اتصال و عضویت
                  </button>
                  <button type="button" class="sm-btn sm-btn-ghost sm-btn-sm" style="color:#ef4444" onclick="SMEmployees.rejectPendingStaff('${p.id}')">
                    <i class="fas fa-times"></i> رد
                  </button>
                </div>
              </div>`).join('')}
          </div>
        </div>
      `
    }

    if (!activePersonnel.length && !pendingRequests.length) {
      return SMUI.empty('fa-users', 'پرسنلی ثبت نشده', 'نام، موبایل، نقش‌ها و نحوه پرداخت را اضافه کنید')
    }
    return pendingHtml + `<div class="sm-emp-list">${activePersonnel.map((p, i) => this._card(p, i)).join('')}</div>`
  },

  async approvePendingStaff(personnelId) {
    const p = DB.find('personnel', x => x.id === personnelId)
    if (!p) return SM.toast('همکار یافت نشد', 'error')

    await SecureDB.update('personnel', p.id, { status: 'active', approvedAt: Utils.todayJalali() })
    const user = DB.find('users', u => u.phone && Utils.normalizePhone(u.phone) === Utils.normalizePhone(p.phone))
    if (user) {
      await SecureDB.update('users', user.id, { status: 'active', portalStatus: 'active' })
    }
    if (typeof window !== 'undefined' && window.ServerSync?.pushNow) {
      window.ServerSync.pushNow().catch(() => {})
    }
    SM.toast(`همکار گرامی «${p.name}» تأیید و فعال شد ✓`, 'success')
    SM.navigate('employees')
  },

  async rejectPendingStaff(personnelId) {
    if (!confirm('آیا از رد این درخواست اتصال مطمئن هستید؟')) return
    const p = DB.find('personnel', x => x.id === personnelId)
    if (!p) return
    await SecureDB.remove('personnel', p.id)
    const user = DB.find('users', u => u.phone && Utils.normalizePhone(u.phone) === Utils.normalizePhone(p.phone))
    if (user && (user.status === 'pending_approval' || user.status === 'pending')) {
      await SecureDB.remove('users', user.id)
    }
    if (typeof window !== 'undefined' && window.ServerSync?.pushNow) {
      window.ServerSync.pushNow().catch(() => {})
    }
    SM.toast('درخواست اتصال رد شد', 'info')
    SM.navigate('employees')
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
    return (DB.get('persContracts') || [])
      .filter(c => c.personnelId === personnelId && c.type === 'employment')
      .sort((a, b) => String(b.sentAt || b.createdAt || '').localeCompare(String(a.sentAt || a.createdAt || '')))[0]
  },

  _approvalsHtml() {
    const contracts = (DB.get('persContracts') || []).filter(c => c.type === 'employment')
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
        <div style="display:flex;align-items:center;gap:8px">
          ${SMUI.badge(st, stType)}
          <button type="button" class="sm-btn sm-btn-sm sm-btn-primary" onclick="SMEmployees.showContractModal('${c.personnelId}')" title="مشاهده و چاپ قرارداد رسمی"><i class="fas fa-print"></i></button>
        </div>
      </div>`
    }).join('')}</div>`
  },

  _statsHtml() {
    const personnel = DB.get('personnel')
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
      { label: 'قرارداد تأییدشده', value: SM.fmt((DB.get('persContracts') || []).filter(c => c.type === 'employment' && c.status === 'verified').length), color: 'var(--sm-info)' }
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
            <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:14px">
              <button type="button" class="sm-btn sm-btn-primary sm-btn-sm" onclick="SMEmployees.showContractModal('${p.id}')">
                <i class="fas fa-file-contract"></i> مشاهده و چاپ قرارداد رسمی
              </button>
              <button type="button" class="sm-btn sm-btn-ghost sm-btn-sm" onclick="SMEmployees.sendContract('${p.id}')">
                <i class="fas fa-paper-plane"></i> ${contract?.status === 'verified' ? 'ارسال مجدد به پنل' : 'ارسال به پنل پرسنل'}
              </button>
            </div>
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

    const idx = item ? DB.get('personnel').findIndex(x => x.id === item.id) : DB.get('personnel').length
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

    if (phone && DB.get('personnel').some(p => p.phone === phone)) {
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

    const contract = await SecureDB.insert('persContracts', {
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

    // Ensure user record exists with portal credentials
    let empUser = DB.find('users', u => u.phone && Utils.normalizePhone(u.phone) === Utils.normalizePhone(p.phone))
    if (!empUser && typeof PortalInvite !== 'undefined') {
      try {
        const inv = await PortalInvite.createForPersonnel(p)
        if (inv?.user) empUser = inv.user
      } catch { /* ignore */ }
    }
    if (empUser) {
      await SecureDB.update('users', empUser.id, {
        portalOtp: {
          code,
          sentAt: new Date().toISOString(),
          phone: p.phone,
          verified: false
        }
      })
    }

    // Try sending SMS in background without blocking contract registration
    const smsText = `${studio}: قرارداد همکاری شما ثبت شد. کد ورود پورتال: ${code}\nجهت بررسی و امضای دیجیتال وارد پنل شوید:\nhttp://studiomandani.ir/app/index.html?view=portal`
    if (typeof SmsProvider !== 'undefined' && SmsProvider.isConfigured()) {
      SmsProvider.sendStudio(p.phone, smsText)
        .then(res => {
          if (!res?.ok) console.warn('[SMS] contract notification warning:', res?.error)
        })
        .catch(err => console.warn('[SMS] error:', err))
    }

    if (typeof window !== 'undefined' && window.ServerSync?.pushNow) {
      window.ServerSync.pushNow().catch(() => {})
    }

    SM.toast('قرارداد همکاری با موفقیت در پنل پرسنل ثبت شد ✓', 'success')
    if (SM.state.viewStack.length) {
      SM.state.viewStack.pop()
      this.view(personnelId)
    } else SM.navigate('employees')
  },

  showContractModal(personnelId) {
    const p = DB.find('personnel', x => x.id === personnelId)
    if (!p) return SM.toast('همکار یافت نشد', 'error')

    const studio = SM.studio()
    const studioName = studio.name || 'استودیو'
    const managerName = studio.manager || 'مدیریت استودیو'
    const studioPhone = studio.phone || '—'
    const studioAddress = studio.address || '—'
    const today = Utils.todayJalali()
    const contract = this._latestContract(personnelId)
    const roles = normalizeRoles(p.roles || []).map(r => typeof getRoleTitle === 'function' ? getRoleTitle(r) : r).join('، ') || 'همکار تخصصی'
    const paySummary = this._paySummary(p)

    const contractHtml = `
      <div class="sm-printable-contract" id="sm-personnel-contract-doc" dir="rtl">
        <div class="sm-pcontract-header">
          <div class="sm-pcontract-logo">
            ${studio.logo ? (Utils.safeImgHtml(studio.logo, 'style="max-height:60px;max-width:110px;object-fit:contain"') || '<i class="fas fa-camera" style="font-size:2rem;color:var(--sm-accent)"></i>') : '<i class="fas fa-camera" style="font-size:2rem;color:var(--sm-accent)"></i>'}
          </div>
          <div class="sm-pcontract-title-wrap">
            <h2 class="sm-pcontract-title">قرارداد همکاری تخصصی و اجرایی استودیو</h2>
            <div class="sm-pcontract-sub">تنظیم‌شده مطابق مقررات داخلی ${SM.esc(studioName)}</div>
          </div>
          <div class="sm-pcontract-meta">
            <div><strong>شماره:</strong> <span dir="ltr">${contract?.id ? SM.esc(contract.id.slice(-8).toUpperCase()) : 'EMP-' + Date.now().toString().slice(-6)}</span></div>
            <div><strong>تاریخ:</strong> <span>${SM.esc(contract?.sentAt || today)}</span></div>
            <div><strong>وضعیت:</strong> <span>${contract?.status === 'verified' ? 'تأییدشده و معتبر' : 'پیش‌نویس / در انتظار'}</span></div>
          </div>
        </div>

        <div class="sm-pcontract-body">
          <div class="sm-pcontract-section">
            <h4 class="sm-pcontract-sec-title">ماده ۱: مشخصات طرفین قرارداد</h4>
            <p><strong>طرف اول (کارفرما / استودیو):</strong> ${SM.esc(studioName)} به مدیریت جناب آقای/سرکار خانم <strong>${SM.esc(managerName)}</strong> به شماره تماس <span dir="ltr">${SM.esc(studioPhone)}</span>${studioAddress !== '—' ? ` و نشانی ${SM.esc(studioAddress)}` : ''}.</p>
            <p><strong>طرف دوم (همکار / مجری):</strong> جناب آقای/سرکار خانم <strong>${SM.esc(p.name)}</strong> به شماره همراه <span dir="ltr">${SM.esc(p.phone || '—')}</span> در سمت تخصصی <strong>«${SM.esc(roles)}»</strong>.</p>
          </div>

          <div class="sm-pcontract-section">
            <h4 class="sm-pcontract-sec-title">ماده ۲: موضوع قرارداد</h4>
            <p>موضوع این قرارداد عبارت است از همکاری طرف دوم با طرف اول در انجام امور محوله شامل (${SM.esc(roles)})، حضور در آفیش‌های پروژه‌های عکاسی و تصویربرداری، ادیت و تحویل پروژه‌ها با رعایت استانداردهای فنی و کیفی استودیو.</p>
          </div>

          <div class="sm-pcontract-section">
            <h4 class="sm-pcontract-sec-title">ماده ۳: شرایط مالی و حق‌الزحمه</h4>
            <p>حق‌الزحمه و شیوه تسویه حساب طرف دوم بر اساس توافق طرفین به شرح زیر می‌باشد:</p>
            <div class="sm-pcontract-highlight">
              <strong>نحوه پرداخت مصوب:</strong> ${SM.esc(paySummary)}
            </div>
            <p class="sm-pcontract-subnote">تسویه حساب پس از اتمام موفق کار، تحویل کلیه فایل‌های خام (Raw) یا ادیت‌شده و تأیید ناظر کیفی استودیو انجام می‌گردد.</p>
          </div>

          <div class="sm-pcontract-section">
            <h4 class="sm-pcontract-sec-title">ماده ۴: تعهدات تخصصی و محرمانگی (بسیار مهم)</h4>
            <ol class="sm-pcontract-rules">
              <li><strong>حفظ حریم خصوصی:</strong> کلیه تصاویر، راش‌ها، فیلم‌ها و اطلاعات مراجعین و مجالس، کاملاً محرمانه بوده و طرف دوم حق هیچ‌گونه انتشار، ذخیره روی حافظه شخصی غیرمجاز، استفاده تبلیغاتی بدون مجوز کتبی، یا ارسال به شخص ثالث را ندارد.</li>
              <li><strong>امانت‌داری تجهیزات:</strong> در صورت تحویل هرگونه تجهیزات (دوربین، لنز، نور، رم، باتری) از سوی استودیو، طرف دوم ملزم به حفظ و نگهداری با رعایت امانت‌داری بوده و مسئولیت خسارت عمدی یا ناشی از سهل‌انگاری بر عهده ایشان است.</li>
              <li><strong>انضباط زمانی و پوشش:</strong> حضور به‌موقع در لوکیشن یا استودیو مطابق برنامه آفیش و رعایت پوشش حرفه‌ای و موقر الزامی است.</li>
              <li><strong>تحویل فایل‌ها:</strong> کلیه فایل‌های عکاسی و تصویربرداری باید بلافاصله پس از اتمام مراسم به سرور یا واحد آرشیو استودیو منتقل گردد.</li>
            </ol>
          </div>

          <div class="sm-pcontract-section">
            <h4 class="sm-pcontract-sec-title">ماده ۵: تأییدیه و امضای طرفین</h4>
            <div class="sm-pcontract-signs">
              <div class="sm-pcontract-sign-box">
                <div>امضا و مهر طرف اول (مدیریت استودیو):</div>
                <div class="sm-pcontract-stamp">
                  <strong>${SM.esc(studioName)}</strong>
                  <div class="sm-pcontract-stamp-sub">${SM.esc(managerName)}</div>
                </div>
              </div>
              <div class="sm-pcontract-sign-box">
                <div>امضا و اثر انگشت طرف دوم (همکار):</div>
                <div class="sm-pcontract-stamp">
                  <strong>${SM.esc(p.name)}</strong>
                  <div class="sm-pcontract-stamp-sub">${contract?.verification?.verified ? 'تأییدشده دیجیتالی با پیامک' : 'امضای دستی / دیجیتال'}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `

    SMUI.modal(`قرارداد رسمی همکاری — ${p.name}`, `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;gap:8px;flex-wrap:wrap">
        <span style="font-size:0.85rem;color:var(--sm-text-muted)">پیش‌نمایش آماده چاپ بر روی برگه A4</span>
        <div style="display:flex;gap:8px">
          <button type="button" class="sm-btn sm-btn-primary" onclick="SMEmployees.printContractDoc()"><i class="fas fa-print"></i> چاپ قرارداد (Print / PDF)</button>
          <button type="button" class="sm-btn sm-btn-ghost" onclick="SMEmployees.sendContract('${p.id}')"><i class="fas fa-paper-plane"></i> ارسال به پنل پرسنل</button>
        </div>
      </div>
      ${contractHtml}
    `, {
      width: 780
    })
  },

  printContractDoc() {
    const docEl = document.getElementById('sm-personnel-contract-doc')
    if (!docEl) return
    const printWin = window.open('', '_blank', 'width=800,height=900')
    if (!printWin) {
      window.print()
      return
    }
    printWin.document.write(`
      <!DOCTYPE html>
      <html lang="fa" dir="rtl">
      <head>
        <meta charset="utf-8"/>
        <title>قرارداد همکاری پرسنل</title>
        <link href="https://fonts.googleapis.com/css2?family=Vazirmatn:wght@400;600;700;800&display=swap" rel="stylesheet">
        <style>
          body { font-family: 'Vazirmatn', sans-serif; margin: 0; padding: 24px; color: #111; background: #fff; line-height: 1.7; font-size: 13px; }
          .sm-pcontract-header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #222; padding-bottom: 14px; margin-bottom: 18px; }
          .sm-pcontract-title { margin: 0 0 4px; font-size: 17px; font-weight: 800; }
          .sm-pcontract-sub { font-size: 11px; color: #555; }
          .sm-pcontract-meta { font-size: 11px; text-align: left; }
          .sm-pcontract-section { margin-bottom: 16px; }
          .sm-pcontract-sec-title { margin: 0 0 6px; font-size: 13px; font-weight: 800; border-right: 3px solid #2563eb; padding-right: 8px; color: #111; }
          .sm-pcontract-highlight { background: #f3f4f6; border-radius: 8px; padding: 10px 14px; margin: 8px 0; border: 1px solid #e5e7eb; font-weight: 700; }
          .sm-pcontract-rules { margin: 6px 0; padding-right: 20px; }
          .sm-pcontract-rules li { margin-bottom: 6px; }
          .sm-pcontract-signs { display: grid; grid-template-columns: 1fr 1fr; gap: 30px; margin-top: 30px; }
          .sm-pcontract-sign-box { border: 1px dashed #999; border-radius: 8px; padding: 16px; text-align: center; min-height: 100px; display: flex; flex-direction: column; justify-content: space-between; }
          .sm-pcontract-stamp { font-weight: 800; margin-top: 30px; }
          @media print {
            body { padding: 0; }
            @page { margin: 15mm; size: A4; }
          }
        </style>
      </head>
      <body>
        ${docEl.outerHTML}
        <script>
          window.onload = function() {
            setTimeout(function() { window.print(); window.close(); }, 300);
          };
        </script>
      </body>
      </html>
    `)
    printWin.document.close()
  }
}

SMModules.employees = {
  setTab(tab) { SMEmployees.setTab(tab) },
  render(el) { SMEmployees.render(el) },
  add() { SMEmployees.add() },
  edit(id) { SMEmployees.edit(id) },
  view(id) { SMEmployees.view(id) },
  showContractModal(id) { SMEmployees.showContractModal(id) },
  printContractDoc() { SMEmployees.printContractDoc() }
}

window.SMEmployees = SMEmployees
