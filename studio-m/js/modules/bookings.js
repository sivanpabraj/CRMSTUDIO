/* Studio M — Bookings module (extracted from modules.js) */
if (typeof SMModules === 'undefined') window.SMModules = {}

const BOOKING_STATUS = {
  scheduled: 'زمان‌بندی شده',
  confirmed: 'تأیید شده',
  cancelled: 'لغو شده'
}

SMModules.bookings = {
  _statusLabel(s) { return BOOKING_STATUS[s] || s || '—' },
  render(el) {
    const bookings = SMH.filterBySearch(DB.get('bookings'), ['title', 'client', 'date'])
    el.innerHTML = `
      ${SMUI.sectionHead('رزرو و مشاوره', '', SMH.addBtn('SMModules.bookings.add()'))}
      ${SMUI.moduleSearch('bookings', 'جستجو در رزروها — مشتری، عنوان، تاریخ...')}
      ${SMUI.table(
        ['عنوان', 'تاریخ', 'ساعت', 'مشتری', 'وضعیت', SM.t('actions')],
        bookings.map(b => `<tr>
          <td>${SM.esc(b.title)}</td><td>${SM.esc(b.date)}</td><td>${SM.esc(b.time || '—')}</td>
          <td>${SM.esc(b.client || '—')}</td><td>${SMUI.badge(this._statusLabel(b.status), b.status === 'confirmed' ? 'success' : b.status === 'cancelled' ? 'danger' : 'warning')}</td>
          ${SMUI.tableActionsCell(`SMModules.bookings.view('${b.id}')`, `SMModules.bookings.edit('${b.id}')`)}
        </tr>`)
      )}`
  },
  view(id) {
    const b = DB.find('bookings', x => x.id === id)
    if (!b) return
    SM.pushSubView(b.title, () => `
      <div class="sm-card"><div class="sm-card-body">
        <p><strong>تاریخ:</strong> ${SM.esc(b.date)} — ${SM.esc(b.time || '')}</p>
        <p style="margin-top:8px"><strong>مشتری:</strong> ${SM.esc(b.client || '—')}</p>
        <p style="margin-top:8px"><strong>وضعیت:</strong> ${SMUI.badge(this._statusLabel(b.status), 'info')}</p>
        <div style="margin-top:16px;display:flex;gap:8px">
          <button class="sm-btn sm-btn-primary" onclick="SMModules.bookings.edit('${b.id}')">${SM.t('edit')}</button>
        </div>
      </div></div>`)
  },
  add() { this._form(null) },
  edit(id) { this._form(DB.find('bookings', b => b.id === id)) },
  _form(item) {
    SMUI.modal(item ? 'ویرایش مشاوره' : 'افزودن مشاوره', `
      ${SMUI.formField('عنوان', 'bk-title', { value: item?.title || '', placeholder: 'مثلاً: مشاوره حضوری' })}
      ${SMUI.formField('تاریخ', 'bk-date', { value: item?.date || Utils.todayJalali() })}
      ${SMUI.formField('ساعت', 'bk-time', { value: item?.time || '14:00', dir: 'ltr' })}
      ${SMUI.formField('مشتری', 'bk-client', { value: item?.client || '' })}
      ${SMUI.formField('وضعیت', 'bk-status', { type: 'select', value: item?.status || 'scheduled', options: [
        { value: 'scheduled', label: 'زمان‌بندی شده' },
        { value: 'confirmed', label: 'تأیید شده' },
        { value: 'cancelled', label: 'لغو شده' }
      ]})}`, {
      onSave: async () => {
        const d = SMUI.readForm(['bk-title', 'bk-date', 'bk-time', 'bk-client', 'bk-status'])
        if (!d['bk-title']) return SM.toast(SM.t('error'), 'error')
        const data = { title: d['bk-title'], date: d['bk-date'], time: d['bk-time'], client: d['bk-client'], status: d['bk-status'] }
        if (item) await SecureDB.update('bookings', item.id, data)
        else await SecureDB.insert('bookings', data)
        SMH.refresh('bookings')
      },
      onDelete: item ? () => SMH.remove('bookings', item.id, 'bookings') : null
    })
  }
}
