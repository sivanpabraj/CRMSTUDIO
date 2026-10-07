/* Studio M — Timeline module (extracted from modules.js) */
if (typeof SMModules === 'undefined') window.SMModules = {}

SMModules.timeline = {
  render(el) {
    const q = SM.getModuleSearch('timeline')
    let timelines = DB.get('timelines')
    const contracts = DB.get('contracts')
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
    const contracts = DB.get('contracts')
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
