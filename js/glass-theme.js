/* ══════════════════════════════════════════════
   MAN — Glass Theme: پس‌زمینه پویا و تم شیشه‌ای
   ══════════════════════════════════════════════ */

const GlassTheme = {
  PRESETS: [
    { id: 'sunset', label: 'غروب دریا', icon: '🌅' },
    { id: 'cosmos', label: 'کهکشان', icon: '🌌' },
    { id: 'aurora', label: 'شفق قطبی', icon: '✨' },
    { id: 'wedding', label: 'عروسی', icon: '💒' },
    { id: 'ocean', label: 'اقیانوس', icon: '🌊' },
    { id: 'mountain', label: 'کوهستان', icon: '🏔️' },
    { id: 'neon', label: 'نئون', icon: '🌃' },
    { id: 'forest', label: 'جنگل', icon: '🌲' }
  ],

  ACCENTS: ['gold', 'sunset', 'ocean', 'violet', 'rose', 'emerald'],

  _scope: 'global',

  init(scope) {
    this._scope = scope || this._detectScope()
    if (this._scope === 'contract') {
      this._ensureContractShell()
    } else {
      this._ensureShell()
    }
    this.apply()
    this._ensureRail()
  },

  _detectScope() {
    const p = (location.pathname || '').toLowerCase()
    if (p.includes('admin')) return 'admin'
    if (p.includes('customer')) return 'customer'
    if (p.includes('contract')) return 'contract'
    return 'portal'
  },

  _storageKey() {
    return `${AppConfig.WALLPAPER_KEY}_${this._scope}`
  },

  getSettings() {
    const defaults = { preset: 'sunset', custom: null, accent: 'gold' }
    const global = Utils.storage.get(AppConfig.WALLPAPER_KEY, null)
    const scoped = Utils.storage.get(this._storageKey(), null)
    return { ...defaults, ...(global || {}), ...(scoped || {}) }
  },

  saveSettings(patch) {
    const next = { ...this.getSettings(), ...patch }
    Utils.storage.set(this._storageKey(), next)
    if (patch.syncGlobal) {
      Utils.storage.set(AppConfig.WALLPAPER_KEY, { preset: next.preset, custom: next.custom, accent: next.accent })
    }
    this.apply()
  },

  _ensureShell() {
    if (!document.getElementById('glass-bg-layer')) {
      const layer = document.createElement('div')
      layer.id = 'glass-bg-layer'
      layer.className = 'glass-bg-layer'
      layer.innerHTML = '<div class="glass-bg-scrim"></div>'
      document.body.prepend(layer)
    }
    document.body.classList.add('glass-app')
    if (this._scope !== 'admin') {
      document.documentElement.classList.add('theme-dark')
    }
  },

  /** فرم قرارداد: پس‌زمینه شیشه‌ای بدون تم تیره اجباری */
  _ensureContractShell() {
    if (!document.getElementById('glass-bg-layer')) {
      const layer = document.createElement('div')
      layer.id = 'glass-bg-layer'
      layer.className = 'glass-bg-layer preset-wedding'
      layer.innerHTML = '<div class="glass-bg-scrim" style="opacity:0.35"></div>'
      document.body.prepend(layer)
    }
    document.body.classList.add('glass-app', 'glass-enabled')
    document.documentElement.classList.remove('theme-dark')
  },

  apply() {
    const s = this.getSettings()
    const layer = document.getElementById('glass-bg-layer')
    if (!layer) return

    document.documentElement.setAttribute('data-glass-accent', s.accent || 'gold')

    if (s.custom) {
      layer.className = 'glass-bg-layer'
      layer.style.backgroundImage = `url("${s.custom}")`
    } else {
      layer.style.backgroundImage = ''
      const preset = s.preset || 'sunset'
      layer.className = `glass-bg-layer preset-${preset}`
    }
  },

  _ensureRail() {
    if (['contract', 'admin', 'portal', 'customer'].includes(this._scope)) return
    if (document.getElementById('glass-rail')) return
    const rail = document.createElement('div')
    rail.id = 'glass-rail'
    rail.className = 'glass-rail'
    rail.innerHTML = `
      <button class="glass-rail-btn" type="button" title="تنظیم ظاهر (پس‌زمینه و رنگ)" data-csp-action="GlassTheme.openPicker" aria-label="تنظیم ظاهر">
        <i class="fas fa-wand-magic-sparkles"></i>
      </button>`
    document.body.appendChild(rail)
  },

  openPicker() {
    document.getElementById('glass-picker-overlay')?.remove()
    const s = this.getSettings()
    const overlay = document.createElement('div')
    overlay.id = 'glass-picker-overlay'
    overlay.className = 'glass-picker-overlay'
    overlay.onclick = e => { if (e.target === overlay) overlay.remove() }

    overlay.innerHTML = `
      <div class="glass-picker-modal" role="dialog" aria-label="تنظیم ظاهر">
        <h2><i class="fas fa-wand-magic-sparkles" style="color:var(--glass-accent);margin-left:8px"></i> ظاهر شیشه‌ای</h2>
        <p class="glass-picker-sub">پس‌زمینه و رنگ تم را شخصی‌سازی کنید. تصویر آپلودی فقط روی این بخش ذخیره می‌شود.</p>

        <div style="font-size:13px;font-weight:700;color:#fff;margin-bottom:10px">پس‌زمینه‌های آماده</div>
        <div class="glass-preset-grid" id="glass-preset-grid">
          ${this.PRESETS.map(p => `
            <button type="button" class="glass-preset-tile preset-${p.id} ${!s.custom && s.preset === p.id ? 'selected' : ''}"
              data-preset="${p.id}" data-csp-action="GlassTheme.selectPreset" data-csp-arg="${p.id}" title="${p.label}">
              <span class="glass-preset-label">${p.icon} ${p.label}</span>
            </button>`).join('')}
        </div>

        <div style="font-size:13px;font-weight:700;color:#fff;margin-bottom:10px">رنگ تم</div>
        <div class="glass-accent-row" id="glass-accent-row">
          ${this.ACCENTS.map(a => `
            <button type="button" class="glass-accent-swatch ${s.accent === a ? 'selected' : ''}"
              data-accent="${a}" data-csp-action="GlassTheme.selectAccent" data-csp-arg="${a}" aria-label="${a}"></button>`).join('')}
        </div>

        <div style="font-size:13px;font-weight:700;color:#fff;margin-bottom:10px">آپلود تصویر شخصی</div>
        <label class="glass-upload-zone" for="glass-bg-upload">
          <i class="fas fa-cloud-upload-alt"></i>
          <p>کلیک کنید یا تصویر را بکشید<br><span style="font-size:11px;opacity:0.7">حداکثر ۱.۵ مگابایت — JPG, PNG, WebP</span></p>
          <input type="file" id="glass-bg-upload" accept="image/jpeg,image/png,image/webp" hidden data-csp-action="GlassTheme.onUpload" data-csp-event="change" data-csp-pass-event/>
        </label>

        ${s.custom ? `<button type="button" class="glass-btn" style="width:100%;margin-bottom:12px" data-csp-action="GlassTheme.clearCustom"><i class="fas fa-undo"></i> بازگشت به پس‌زمینه آماده</button>` : ''}

        <div class="glass-picker-actions">
          <button type="button" class="glass-btn" data-csp-action="GlassTheme.closePicker">بستن</button>
          <button type="button" class="glass-btn glass-btn--solid" data-csp-action="GlassTheme.saveGlobalAndClosePicker">
            <i class="fas fa-check"></i> اعمال در همه بخش‌ها
          </button>
        </div>
      </div>`

    document.body.appendChild(overlay)
  },

  renderInlinePicker(containerId) {
    const el = document.getElementById(containerId)
    if (!el) return
    const s = this.getSettings()
    el.innerHTML = `
      <div class="glass-preset-grid" style="margin-bottom:12px">
        ${this.PRESETS.map(p => `
          <button type="button" class="glass-preset-tile preset-${p.id} ${!s.custom && s.preset === p.id ? 'selected' : ''}"
            data-preset="${p.id}" data-csp-action="GlassTheme.selectPreset" data-csp-arg="${p.id}" title="${p.label}">
            <span class="glass-preset-label">${p.icon} ${p.label}</span>
          </button>`).join('')}
      </div>
      <div class="glass-accent-row">
        ${this.ACCENTS.map(a => `
          <button type="button" class="glass-accent-swatch ${s.accent === a ? 'selected' : ''}"
            data-accent="${a}" data-csp-action="GlassTheme.selectAccent" data-csp-arg="${a}"></button>`).join('')}
      </div>
      <label class="glass-upload-zone" for="glass-bg-upload-inline" style="margin-top:12px">
        <i class="fas fa-image"></i>
        <p>آپلود تصویر پس‌زمینه</p>
        <input type="file" id="glass-bg-upload-inline" accept="image/jpeg,image/png,image/webp" hidden data-csp-action="GlassTheme.onUpload" data-csp-event="change" data-csp-pass-event data-csp-arg="${Utils.escapeHtml(containerId)}"/>
      </label>
      ${s.custom ? `<button type="button" class="glass-btn" style="width:100%;margin-top:8px" data-csp-action="GlassTheme.clearAndRenderInlinePicker" data-csp-arg="${Utils.escapeHtml(containerId)}">بازگشت به پس‌زمینه آماده</button>` : ''}`
  },

  selectPreset(id) {
    this.saveSettings({ preset: id, custom: null })
    document.querySelectorAll('.glass-preset-tile').forEach(t => {
      t.classList.toggle('selected', t.dataset.preset === id)
    })
    Utils.toast('پس‌زمینه اعمال شد', 'success')
  },

  selectAccent(id) {
    this.saveSettings({ accent: id })
    document.querySelectorAll('.glass-accent-swatch').forEach(t => {
      t.classList.toggle('selected', t.dataset.accent === id)
    })
  },

  onUpload(ev, rerenderId) {
    const file = ev.target.files?.[0]
    if (!file) return
    if (file.size > 1.5 * 1024 * 1024) {
      Utils.toast('حداکثر حجم تصویر ۱.۵ مگابایت است', 'error')
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      this.saveSettings({ custom: reader.result, preset: this.getSettings().preset })
      Utils.toast('تصویر پس‌زمینه ذخیره شد', 'success')
      if (rerenderId) this.renderInlinePicker(rerenderId)
      else {
        document.querySelectorAll('.glass-preset-tile').forEach(t => t.classList.remove('selected'))
      }
    }
    reader.readAsDataURL(file)
    ev.target.value = ''
  },

  clearCustom() {
    const s = this.getSettings()
    this.saveSettings({ custom: null, preset: s.preset || 'sunset' })
    Utils.toast('پس‌زمینه آماده بازگردانده شد', 'info')
  },

  closePicker() {
    document.getElementById('glass-picker-overlay')?.remove()
  },

  saveGlobalAndClosePicker() {
    this.saveSettings({ syncGlobal: true })
    Utils.toast('تنظیمات ظاهر برای همه بخش‌ها ذخیره شد', 'success')
    this.closePicker()
  },

  clearAndRenderInlinePicker(containerId) {
    this.clearCustom()
    this.renderInlinePicker(containerId)
  }
}

window.GlassTheme = GlassTheme
