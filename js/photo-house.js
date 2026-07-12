/* ══════════════════════════════════════════════
   MAN — عکس‌خانه (Photo House Module)
   چاپ، انتخاب عکس، آلبوم، تحویل
   ══════════════════════════════════════════════ */

const PhotoHouse = {
  LABEL: 'عکس‌خانه',

  ORDER_TYPES: {
    selection: { label: 'انتخاب عکس', icon: '🖼️', color: '#8B5CF6' },
    print: { label: 'چاپ', icon: '🖨️', color: '#3B82F6' },
    album: { label: 'آلبوم', icon: '📔', color: '#C9A96E' },
    delivery: { label: 'تحویل', icon: '📦', color: '#22C55E' }
  },

  ORDER_STATUS: {
    pending: { label: 'ثبت شده', icon: '📝' },
    selection: { label: 'در انتخاب', icon: '🖼️' },
    editing: { label: 'در ادیت', icon: '✂️' },
    sent: { label: 'ارسال به چاپ', icon: '🏭' },
    ready: { label: 'آماده تحویل', icon: '✅' },
    delivered: { label: 'تحویل شده', icon: '🎁' }
  },

  SELECTION_STATUS: {
    pending: { label: 'در انتظار انتخاب', icon: '⏳' },
    in_progress: { label: 'در حال انتخاب', icon: '🖼️' },
    submitted: { label: 'ارسال شده', icon: '📤' },
    approved: { label: 'تأیید شده', icon: '✅' },
    rejected: { label: 'نیاز به اصلاح', icon: '❌' }
  },

  ALBUM_STATUS: {
    draft: { label: 'پیش‌نویس', step: 0 },
    selection: { label: 'انتخاب عکس', step: 1 },
    design: { label: 'طراحی آلبوم', step: 2 },
    print: { label: 'در چاپ', step: 3 },
    ready: { label: 'آماده تحویل', step: 4 },
    delivered: { label: 'تحویل شده', step: 5 }
  },

  ITEM_PRESETS: [
    { name: 'آلبوم ۳۰×۳۰ جلد چرم', unitPrice: 8500000 },
    { name: 'آلبوم ۳۰×۶۰ جلد چرم', unitPrice: 12000000 },
    { name: 'آلبوم دیجیتال', unitPrice: 3500000 },
    { name: 'چاپ ۲۰×۳۰ (هر عدد)', unitPrice: 150000 },
    { name: 'چاپ ۳۰×۴۰ (هر عدد)', unitPrice: 250000 },
    { name: 'چاپ ۴۰×۶۰ (هر عدد)', unitPrice: 450000 },
    { name: 'قاب چوبی ۳۰×۴۰', unitPrice: 1800000 },
    { name: 'قاب چوبی ۴۰×۶۰', unitPrice: 2800000 },
    { name: 'کانواس ۵۰×۷۰', unitPrice: 3200000 },
    { name: 'ادیت عکس (هر عدد)', unitPrice: 80000 },
    { name: 'انتخاب عکس (پکیج)', unitPrice: 0 }
  ],

  CUSTOMER_PIPELINE: [
    { key: 'contract', label: 'ثبت قرارداد', icon: '📋' },
    { key: 'shooting', label: 'عکاسی مراسم', icon: '📸' },
    { key: 'selection', label: 'انتخاب عکس', icon: '🖼️' },
    { key: 'editing', label: 'ادیت و طراحی', icon: '✂️' },
    { key: 'print', label: 'چاپ / آلبوم', icon: '📔' },
    { key: 'delivered', label: 'تحویل نهایی', icon: '✅' }
  ],

  normalizeItem(item) {
    const qty = Math.max(1, parseInt(item.qty, 10) || 1)
    const unitPrice = parseInt(item.unitPrice ?? item.price, 10) || 0
    const total = item.total != null ? parseInt(item.total, 10) : qty * unitPrice
    return {
      name: item.name || '',
      qty,
      unitPrice,
      price: unitPrice,
      total,
      selected: !!item.selected
    }
  },

  calcItemsTotal(items) {
    return (items || []).reduce((s, i) => {
      const n = this.normalizeItem(i)
      return s + n.total
    }, 0)
  },

  formatItemLine(item) {
    const n = this.normalizeItem(item)
    if (n.qty > 1) return `${n.name} × ${Utils.fmtNum(n.qty)} = ${Utils.fmtNum(n.total)}`
    return `${n.name} — ${Utils.fmtNum(n.total)}`
  },

  getContractPhotoStage(contractId) {
    const albums = DB.filter('albums', a => a.contractId === contractId)
    const orders = DB.filter('printOrders', o => o.customerId === contractId)
    const selections = DB.filter('photoSelections', s => s.contractId === contractId)

    if (albums.some(a => a.status === 'delivered') || orders.some(o => o.status === 'delivered')) return 5
    if (albums.some(a => ['print', 'ready'].includes(a.status)) || orders.some(o => ['sent', 'ready'].includes(o.status))) return 4
    if (albums.some(a => ['design', 'selection'].includes(a.status)) || orders.some(o => ['editing', 'selection'].includes(o.status))) return 3
    if (selections.some(s => s.status === 'submitted' || s.status === 'approved')) return 2
    if (selections.some(s => s.status === 'in_progress')) return 1
    const pers = DB.filter('persProjects', p => p.contractId === contractId && p.accepted === true)
    if (pers.some(p => ['active', 'editing', 'finished'].includes(p.status))) return 1
    return 0
  },

  getContractSummary(contractId) {
    const albums = DB.filter('albums', a => a.contractId === contractId)
    const orders = DB.filter('printOrders', o => o.customerId === contractId)
    const selections = DB.filter('photoSelections', s => s.contractId === contractId)
    const stage = this.getContractPhotoStage(contractId)
    const pendingSelection = selections.find(s => ['pending', 'in_progress', 'rejected'].includes(s.status))
    const activeAlbum = albums.find(a => !['delivered'].includes(a.status))
    const activeOrder = orders.find(o => !['delivered'].includes(o.status))
    return { stage, albums, orders, selections, pendingSelection, activeAlbum, activeOrder }
  },

  migrateLegacyOrders() {
    const orders = DB.get('printOrders') || []
    let changed = false
    orders.forEach(o => {
      if (!o.orderType) { o.orderType = o.type || 'print'; changed = true }
      if (!o.items?.length) return
      o.items = o.items.map(i => {
        const n = this.normalizeItem(i)
        if (i.qty === undefined || i.unitPrice === undefined) changed = true
        return n
      })
      const total = this.calcItemsTotal(o.items)
      if (!o.totalAmount || o.totalAmount !== total) {
        o.totalAmount = total
        o.remaining = Math.max(0, total - (o.deposit || 0))
        changed = true
      }
    })
    if (changed) SecureDB.set ? SecureDB.set('printOrders', orders) : DB.set('printOrders', orders)
  },

  /** یک دعوت انتخاب فعال per قرارداد — بدون تکرار */
  upsertPhotoSelection(data) {
    const open = DB.get('photoSelections').find(s =>
      s.contractId === data.contractId && ['pending', 'in_progress', 'rejected'].includes(s.status)
    )
    if (open) {
      SecureDB.update ? SecureDB.update('photoSelections', open.id, {
        maxPhotos: data.maxPhotos ?? open.maxPhotos,
        notes: data.notes ?? open.notes,
        couple: data.couple ?? open.couple,
        contractNum: data.contractNum ?? open.contractNum,
        status: data.status === 'rejected' ? 'pending' : (data.status || open.status)
      }) : DB.update('photoSelections', open.id, {
        maxPhotos: data.maxPhotos ?? open.maxPhotos,
        notes: data.notes ?? open.notes,
        couple: data.couple ?? open.couple,
        contractNum: data.contractNum ?? open.contractNum,
        status: data.status === 'rejected' ? 'pending' : (data.status || open.status)
      })
      return open
    }
    return SecureDB.insert ? SecureDB.insert('photoSelections', {
      contractId: data.contractId,
      contractNum: data.contractNum || '',
      couple: data.couple || '',
      maxPhotos: data.maxPhotos || 50,
      selectedPhotos: [],
      notes: data.notes || '',
      status: 'pending',
      createdAt: Utils.todayJalali()
    }) : DB.insert('photoSelections', {
      contractId: data.contractId,
      contractNum: data.contractNum || '',
      couple: data.couple || '',
      maxPhotos: data.maxPhotos || 50,
      selectedPhotos: [],
      notes: data.notes || '',
      status: 'pending',
      createdAt: Utils.todayJalali()
    })
  },

  selectionStatusLabel(status) {
    return this.SELECTION_STATUS[status]?.label || status
  }
}

window.PhotoHouse = PhotoHouse
