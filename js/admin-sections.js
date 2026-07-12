/* Studio M — Admin section renderers */
const AdminSections = {
  PAGE_SIZE: 25,

  formatCouple(c) {
    if (!c) return '—'
    if (c.couple) return c.couple
    const groom = c.groom || ''
    const bride = c.bride || ''
    if (!groom && !bride) return '—'
    return `${groom || '—'} و ${bride || '—'}`
  },

  renderPlaceholder(container, title) {
    container.innerHTML = `<div class="admin-card"><div class="admin-card-body" style="text-align:center;padding:48px">
      <p style="color:var(--clr-text-muted)">بخش <strong>${Utils.escapeHtml(title)}</strong> — از <a href="studio-m/">Studio M Pro</a> استفاده کنید.</p>
    </div></div>`
  },

  renderDashboard(container) {
    const contracts = DB.get('contracts')
    const tx = DB.get('transactions')
    const personnel = DB.get('personnel').filter(p => p.status === 'active')
    const income = tx.filter(t => t.type === 'deposit').reduce((s, t) => s + (t.amount || 0), 0)
    const expense = tx.filter(t => t.type === 'withdrawal').reduce((s, t) => s + (t.amount || 0), 0)
    const outstanding = contracts.reduce((s, c) => s + Math.max(0, (c.total || 0) - (c.deposit || 0) - (c.paid || 0)), 0)
    const fmt = Utils.fmtNum
  container.innerHTML = `
    <div class="dash-hero-grid">
      <div class="dash-stat-card" style="--stat-clr:var(--clr-primary)">
        <div class="dash-stat-val">${fmt(contracts.length)}</div><div class="dash-stat-lbl">قرارداد</div>
      </div>
      <div class="dash-stat-card" style="--stat-clr:var(--clr-success)">
        <div class="dash-stat-val">${fmt(income)}</div><div class="dash-stat-lbl">درآمد</div>
      </div>
      <div class="dash-stat-card" style="--stat-clr:var(--clr-danger)">
        <div class="dash-stat-val">${fmt(expense)}</div><div class="dash-stat-lbl">هزینه</div>
      </div>
      <div class="dash-stat-card" style="--stat-clr:var(--clr-warning)">
        <div class="dash-stat-val">${fmt(outstanding)}</div><div class="dash-stat-lbl">مانده مشتری</div>
      </div>
      <div class="dash-stat-card" style="--stat-clr:var(--clr-info)">
        <div class="dash-stat-val">${fmt(personnel.length)}</div><div class="dash-stat-lbl">پرسنل فعال</div>
      </div>
    </div>
    <div class="admin-card" style="margin-top:20px">
      <div class="admin-card-header"><div class="admin-card-title">قراردادهای اخیر</div>
        <button class="btn btn-sm btn-primary" onclick="Admin.openNewContract()">+ قرارداد</button>
      </div>
      <div class="admin-card-body">
        ${contracts.length ? `<div class="admin-table-wrap"><table class="admin-table">
          <thead><tr><th>شماره</th><th>زوج</th><th>تاریخ مراسم</th><th>مبلغ</th><th></th></tr></thead>
          <tbody>${contracts.slice().reverse().slice(0, 8).map(c => `<tr>
            <td dir="ltr">${Utils.escapeHtml(c.contractNum || '—')}</td>
            <td>${Utils.escapeHtml(AdminSections.formatCouple(c))}</td>
            <td>${Utils.escapeHtml(c.eventDate || '—')}</td>
            <td>${fmt(c.total || 0)}</td>
            <td><button class="btn btn-sm btn-ghost" onclick="Admin.showSection('contracts')">مشاهده</button></td>
          </tr>`).join('')}</tbody></table></div>` : '<p style="text-align:center;color:var(--clr-text-muted);padding:24px">هنوز قراردادی ثبت نشده</p>'}
      </div>
    </div>`
  },

  renderContracts(container) {
    const contracts = DB.get('contracts').slice().reverse()
    const fmt = Utils.fmtNum
    const pg = UiKit.paginate(contracts, 'admin-contracts', this.PAGE_SIZE)
    container.innerHTML = `
      <div class="admin-section-header" style="--sec-clr:var(--clr-primary)">
        <div class="admin-section-title"><i class="fas fa-file-signature"></i> قراردادها</div>
        <button class="section-action gold" onclick="Admin.openNewContract()"><i class="fas fa-plus"></i> قرارداد جدید</button>
      </div>
      <div class="admin-card">
        <div class="admin-table-wrap">
          <table class="admin-table">
            <thead><tr><th>شماره</th><th>زوج</th><th>موبایل</th><th>مراسم</th><th>مبلغ</th><th>بیعانه</th><th>وضعیت</th></tr></thead>
            <tbody>${pg.slice.length ? pg.slice.map(c => `<tr>
              <td dir="ltr">${Utils.escapeHtml(c.contractNum)}</td>
              <td>${Utils.escapeHtml(c.couple || '—')}</td>
              <td dir="ltr">${Utils.escapeHtml(c.groomPhone || c.phone || '—')}</td>
              <td>${Utils.escapeHtml(c.eventDate || '—')}</td>
              <td>${fmt(c.total || 0)}</td>
              <td>${fmt(c.deposit || 0)}</td>
              <td><span class="badge badge-gold">${Admin.contractStatus(c.status)}</span></td>
            </tr>`).join('') : '<tr><td colspan="7" style="text-align:center;padding:32px">قراردادی نیست</td></tr>'}
            </tbody>
          </table>
        </div>
        ${pg.pagerHtml}
      </div>`
    UiKit.bindPager(container, 'admin-contracts', () => {
      Admin.invalidateSection('contracts')
      Admin.showSection('contracts', true)
    })
  },

  renderCrm(container) {
    const leads = DB.get('leads')
    const stages = [
      { id: 'new', label: 'جدید', color: '#3B82F6' },
      { id: 'contacted', label: 'تماس', color: '#8B5CF6' },
      { id: 'quoted', label: 'پیش‌فاکتور', color: '#F59E0B' },
      { id: 'won', label: 'برنده', color: '#22C55E' },
      { id: 'lost', label: 'از دست رفته', color: '#6B7280' }
    ]
    container.innerHTML = `
      <div class="admin-section-header" style="--sec-clr:var(--clr-warning)">
        <div class="admin-section-title"><i class="fas fa-funnel-dollar"></i> CRM — مدیریت لید</div>
        <button class="section-action blue" onclick="AdminSections.addLead()"><i class="fas fa-plus"></i> لید جدید</button>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px">
        ${stages.map(st => {
          const items = leads.filter(l => (l.stage || 'new') === st.id)
          return `<div class="admin-card" style="border-top:3px solid ${st.color}">
            <div class="admin-card-header"><strong>${st.label}</strong> <span class="badge">${items.length}</span></div>
            <div class="admin-card-body" style="display:flex;flex-direction:column;gap:8px;min-height:120px">
              ${items.map(l => `<div class="activity-item" style="cursor:pointer;padding:10px;border-radius:8px;background:var(--clr-surface)" data-lead-id="${Utils.escapeHtml(String(l.id))}" role="button" tabindex="0">
                <div style="font-weight:600">${Utils.escapeHtml(l.name || '—')}</div>
                <div style="font-size:12px;color:var(--clr-text-muted)" dir="ltr">${Utils.escapeHtml(l.phone || '')}</div>
                ${l.source ? `<div style="font-size:11px;margin-top:4px">${Utils.escapeHtml(l.source)}</div>` : ''}
              </div>`).join('') || '<span style="font-size:12px;color:var(--clr-text-muted)">خالی</span>'}
            </div>
          </div>`
        }).join('')}
      </div>`
    container.querySelectorAll('[data-lead-id]').forEach(el => {
      el.addEventListener('click', () => AdminSections.editLead(el.getAttribute('data-lead-id')))
    })
  },

  async addLead() {
    const data = await UiKit.form({
      title: 'لید جدید',
      fields: [
        { id: 'name', label: 'نام', required: true },
        { id: 'phone', label: 'موبایل', type: 'tel', dir: 'ltr', inputmode: 'tel', hint: 'مثال: 09121234567' },
        { id: 'source', label: 'منبع', value: 'دستی' }
      ]
    })
    if (!data) return
    await UiKit.withLoading(async () => {
      SecureDB.insert('leads', {
        name: data.name,
        phone: data.phone,
        stage: 'new',
        source: data.source || 'دستی',
        notes: '',
        createdAt: Utils.todayJalali()
      })
      await DB.flush?.()
    }, 'در حال ثبت لید…')
    DB.log('crm', `لید جدید: ${data.name}`)
    Admin.invalidateSection('crm')
    Admin.showSection('crm', true)
    Utils.toast('لید اضافه شد', 'success')
  },

  async editLead(id) {
    const l = DB.find('leads', x => x.id === id)
    if (!l) return
    const data = await UiKit.form({
      title: 'ویرایش لید',
      fields: [
        { id: 'name', label: 'نام', value: l.name || '', required: true },
        { id: 'phone', label: 'موبایل', type: 'tel', value: l.phone || '', dir: 'ltr', inputmode: 'tel' },
        {
          id: 'stage', label: 'مرحله', type: 'select', value: l.stage || 'new',
          options: [
            { value: 'new', label: 'جدید' },
            { value: 'contacted', label: 'تماس' },
            { value: 'quoted', label: 'پیش‌فاکتور' },
            { value: 'won', label: 'برنده' },
            { value: 'lost', label: 'از دست رفته' }
          ]
        },
        { id: 'notes', label: 'یادداشت', type: 'textarea', value: l.notes || '' }
      ]
    })
    if (!data) return
    await UiKit.withLoading(async () => {
      await SecureDB.update('leads', id, data)
    })
    Admin.invalidateSection('crm')
    Admin.showSection('crm', true)
    Utils.toast('لید به‌روز شد', 'success')
  },

  renderCalendar(container) {
    const bookings = DB.get('bookings')
    const appointments = DB.get('appointments')
    const all = [...bookings.map(b => ({ ...b, kind: 'رزرو' })), ...appointments.map(a => ({ ...a, kind: 'نوبت' }))]
    all.sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')))
    container.innerHTML = `
      <div class="admin-section-header" style="--sec-clr:var(--clr-info)">
        <div class="admin-section-title"><i class="fas fa-calendar-days"></i> تقویم و رزرو</div>
        <button class="section-action blue" onclick="AdminSections.addBooking()"><i class="fas fa-plus"></i> رزرو جدید</button>
      </div>
      <div class="admin-card">
        <div class="admin-table-wrap"><table class="admin-table">
          <thead><tr><th>نوع</th><th>عنوان</th><th>تاریخ</th><th>ساعت</th><th>مشتری</th><th>وضعیت</th></tr></thead>
          <tbody>${all.length ? all.map(b => `<tr>
            <td>${b.kind}</td><td>${Utils.escapeHtml(b.title || b.type || '—')}</td>
            <td>${Utils.escapeHtml(b.date || '—')}</td><td>${Utils.escapeHtml(b.time || '—')}</td>
            <td>${Utils.escapeHtml(b.client || b.couple || '—')}</td>
            <td>${Utils.escapeHtml(b.status || 'scheduled')}</td>
          </tr>`).join('') : '<tr><td colspan="6" style="text-align:center;padding:32px">رویدادی ثبت نشده</td></tr>'}
          </tbody></table></div>
      </div>`
  },

  async addBooking() {
    const data = await UiKit.form({
      title: 'رزرو جدید',
      fields: [
        { id: 'title', label: 'عنوان', required: true },
        { id: 'date', label: 'تاریخ (شمسی)', value: Utils.todayJalali(), required: true, hint: 'YYYY/MM/DD' },
        { id: 'time', label: 'ساعت', placeholder: '14:00', dir: 'ltr' },
        { id: 'client', label: 'مشتری / زوج' }
      ]
    })
    if (!data) return
    await UiKit.withLoading(async () => {
      SecureDB.insert('bookings', {
        title: data.title,
        date: data.date,
        time: data.time || '',
        client: data.client || '',
        status: 'scheduled',
        createdAt: Utils.todayJalali()
      })
      await DB.flush?.()
    })
    Admin.invalidateSection('calendar')
    Admin.showSection('calendar', true)
    Utils.toast('رزرو ثبت شد', 'success')
  },

  renderFinance(container) {
    const tx = DB.get('transactions').slice().reverse()
    const fmt = Utils.fmtNum
    const pg = UiKit.paginate(tx, 'admin-finance', this.PAGE_SIZE)
    container.innerHTML = `
      <div class="admin-section-header" style="--sec-clr:var(--clr-success)">
        <div class="admin-section-title"><i class="fas fa-wallet"></i> مالی</div>
        <button class="section-action gold" onclick="AdminTools?.openTransactionModal?.('deposit')"><i class="fas fa-plus"></i> تراکنش</button>
      </div>
      <div class="admin-table-wrap"><table class="admin-table">
        <thead><tr><th>تاریخ</th><th>نوع</th><th>مبلغ</th><th>شرح</th></tr></thead>
        <tbody>${pg.slice.length ? pg.slice.map(t => `<tr>
          <td>${Utils.escapeHtml(t.date || '—')}</td>
          <td>${t.type === 'deposit' ? 'واریز' : 'برداشت'}</td>
          <td style="color:${t.type === 'deposit' ? 'var(--clr-success)' : 'var(--clr-danger)'}">${fmt(t.amount)}</td>
          <td>${Utils.escapeHtml(t.desc || t.note || '—')}</td>
        </tr>`).join('') : '<tr><td colspan="4" style="text-align:center;padding:32px">تراکنشی نیست</td></tr>'}
        </tbody></table></div>
      ${pg.pagerHtml}`
    UiKit.bindPager(container, 'admin-finance', () => {
      Admin.invalidateSection('finance')
      Admin.showSection('finance', true)
    })
  },

  renderEquipment(container) {
    const items = DB.get('equipment')
    container.innerHTML = `
      <div class="admin-section-header" style="--sec-clr:var(--clr-accent)">
        <div class="admin-section-title"><i class="fas fa-camera"></i> تجهیزات</div>
        <button class="section-action blue" onclick="AdminSections.addEquipment()"><i class="fas fa-plus"></i> افزودن</button>
      </div>
      <div class="admin-table-wrap"><table class="admin-table">
        <thead><tr><th>نام</th><th>برند</th><th>سریال</th><th>دسته</th><th>وضعیت</th></tr></thead>
        <tbody>${items.length ? items.map(e => `<tr>
          <td>${Utils.escapeHtml(e.name)}</td><td>${Utils.escapeHtml(e.brand || '—')}</td>
          <td dir="ltr">${Utils.escapeHtml(e.serial || '—')}</td><td>${Utils.escapeHtml(e.category || '—')}</td>
          <td>${Utils.escapeHtml(e.status || 'available')}</td>
        </tr>`).join('') : '<tr><td colspan="5" style="text-align:center;padding:32px">تجهیزاتی ثبت نشده — دوربین و لنزها را اینجا اضافه کنید</td></tr>'}
        </tbody></table></div>`
  },

  async addEquipment() {
    const data = await UiKit.form({
      title: 'افزودن تجهیز',
      fields: [
        { id: 'name', label: 'نام تجهیز', required: true, placeholder: 'Sony A7IV' },
        { id: 'brand', label: 'برند' },
        {
          id: 'category', label: 'دسته', type: 'select', value: 'camera',
          options: [
            { value: 'camera', label: 'دوربین' },
            { value: 'lens', label: 'لنز' },
            { value: 'lighting', label: 'نور' },
            { value: 'other', label: 'سایر' }
          ]
        },
        { id: 'serial', label: 'سریال', dir: 'ltr' }
      ]
    })
    if (!data) return
    await UiKit.withLoading(async () => {
      SecureDB.insert('equipment', {
        name: data.name,
        brand: data.brand || '',
        category: data.category || 'camera',
        serial: data.serial || '',
        status: 'available',
        notes: '',
        createdAt: Utils.todayJalali()
      })
      await DB.flush?.()
    })
    DB.log('equipment', `تجهیز جدید: ${data.name}`)
    Admin.invalidateSection('equipment')
    Admin.showSection('equipment', true)
    Utils.toast('تجهیز ثبت شد', 'success')
  },

  renderPersonnel(container) {
    const personnel = DB.get('personnel')
    const pg = UiKit.paginate(personnel, 'admin-personnel', this.PAGE_SIZE)
    container.innerHTML = `
      <div class="admin-section-header"><div class="admin-section-title"><i class="fas fa-users"></i> پرسنل</div></div>
      <div class="admin-table-wrap"><table class="admin-table">
        <thead><tr><th>نام</th><th>موبایل</th><th>نقش</th><th>وضعیت</th><th>پروژه</th></tr></thead>
        <tbody>${pg.slice.length ? pg.slice.map(p => `<tr>
          <td>${Utils.escapeHtml(p.name)}</td><td dir="ltr">${Utils.escapeHtml(p.phone || '')}</td>
          <td>${(p.roles || []).map(r => RolesHelper.title(r)).join('، ') || '—'}</td>
          <td>${p.status === 'active' ? 'فعال' : 'غیرفعال'}</td>
          <td>${p.jobs || 0}</td>
        </tr>`).join('') : '<tr><td colspan="5" style="text-align:center;padding:32px">پرسنلی نیست</td></tr>'}
        </tbody></table></div>
      ${pg.pagerHtml}`
    UiKit.bindPager(container, 'admin-personnel', () => {
      Admin.invalidateSection('personnel')
      Admin.showSection('personnel', true)
    })
  },

  renderRequests(container) {
    const reqs = DB.get('customerRequests').slice().reverse()
    container.innerHTML = `
      <div class="admin-section-header"><div class="admin-section-title"><i class="fas fa-inbox"></i> درخواست مشتریان</div></div>
      <div class="admin-card-body">${reqs.length ? reqs.map(r => {
        const type = PortalShared.REQUEST_TYPES[r.type] || { label: r.type, icon: '📝' }
        return `<div class="activity-item" style="padding:14px;border-bottom:1px solid var(--clr-border)">
          <div style="display:flex;justify-content:space-between;gap:8px">
            <strong>${type.icon} ${Utils.escapeHtml(type.label)}</strong>
            <span class="badge badge-${r.status === 'pending' ? 'gold' : 'success'}">${Utils.escapeHtml(r.status || 'pending')}</span>
          </div>
          <p style="margin:8px 0;font-size:0.9rem">${Utils.escapeHtml(r.message || r.text || '—')}</p>
          <div style="display:flex;gap:8px">${r.status === 'pending' ? `
            <button type="button" class="btn btn-sm btn-success" data-req-action="approve" data-req-id="${Utils.escapeHtml(String(r.id))}">تأیید</button>
            <button type="button" class="btn btn-sm btn-danger" data-req-action="reject" data-req-id="${Utils.escapeHtml(String(r.id))}">رد</button>` : ''}
          </div>
        </div>`
      }).join('') : '<p style="text-align:center;padding:32px;color:var(--clr-text-muted)">درخواستی نیست</p>'}</div>`
    container.querySelectorAll('[data-req-action]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-req-id')
        const act = btn.getAttribute('data-req-action')
        if (!id) return
        if (act === 'approve' && typeof AdminTools !== 'undefined') AdminTools.approveCustomerRequest(id)
        else if (act === 'reject' && typeof AdminTools !== 'undefined') AdminTools.rejectCustomerRequest(id)
      })
    })
  },

  renderUsers(container) {
    if (!Auth.isSystemAdmin()) {
      container.innerHTML = `<div class="admin-empty"><p>مدیریت کاربران فقط برای <strong>ادمین سیستم</strong> است.</p>
        <button class="btn btn-primary" onclick="window.location.href='studio-m/#settings'">تنظیمات Studio M</button></div>`
      return
    }
    const users = DB.get('users')
    container.innerHTML = `
      <div class="admin-section-header"><div class="admin-section-title"><i class="fas fa-user-shield"></i> کاربران</div></div>
      <div class="admin-table-wrap"><table class="admin-table">
        <thead><tr><th>نام</th><th>موبایل</th><th>نقش</th><th>وضعیت</th></tr></thead>
        <tbody>${users.map(u => `<tr>
          <td>${Utils.escapeHtml(u.name)}</td><td dir="ltr">${Utils.escapeHtml(u.phone)}</td>
          <td>${(u.roles || []).map(r => RolesHelper.title(r)).join('، ') || 'در انتظار'}</td>
          <td>${Utils.escapeHtml(u.status || 'active')}</td>
        </tr>`).join('')}</tbody></table></div>`
  },

  renderSettings(container) {
    if (typeof AdminTools !== 'undefined' && AdminTools.renderSettings) {
      AdminTools.renderSettings(container)
      return
    }
    this.renderPlaceholder(container, 'تنظیمات')
  },

  renderLogs(container) {
    const logs = DB.get('logs').slice().reverse().slice(0, 100)
    container.innerHTML = `
      <div class="admin-section-header"><div class="admin-section-title"><i class="fas fa-clock-rotate-left"></i> لاگ سیستم</div></div>
      <div class="activity-list">${logs.map(l => `<div class="activity-item">
        <div class="activity-content">
          <div class="activity-text"><strong>${Utils.escapeHtml(l.action || '—')}</strong> — ${Utils.escapeHtml(l.detail || '')}</div>
          <div class="activity-time">${Utils.escapeHtml((l.timestamp || '').slice(0, 19).replace('T', ' '))}</div>
        </div>
      </div>`).join('') || '<p style="padding:24px;text-align:center">لاگی نیست</p>'}</div>`
  },

  renderReports(container) {
    container.innerHTML = `<div class="admin-card"><div class="admin-card-body" style="padding:24px">
      <p>گزارش‌های بخش‌به‌بخش از منوی گزارش‌ها در نسخه بعدی Studio M Pro نیز یکپارچه می‌شوند.</p>
      <button class="btn btn-primary" onclick="Admin.showSection('dashboard')">بازگشت</button>
    </div></div>`
  }
}

window.AdminSections = AdminSections
