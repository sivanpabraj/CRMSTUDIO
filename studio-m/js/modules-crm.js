/* Studio M Pro — CRM pipeline: lead intake, follow-up and contract handoff. */
const CRM_STAGES = [
  ['new', 'جدید'], ['contacted', 'تماس‌شده'], ['consultation', 'مشاوره'],
  ['proposal', 'پیشنهاد'], ['won', 'تبدیل‌شده'], ['lost', 'از دست‌رفته']
]

SMModules.crm = {
  stageLabel(stage) { return CRM_STAGES.find(([id]) => id === stage)?.[1] || 'جدید' },
  render(el) {
    const q = SM.getModuleSearch('crm')
    const leads = DB.active('leads').filter(item => !q || [item.name, item.phone, item.source, item.notes]
      .filter(Boolean).join(' ').toLowerCase().includes(q))
    const totals = Object.fromEntries(CRM_STAGES.map(([id]) => [id, leads.filter(item => (item.stage || 'new') === id).length]))
    el.innerHTML = `${SMUI.sectionHead('مدیریت ارتباط با مشتری', 'از ورود لید تا تبدیل به قرارداد', `<button class="sm-btn sm-btn-primary" ${SMEvents.attrs('SMModules.crm.add')}><i class="fas fa-plus"></i> لید جدید</button>`)}
      ${SMUI.moduleSearch('crm', 'جستجو با نام، موبایل یا منبع...')}
      <div class="sm-stats">${CRM_STAGES.map(([id, label]) => `<div class="sm-stat" style="--stat-color:${id === 'won' ? '#34C759' : id === 'lost' ? '#EF4444' : '#60A5FA'}"><div class="sm-stat-val">${totals[id].toLocaleString('fa-IR')}</div><div class="sm-stat-lbl">${label}</div></div>`).join('')}</div>
      ${SMUI.table(['مشتری', 'موبایل', 'مرحله', 'منبع', 'آخرین پیگیری', 'عملیات'], leads.map(item => `<tr>
        <td>${SM.esc(item.name || 'بدون نام')}</td><td dir="ltr">${SM.esc(item.phone || '—')}</td>
        <td>${SMUI.badge(this.stageLabel(item.stage), item.stage === 'won' ? 'success' : item.stage === 'lost' ? 'danger' : 'info')}</td>
        <td>${SM.esc(item.source || '—')}</td><td>${SM.esc(item.followUpAt || item.createdAt || '—')}</td>
        <td>${SMUI.rowActions([
          { fn: 'SMModules.crm.edit', args: [item.id], label: 'ویرایش', icon: 'fa-pen' },
          { fn: 'SMModules.crm.convert', args: [item.id], label: 'تبدیل به قرارداد', icon: 'fa-file-signature', className: 'sm-btn-primary' }
        ])}</td></tr>`))}`
  },
  add() { this.form(null) },
  edit(id) { this.form(DB.find('leads', item => item.id === id)) },
  form(item) {
    SMUI.modal(item ? 'ویرایش لید' : 'لید جدید', `
      ${SMUI.formField('نام مشتری', 'crm-name', { value: item?.name || '' })}
      ${SMUI.formField('شماره موبایل', 'crm-phone', { value: item?.phone || '', dir: 'ltr' })}
      ${SMUI.formField('مرحله', 'crm-stage', { type: 'select', value: item?.stage || 'new', options: CRM_STAGES.map(([value, label]) => ({ value, label })) })}
      ${SMUI.formField('منبع', 'crm-source', { value: item?.source || '' })}
      ${SMUI.formField('زمان پیگیری', 'crm-follow', { value: item?.followUpAt || Utils.todayJalali() })}
      ${SMUI.formField('یادداشت', 'crm-notes', { type: 'textarea', value: item?.notes || '' })}`, {
      onSave: async () => {
        const d = SMUI.readForm(['crm-name', 'crm-phone', 'crm-stage', 'crm-source', 'crm-follow', 'crm-notes'])
        const phone = Utils.normalizePhone(d['crm-phone'])
        if (!d['crm-name'] || !Utils.isValidPhone(phone)) {
          SM.toast('نام و شماره موبایل معتبر الزامی است', 'error'); return
        }
        const data = { name: d['crm-name'], phone, stage: d['crm-stage'], source: d['crm-source'], followUpAt: d['crm-follow'], notes: d['crm-notes'] }
        if (item) await SecureDB.update('leads', item.id, data)
        else await SecureDB.insert('leads', { ...data, createdAt: Utils.todayJalali() })
        SMUI.closeModal(); SM.navigate('crm')
      }, onDelete: item ? () => SMH.remove('leads', item.id, 'crm') : null
    })
  },
  async convert(id) {
    const lead = DB.find('leads', item => item.id === id)
    if (!lead) return
    await SecureDB.update('leads', id, { stage: 'won', convertedAt: new Date().toISOString() })
    sessionStorage.setItem('sm_contract_prefill', JSON.stringify({ name: lead.name, phone: lead.phone, leadId: lead.id }))
    location.href = '../contract.html?from=crm'
  }
}
