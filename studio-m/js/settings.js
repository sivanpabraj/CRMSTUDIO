/* Studio M — تنظیمات · پروفایل · SMS · پشتیبان */

const SMSettings = {
  _tab: 'profile',
  _search: '',

  TAB_META: [
    { id: 'profile', icon: 'fa-user', title: 'پروفایل من', keywords: 'نام موبایل ایمیل لوگو رمز عبور پسورد password' },
    { id: 'studio', icon: 'fa-building', title: 'استودیو', keywords: 'آدرس تلفن شعار شبکه اجتماعی کد عضویت join' },
    { id: 'widgets', icon: 'fa-gauge-high', title: 'ویجت داشبورد', keywords: 'ویجت چیدمان داشبورد تقویم قرارداد' },
    { id: 'site', icon: 'fa-globe', title: 'سایت', keywords: 'وب سایت html embed لینک ورود' },
    { id: 'sms', icon: 'fa-sms', title: 'پیامک', keywords: 'sms api کاوهنگار پیامک' },
    { id: 'backup', icon: 'fa-cloud', title: 'پشتیبان', keywords: 'backup بازیابی restore دانلود پوشه فایل' },
    { id: 'cloud', icon: 'fa-cloud-arrow-up', title: 'ابر Supabase', keywords: 'supabase sync cloud ابر همگام sync' },
    { id: 'system', icon: 'fa-server', title: 'سیستم', keywords: 'پاکسازی بازنشانی reset wipe امنیت مدیر پیشفرض' }
  ],

  setTab(tab) {
    const opsOnly = new Set(['sms', 'cloud', 'system', 'backup'])
    if (opsOnly.has(tab) && typeof Access !== 'undefined' && !Access.canManageStudioOps?.(SM.user())) {
      SM.toast('فقط مدیر به این بخش دسترسی دارد', 'error')
      tab = 'profile'
    }
    this._tab = tab
    this._search = ''
    SM.navigate('settings')
  },

  onSearch(q) {
    this._search = (q || '').trim().toLowerCase()
    const hits = document.getElementById('sm-settings-hits')
    const panel = document.getElementById('sm-settings-panel')
    if (!hits) return
    if (!this._search) {
      hits.hidden = true
      hits.innerHTML = ''
      if (panel) panel.style.display = ''
      document.querySelectorAll('.sm-tab').forEach(t => { t.style.display = '' })
      return
    }
    const matches = this.TAB_META.filter(t =>
      t.title.includes(this._search) || t.keywords.includes(this._search) ||
      t.id.includes(this._search)
    )
    if (matches.length) {
      hits.hidden = false
      hits.innerHTML = matches.map(t => `
        <button type="button" class="sm-settings-hit" ${SMEvents.attrs('SMSettings.setTab', [t.id])}>
          <i class="fas ${t.icon}"></i> ${SM.esc(t.title)}
        </button>`).join('')
    } else {
      hits.hidden = false
      hits.innerHTML = '<p class="sm-settings-hit-empty">موردی یافت نشد</p>'
    }
    document.querySelectorAll('.sm-tab').forEach(el => {
      const id = el.getAttribute('data-sm-tab') || ''
      el.style.display = !id || matches.some(m => m.id === id) ? '' : 'none'
    })
  },

  _searchBar() {
    return `<div class="sm-settings-search-wrap">
      <div class="sm-settings-search">
        <i class="fas fa-search"></i>
        <input type="search" id="sm-settings-q" placeholder="جستجو در تنظیمات — رمز، پشتیبان، ویجت..."
          value="${SM.esc(this._search)}" autocomplete="off" ${SMEvents.inputAttrs('SMSettings.onSearch')} aria-label="جستجو در تنظیمات"/>
      </div>
      <div id="sm-settings-hits" class="sm-settings-hits" hidden></div>
    </div>`
  },

  render(el) {
    const info = SM.studio()
    el.innerHTML = `
      ${SMUI.sectionHead('تنظیمات', 'پروفایل · استودیو · پشتیبان · سیستم')}
      ${this._searchBar()}
      ${SMUI.tabs(this.TAB_META.map(t => ({
        id: t.id,
        label: t.title,
        icon: t.icon,
        fn: 'SMSettings.setTab',
        args: [t.id]
      })), this._tab)}
      <div id="sm-settings-panel" style="margin-top:16px">${this._renderTab(info)}</div>`
    if (this._tab === 'backup') setTimeout(() => this._loadBackupList(), 0)
  },

  _renderTab(info) {
    if (this._tab === 'profile') return this._profileTab()
    if (this._tab === 'widgets') return this._widgetsTab()
    if (this._tab === 'site') return this._siteTab(info)
    if (this._tab === 'sms') return this._smsTab(info)
    if (this._tab === 'backup') return this._backupTab(info)
    if (this._tab === 'cloud') return this._cloudTab(info)
    if (this._tab === 'system') return this._systemTab(info)
    return this._studioTab(info)
  },

  _profileTab() {
    const user = SM.user()
    const info = SM.studio()
    const logo = info.logo || ''
    const minPw = AppConfig.MIN_PASSWORD_LENGTH || 8
    const mustChange = typeof Auth !== 'undefined' && Auth.mustChangePassword?.()
    const isDefaultPhone = Utils.normalizePhone(user?.phone) === Utils.normalizePhone(AppConfig.INITIAL_ADMIN_PHONE)
    return `<div class="sm-settings-grid">
      <div class="sm-card">
        <div class="sm-card-head"><div class="sm-card-title">پروفایل مدیر</div>
          <button type="button" class="sm-btn sm-btn-sm sm-btn-primary" ${SMEvents.attrs('SMSettings.saveProfile')}><i class="fas fa-save"></i> ذخیره</button>
        </div>
        <div class="sm-card-body">
          ${mustChange ? `<div class="sm-settings-alert"><i class="fas fa-shield-halved"></i> برای امنیت، لطفاً رمز پیش‌فرض را در بخش پایین عوض کنید.</div>` : ''}
          <div class="sm-profile-head">
            <div class="sm-profile-avatar" id="sm-profile-avatar-preview">${logo
              ? (Utils.safeImgHtml(logo, 'alt="logo"') || SM.esc((user?.name || '?').charAt(0)))
              : SM.esc((user?.name || '?').charAt(0))}</div>
            <div>
              <strong>${SM.esc(user?.name || '')}</strong>
              <p style="font-size:.78rem;color:var(--sm-text-muted);margin:4px 0 0">${SM.esc(typeof Access !== 'undefined' ? Access.getPrimaryRoleLabel(user) : 'مدیر')}</p>
              <p style="font-size:.72rem;color:var(--sm-text-muted);margin:4px 0 0" dir="ltr">${SM.esc(user?.phone || '')}</p>
            </div>
          </div>
          ${SMUI.formField('نام و نام خانوادگی', 'prof-name', { value: user?.name || '' })}
          ${SMUI.formField('موبایل (ورود به سیستم)', 'prof-phone', { value: user?.phone || '', dir: 'ltr' })}
          ${SMUI.formField('ایمیل (اختیاری)', 'prof-email', { value: user?.email || info.managerEmail || '', dir: 'ltr' })}
        </div>
      </div>
      <div class="sm-card">
        <div class="sm-card-head"><div class="sm-card-title">لوگو و برند استودیو</div></div>
        <div class="sm-card-body">
          <p style="font-size:.82rem;color:var(--sm-text-muted);margin:0 0 12px">لوگو در سایدبار، قرارداد و پورتال نمایش داده می‌شود.</p>
          <div class="sm-logo-preview" id="sm-logo-preview">${logo
            ? (Utils.safeImgHtml(logo, 'alt="لوگو"') || '<span class="sm-logo-placeholder"><i class="fas fa-camera-retro"></i></span>')
            : '<span class="sm-logo-placeholder"><i class="fas fa-camera-retro"></i></span>'}</div>
          <input type="file" id="prof-logo-file" accept="image/*" hidden data-sm-change-fn="SMSettings.onLogoPick" data-sm-args='[]'/>
          <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap">
            <button type="button" class="sm-btn sm-btn-ghost" ${SMEvents.attrs('SMSettings.pickLogoFile')}><i class="fas fa-upload"></i> انتخاب تصویر</button>
            ${logo ? `<button type="button" class="sm-btn sm-btn-ghost" ${SMEvents.attrs('SMSettings.removeLogo')}><i class="fas fa-trash"></i> حذف</button>` : ''}
          </div>
          ${SMUI.formField('نام استودیو', 'prof-studio-name', { value: info.name || '' })}
          ${SMUI.formField('نام مدیر (روی قرارداد)', 'prof-manager', { value: info.manager || user?.name || '' })}
        </div>
      </div>
      <div class="sm-card sm-settings-full">
        <div class="sm-card-head"><div class="sm-card-title"><i class="fas fa-key"></i> رمز عبور شخصی</div></div>
        <div class="sm-card-body sm-settings-pw">
          <p style="font-size:.82rem;color:var(--sm-text-muted);line-height:1.7;margin:0 0 14px">
            رمز خودتان را اینجا تعریف کنید: حداقل <strong>${minPw}</strong> کاراکتر، <strong>فقط انگلیسی و عدد</strong> (کیبورد EN).
            ${isDefaultPhone ? ' اگر هنوز رمز را عوض نکرده‌اید، همان رمزی را که هنگام راه‌اندازی تعیین کردید وارد کنید.' : ' رمز فعلی را در «رمز فعلی» وارد کنید.'}
          </p>
          ${SMUI.formField('رمز فعلی', 'prof-pw-old', { type: 'password', dir: 'ltr', placeholder: 'رمز الان' })}
          ${SMUI.formField('رمز جدید', 'prof-pw-new', { type: 'password', dir: 'ltr', placeholder: `حداقل ${minPw} کاراکتر` })}
          ${SMUI.formField('تکرار رمز جدید', 'prof-pw2', { type: 'password', dir: 'ltr' })}
          <button type="button" class="sm-btn sm-btn-primary" ${SMEvents.attrs('SMSettings.changePassword')}><i class="fas fa-key"></i> ذخیره رمز جدید</button>
        </div>
      </div>
    </div>`
  },

  _studioTab(_info) {
    if (typeof Studio !== 'undefined') Studio.ensureIdentity()
    const live = SM.studio()
    const code = live.joinCode || ''
    const formatted = typeof Studio !== 'undefined' ? Studio.formatCode(code) : code
    return `<div class="sm-settings-grid">
      <div class="sm-card sm-settings-full">
        <div class="sm-card-head"><div class="sm-card-title">کد عضویت استودیو</div></div>
        <div class="sm-card-body">
          <p style="font-size:.82rem;color:var(--sm-text-muted);line-height:1.7;margin:0 0 14px">
            این کد مخصوص استودیو است و در <strong>تنظیمات</strong> نگه داشته می‌شود.
            برای پرسنل از «مدیریت پرتال → + پرسنل» استفاده کنید تا <strong>کد ورود شخصی</strong> بسازید.
          </p>
          <div style="text-align:center;padding:20px;border:2px dashed var(--sm-border);border-radius:14px;margin-bottom:12px">
            <div style="font-size:.75rem;color:var(--sm-text-muted)">کد عضویت</div>
            <div dir="ltr" style="font-size:1.8rem;font-weight:800;letter-spacing:4px;margin:8px 0;font-family:ui-monospace,monospace">${SM.esc(formatted || '—')}</div>
            <div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap">
              <button type="button" class="sm-btn sm-btn-sm sm-btn-primary" ${SMEvents.attrs('SMSettings.copyJoinCode')}><i class="fas fa-copy"></i> کپی کد</button>
              <button type="button" class="sm-btn sm-btn-sm sm-btn-ghost" ${SMEvents.attrs('SMSettings.regenJoinCode')}><i class="fas fa-sync"></i> تولید مجدد</button>
            </div>
          </div>
        </div>
      </div>
      <div class="sm-card"><div class="sm-card-head"><div class="sm-card-title">اطلاعات استودیو</div>
        <button type="button" class="sm-btn sm-btn-sm sm-btn-primary" ${SMEvents.attrs('SMSettings.saveStudio')}><i class="fas fa-save"></i> ذخیره</button>
      </div>
      <div class="sm-card-body">
        ${SMUI.formField('نام استودیو', 'set-name', { value: live.name || '' })}
        ${SMUI.formField('تلفن', 'set-phone', { value: live.phone || '', dir: 'ltr' })}
        ${SMUI.formField('آدرس', 'set-address', { type: 'textarea', value: live.address || '' })}
        ${SMUI.formField('شعار (روی صفحه ورود)', 'set-tagline', { value: live.tagline || '', placeholder: 'مثلاً: ماندگارترین لحظات زندگی شما' })}
        ${SMUI.formField('شبکه‌های اجتماعی', 'set-social', { value: live.social || '', placeholder: 'اینستاگرام، تلگرام...' })}
        <p style="font-size:.78rem;color:var(--sm-text-muted);margin-top:12px">لوگو در تب «پروفایل» · اتصال سایت در تب «سایت»</p>
      </div></div>
    </div>`
  },

  copyJoinCode() {
    const code = SM.studio()?.joinCode || ''
    if (!code) return SM.toast('کدی نیست', 'error')
    navigator.clipboard?.writeText(code).then(() => SM.toast('کد کپی شد', 'success')).catch(() => SM.toast(code, 'info'))
  },

  async regenJoinCode() {
    if (!confirm('کد عضویت قبلی باطل می‌شود. ادامه؟')) return
    if (typeof Studio === 'undefined') return
    const code = Studio.regenerateJoinCode()
    await DB.flush?.()
    SM.toast(`کد جدید: ${Studio.formatCode(code)}`, 'success')
    SMSettings.setTab('studio')
  },

  _widgetsTab() {
    if (typeof SMDashboard === 'undefined') {
      return SMUI.empty('fa-gauge-high', 'ماژول داشبورد بارگذاری نشد')
    }
    const cfg = SMDashboard.getConfig()
    const rows = cfg.order.map((id, idx) => {
      const w = SMDashboard.WIDGETS[id]
      if (!w) return ''
      const on = cfg.enabled.includes(id)
      return `<div class="sm-widget-row" data-id="${id}" style="--w-color:${w.color}">
        <label class="sm-widget-check">
          <input type="checkbox" name="dash-widget" value="${id}"${on ? ' checked' : ''}/>
          <span class="sm-widget-icon"><i class="fas ${w.icon}"></i></span>
          <span>
            <strong>${SM.esc(w.title)}</strong>
            <small>${SM.esc(w.desc || '')}</small>
          </span>
        </label>
        <div class="sm-widget-order">
          <button type="button" class="sm-btn sm-btn-sm sm-btn-ghost" title="بالا" ${SMEvents.attrs('SMSettings.moveWidget', [id, -1])}${idx === 0 ? ' disabled' : ''}><i class="fas fa-chevron-up"></i></button>
          <button type="button" class="sm-btn sm-btn-sm sm-btn-ghost" title="پایین" ${SMEvents.attrs('SMSettings.moveWidget', [id, 1])}${idx === cfg.order.length - 1 ? ' disabled' : ''}><i class="fas fa-chevron-down"></i></button>
        </div>
      </div>`
    }).join('')

    return `<div class="sm-card sm-settings-full">
      <div class="sm-card-head">
        <div class="sm-card-title"><i class="fas fa-gauge-high"></i> ویجت‌های داشبورد</div>
        <button type="button" class="sm-btn sm-btn-sm sm-btn-primary" ${SMEvents.attrs('SMSettings.saveWidgets')}><i class="fas fa-save"></i> ذخیره</button>
      </div>
      <div class="sm-card-body">
        <p style="font-size:.82rem;color:var(--sm-text-muted);line-height:1.7;margin:0 0 16px">
          ویجت‌های فعال را انتخاب کنید. برای جابه‌جایی روی داشبورد، دکمه «جابه‌جایی ویجت‌ها» را بزنید و بکشید.
        </p>
        <div class="sm-widget-list">${rows}</div>
        <div style="margin-top:16px;display:flex;gap:8px;flex-wrap:wrap">
          <button type="button" class="sm-btn sm-btn-ghost" ${SMEvents.attrs('SMSettings.resetWidgets')}><i class="fas fa-rotate-left"></i> پیش‌فرض</button>
          <button type="button" class="sm-btn sm-btn-ghost" ${SMEvents.attrs('SM.navigate', ["dashboard"])}><i class="fas fa-eye"></i> مشاهده داشبورد</button>
        </div>
      </div>
    </div>`
  },

  moveWidget(id, dir) {
    const cfg = SMDashboard.getConfig()
    const order = [...cfg.order]
    const i = order.indexOf(id)
    if (i < 0) return
    const j = i + dir
    if (j < 0 || j >= order.length) return
    ;[order[i], order[j]] = [order[j], order[i]]
    SMDashboard.saveConfig(cfg.enabled, order)
    SMSettings.setTab('widgets')
  },

  saveWidgets() {
    const boxes = document.querySelectorAll('input[name="dash-widget"]:checked')
    const enabled = [...boxes].map(b => b.value)
    const cfg = SMDashboard.getConfig()
    SMDashboard.saveConfig(enabled, cfg.order)
    SM.toast('ویجت‌های داشبورد ذخیره شد', 'success')
    SMSettings.setTab('widgets')
  },

  resetWidgets() {
    const def = SMDashboard.defaultOrder()
    SMDashboard.saveConfig(def, def)
    SM.toast('به حالت پیش‌فرض برگشت', 'success')
    SMSettings.setTab('widgets')
  },

  _siteTab(info) {
    const links = { ...(typeof SiteBridge !== 'undefined' ? SiteBridge.DEFAULT_LINKS : {}), ...(info.siteLinks || {}) }
    const base = typeof SiteBridge !== 'undefined' ? SiteBridge.appBase() : ''
    const embed = typeof SiteBridge !== 'undefined' ? SiteBridge.embedSnippet() : ''
    return `<div class="sm-settings-grid">
      <div class="sm-card sm-settings-full">
        <div class="sm-card-head"><div class="sm-card-title">اتصال به سایت شما</div>
          <button type="button" class="sm-btn sm-btn-sm sm-btn-primary" ${SMEvents.attrs('SMSettings.saveSite')}><i class="fas fa-save"></i> ذخیره</button>
        </div>
        <div class="sm-card-body">
          <p style="font-size:.82rem;color:var(--sm-text-muted);line-height:1.7;margin:0 0 14px">
            لینک‌های «پیگیری مراسم» و «مدیریت استودیو» را در سایت WordPress یا HTML خود قرار دهید.
            هویت (نام، لوگو) از همین پنل خوانده می‌شود.
          </p>
          ${SMUI.formField('آدرس سایت شما (اختیاری)', 'site-external', { value: info.externalSiteUrl || '', dir: 'ltr', placeholder: 'https://example.com' })}
          ${SMUI.formField('آدرس پایه اپ (اگر روی زیردامنه است)', 'site-app-base', { value: info.appBaseUrl || '', dir: 'ltr', placeholder: base || 'https://app.example.com' })}
          ${SMUI.formField('عنوان لینک مشتری', 'site-cust-label', { value: links.customerLabel || '' })}
          ${SMUI.formField('عنوان لینک مدیر', 'site-mgr-label', { value: links.managerLabel || '' })}
          <div class="sm-settings-note" style="margin-top:14px">
            <strong>لینک ورود واحد:</strong><br/>
            <a href="${SM.esc(typeof SiteBridge !== 'undefined' ? SiteBridge.loginUrl() : '../index.html')}" target="_blank" rel="noopener">${SM.esc(typeof SiteBridge !== 'undefined' ? SiteBridge.loginUrl() : '../index.html')}</a>
            · <a href="${SM.esc(typeof SiteBridge !== 'undefined' ? SiteBridge.sitePageUrl() : '../site.html')}" target="_blank" rel="noopener">site.html</a>
            <p style="margin:8px 0 0;font-size:.75rem">یک لینک — سیستم بر اساس شماره، مدیر / ادمین / پرسنل / مشتری را تشخیص می‌دهد.</p>
          </div>
        </div>
      </div>
      <div class="sm-card sm-settings-full">
        <div class="sm-card-head"><div class="sm-card-title">کد HTML برای سایت</div>
          <button type="button" class="sm-btn sm-btn-sm sm-btn-ghost" ${SMEvents.attrs('SMSettings.copyEmbed')}><i class="fas fa-copy"></i> کپی</button>
        </div>
        <div class="sm-card-body">
          <pre class="sm-embed-code" id="site-embed-code">${SM.esc(embed)}</pre>
          <p style="font-size:.72rem;color:var(--sm-text-muted);margin-top:8px">این بلاک را در صفحه «تماس» یا «خدمات» سایت خود paste کنید.</p>
        </div>
      </div>
    </div>`
  },

  saveSite() {
    const prev = SM.studio()
    const links = {
      ...(prev.siteLinks || {}),
      customerLabel: document.getElementById('site-cust-label')?.value?.trim() || 'پیگیری مراسم',
      managerLabel: document.getElementById('site-mgr-label')?.value?.trim() || 'مدیریت استودیو'
    }
    SecureDB.merge('studioInfo', {
      ...prev,
      externalSiteUrl: document.getElementById('site-external')?.value?.trim() || '',
      appBaseUrl: document.getElementById('site-app-base')?.value?.trim() || '',
      siteLinks: links
    }).then(() => {
      SM.toast('تنظیمات سایت ذخیره شد', 'success')
      SM.navigate('settings')
    })
  },

  copyEmbed() {
    const el = document.getElementById('site-embed-code')
    if (el && typeof Utils !== 'undefined') Utils.copyText(el.textContent)
  },

  _smsTab(info) {
    const configured = typeof SmsProvider !== 'undefined' && SmsProvider.isConfigured()
    return `<div class="sm-card"><div class="sm-card-head"><div class="sm-card-title">تنظیمات پیامک (SMS)</div>
        <button type="button" class="sm-btn sm-btn-sm sm-btn-primary" ${SMEvents.attrs('SMSettings.saveSms')}><i class="fas fa-save"></i> ذخیره</button>
      </div>
      <div class="sm-card-body">
        <p style="font-size:.85rem;color:var(--sm-text-muted);margin-bottom:14px">برای production از <strong>URL پراکسی</strong> (Edge Function) استفاده کنید — کلید API در سرور بماند.</p>
        ${SMUI.badge(configured ? 'API متصل' : 'در انتظار API', configured ? 'success' : 'warning')}
        ${SMUI.formField('URL پراکسی SMS (توصیه production)', 'set-sms-proxy', { value: info.smsProxyUrl || '', dir: 'ltr', placeholder: 'https://xxx.supabase.co/functions/v1/send-sms' })}
        ${SMUI.formField('ارائه‌دهنده (dev/local)', 'set-sms-provider', { type: 'select', value: info.smsProvider || '', options: [
          { value: '', label: '— انتخاب —' },
          { value: 'melipayamak', label: 'ملی پیامک' },
          { value: 'kavenegar', label: 'کاوه‌نگار' },
          { value: 'smsir', label: 'SMS.ir' },
          { value: 'farazsms', label: 'فراز SMS' }
        ]})}
        ${SMUI.formField('نام کاربری (اختیاری — اگر توکن کنسول دارید خالی بگذارید)', 'set-sms-user', { value: info.smsUsername || '', dir: 'ltr', placeholder: 'username پنل' })}
        ${SMUI.formField('توکن کنسول / رمز وب‌سرویس', 'set-sms-key', { value: info.smsApiKey || '', dir: 'ltr', placeholder: 'UUID کنسول یا رمز API' })}
        ${SMUI.formField('شماره خط / فرستنده', 'set-sms-line', { value: info.smsLineNumber || '', dir: 'ltr', placeholder: 'مثلاً 5000...' })}
        <label class="sm-check-row" style="margin-top:14px"><input type="checkbox" id="set-sms-morning" ${info.smsMorningReminders !== false ? 'checked' : ''}/> یادآوری صبحگاهی تقویم (پیامک رویدادهای امروز)</label>
        <div class="sm-settings-note" style="margin-top:16px">
          <i class="fas fa-info-circle"></i> بخش «سطح / لایسنس SMS» فعلاً غیرفعال است — تنظیمات بالا کافی است.
        </div>
      </div></div>`
  },

  _backupTab(info) {
    const sched = typeof BackupService !== 'undefined' ? BackupService.scheduleLabel(info) : '—'
    const lastDisplay = info.backupLastDisplay || (info.backupLastAt ? Utils.formatJalaliDateTime(info.backupLastAt) : info.lastBackup || '—')
    const sampleName = Utils.backupFileName('manual')
    return `<div class="sm-settings-grid">
      <div class="sm-card">
        <div class="sm-card-head"><div class="sm-card-title"><i class="fas fa-clock"></i> پشتیبان‌گیری خودکار</div>
          <button type="button" class="sm-btn sm-btn-sm sm-btn-primary" ${SMEvents.attrs('SMSettings.saveBackupSettings')}><i class="fas fa-save"></i> ذخیره</button>
        </div>
        <div class="sm-card-body">
          <label class="sm-check-row sm-check-row--block"><input type="checkbox" id="set-autobackup" ${info.autoBackup ? 'checked' : ''}/> <strong>پشتیبان‌گیری خودکار فعال</strong></label>
          <label class="sm-check-row"><input type="checkbox" id="set-backup-hourly" ${info.backupHourly ? 'checked' : ''}/> هر ساعت (با تاریخ و ساعت شمسی)</label>
          <label class="sm-check-row"><input type="checkbox" id="set-backup-daily" ${info.backupDaily ? 'checked' : ''}/> هر روز — اولین بار در همان روز شمسی</label>
          <label class="sm-check-row sm-check-row--block" style="margin-top:10px"><input type="checkbox" id="set-backup-download" ${info.backupAutoDownload ? 'checked' : ''}/> دانلود خودکار فایل JSON</label>
          <div class="sm-backup-folder-row">
            <label class="sm-label">پوشهٔ ذخیره (یادداشت شخصی)</label>
            <div class="sm-backup-folder-pick">
              <button type="button" class="sm-btn sm-btn-ghost" ${SMEvents.attrs('SMSettings.pickBackupFolder')}><i class="fas fa-folder-open"></i> انتخاب پوشه</button>
              <input type="text" class="sm-input" id="set-backup-path" value="${SM.esc(info.backupPathNote || '')}" placeholder="مثلاً: Backup روی Desktop"/>
            </div>
            <p class="sm-backup-hint">فایل‌ها با نام شمسی ذخیره می‌شوند — نمونه: <code dir="ltr">${SM.esc(sampleName)}</code></p>
          </div>
          <div class="sm-backup-status">
            <span>زمان‌بندی: ${SMUI.badge(sched, info.autoBackup ? 'success' : 'muted')}</span>
            <span>آخرین پشتیبان: <strong>${SM.esc(lastDisplay)}</strong>${info.backupLastLabel ? ` (${SM.esc(info.backupLastLabel)})` : ''}</span>
          </div>
        </div>
      </div>
      <div class="sm-card">
        <div class="sm-card-head"><div class="sm-card-title"><i class="fas fa-database"></i> دستی · بازیابی</div></div>
        <div class="sm-card-body">
          <button type="button" class="sm-btn sm-btn-primary sm-btn-block" ${SMEvents.attrs('SMSettings.backupNow')}><i class="fas fa-cloud-upload-alt"></i> پشتیبان بگیر الان</button>
          <div class="sm-backup-drop" id="sm-backup-drop" ${SMEvents.elAttrs('SMSettings.pickRestoreFile')} role="button" tabindex="0">
            <i class="fas fa-folder-open"></i>
            <strong>باز کردن فایل پشتیبان</strong>
            <span>کلیک کنید یا فایل JSON را اینجا بکشید و رها کنید</span>
          </div>
          <input type="file" id="sm-restore-input" accept=".json,application/json" hidden data-sm-change-fn="SMSettings.restore" data-sm-args='[]'/>
          <div id="sm-backup-list" class="sm-backup-list"></div>
        </div>
      </div>
    </div>`
  },

  async pickBackupFolder() {
    if (typeof window.showDirectoryPicker === 'function') {
      try {
        const dir = await window.showDirectoryPicker({ mode: 'read' })
        const el = document.getElementById('set-backup-path')
        if (el) el.value = dir.name
        SM.toast(`پوشه «${dir.name}» — برای ذخیره دائمی «ذخیره» را بزنید`, 'success')
        return
      } catch { /* cancelled */ }
    }
    SM.toast('فایل پشتیبان در پوشه Downloads مرورگر ذخیره می‌شود — نام فایل شمسی است', 'info')
  },

  _bindBackupDrop() {
    const drop = document.getElementById('sm-backup-drop')
    const input = document.getElementById('sm-restore-input')
    if (!drop || !input || drop.dataset.bound) return
    drop.dataset.bound = '1'
    ;['dragenter', 'dragover'].forEach(ev => drop.addEventListener(ev, e => {
      e.preventDefault()
      drop.classList.add('is-over')
    }))
    ;['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, e => {
      e.preventDefault()
      drop.classList.remove('is-over')
    }))
    drop.addEventListener('drop', e => {
      const file = e.dataTransfer?.files?.[0]
      if (!file) return
      input.files = e.dataTransfer.files
      SMSettings.restore(input)
    })
  },

  async _loadBackupList() {
    this._bindBackupDrop()
    const el = document.getElementById('sm-backup-list')
    if (!el || typeof DB.listBackups !== 'function') return
    const keys = await DB.listBackups()
    const recent = keys.slice(-8).reverse()
    el.innerHTML = recent.length
      ? `<p class="sm-backup-list-title"><i class="fas fa-history"></i> پشتیبان‌های محلی (مرورگر)</p>
        ${recent.map(k => {
          const when = Utils.parseBackupKey(k)
          return `<div class="sm-backup-item">
            <div class="sm-backup-item-meta">
              <i class="fas fa-file-code"></i>
              <div><strong>${SM.esc(when)}</strong><code dir="ltr">${SM.esc(String(k).slice(-12))}</code></div>
            </div>
            <button type="button" class="sm-btn sm-btn-sm sm-btn-ghost" ${SMEvents.attrs('SMSettings.downloadBackup', [k])}><i class="fas fa-download"></i></button>
          </div>`
        }).join('')}`
      : '<p class="sm-backup-list-empty">هنوز پشتیبان محلی ثبت نشده — «پشتیبان بگیر الان» را بزنید</p>'
  },

  _cloudTab(info) {
    const user = SM.user()
    const st = typeof Cloud !== 'undefined' ? Cloud.statusLabel() : { text: 'ماژول ابر بارگذاری نشده', tone: 'muted' }
    const env = typeof Cloud !== 'undefined' ? Cloud.envConfig() : { url: '', anonKey: '' }
    const url = info.supabaseUrl || env.url || ''
    const key = info.supabaseAnonKey || env.anonKey || ''
    const lastEntity = info.cloudLastEntitySyncAt
      ? `${Utils.formatJalaliDateTime?.(info.cloudLastEntitySyncAt) || info.cloudLastEntitySyncAt}`
      : '—'
    const last = info.cloudLastSyncAt
      ? `${Utils.formatJalaliDateTime?.(info.cloudLastSyncAt) || info.cloudLastSyncAt} (${info.cloudLastSyncDir === 'pull' ? 'دریافت' : 'ارسال'})`
      : '—'
    const conflicts = Array.isArray(info.syncConflicts) ? info.syncConflicts : []
    const rt = typeof Cloud !== 'undefined' ? Cloud.realtimeStatus?.() : 'off'
    return `<div class="sm-settings-grid">
      <div class="sm-card sm-settings-full">
        <div class="sm-card-head">
          <div class="sm-card-title"><i class="fas fa-cloud"></i> همگام‌سازی Supabase</div>
          ${SMUI.badge(st.text, st.tone === 'success' ? 'success' : st.tone === 'warning' ? 'warning' : 'muted')}
        </div>
        <div class="sm-card-body">
          <p style="font-size:.82rem;color:var(--sm-text-muted);line-height:1.7;margin:0 0 14px">
            همگام‌سازی: entity (۲.۵s) + snapshot (۶۰s) + realtime.
            حالت: <strong>${SM.esc(typeof Cloud !== 'undefined' ? Cloud.syncModeLabel() : '—')}</strong>
            · Realtime: ${SMUI.badge(rt === 'live' ? 'متصل' : 'قطع', rt === 'live' ? 'success' : 'muted')}
          </p>
          ${SMUI.formField('Supabase URL', 'cloud-url', { value: url, dir: 'ltr', placeholder: 'https://xxxx.supabase.co' })}
          ${SMUI.formField('Anon Key (public)', 'cloud-key', { value: key, dir: 'ltr', placeholder: 'eyJhbG...' })}
          <label class="sm-check-row"><input type="checkbox" id="cloud-enabled" ${info.cloudEnabled ? 'checked' : ''}/> فعال‌سازی همگام‌سازی ابر</label>
          <label class="sm-check-row"><input type="checkbox" id="cloud-unify-pw" ${info.cloudUnifyPassword ? 'checked' : ''}/> یکسان‌سازی رمز محلی با Supabase (هنگام تغییر رمز)</label>
          <label class="sm-check-row"><input type="checkbox" id="cloud-mutate" ${info.mutateEnabled ? 'checked' : ''}/> گزارش تراکنش‌های مالی به Edge <code dir="ltr">studio-mutate</code> (آزمایشی)</label>
          ${SMUI.formField('Observability URL (اختیاری)', 'cloud-obs-url', {
            value: info.observabilityUrl || '',
            dir: 'ltr',
            placeholder: 'https://logs.example.com/ingest'
          })}
          <p style="font-size:.72rem;color:var(--sm-text-muted);margin:8px 0 0;line-height:1.6">mutate فعلاً فقط audit است — IDB منبع حقیقت می‌ماند تا ledger سروری آماده شود.</p>
          <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px">
            <button type="button" class="sm-btn sm-btn-primary" ${SMEvents.attrs('SMSettings.saveCloudConfig')}><i class="fas fa-save"></i> ذخیره تنظیمات</button>
            <button type="button" class="sm-btn sm-btn-ghost" ${SMEvents.attrs('SMSettings.testObservability')}><i class="fas fa-satellite-dish"></i> تست observability</button>
          </div>
        </div>
      </div>
      <div class="sm-card">
        <div class="sm-card-head"><div class="sm-card-title"><i class="fas fa-user-lock"></i> حساب Supabase</div></div>
        <div class="sm-card-body">
          <p style="font-size:.78rem;color:var(--sm-text-muted);margin:0 0 10px">کاربر محلی: <strong>${SM.esc(user?.name || '—')}</strong> · ایمیل Supabase: <code dir="ltr">${SM.esc(typeof Cloud !== 'undefined' ? Cloud.phoneToEmail(user?.phone) : '')}</code></p>
          <p style="font-size:.72rem;color:var(--orange-500,#c2410c);margin:0 0 10px;line-height:1.6"><strong>توجه:</strong> با «یکسان‌سازی رمز»، تغییر رمز محلی به Supabase هم اعمال می‌شود (نیاز به ورود ابری).</p>
          <p style="font-size:.72rem;color:var(--sm-text-muted);margin:0 0 10px;line-height:1.6">Supabase Dashboard → Authentication → URL Configuration:<br/>Site URL = <code dir="ltr">http://localhost:5173/studio-m/auth-callback.html</code><br/>Redirect URLs = <code dir="ltr">http://localhost:5173/**</code></p>
          ${SMUI.formField('رمز Supabase', 'cloud-pw', { type: 'password', dir: 'ltr', placeholder: 'رمز حساب ابری' })}
          <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">
            <button type="button" class="sm-btn sm-btn-primary" ${SMEvents.attrs('SMSettings.cloudSignIn')}><i class="fas fa-sign-in-alt"></i> ورود</button>
            <button type="button" class="sm-btn sm-btn-ghost" ${SMEvents.attrs('SMSettings.cloudSignUp')}><i class="fas fa-user-plus"></i> ثبت‌نام + ساخت استودیو</button>
            <button type="button" class="sm-btn sm-btn-ghost" ${SMEvents.attrs('SMSettings.cloudSignOut')}><i class="fas fa-sign-out-alt"></i> خروج</button>
          </div>
        </div>
      </div>
      <div class="sm-card">
        <div class="sm-card-head"><div class="sm-card-title"><i class="fas fa-arrows-rotate"></i> Sync دستی</div></div>
        <div class="sm-card-body">
          <p style="font-size:.78rem;color:var(--sm-text-muted);margin:0 0 10px">آخرین entity sync: ${SM.esc(lastEntity)} · snapshot: ${SM.esc(last)}</p>
          <p style="font-size:.72rem;color:var(--sm-text-muted);margin:0 0 12px">Studio ID: <code dir="ltr">${SM.esc(info.supabaseStudioId || '—')}</code></p>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <button type="button" class="sm-btn sm-btn-primary" ${SMEvents.attrs('SMSettings.cloudPush')}><i class="fas fa-cloud-upload-alt"></i> ارسال کامل</button>
            <button type="button" class="sm-btn sm-btn-ghost" ${SMEvents.attrs('SMSettings.cloudPull')}><i class="fas fa-cloud-download-alt"></i> دریافت کامل</button>
            <button type="button" class="sm-btn sm-btn-ghost" ${SMEvents.attrs('SMSettings.cloudPushEntities')}><i class="fas fa-table"></i> فقط entity</button>
          </div>
        </div>
      </div>
      ${conflicts.length ? `<div class="sm-card sm-settings-full sm-card-danger-zone">
        <div class="sm-card-head">
          <div class="sm-card-title"><i class="fas fa-code-branch"></i> تعارض‌های sync</div>
          ${SMUI.badge(String(conflicts.length), 'warning')}
        </div>
        <div class="sm-card-body">
          <p style="font-size:.78rem;color:var(--sm-text-muted);margin:0 0 12px">دو دستگاه همزمان یک رکورد را ویرایش کرده‌اند — یکی را انتخاب کنید:</p>
          ${conflicts.map(c => `
            <div class="sm-sync-conflict" style="border:1px solid var(--sm-border);border-radius:10px;padding:12px;margin-bottom:10px">
              <strong>${SM.esc(c.entityType)} · ${SM.esc(c.localId)}</strong>
              <div style="font-size:.72rem;color:var(--sm-text-muted);margin:6px 0">${SM.esc(c.detectedAt || '')}</div>
              <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px">
                <button type="button" class="sm-btn sm-btn-sm sm-btn-primary" ${SMEvents.attrs('SMSettings.resolveSyncConflict', [String(c.entityType), String(c.localId), 'local'])}>نگه‌داشتن محلی</button>
                <button type="button" class="sm-btn sm-btn-sm sm-btn-ghost" ${SMEvents.attrs('SMSettings.resolveSyncConflict', [String(c.entityType), String(c.localId), 'remote'])}>نگه‌داشتن ابری</button>
              </div>
            </div>`).join('')}
        </div>
      </div>` : ''}
    </div>`
  },

  async saveCloudConfig() {
    if (typeof Cloud === 'undefined') return SM.toast('ماژول ابر بارگذاری نشده', 'error')
    const url = Cloud.normalizeUrl(document.getElementById('cloud-url')?.value)
    const anonKey = document.getElementById('cloud-key')?.value?.trim()
    const keyCheck = Cloud.validateAnonKey(anonKey)
    if (anonKey && !keyCheck.ok) return SM.toast(keyCheck.error, 'error')
    const enabled = !!document.getElementById('cloud-enabled')?.checked
    const unify = !!document.getElementById('cloud-unify-pw')?.checked
    const mutateEnabled = !!document.getElementById('cloud-mutate')?.checked
    let observabilityUrl = (document.getElementById('cloud-obs-url')?.value || '').trim()
    if (observabilityUrl) {
      try {
        const u = new URL(observabilityUrl)
        if (u.protocol !== 'https:' && !(typeof AppConfig !== 'undefined' && AppConfig.isLocalDev?.() && u.protocol === 'http:')) {
          return SM.toast('Observability URL باید https باشد', 'error')
        }
        observabilityUrl = u.href
      } catch {
        return SM.toast('Observability URL نامعتبر است', 'error')
      }
    }
    await SecureDB.merge('studioInfo', {
      ...DB.get('studioInfo'),
      supabaseUrl: url,
      supabaseAnonKey: anonKey,
      cloudEnabled: enabled,
      cloudUnifyPassword: unify,
      mutateEnabled,
      observabilityUrl
    })
    Cloud._client = null
    await DB.flush?.()
    SM.toast('تنظیمات ابر ذخیره شد', 'success')
    SMSettings.setTab('cloud')
  },

  testObservability() {
    if (typeof SMObservability === 'undefined') return SM.toast('ماژول observability نیست', 'error')
    SMObservability.captureEvent('ops_ping', { from: 'settings' })
    SM.toast('رویداد تست ثبت شد (کنسول / remote sink)', 'info')
  },

  async cloudSignIn() {
    if (typeof Cloud === 'undefined') return SM.toast('ماژول ابر نیست', 'error')
    const pw = document.getElementById('cloud-pw')?.value
    if (!pw) return SM.toast('رمز را وارد کنید', 'error')
    const user = SM.user()
    const r = await Cloud.signIn({ phone: user?.phone, password: pw })
    if (!r.ok) return SM.toast(r.error || 'خطا', 'error')
    SM.toast('ورود Supabase موفق', 'success')
    SMSettings.setTab('cloud')
  },

  async cloudSignUp() {
    if (typeof Cloud === 'undefined') return SM.toast('ماژول ابر نیست', 'error')
    const pw = document.getElementById('cloud-pw')?.value
    if (!pw || pw.length < AppConfig.MIN_PASSWORD_LENGTH) {
      return SM.toast(`رمز حداقل ${AppConfig.MIN_PASSWORD_LENGTH} کاراکتر`, 'error')
    }
    const cfg = Cloud.resolvedConfig()
    if (cfg.url) sessionStorage.setItem('sm_cloud_url', cfg.url)
    if (cfg.anonKey) sessionStorage.setItem('sm_cloud_key', cfg.anonKey)
    const user = SM.user()
    const info = SM.studio()
    const r = await Cloud.signUp({
      phone: user?.phone,
      password: pw,
      name: user?.name,
      studioName: info.name,
      joinCode: info.joinCode
    })
    if (!r.ok) return SM.toast(r.error || 'خطا', 'error')
    if (r.needsEmailConfirm) {
      SM.toast('ایمیل تأیید را در Supabase چک کنید (یا تأیید دستی در Dashboard)', 'info')
    } else {
      await Cloud.pushAll()
      SM.toast('استودیوی ابری ساخته شد', 'success')
    }
    SMSettings.setTab('cloud')
  },

  async cloudSignOut() {
    if (typeof Cloud !== 'undefined') await Cloud.signOut()
    SM.toast('خروج از Supabase', 'info')
    SMSettings.setTab('cloud')
  },

  async cloudPush() {
    if (typeof Cloud === 'undefined') return
    const r = await Cloud.pushAll()
    const ok = r.ok || r.entities?.ok
    SM.toast(ok ? 'ارسال entity + snapshot انجام شد' : (r.entities?.error || r.snapshot?.error || 'خطا'), ok ? 'success' : 'error')
    SMSettings.setTab('cloud')
  },

  async cloudPull() {
    if (typeof Cloud === 'undefined') return
    const r = await Cloud.pullAll({ force: true })
    if (r.ok && (r.applied > 0 || !r.skipped)) {
      SM.toast('دریافت از ابر — بارگذاری مجدد', 'success')
      setTimeout(() => location.reload(), 600)
    } else {
      SM.toast(r.error || r.reason || 'تغییری نبود', r.ok ? 'info' : 'error')
    }
  },

  async cloudPushEntities() {
    if (typeof Cloud === 'undefined') return
    const r = await Cloud.pushEntities()
    SM.toast(r.ok ? `entity: ${r.count || 0} رکورد` : (r.error || 'خطا'), r.ok ? 'success' : 'error')
    SMSettings.setTab('cloud')
  },

  async cloudSyncContracts() {
    if (typeof Cloud === 'undefined') return
    const r = await Cloud.syncContractsFromLocal()
    SM.toast(r.ok ? `sync ${r.count || 0} قرارداد` : (r.error || 'خطا'), r.ok ? 'success' : 'error')
  },

  async resolveSyncConflict(entityType, localId, choice) {
    const info = DB.get('studioInfo') || {}
    const list = Array.isArray(info.syncConflicts) ? info.syncConflicts : []
    const entry = list.find(c => c.entityType === entityType && String(c.localId) === String(localId))
    if (!entry) return SM.toast('تعارض یافت نشد', 'error')

    const item = choice === 'remote'
      ? {
        ...entry.remote,
        id: localId,
        updatedAtIso: entry.remoteUpdatedAt || new Date().toISOString(),
        _syncRev: (Number(entry.remoteRevision) || 0) + 1
      }
      : {
        ...entry.local,
        id: localId,
        updatedAtIso: new Date().toISOString(),
        _syncRev: (Number(entry.local?._syncRev) || 0) + 1
      }

    const col = DB.get(entityType) || []
    const idx = col.findIndex(i => String(i.id) === String(localId))
    if (idx >= 0) col[idx] = item
    else col.push(item)
    if (typeof SecureDB !== 'undefined' && SecureDB.systemSet) SecureDB.systemSet(entityType, col)
    else DB.set(entityType, col)

    await SecureDB.merge('studioInfo', {
      ...info,
      syncConflicts: list.filter(c => !(c.entityType === entityType && String(c.localId) === String(localId)))
    })
    if (typeof Cloud !== 'undefined') Cloud.schedulePush?.()
    SM.toast(choice === 'remote' ? 'نسخه ابری اعمال شد' : 'نسخه محلی اعمال شد', 'success')
    SMSettings.setTab('cloud')
  },

  _systemTab(info) {
    const audit = typeof SMOnboarding !== 'undefined' ? SMOnboarding.securityAudit() : null
    const users = (DB.get('users') || []).filter(u => u.status === 'active')
    const manager = users.find(u => typeof Access !== 'undefined' && Access.isStudioManager(u)) || users[0]
    return `<div class="sm-settings-grid">
      <div class="sm-card">
        <div class="sm-card-head"><div class="sm-card-title"><i class="fas fa-user-shield"></i> حساب مدیر</div></div>
        <div class="sm-card-body">
          <p style="font-size:.82rem;color:var(--sm-text-muted);line-height:1.7;margin:0 0 12px">
            مدیر فعلی: <strong>${SM.esc(manager?.name || '—')}</strong>
            <span dir="ltr">${SM.esc(manager?.phone || '')}</span>
          </p>
          <p style="font-size:.78rem;color:var(--sm-text-muted);line-height:1.6">
            پس از <strong>بازنشانی کامل</strong>، رمز جدید یک‌بار در صفحه ورود نشان داده می‌شود.
          </p>
          <p style="font-size:.75rem;color:var(--sm-text-muted)">کاربران فعال: ${users.length} · ${info.setupCompleted ? SMUI.badge('راه‌اندازی شده', 'success') : SMUI.badge('در انتظار راه‌اندازی', 'warning')}</p>
        </div>
      </div>
      <div class="sm-card">
        <div class="sm-card-head"><div class="sm-card-title">چکاپ امنیتی</div>
          ${audit ? SMUI.badge(`${audit.score}%`, audit.score >= 80 ? 'success' : audit.score >= 50 ? 'warning' : 'danger') : ''}
        </div>
        <div class="sm-card-body">
          ${audit ? audit.checks.map(c => `
            <div class="sm-security-row">
              <i class="fas fa-${c.ok ? 'check-circle' : 'circle-xmark'}" style="color:${c.ok ? 'var(--sm-success)' : 'var(--sm-danger)'}"></i>
              <span>${SM.esc(c.label)}${c.hint ? ` <small style="color:var(--sm-text-muted)">(${SM.esc(c.hint)})</small>` : ''}${c.optional ? ' <small>(اختیاری)</small>' : ''}</span>
            </div>`).join('') : '<p>—</p>'}
        </div>
      </div>
      <div class="sm-card sm-settings-full sm-card-danger-zone">
        <div class="sm-card-head"><div class="sm-card-title"><i class="fas fa-triangle-exclamation"></i> پاکسازی و بازنشانی</div></div>
        <div class="sm-card-body">
          <p style="font-size:.85rem;color:var(--sm-text-muted);line-height:1.7">قبل از هر عمل، حتماً از تب «پشتیبان» یک نسخه بگیرید.</p>
          <div class="sm-danger-actions">
            <div class="sm-danger-box">
              <h4><i class="fas fa-broom"></i> پاکسازی داده‌های کاری</h4>
              <p>قرارداد، مشتری، مالی، پیام‌ها و لاگ‌ها پاک می‌شود. <strong>نام استودیو، لوگو، مدیر و تنظیمات</strong> می‌ماند.</p>
              <button type="button" class="sm-btn sm-btn-warning" ${SMEvents.attrs('SMSettings.wipeOperational')}>
                <i class="fas fa-broom"></i> پاکسازی داده‌های کاری
              </button>
            </div>
            <div class="sm-danger-box sm-danger-box--full">
              <h4><i class="fas fa-trash-restore"></i> بازنشانی کامل</h4>
              <p>همه چیز صفر می‌شود و مدیر پیش‌فرض از نو ساخته می‌شود.</p>
              <button type="button" class="sm-btn sm-btn-danger" ${SMEvents.attrs('SMSettings.factoryReset')}>
                <i class="fas fa-trash-restore"></i> بازنشانی کامل سیستم
              </button>
            </div>
          </div>
          <div class="sm-danger-box" style="margin-top:12px">
            <h4><i class="fas fa-clock-rotate-left"></i> پنل کلاسیک (منسوخ)</h4>
            <p>فقط برای بازیابی اضطراری. بعد از فعال‌سازی موقت، <code>?classic=1</code> روی admin.html کار می‌کند.</p>
            <button type="button" class="sm-btn sm-btn-ghost" ${SMEvents.attrs('SMSettings.enableClassicAdmin')}>
              <i class="fas fa-unlock"></i> فعال‌سازی موقت پنل کلاسیک
            </button>
          </div>
          <p style="font-size:.72rem;color:var(--sm-text-muted);margin-top:14px">
            <strong>نسخه:</strong> ${AppConfig.APP_VERSION} · <strong>DB:</strong> v${DB.getStorageInfo?.()?.version || '—'}
          </p>
        </div>
      </div>
    </div>`
  },

  async enableClassicAdmin() {
    if (typeof Access !== 'undefined' && !Access.isStudioManager?.(SM.user()) && !Access.isSystemAdmin?.(SM.user())) {
      return SM.toast('فقط مدیر مجاز است', 'error')
    }
    if (!confirm('فعال‌سازی موقت پنل کلاسیک؟ فقط برای بازیابی اضطراری.')) return
    const typed = prompt('برای تأیید، کلمه «کلاسیک» را بنویسید:')
    if (typed !== 'کلاسیک') return SM.toast('لغو شد', 'info')
    const pw = prompt('رمز ورود فعلی مدیر را وارد کنید:')
    if (!pw) return SM.toast('لغو شد', 'info')
    const v = await Auth.verifyCurrentPassword(pw)
    if (!v.ok) return SM.toast(v.error || 'رمز اشتباه', 'error')
    try {
      const user = SM.user()
      const ttl = 2 * 60 * 60 * 1000
      if (typeof SignedProof !== 'undefined' && SignedProof.issue) {
        await SignedProof.issue('sm_classic_unlock', {
          purpose: 'classic',
          userId: user?.id || '',
          issuedAt: Date.now()
        }, ttl)
        try { sessionStorage.removeItem('sm_allow_classic') } catch { /* */ }
      } else {
        sessionStorage.setItem('sm_allow_classic', '1')
      }
      SM.toast('پنل کلاسیک برای این نشست فعال شد — admin.html?classic=1', 'success')
      if (typeof SMObservability !== 'undefined') SMObservability.captureEvent('classic_admin_unlock')
    } catch {
      SM.toast('خطا در فعال‌سازی', 'error')
    }
  },

  async wipeOperational() {
    if (typeof Access !== 'undefined' && !Access.canManageStudioOps?.(SM.user())) {
      return SM.toast('فقط مدیر مجاز است', 'error')
    }
    if (!confirm('پاکسازی داده‌های کاری\n\nقراردادها، مالی، پیام‌ها پاک می‌شود.\nنام استودیو و تنظیمات شما حفظ می‌شود.\n\nادامه؟')) return
    const pw = prompt('رمز ورود فعلی خود را برای تأیید وارد کنید:')
    if (!pw) return SM.toast('لغو شد', 'info')
    const v = await Auth.verifyCurrentPassword(pw)
    if (!v.ok) return SM.toast(v.error || 'رمز اشتباه', 'error')
    if (typeof FactoryReset === 'undefined') return SM.toast('ماژول یافت نشد', 'error')
    try {
      SM.toast('در حال پاکسازی...', 'info')
      await FactoryReset.wipeOperationalData()
      SM.toast('پاکسازی انجام شد — در حال ورود مجدد', 'success')
      setTimeout(() => { window.location.href = '../index.html' }, 900)
    } catch (e) {
      SM.toast('خطا در پاکسازی: ' + (e.message || e), 'error')
    }
  },

  async factoryReset() {
    if (typeof Access !== 'undefined' && !Access.canManageStudioOps?.(SM.user())) {
      return SM.toast('فقط مدیر مجاز است', 'error')
    }
    if (!confirm('بازنشانی کامل\n\nهمه داده‌ها پاک می‌شود.\n\nادامه می‌دهید؟')) return
    const typed = prompt('برای تأیید، کلمه «بازنشانی» را بنویسید:')
    if (typed !== 'بازنشانی') return SM.toast('لغو شد', 'info')
    const pw = prompt('رمز ورود فعلی مدیر را برای تأیید وارد کنید:')
    if (!pw) return SM.toast('لغو شد', 'info')
    const v = await Auth.verifyCurrentPassword(pw)
    if (!v.ok) return SM.toast(v.error || 'رمز اشتباه', 'error')
    if (typeof FactoryReset === 'undefined') return SM.toast('ماژول بازنشانی یافت نشد', 'error')
    try {
      SM.toast('در حال بازنشانی...', 'info')
      await FactoryReset.wipeForTesting()
      window.location.href = '../index.html?fresh=1'
    } catch (e) {
      SM.toast('خطا: ' + (e.message || e), 'error')
    }
  },

  onLogoPick(a, b) {
    const input = (b && b.files !== undefined) ? b : a
    const file = input?.files?.[0]
    if (!file || !file.type.startsWith('image/')) return SM.toast('فقط تصویر', 'error')
    if (file.size > 800000) return SM.toast('حداکثر ۸۰۰KB', 'error')
    const reader = new FileReader()
    reader.onload = () => {
      SMSettings._pendingLogo = reader.result
      const prev = document.getElementById('sm-logo-preview')
      const av = document.getElementById('sm-profile-avatar-preview')
      const html = Utils.safeImgHtml(reader.result, 'alt="logo"') || ''
      if (prev) prev.innerHTML = html || '<span class="sm-logo-placeholder"><i class="fas fa-camera-retro"></i></span>'
      if (av) av.innerHTML = html || SM.esc((SM.user()?.name || '?').charAt(0))
      SM.toast('لوگو آماده ذخیره است — دکمه ذخیره را بزنید', 'info')
    }
    reader.readAsDataURL(file)
    input.value = ''
  },

  pickLogoFile() {
    document.getElementById('prof-logo-file')?.click()
  },

  pickRestoreFile() {
    document.getElementById('sm-restore-input')?.click()
  },

  removeLogo() {
    SMSettings._pendingLogo = ''
    const prev = SM.studio()
    SecureDB.merge('studioInfo', { ...prev, logo: '' })
    SM.renderShell()
    SM.toast('لوگو حذف شد', 'success')
    SM.navigate('settings')
  },

  async saveProfile() {
    const user = SM.user()
    if (!user) return
    const name = document.getElementById('prof-name')?.value?.trim()
    const phone = Utils.normalizePhone(document.getElementById('prof-phone')?.value?.trim())
    const email = document.getElementById('prof-email')?.value?.trim() || ''
    const studioName = document.getElementById('prof-studio-name')?.value?.trim()
    const manager = document.getElementById('prof-manager')?.value?.trim()

    if (name) await SecureDB.update('users', user.id, { name, email: email || user.email || '' })
    if (phone && phone !== user.phone) {
      if (DB.find('users', u => u.id !== user.id && Utils.normalizePhone(u.phone) === phone)) {
        return SM.toast('این موبایل قبلاً ثبت شده', 'error')
      }
      await SecureDB.update('users', user.id, { phone })
    }

    const prev = SM.studio()
    const patch = {
      ...prev,
      name: studioName || prev.name,
      manager: manager || name || prev.manager,
      managerEmail: email
    }
    if (SMSettings._pendingLogo !== undefined) patch.logo = SMSettings._pendingLogo
    await SecureDB.merge('studioInfo', patch)
    SMSettings._pendingLogo = undefined
    await DB.flush?.()
    SM.renderShell()
    SM.toast('پروفایل ذخیره شد', 'success')
    SM.navigate('settings')
  },

  async changePassword() {
    const user = SM.user()
    const oldPw = document.getElementById('prof-pw-old')?.value || ''
    const newPw = document.getElementById('prof-pw-new')?.value || ''
    const pw2 = document.getElementById('prof-pw2')?.value || ''
    if (!newPw) return SM.toast('رمز جدید را وارد کنید', 'error')
    if (newPw !== pw2) return SM.toast('رمز جدید و تکرار یکسان نیست', 'error')
    const res = await Auth.updatePassword(user.id, oldPw, newPw)
    if (!res.ok) return SM.toast(res.error || 'خطا', 'error')
    document.getElementById('prof-pw-old').value = ''
    document.getElementById('prof-pw-new').value = ''
    document.getElementById('prof-pw2').value = ''
    SM.toast('رمز با موفقیت تغییر کرد', 'success')
    SMSettings.setTab('profile')
  },

  async saveStudio() {
    const prev = SM.studio()
    await SecureDB.merge('studioInfo', {
      name: document.getElementById('set-name')?.value?.trim() || prev.name,
      phone: document.getElementById('set-phone')?.value?.trim() || prev.phone,
      address: document.getElementById('set-address')?.value?.trim() || prev.address,
      social: document.getElementById('set-social')?.value?.trim() || prev.social || '',
      tagline: document.getElementById('set-tagline')?.value?.trim() || prev.tagline || ''
    })
    SM.renderShell()
    SM.toast('ذخیره شد', 'success')
    SM.navigate('settings')
  },

  async saveSms() {
    if (typeof Access !== 'undefined' && !Access.canManageStudioOps?.(SM.user())) {
      return SM.toast('فقط مدیر مجاز به تغییر تنظیمات پیامک است', 'error')
    }
    const raw = {
      smsProxyUrl: document.getElementById('set-sms-proxy')?.value?.trim() || '',
      smsProvider: document.getElementById('set-sms-provider')?.value?.trim() || '',
      smsUsername: document.getElementById('set-sms-user')?.value?.trim() || '',
      smsApiKey: document.getElementById('set-sms-key')?.value?.trim() || '',
      smsLineNumber: document.getElementById('set-sms-line')?.value?.trim() || '',
      smsMorningReminders: document.getElementById('set-sms-morning')?.checked !== false
    }
    const isLocal = typeof AppConfig !== 'undefined' && AppConfig.isLocalDev?.()
    const sanitized = (typeof sanitizeSmsSettings === 'function'
      ? sanitizeSmsSettings(raw, { isLocalDev: !!isLocal })
      : (typeof SmsSettingsSanitize !== 'undefined'
        ? SmsSettingsSanitize.sanitizeSmsSettings(raw, { isLocalDev: !!isLocal })
        : raw))
    if (!isLocal && !sanitized.smsProxyUrl && (raw.smsApiKey || raw.smsUsername)) {
      return SM.toast('در production فقط URL پراکسی مجاز است — کلید API را در Edge Function بگذارید', 'error')
    }
    await SecureDB.merge('studioInfo', sanitized)
    if (sanitized.smsProxyUrl && (raw.smsApiKey || raw.smsUsername)) {
      SM.toast('پراکسی ذخیره شد — کلید API از دستگاه پاک شد', 'success')
    } else {
      SM.toast('تنظیمات پیامک ذخیره شد', 'success')
    }
    SM.navigate('settings')
  },

  async saveBackupSettings() {
    if (typeof Access !== 'undefined' && !Access.canManageStudioOps?.(SM.user())) {
      return SM.toast('فقط مدیر مجاز است', 'error')
    }
    await SecureDB.merge('studioInfo', {
      autoBackup: !!document.getElementById('set-autobackup')?.checked,
      backupHourly: !!document.getElementById('set-backup-hourly')?.checked,
      backupDaily: !!document.getElementById('set-backup-daily')?.checked,
      backupAutoDownload: !!document.getElementById('set-backup-download')?.checked,
      backupPathNote: document.getElementById('set-backup-path')?.value?.trim() || ''
    })
    if (typeof BackupService !== 'undefined') BackupService.restart()
    SM.toast('تنظیمات پشتیبان ذخیره شد', 'success')
    SM.navigate('settings')
  },

  async backupNow() {
    if (typeof BackupService !== 'undefined') {
      const r = await BackupService.run('manual')
      if (r.ok) SM.toast(`پشتیبان گرفته شد — ${Utils.formatJalaliDateTime(r.at ? new Date(r.at) : Date.now())}`, 'success')
      else SM.toast(r.error || 'خطا', 'error')
    } else {
      const json = DB.exportJSON()
      const blob = new Blob([json], { type: 'application/json' })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = Utils.backupFileName('manual')
      a.click()
      SM.toast('دانلود شد', 'success')
    }
    SMSettings.setTab('backup')
  },

  async downloadBackup(key) {
    const json = await DB.getBackup(key)
    if (!json) return SM.toast('یافت نشد', 'error')
    const blob = new Blob([json], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = Utils.backupFileName('restore')
    a.click()
  },

  async restore(a, b) {
    const input = (b && b.files !== undefined) ? b : a
    const file = input?.files?.[0]
    if (!file) return
    try {
      if (typeof Access !== 'undefined' && !Access.canManageStudioOps?.(SM.user())) {
        SM.toast('فقط مدیر مجاز به بازیابی است', 'error')
        return
      }
      if (!confirm('بازیابی پشتیبان تمام داده‌های فعلی را جایگزین می‌کند. ادامه می‌دهید؟')) return
      const typed = prompt('برای تأیید، کلمه «بازیابی» را بنویسید:')
      if (typed !== 'بازیابی') return SM.toast('لغو شد', 'info')
      const pw = prompt('رمز ورود فعلی مدیر را برای تأیید وارد کنید:')
      if (!pw) return SM.toast('لغو شد', 'info')
      if (typeof Auth === 'undefined' || !Auth.verifyCurrentPassword) {
        return SM.toast('ماژول احراز هویت در دسترس نیست', 'error')
      }
      const v = await Auth.verifyCurrentPassword(pw)
      if (!v.ok) return SM.toast(v.error || 'رمز اشتباه', 'error')

      const text = await file.text()
      const result = await DB.importJSON(text)
      if (result.ok) {
        if (typeof DB.log === 'function') DB.log('backup_restore', file.name || 'restore.json')
        SM.toast('بازیابی شد — بارگذاری مجدد', 'success')
        location.reload()
      } else {
        SM.toast(result.error || 'خطا', 'error')
      }
    } finally {
      input.value = ''
    }
  }
}

SMModules.settings = {
  setTab(tab) { SMSettings.setTab(tab) },
  render(el) { SMSettings.render(el) },
  saveStudio() { SMSettings.saveStudio() },
  saveSms() { SMSettings.saveSms() },
  backup() { SMSettings.backupNow() },
  restore(input) { SMSettings.restore(input) },
  enableClassicAdmin() { SMSettings.enableClassicAdmin() }
}

window.SMSettings = SMSettings
