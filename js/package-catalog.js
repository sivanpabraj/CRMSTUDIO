/* کاتالوگ پکیج — مشترک بین Studio M و فرم قرارداد */

const PackageCatalog = {
  TIERS: {
    economic: { label: 'اقتصادی', color: '#16A34A', icon: '🌱' },
    silver: { label: 'سیلور', color: '#94A3B8', icon: '🥈' },
    gold: { label: 'گلد', color: '#C9A96E', icon: '🥇' },
    vip: { label: 'وی‌آی‌پی', color: '#5856D6', icon: '👑' },
    cip: { label: 'سی‌آی‌پی', color: '#0071E3', icon: '💎' },
    custom: { label: 'سفارشی', color: '#64748B', icon: '✏️' }
  },

  ADDONS: [
    { id: 'photoVenue', checkId: 'pkg-photo-venue', priceId: 'price-photo-venue', label: 'عکاسی مراسم (تالار)', icon: '📸' },
    { id: 'photoGarden', checkId: 'pkg-photo-garden', priceId: 'price-photo-garden', label: 'عکاسی باغ', icon: '🌳' },
    { id: 'helishot', checkId: 'pkg-helishot', priceId: 'price-helishot', label: 'هلی‌شات', icon: '🚁' },
    { id: 'fpv', checkId: 'pkg-fpv', priceId: 'price-fpv', label: 'FPV', icon: '🎮' },
    { id: 'crane', checkId: 'pkg-crane', priceId: 'price-crane', label: 'کرین', icon: '🏗️' },
    { id: 'tv', checkId: 'pkg-tv', priceId: 'price-tv', label: 'پروژکشن / TV', icon: '📺' }
  ],

  addonById(id) {
    return this.ADDONS.find(a => a.id === id)
  },

  tierMeta(tier) {
    return this.TIERS[tier] || { label: tier || 'پکیج', color: '#64748B', icon: '📦' }
  },

  /** یکسان‌سازی پکیج قدیمی / جدید */
  normalize(pkg) {
    if (!pkg) return null
    const p = { ...pkg }
    if (!p.photoVenue && p.addons) {
      p.photoVenue = this._rowFromAddons(p.addons, 'photoVenue')
      p.photoGarden = this._rowFromAddons(p.addons, 'photoGarden')
      p.helishot = this._rowFromAddons(p.addons, 'helishot')
      p.fpv = this._rowFromAddons(p.addons, 'fpv')
      p.crane = this._rowFromAddons(p.addons, 'crane')
      p.tv = this._rowFromAddons(p.addons, 'tv')
    }
    if (!p.video) p.video = { cameras: 3, quality: '4k', price: 0, price4k: 0, clip: true, note: '' }
    if (!p.album) p.album = { enabled: false, size: '20x20', photoCount: 10, price: 0, note: '' }
    if (!p.disk) p.disk = { enabled: false, label: 'دیسک USB', price: 0, note: '' }
    if (!p.customItems) p.customItems = []
    if (p.tier === 'cbi') p.tier = 'cip'
    if (p.active === undefined) p.active = true
    if (!Number.isFinite(Number(p.version))) p.version = 1
    ;['photoVenue', 'photoGarden', 'helishot', 'fpv', 'crane', 'tv'].forEach(k => {
      if (!p[k]) p[k] = { enabled: false, price: 0, note: '' }
    })
    return p
  },

  _rowFromAddons(addons, id) {
    const row = (addons || []).find(a => a.id === id)
    return { enabled: !!row?.enabled, price: row?.price || 0, note: row?.note || '' }
  },

  _toAddons(p) {
    return this.ADDONS.map(ad => ({
      id: ad.id,
      enabled: !!p[ad.id]?.enabled,
      price: +(p[ad.id]?.price || 0),
      note: p[ad.id]?.note || ''
    }))
  },

  packageTotal(pkg) {
    const p = this.normalize(pkg)
    if (!p) return 0
    let t = +(p.video?.price || 0) + +(p.video?.price4k || 0)
    this.ADDONS.forEach(ad => {
      const row = p[ad.id]
      if (row?.enabled) t += +(row.price || 0)
    })
    if (p.album?.enabled) t += +(p.album.price || 0)
    if (p.disk?.enabled) t += +(p.disk.price || 0)
    ;(p.customItems || []).forEach(c => { t += +(c.price || 0) })
    return t
  },

  featureLines(pkg) {
    const p = this.normalize(pkg)
    if (!p) return []
    const lines = []
    const v = p.video || {}
    if (v.cameras) {
      let s = `${v.cameras} دوربین`
      if (v.quality === '4k') s += ' — 4K'
      if (v.clip) s += ' + کلیپ'
      lines.push(s)
    }
    this.ADDONS.forEach(ad => {
      const row = p[ad.id]
      if (row?.enabled) lines.push(`${ad.icon} ${ad.label}`)
    })
    if (p.album?.enabled) {
      lines.push(`📔 آلبوم ${p.album.size || ''}${p.album.photoCount ? ` (${p.album.photoCount} عکس)` : ''}`.trim())
    }
    if (p.disk?.enabled) lines.push(`💿 ${p.disk.label || 'دیسک'}`)
    ;(p.customItems || []).forEach(c => { if (c.label) lines.push(c.label) })
    return lines
  },

  /** نسخه غیرقابل‌تغییر پکیج برای نگهداری داخل قرارداد */
  snapshot(pkg) {
    const p = this.normalize(pkg)
    if (!p) return null
    return JSON.parse(JSON.stringify({
      sourcePackageId: pkg.id || '',
      sourceVersion: Number(p.version) || 1,
      name: p.name || '',
      tier: p.tier || 'custom',
      description: p.description || '',
      video: p.video,
      addons: this._toAddons(p),
      album: p.album,
      disk: p.disk,
      customItems: p.customItems,
      total: this.packageTotal(p),
      features: this.featureLines(p),
      capturedAt: new Date().toISOString()
    }))
  },

  defaultPackages() {
    return [
      {
        tier: 'economic', name: 'پکیج اقتصادی', featured: false,
        description: 'پوشش پایه و قابل ویرایش برای مراسم جمع‌وجور',
        video: { cameras: 2, quality: 'fullhd', price: 0, price4k: 0, clip: true, note: 'فیلمبرداری و کلیپ روز مراسم' },
        photoVenue: { enabled: false, price: 0, note: '' },
        photoGarden: { enabled: false, price: 0, note: '' },
        helishot: { enabled: false, price: 0, note: '' },
        fpv: { enabled: false, price: 0, note: '' },
        crane: { enabled: false, price: 0, note: '' },
        tv: { enabled: false, price: 0, note: '' },
        album: { enabled: false, size: '20x20', photoCount: 10, price: 0, note: '' },
        disk: { enabled: false, label: 'فلش تحویل فایل', price: 0, note: '' },
        customItems: []
      },
      {
        tier: 'silver', name: 'پکیج سیلور', featured: false,
        description: 'فیلمبرداری پایه — مناسب مراسم جمع‌وجور',
        video: { cameras: 2, quality: 'fullhd', price: 28000000, price4k: 0, clip: true, note: 'فیلم Full HD + کلیپ کوتاه' },
        photoVenue: { enabled: false, price: 0, note: '' },
        photoGarden: { enabled: false, price: 0, note: '' },
        helishot: { enabled: false, price: 0, note: '' },
        fpv: { enabled: false, price: 0, note: '' },
        crane: { enabled: false, price: 0, note: '' },
        tv: { enabled: false, price: 0, note: '' },
        album: { enabled: false, size: '20x20', photoCount: 10, price: 0, note: '' },
        disk: { enabled: false, label: 'فلش 64GB', price: 0, note: '' },
        customItems: []
      },
      {
        tier: 'gold', name: 'پکیج گلد', featured: true,
        description: 'ترکیب محبوب — ۳ دوربین، 4K و عکاسی تالار',
        video: { cameras: 3, quality: '4k', price: 32000000, price4k: 4000000, clip: true, note: '۳ دوربین + کلیپ سینمایی' },
        photoVenue: { enabled: true, price: 8000000, note: 'عکاسی مراسم در تالار' },
        photoGarden: { enabled: false, price: 6000000, note: '' },
        helishot: { enabled: false, price: 12000000, note: '' },
        fpv: { enabled: false, price: 0, note: '' },
        crane: { enabled: false, price: 0, note: '' },
        tv: { enabled: false, price: 0, note: '' },
        album: { enabled: true, size: '25x25', photoCount: 20, price: 15000000, note: 'طراحی و چاپ آلبوم' },
        disk: { enabled: true, label: 'USB 128GB', price: 2000000, note: 'تحویل فیلم و عکس' },
        customItems: []
      },
      {
        tier: 'vip', name: 'پکیج VIP', featured: false,
        description: 'کامل — ۴ دوربین، هلی‌شات و عکاسی',
        video: { cameras: 4, quality: '4k', price: 45000000, price4k: 0, clip: true, note: '' },
        photoVenue: { enabled: true, price: 8000000, note: '' },
        photoGarden: { enabled: true, price: 6000000, note: '' },
        helishot: { enabled: true, price: 15000000, note: 'شات هوایی مراسم' },
        fpv: { enabled: false, price: 0, note: '' },
        crane: { enabled: false, price: 0, note: '' },
        tv: { enabled: false, price: 0, note: '' },
        album: { enabled: true, size: '30x30', photoCount: 30, price: 22000000, note: '' },
        disk: { enabled: true, label: 'Blu-ray + USB', price: 3500000, note: '' },
        customItems: []
      },
      {
        tier: 'cip', name: 'پکیج CIP', featured: false,
        description: 'سفارشی سینمایی — FPV، کرین و TV',
        video: { cameras: 5, quality: '4k', price: 55000000, price4k: 0, clip: true, note: 'پوشش سینمایی کامل' },
        photoVenue: { enabled: true, price: 8000000, note: '' },
        photoGarden: { enabled: false, price: 0, note: '' },
        helishot: { enabled: false, price: 0, note: '' },
        fpv: { enabled: true, price: 10000000, note: 'FPV ورود عروس' },
        crane: { enabled: true, price: 8000000, note: '' },
        tv: { enabled: true, price: 5000000, note: 'پخش زنده مراسم' },
        album: { enabled: true, size: 'luxury', photoCount: 40, price: 35000000, note: 'آلبوم لوکس' },
        disk: { enabled: true, label: 'NAS + USB', price: 5000000, note: '' },
        customItems: [{ label: 'تدوین سینمایی ویژه', desc: 'گرید رنگ اختصاصی', price: 12000000 }]
      }
    ]
  },

  ensureDefaults() {
    if (typeof DB === 'undefined' || !DB.get) return
    if (DB.get('packages').length) return
    this.defaultPackages().forEach(p => {
      const tier = this.tierMeta(p.tier)
      const norm = this.normalize(p)
      DB.insert('packages', {
        ...norm,
        addons: this._toAddons(norm),
        color: tier.color,
        features: this.featureLines(norm),
        createdAt: typeof Utils !== 'undefined' ? Utils.todayJalali() : ''
      })
    })
  },

  _fmtPrice(n) {
    if (typeof fmtNum === 'function') return fmtNum(n)
    if (typeof Utils !== 'undefined') return Utils.fmtNum(n)
    return String(n)
  },

  applyToContractForm(pkg, state) {
    if (!pkg || typeof document === 'undefined') return
    const p = this.normalize(pkg)
    this._clearContractAddons()
    const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.value = val ?? '' }
    const setChk = (id, on) => { const el = document.getElementById(id); if (el) el.checked = !!on }

    const v = p.video || {}
    if (v.cameras) setVal('pkg-cameras', String(v.cameras))
    if (v.quality) setVal('pkg-quality', v.quality)
    if (v.price) setVal('price-cameras', this._fmtPrice(v.price))
    if (v.quality === '4k' && v.price4k) setVal('price-quality-4k', this._fmtPrice(v.price4k))
    else setVal('price-quality-4k', '')

    this.ADDONS.forEach(ad => {
      const row = p[ad.id]
      setChk(ad.checkId, row?.enabled)
      setVal(ad.priceId, row?.enabled && row?.price ? this._fmtPrice(row.price) : '')
    })

    if (p.album?.enabled) {
      setChk('ord-album', true)
      if (p.album.size) setVal('album-size', p.album.size)
      if (p.album.price) setVal('price-album', this._fmtPrice(p.album.price))
      if (typeof toggleAlbumFields === 'function') toggleAlbumFields()
    }

    const extras = []
    if (p.disk?.enabled && p.disk.price) {
      extras.push({ label: p.disk.label || 'دیسک', price: p.disk.price, note: p.disk.note })
    }
    ;(p.customItems || []).forEach(c => {
      if (c.label && c.price) extras.push({ ...c })
    })

    if (state) {
      state.packageExtras = extras
      state.selectedPackageId = pkg.id
      state.selectedPackageName = p.name
      state.selectedPackageSnapshot = this.snapshot(pkg)
    }

    if (typeof updateCamOperators === 'function') updateCamOperators()
    if (typeof toggleQualityPrice === 'function') toggleQualityPrice()
    if (typeof calcTotals === 'function') calcTotals()
  },

  _clearContractAddons() {
    this.ADDONS.forEach(ad => {
      const c = document.getElementById(ad.checkId)
      const pr = document.getElementById(ad.priceId)
      if (c) c.checked = false
      if (pr) pr.value = ''
    })
  },

  clearContractForm(state) {
    if (typeof document === 'undefined') return
    this._clearContractAddons()
    const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.value = val ?? '' }
    const setChk = (id, on) => { const el = document.getElementById(id); if (el) el.checked = !!on }

    setVal('pkg-cameras', '1')
    setVal('pkg-quality', '1080p')
    setVal('price-cameras', '')
    setVal('price-quality-4k', '')
    setChk('ord-album', false)
    setVal('album-size', '')
    setVal('price-album', '')
    setChk('ord-prints', false)
    setChk('ord-photo-pack', false)

    if (state) {
      state.packageExtras = []
      state.selectedPackageId = null
      state.selectedPackageName = ''
      state.selectedPackageSnapshot = null
    }

    if (typeof updateCamOperators === 'function') updateCamOperators()
    if (typeof toggleQualityPrice === 'function') toggleQualityPrice()
    if (typeof toggleAlbumFields === 'function') toggleAlbumFields()
    if (typeof togglePrintFields === 'function') togglePrintFields()
    if (typeof togglePhotoPackFields === 'function') togglePhotoPackFields()
    if (typeof calcTotals === 'function') calcTotals()
  }
}

window.PackageCatalog = PackageCatalog
