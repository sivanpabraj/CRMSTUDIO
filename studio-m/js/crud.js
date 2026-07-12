/* Studio M Pro — Shared CRUD & module helpers */
const SMH = {
  fa: () => SM.state.locale === 'fa',
  lbl(fa, en) { return SM.state.locale === 'fa' ? fa : en },

  refresh(route) {
    SMUI.closeModal()
    SM.navigate(route)
    SM.toast(SM.t('success'), 'success')
  },

  refreshOrSubView(route, subViewFn) {
    SMUI.closeModal()
    if (SM.state.viewStack.length && subViewFn) {
      SM.state.viewStack.pop()
      subViewFn()
    } else {
      SM.navigate(route)
    }
    SM.toast(SM.t('success'), 'success')
  },

  confirmDelete(msg) {
    return confirm(msg || (SM.t('delete') + '?'))
  },

  _afterDelete(collection, id, route) {
    SM.log('delete', `${collection}:${id}`)
    if (SM.state.viewStack.length) SM.popSubView()
    else SM.navigate(route)
    SM.toast(SM.t('success'), 'success')
  },

  remove(collection, id, route) {
    if (!SMH.confirmDelete()) return
    const done = () => SMH._afterDelete(collection, id, route)
    if (typeof SecureDB !== 'undefined' && SecureDB.delete) {
      SecureDB.delete(collection, id).then(done).catch(e => SM.toast(e.message || 'خطا', 'error'))
      return
    }
    DB.delete(collection, id)
    done()
  },

  roleOptions(selected) {
    const roles = typeof getAllRoles === 'function' ? getAllRoles() : []
    return roles.map(r => ({ value: r.id, label: `${r.emoji || ''} ${r.title}`.trim(), selected: r.id === selected }))
  },

  personnelOptions(selected) {
    return DB.get('personnel').map(p => ({ value: p.id, label: p.name, selected: p.id === selected }))
  },

  contractOptions(selected) {
    return [{ value: '', label: '—' }, ...DB.get('contracts').map(c => ({
      value: c.id,
      label: c.couple || c.contractNum || c.id,
      selected: c.id === selected
    }))]
  },

  statusOptions(list, selected) {
    return list.map(o => ({ ...o, selected: o.value === selected }))
  },

  filterBySearch(items, fields, route) {
    const q = SM.getModuleSearch(route || SM.state.route)
    if (!q) return items
    return items.filter(item => fields.some(f => String(item[f] ?? '').toLowerCase().includes(q)))
  },

  section(route, titleFa, titleEn, desc, actionHtml) {
    return SMUI.sectionHead(SMH.lbl(titleFa, titleEn), desc, actionHtml)
  },

  addBtn(onclick) {
    return `<button type="button" class="sm-btn sm-btn-primary" onclick="${onclick}"><i class="fas fa-plus"></i> ${SM.t('add')}</button>`
  },

  deleteInModal(collection, id, route) {
    if (!SMH.confirmDelete()) return
    const done = () => {
      SM.log('delete', `${collection}:${id}`)
      SMUI.closeModal()
      if (SM.state.viewStack.length) SM.popSubView()
      else SM.navigate(route)
      SM.toast(SM.t('success'), 'success')
    }
    if (typeof SecureDB !== 'undefined' && SecureDB.delete) {
      SecureDB.delete(collection, id).then(done).catch(e => SM.toast(e.message || 'خطا', 'error'))
      return
    }
    DB.delete(collection, id)
    done()
  },

  modalDeleteBtn(collection, id, route) {
    return `<button type="button" class="sm-btn sm-btn-danger" onclick="SMH.deleteInModal('${collection}','${id}','${route}')"><i class="fas fa-trash"></i> ${SM.t('delete')}</button>`
  },

  tabModule(mod, el, tabs, renderTab) {
    if (SM.state.viewStack.length) return
    el.innerHTML = `
      ${mod._sectionHead?.() || ''}
      ${SMUI.tabs(tabs.map(t => ({
        id: t.id,
        label: SMH.lbl(t.fa, t.en),
        icon: t.icon,
        onclick: `${mod._tabHandler}('${t.id}')`
      })), mod._tab || tabs[0].id)}
      <div style="margin-top:16px">${renderTab(mod._tab || tabs[0].id)}</div>`
  },

  bindTabModule(mod, route, tabs, renders, sectionHead) {
    mod._tab = mod._tab || tabs[0].id
    mod._tabHandler = `SMModules.${route}.setTab`
    mod._sectionHead = sectionHead
    mod.setTab = function (tab) {
      this._tab = tab
      SM.navigate(route)
    }
    mod.render = function (el) {
      if (SM.state.viewStack.length) return
      SMH.tabModule(this, el, tabs, id => renders[id]?.() || '')
    }
  }
}

window.SMH = SMH
