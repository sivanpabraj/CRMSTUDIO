/* Studio M — گردش کار تدوین (venue / clip / album) */

const SMWorkflow = {
  STAGES: ['ingest', 'cull', 'edit', 'color', 'review', 'delivery'],

  STAGE_LABELS: {
    ingest: { fa: 'دریافت فوتیج', en: 'Ingest' },
    cull: { fa: 'انتخاب و حذف', en: 'Cull' },
    edit: { fa: 'تدوین', en: 'Edit' },
    color: { fa: 'رنگ‌بندی', en: 'Color' },
    review: { fa: 'بازبینی', en: 'Review' },
    delivery: { fa: 'تحویل', en: 'Delivery' }
  },

  TYPES: {
    venue: { fa: 'تدوین تالار', en: 'Venue edit', icon: 'fa-building' },
    clip: { fa: 'تدوین کلیپ', en: 'Clip edit', icon: 'fa-film' },
    album: { fa: 'طراحی آلبوم', en: 'Album design', icon: 'fa-book-open' },
    photo: { fa: 'ادیت عکس', en: 'Photo edit', icon: 'fa-image' },
    other: { fa: 'سایر', en: 'Other', icon: 'fa-folder' }
  },

  PRIORITY: {
    low: { fa: 'کم', en: 'Low', badge: 'muted' },
    normal: { fa: 'معمولی', en: 'Normal', badge: 'info' },
    high: { fa: 'بالا', en: 'High', badge: 'warning' },
    urgent: { fa: 'فوری', en: 'Urgent', badge: 'danger' }
  },

  STATUS: {
    active: { fa: 'در جریان', en: 'Active', badge: 'info' },
    on_hold: { fa: 'معلق', en: 'On hold', badge: 'warning' },
    completed: { fa: 'تمام‌شده', en: 'Completed', badge: 'success' }
  },

  _tab: 'active',

  _lbl(map, key) {
    const o = map[key] || {}
    return SMH.lbl(o.fa || key, o.en || key)
  },

  _stageLabel(stage) {
    return this._lbl(this.STAGE_LABELS, stage || 'ingest')
  },

  _typeLabel(type) {
    return this._lbl(this.TYPES, type || 'other')
  },

  _contractLabel(id) {
    if (!id) return '—'
    const c = DB.find('contracts', x => x.id === id)
    if (!c) return id
    const couple = c.couple || [c.bride, c.groom].filter(Boolean).join(' و ')
    return couple ? `${couple} (#${c.contractNum || '—'})` : `#${c.contractNum || c.id}`
  },

  _personnelName(id) {
    if (!id) return '—'
    const p = DB.find('personnel', x => x.id === id)
    return p?.name || '—'
  },

  _statusOf(w) {
    if (w.status === 'completed' || w.completedAt) return 'completed'
    if (w.status === 'on_hold') return 'on_hold'
    return 'active'
  },

  _progress(w) {
    const idx = this.STAGES.indexOf(w.stage || 'ingest')
    if (idx < 0) return 0
    if (this._statusOf(w) === 'completed') return 100
    return Math.round((idx / (this.STAGES.length - 1)) * 100)
  },

  _isOverdue(w) {
    if (this._statusOf(w) === 'completed' || !w.dueDate) return false
    const d = Utils.daysUntil(w.dueDate)
    return d !== null && d < 0
  },

  _items() {
    return (DB.active('workflows') || []).slice().sort((a, b) => {
      const pa = { urgent: 0, high: 1, normal: 2, low: 3 }[a.priority || 'normal'] ?? 2
      const pb = { urgent: 0, high: 1, normal: 2, low: 3 }[b.priority || 'normal'] ?? 2
      if (pa !== pb) return pa - pb
      return String(a.dueDate || '').localeCompare(String(b.dueDate || ''))
    })
  },

  _filtered() {
    let list = SMH.filterBySearch(this._items(), ['title', 'notes'], 'workflow')
    if (this._tab === 'active') list = list.filter(w => this._statusOf(w) === 'active')
    else if (this._tab === 'completed') list = list.filter(w => this._statusOf(w) === 'completed')
    else if (this._tab === 'on_hold') list = list.filter(w => this._statusOf(w) === 'on_hold')
    return list
  },

  setTab(tab) {
    this._tab = tab
    SM.navigate('workflow')
  },

  _pipelineHtml(w) {
    const cur = this.STAGES.indexOf(w.stage || 'ingest')
    const done = this._statusOf(w) === 'completed'
    return `<div class="sm-pipeline">${this.STAGES.map((s, i) => {
      const cls = done ? 'done' : (i < cur ? 'done' : i === cur ? 'active' : '')
      return `<div class="sm-pipeline-stage ${cls}" title="${SM.esc(this._stageLabel(s))}">
        <div style="font-size:.68rem;font-weight:800">${SM.esc(this._stageLabel(s))}</div>
      </div>`
    }).join('')}</div>`
  },

  render(el) {
    if (SM.state.viewStack.length) return
    const all = this._items()
    const active = all.filter(w => this._statusOf(w) === 'active')
    const overdue = active.filter(w => this._isOverdue(w))
    const completed = all.filter(w => this._statusOf(w) === 'completed')
    const items = this._filtered()

    el.innerHTML = `
      ${SMUI.sectionHead(SM.t('workflow'), SMH.lbl('خط تولید تدوین و تحویل', 'Editing & delivery pipeline'), `
        <button type="button" class="sm-btn sm-btn-ghost" ${SMEvents.attrs('SMWorkflow.addFromContract')}><i class="fas fa-file-signature"></i> ${SMH.lbl('از قرارداد', 'From contract')}</button>
        <button type="button" class="sm-btn sm-btn-primary" ${SMEvents.attrs('SMWorkflow.add')}><i class="fas fa-plus"></i> ${SM.t('add')}</button>`)}
      ${SMUI.statCards([
        { label: SMH.lbl('در جریان', 'Active'), value: SM.fmt(active.length), color: 'var(--sm-accent)' },
        { label: SMH.lbl('سررسید گذشته', 'Overdue'), value: SM.fmt(overdue.length), color: 'var(--sm-danger)' },
        { label: SMH.lbl('تمام‌شده', 'Done'), value: SM.fmt(completed.length), color: 'var(--sm-success)' },
        { label: SMH.lbl('کل پروژه', 'Total'), value: SM.fmt(all.length), color: 'var(--sm-text-muted)' }
      ])}
      ${SMUI.tabs([
        { id: 'active', label: SMH.lbl('فعال', 'Active'), active: this._tab === 'active' },
        { id: 'on_hold', label: SMH.lbl('معلق', 'On hold'), active: this._tab === 'on_hold' },
        { id: 'completed', label: SMH.lbl('تمام‌شده', 'Done'), active: this._tab === 'completed' },
        { id: 'all', label: SMH.lbl('همه', 'All'), active: this._tab === 'all' }
      ], 'SMWorkflow.setTab')}
      ${items.length ? items.map(w => this._cardHtml(w)).join('') : SMUI.empty('fa-diagram-project', SM.t('no_data'))}`
  },

  _cardHtml(w) {
    const st = this.STATUS[this._statusOf(w)] || this.STATUS.active
    const pr = this.PRIORITY[w.priority || 'normal'] || this.PRIORITY.normal
    const type = this.TYPES[w.type || 'other'] || this.TYPES.other
    const overdue = this._isOverdue(w)
    return `
      <div class="sm-card sm-workflow-card" style="margin-bottom:16px">
        <div class="sm-card-head">
          <div>
            <div class="sm-card-title"><i class="fas ${type.icon}"></i> ${SM.esc(w.title || this._contractLabel(w.contractId))}</div>
            <div style="font-size:.78rem;color:var(--sm-text-muted);margin-top:4px">
              ${SM.esc(this._contractLabel(w.contractId))} · ${SM.esc(this._personnelName(w.personnelId))}
              ${w.dueDate ? ` · ${SMH.lbl('سررسید', 'Due')}: ${SM.esc(w.dueDate)}` : ''}
            </div>
          </div>
          <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">
            ${SMUI.badge(this._lbl(pr, w.priority || 'normal'), pr.badge)}
            ${overdue ? SMUI.badge(SMH.lbl('تأخیر', 'Late'), 'danger') : ''}
            ${SMUI.badge(this._lbl(st, this._statusOf(w)), st.badge)}
            <button type="button" class="sm-btn sm-btn-sm sm-btn-ghost" ${SMEvents.attrs('SMWorkflow.edit', [w.id])}><i class="fas fa-pen"></i></button>
            ${this._statusOf(w) === 'active' ? `
              <button type="button" class="sm-btn sm-btn-sm sm-btn-ghost" ${SMEvents.attrs('SMWorkflow.revert', [w.id])} title="${SMH.lbl('مرحله قبل', 'Previous')}"><i class="fas fa-arrow-right"></i></button>
              <button type="button" class="sm-btn sm-btn-sm sm-btn-primary" ${SMEvents.attrs('SMWorkflow.advance', [w.id])}>${SMH.lbl('مرحله بعد', 'Next')}</button>
            ` : ''}
          </div>
        </div>
        <div class="sm-card-body">
          ${this._pipelineHtml(w)}
          <div style="display:flex;justify-content:space-between;margin-top:10px;font-size:.75rem;color:var(--sm-text-muted)">
            <span>${SMH.lbl('مرحله', 'Stage')}: <strong>${SM.esc(this._stageLabel(w.stage))}</strong></span>
            <span>${SMH.lbl('پیشرفت', 'Progress')}: ${SM.fmt(this._progress(w))}٪</span>
          </div>
          ${w.notes ? `<p style="font-size:.82rem;color:var(--sm-text-muted);margin:10px 0 0">${SM.esc(w.notes)}</p>` : ''}
        </div>
      </div>`
  },

  add() { this._form(null) },

  addFromContract() {
    const contracts = DB.active('contracts').filter(c => c.status !== 'cancelled')
    if (!contracts.length) return SM.toast(SMH.lbl('قراردادی یافت نشد', 'No contracts'), 'error')
    SMUI.modal(SMH.lbl('پروژه تدوین از قرارداد', 'Workflow from contract'), `
      ${SMUI.formField(SMH.lbl('قرارداد', 'Contract'), 'wf-contract', {
        type: 'select',
        options: contracts.map(c => ({
          value: c.id,
          label: this._contractLabel(c.id)
        }))
      })}
      ${SMUI.formField(SMH.lbl('نوع کار', 'Type'), 'wf-type', {
        type: 'select',
        value: 'venue',
        options: Object.entries(this.TYPES).map(([k, _v]) => ({ value: k, label: this._lbl(this.TYPES, k) }))
      })}`, {
      onSave: async () => {
        const d = SMUI.readForm(['wf-contract', 'wf-type'])
        const c = DB.find('contracts', x => x.id === d['wf-contract'])
        if (!c) return SM.toast(SMH.lbl('قرارداد نامعتبر', 'Invalid contract'), 'error')
        const couple = c.couple || [c.bride, c.groom].filter(Boolean).join(' و ')
        await this._save(null, {
          title: `${this._typeLabel(d['wf-type'])} — ${couple || c.contractNum}`,
          contractId: c.id,
          type: d['wf-type'] || 'venue',
          stage: 'ingest',
          status: 'active',
          priority: 'normal',
          dueDate: c.deliveryDate || '',
          notes: ''
        })
      },
      width: 440
    })
  },

  edit(id) {
    const w = DB.find('workflows', x => x.id === id)
    if (!w) return
    this._form(w)
  },

  _form(item) {
    const typeOpts = Object.keys(this.TYPES).map(k => ({ value: k, label: this._typeLabel(k), selected: k === (item?.type || 'venue') }))
    const stageOpts = this.STAGES.map(s => ({ value: s, label: this._stageLabel(s), selected: s === (item?.stage || 'ingest') }))
    const prOpts = Object.keys(this.PRIORITY).map(k => ({ value: k, label: this._lbl(this.PRIORITY, k), selected: k === (item?.priority || 'normal') }))
    const stOpts = Object.keys(this.STATUS).map(k => ({ value: k, label: this._lbl(this.STATUS, k), selected: k === (item?.status || 'active') }))

    SMUI.modal(item ? SMH.lbl('ویرایش گردش کار', 'Edit workflow') : SMH.lbl('پروژه تدوین جدید', 'New workflow'), `
      ${SMUI.formField(SMH.lbl('عنوان', 'Title'), 'wf-title', { value: item?.title || '', placeholder: SMH.lbl('مثلاً: تدوین تالار — مریم و رضا', 'e.g. Venue edit — couple') })}
      ${SMUI.formField(SMH.lbl('قرارداد', 'Contract'), 'wf-contract', { type: 'select', value: item?.contractId || '', options: SMH.contractOptions(item?.contractId) })}
      ${SMUI.formField(SMH.lbl('نوع', 'Type'), 'wf-type', { type: 'select', options: typeOpts })}
      ${SMUI.formField(SMH.lbl('ادیتور / مسئول', 'Assignee'), 'wf-personnel', { type: 'select', value: item?.personnelId || '', options: [{ value: '', label: '—' }, ...SMH.personnelOptions(item?.personnelId)] })}
      ${SMUI.formField(SMH.lbl('مرحله', 'Stage'), 'wf-stage', { type: 'select', options: stageOpts })}
      ${SMUI.formField(SMH.lbl('اولویت', 'Priority'), 'wf-priority', { type: 'select', options: prOpts })}
      ${SMUI.formField(SMH.lbl('وضعیت', 'Status'), 'wf-status', { type: 'select', options: stOpts })}
      ${SMUI.formField(SMH.lbl('سررسید (شمسی)', 'Due date'), 'wf-due', { value: item?.dueDate || '', placeholder: '1404/07/15' })}
      ${SMUI.formField(SMH.lbl('یادداشت', 'Notes'), 'wf-notes', { type: 'textarea', value: item?.notes || '', rows: 3 })}`, {
      onSave: async () => {
        const d = SMUI.readForm(['wf-title', 'wf-contract', 'wf-type', 'wf-personnel', 'wf-stage', 'wf-priority', 'wf-status', 'wf-due', 'wf-notes'])
        if (!d['wf-title']?.trim()) return SM.toast(SMH.lbl('عنوان الزامی است', 'Title required'), 'error')
        await this._save(item?.id || null, {
          title: d['wf-title'].trim(),
          contractId: d['wf-contract'] || '',
          type: d['wf-type'] || 'venue',
          personnelId: d['wf-personnel'] || '',
          stage: d['wf-stage'] || 'ingest',
          priority: d['wf-priority'] || 'normal',
          status: d['wf-status'] || 'active',
          dueDate: d['wf-due'] || '',
          notes: d['wf-notes'] || '',
          completedAt: d['wf-status'] === 'completed' ? (item?.completedAt || Utils.todayJalali()) : ''
        })
      },
      onDelete: item ? () => SMH.remove('workflows', item.id, 'workflow') : null,
      width: 520
    })
  },

  async _save(id, data) {
    data.progress = this._progress({ ...data, status: data.status })
    if (id) {
      await SecureDB.update('workflows', id, data)
      SM.log('workflow_update', data.title)
    } else {
      await SecureDB.insert('workflows', data)
      SM.log('workflow_create', data.title)
    }
    SMH.refresh('workflow')
  },

  async advance(id) {
    const w = DB.find('workflows', x => x.id === id)
    if (!w || this._statusOf(w) !== 'active') return
    const idx = this.STAGES.indexOf(w.stage || 'ingest')
    if (idx >= this.STAGES.length - 1) {
      await SecureDB.update('workflows', id, {
        status: 'completed',
        completedAt: Utils.todayJalali(),
        progress: 100
      })
      await this._notifyStage(w, 'delivery', true)
      SM.toast(SMH.lbl('پروژه تکمیل شد', 'Project completed'), 'success')
    } else {
      const next = this.STAGES[idx + 1]
      await SecureDB.update('workflows', id, {
        stage: next,
        progress: Math.round(((idx + 1) / (this.STAGES.length - 1)) * 100)
      })
      await this._notifyStage(w, next, false)
      SM.toast(SMH.lbl('مرحله به‌روز شد', 'Stage updated'), 'success')
    }
    SM.navigate('workflow')
  },

  async revert(id) {
    const w = DB.find('workflows', x => x.id === id)
    if (!w || this._statusOf(w) !== 'active') return
    const idx = this.STAGES.indexOf(w.stage || 'ingest')
    if (idx <= 0) return SM.toast(SMH.lbl('در اولین مرحله هستید', 'Already at first stage'), 'info')
    const prev = this.STAGES[idx - 1]
    await SecureDB.update('workflows', id, {
      stage: prev,
      progress: Math.round(((idx - 1) / (this.STAGES.length - 1)) * 100)
    })
    SM.navigate('workflow')
  },

  async _notifyStage(w, stage, completed) {
    const title = completed
      ? `✅ تدوین تمام: ${w.title || this._contractLabel(w.contractId)}`
      : `🎬 ${this._stageLabel(stage)}: ${w.title || this._contractLabel(w.contractId)}`
    await SecureDB.insert('notifications', {
      type: completed ? 'success' : 'info',
      title,
      text: SMH.lbl(`مرحله ${this._stageLabel(stage)}`, `Stage ${this._stageLabel(stage)}`),
      read: false,
      createdAt: Utils.todayJalali()
    })
  }
}

SMModules.workflow = {
  setTab(tab) { SMWorkflow.setTab(tab) },
  render(el) { SMWorkflow.render(el) },
  add() { SMWorkflow.add() },
  edit(id) { SMWorkflow.edit(id) },
  advance(id) { SMWorkflow.advance(id) }
}

window.SMWorkflow = SMWorkflow
