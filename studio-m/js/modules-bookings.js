/* Studio M Pro — split module (loaded after modules.js) */
/* ── Bookings & Calendar ── */
const BOOKING_STATUS = {
  scheduled: 'زمان‌بندی شده',
  confirmed: 'تأیید شده',
  cancelled: 'لغو شده'
}

SMModules.bookings = {
  _statusLabel(s) { return BOOKING_STATUS[s] || s || '—' },
  render(el) {
    const bookings = SMH.filterBySearch(DB.active('bookings'), ['title', 'client', 'date'])
    el.innerHTML = `
      ${SMUI.sectionHead('رزرو و مشاوره', '', SMH.addBtn('SMModules.bookings.add()'))}
      ${SMUI.moduleSearch('bookings', 'جستجو در رزروها — مشتری، عنوان، تاریخ...')}
      ${SMUI.table(
        ['عنوان', 'تاریخ', 'ساعت', 'مشتری', 'وضعیت', SM.t('actions')],
        bookings.map(b => `<tr>
          <td>${SM.esc(b.title)}</td><td>${SM.esc(b.date)}</td><td>${SM.esc(b.time || '—')}</td>
          <td>${SM.esc(b.client || '—')}</td><td>${SMUI.badge(this._statusLabel(b.status), b.status === 'confirmed' ? 'success' : b.status === 'cancelled' ? 'danger' : 'warning')}</td>
          ${SMUI.tableActionsCell(
            { fn: 'SMModules.bookings.view', args: [b.id] },
            { fn: 'SMModules.bookings.edit', args: [b.id] }
          )}
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

/* ── Wedding Timeline ── */
SMModules.timeline = {
  render(el) {
    const q = SM.getModuleSearch('timeline')
    let timelines = DB.active('timelines')
    const contracts = DB.active('contracts')
    if (q) {
      timelines = timelines.filter(t => {
        const contract = contracts.find(c => c.id === t.contractId)
        const hay = [t.title, contract?.couple, contract?.groom, contract?.bride, ...(t.events || []).map(e => `${e.time} ${e.title} ${e.desc}`)].join(' ').toLowerCase()
        return hay.includes(q)
      })
    }
    el.innerHTML = `
      ${SMUI.sectionHead('تایم‌لاین عروسی', 'برنامه روز مراسم', `<button class="sm-btn sm-btn-primary" onclick="SMModules.timeline.add()"><i class="fas fa-plus"></i> ${SM.t('add')}</button>`)}
      ${SMUI.moduleSearch('timeline', 'جستجو در تایم‌لاین — زوج، رویداد...')}
      <div class="sm-grid-2">${timelines.length ? timelines.map(t => {
        const contract = contracts.find(c => c.id === t.contractId)
        const events = t.events || []
        return `<div class="sm-card">
          <div class="sm-card-head">
            <div class="sm-card-title">${SM.esc(t.title || contract?.couple || 'تایم‌لاین')}</div>
            <button class="sm-btn sm-btn-sm sm-btn-ghost" onclick="SMModules.timeline.edit('${t.id}')">${SM.t('edit')}</button>
          </div>
          <div class="sm-card-body">
            <div class="sm-timeline">${events.map(ev => `
              <div class="sm-timeline-item">
                <div class="sm-timeline-dot"></div>
                <div class="sm-timeline-time">${SM.esc(ev.time || '')}</div>
                <div class="sm-timeline-title">${SM.esc(ev.title)}</div>
                <div class="sm-timeline-desc">${SM.esc(ev.desc || '')}</div>
              </div>`).join('') || SMUI.empty('fa-clock', SM.t('no_data'))}
            </div>
          </div></div>`
      }).join('') : SMUI.empty('fa-clock', q ? 'تایم‌لاینی یافت نشد' : 'تایم‌لاین عروسی بسازید')}</div>`
  },
  add() { this._form(null) },
  edit(id) { this._form(DB.find('timelines', t => t.id === id)) },
  _form(item) {
    const contracts = DB.active('contracts')
    SMUI.modal(item ? 'ویرایش تایم‌لاین' : 'تایم‌لاین عروسی', `
      ${SMUI.formField('عنوان', 'tl-title', { value: item?.title || '', placeholder: 'مثلاً: برنامه روز عروسی' })}
      ${SMUI.formField('قرارداد', 'tl-contract', { type: 'select', value: item?.contractId || '', options: [
        { value: '', label: '— انتخاب —' }, ...contracts.map(c => ({ value: c.id, label: c.couple || c.contractNum }))
      ]})}
      ${SMUI.formField('رویدادها (هر خط: ساعت|عنوان|توضیح)', 'tl-events', { type: 'textarea', value: (item?.events || []).map(e => `${e.time}|${e.title}|${e.desc || ''}`).join('\n'), placeholder: '14:00|ورود عروس|...\n15:30|عقد\n18:00|شام' })}`, {
      onSave: async () => {
        const d = SMUI.readForm(['tl-title', 'tl-contract', 'tl-events'])
        const events = d['tl-events'].split('\n').filter(Boolean).map(line => {
          const [time, title, desc] = line.split('|')
          return { time: time?.trim(), title: title?.trim(), desc: desc?.trim() || '' }
        }).filter(e => e.title)
        const data = { title: d['tl-title'], contractId: d['tl-contract'], events }
        if (item) await SecureDB.update('timelines', item.id, data)
        else await SecureDB.insert('timelines', data)
        SMH.refresh('timeline')
      }, width: 560,
      onDelete: item ? () => SMH.remove('timelines', item.id, 'timeline') : null
    })
  }
}


