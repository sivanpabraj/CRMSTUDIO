/* Studio M — تنظیمات · پروفایل · SMS · پشتیبان */

const SMSettings = {
  _tab: 'profile',
  _search: '',

  TAB_META: [
    { id: 'profile', icon: 'fa-user', title: 'پروفایل مدیر', keywords: 'نام موبایل ایمیل لوگو رمز عبور پسورد password' },
    { id: 'studio', icon: 'fa-building', title: 'اطلاعات استودیو', keywords: 'آدرس تلفن شعار شبکه اجتماعی کد عضویت join' },
    { id: 'legal', icon: 'fa-scale-balanced', title: 'ضوابط قرارداد و صنف', keywords: 'قرارداد صنف تعهدات شرایط کنسلی آرشیو مالیات قوانین صنف عکاسان' },
    { id: 'automation', icon: 'fa-bolt', title: 'اتوماسیون پیامک', keywords: 'سالگرد ازدواج اقساط یادآوری اعلان الگو باشگاه مشتریان' },
    { id: 'security', icon: 'fa-shield-halved', title: 'امنیت و نشست‌ها', keywords: 'خروج نشست‌ها دستگاه‌ها انقضا پسورد امنیت' },
    { id: 'widgets', icon: 'fa-gauge-high', title: 'پیشخوان مدیریتی', keywords: 'داشبورد مالی عملیات نمودار سلامت مالی' },
    { id: 'site', icon: 'fa-globe', title: 'سایت و پورتال', keywords: 'وب سایت html embed لینک ورود' },
    { id: 'messengers', icon: 'fa-paper-plane', title: 'پیام‌رسان‌ها (بله و واتساپ)', keywords: 'بله bale واتساپ whatsapp otp ربات bot ایمیل' },
    { id: 'gateway', icon: 'fa-credit-card', title: 'درگاه پرداخت و مالیات', keywords: 'درگاه پرداخت شاپرک زرین‌پال زیبال نکست‌پی پی پوز مالیات ارزش افزوده vat شبا کارت مرچنت مالیات فاکتور' },
    { id: 'sms', icon: 'fa-sms', title: 'درگاه پیامک', keywords: 'sms api کاوهنگار پیامک ملی پیامک' },
    { id: 'backup', icon: 'fa-cloud', title: 'پشتیبان و دیتا', keywords: 'backup بازیابی restore دانلود پوشه فایل' },
    { id: 'cloud', icon: 'fa-cloud-arrow-up', title: 'ابر Supabase', keywords: 'supabase sync cloud ابر همگام sync' },
    { id: 'system', icon: 'fa-server', title: 'سیستم و بازنشانی', keywords: 'پاکسازی بازنشانی reset wipe امنیت مدیر پیشفرض' }
  ],

  setTab(tab) {
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
        <button type="button" class="sm-settings-hit" onclick="SMSettings.setTab('${t.id}')">
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
          value="${SM.esc(this._search)}" autocomplete="off" oninput="SMSettings.onSearch(this.value)"/>
      </div>
      <div id="sm-settings-hits" class="sm-settings-hits" hidden></div>
    </div>`
  },

  render(el) {
    const info = SM.studio()
    el.innerHTML = `
      ${SMUI.sectionHead('تنظیمات پیشرفته استودیو', 'پروفایل · ضوابط صنف · اتوماسیون پیامک · امنیت · پشتیبان')}
      ${this._searchBar()}
      ${SMUI.tabs(this.TAB_META.map(t => ({
        id: t.id,
        label: t.title,
        icon: t.icon,
        onclick: `SMSettings.setTab('${t.id}')`
      })), this._tab)}
      <div id="sm-settings-panel" style="margin-top:16px">${this._renderTab(info)}</div>`
    // Add SMTP status dot badge to the messengers tab button
    const messengersTab = el.querySelector('[data-sm-tab="messengers"]')
    if (messengersTab) {
      const smtpOk = !!(info && info.emailSmtpUser)
      const dot = document.createElement('span')
      dot.style.cssText = `display:inline-block;width:7px;height:7px;border-radius:50%;background:${smtpOk ? '#4ade80' : '#f87171'};margin-right:4px;vertical-align:middle`
      dot.title = smtpOk ? 'SMTP پیکربندی شده' : 'SMTP پیکربندی نشده'
      messengersTab.appendChild(dot)
    }
    if (this._tab === 'backup') setTimeout(() => this._loadBackupList(), 0)
  },

  _renderTab(info) {
    if (this._tab === 'profile') return this._profileTab()
    if (this._tab === 'legal') return this._legalTab(info)
    if (this._tab === 'automation') return this._automationTab(info)
    if (this._tab === 'security') return this._securityTab(info)
    if (this._tab === 'widgets') return this._widgetsTab()
    if (this._tab === 'site') return this._siteTab(info)
    if (this._tab === 'messengers') return this._messengersTab(info)
    if (this._tab === 'gateway') return this._gatewayTab(info)
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
          <button type="button" class="sm-btn sm-btn-sm sm-btn-primary" onclick="SMSettings.saveProfile()"><i class="fas fa-save"></i> ذخیره</button>
        </div>
        <div class="sm-card-body">
          ${mustChange ? `<div class="sm-settings-alert"><i class="fas fa-shield-halved"></i> برای امنیت، لطفاً رمز پیش‌فرض را در بخش پایین عوض کنید.</div>` : ''}
          <div class="sm-profile-head">
            <div class="sm-profile-avatar" id="sm-profile-avatar-preview">${logo
              ? `<img src="${SM.esc(logo)}" alt="logo"/>`
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
            ? `<img src="${SM.esc(logo)}" alt="لوگو"/>`
            : '<span class="sm-logo-placeholder"><i class="fas fa-camera-retro"></i></span>'}</div>
          <input type="file" id="prof-logo-file" accept="image/*" hidden onchange="SMSettings.onLogoPick(this)"/>
          <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap">
            <button type="button" class="sm-btn sm-btn-ghost" onclick="document.getElementById('prof-logo-file').click()"><i class="fas fa-upload"></i> انتخاب تصویر</button>
            ${logo ? `<button type="button" class="sm-btn sm-btn-ghost" onclick="SMSettings.removeLogo()"><i class="fas fa-trash"></i> حذف</button>` : ''}
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
          <button type="button" class="sm-btn sm-btn-primary" onclick="SMSettings.changePassword()"><i class="fas fa-key"></i> ذخیره رمز جدید</button>
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
        <div class="sm-card-head"><div class="sm-card-title"><i class="fas fa-key" style="color:var(--sm-accent)"></i> کد اختصاصی اتصال پرسنل به استودیو (اتصال دوطرفه)</div></div>
        <div class="sm-card-body">
          <p style="font-size:.84rem;color:var(--sm-text-muted);line-height:1.8;margin:0 0 14px">
            این کد اختصاصی و یکتای استودیو شماست. آن را در اختیار پرسنل، عکاسان، تدوین‌گران و همکاران قرار دهید تا هنگام ثبت‌نام در سامانه، در زبانه <strong>«عضویت پرسنل (اتصال به استودیو)»</strong> این کد را وارد کنند. پس از ارسال درخواست توسط همکار، کارت درخواست اتصال در بخش <strong>«پرسنل»</strong> ظاهر شده و با تأیید شما حساب همکار فعال و رسمی می‌گردد.
          </p>
          <div style="text-align:center;padding:20px;border:2px dashed var(--sm-border);border-radius:14px;margin-bottom:12px">
            <div style="font-size:.75rem;color:var(--sm-text-muted)">کد عضویت</div>
            <div dir="ltr" style="font-size:1.8rem;font-weight:800;letter-spacing:4px;margin:8px 0;font-family:ui-monospace,monospace">${SM.esc(formatted || '—')}</div>
            <div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap">
              <button type="button" class="sm-btn sm-btn-sm sm-btn-primary" onclick="SMSettings.copyJoinCode()"><i class="fas fa-copy"></i> کپی کد</button>
              <button type="button" class="sm-btn sm-btn-sm sm-btn-ghost" onclick="SMSettings.regenJoinCode()"><i class="fas fa-sync"></i> تولید مجدد</button>
            </div>
          </div>
        </div>
      </div>
      <div class="sm-card"><div class="sm-card-head"><div class="sm-card-title">اطلاعات استودیو</div>
        <button type="button" class="sm-btn sm-btn-sm sm-btn-primary" onclick="SMSettings.saveStudio()"><i class="fas fa-save"></i> ذخیره</button>
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

  _legalTab(info) {
    const legal = info.legalSettings || {}
    return `<div class="sm-settings-grid">
      <div class="sm-card">
        <div class="sm-card-head">
          <div class="sm-card-title"><i class="fas fa-scale-balanced"></i> ضوابط قرارداد و شرایط صنف عکاسان</div>
          <button type="button" class="sm-btn sm-btn-sm sm-btn-primary" onclick="SMSettings.saveLegal()"><i class="fas fa-save"></i> ذخیره ضوابط</button>
        </div>
        <div class="sm-card-body">
          <div class="sm-form-row sm-form-row--2">
            ${SMUI.formField('درصد کسر در کنسلی تا ۳۰ روز قبل مراسم (٪)', 'legal-cancel-30', { value: legal.cancelRate30 ?? '30', type: 'number' })}
            ${SMUI.formField('درصد کسر در کنسلی کمتر از ۱۵ روز قبل (٪)', 'legal-cancel-15', { value: legal.cancelRate15 ?? '70', type: 'number' })}
          </div>
          <div class="sm-form-row sm-form-row--2">
            ${SMUI.formField('مدت ضمانت نگهداری آرشیو راش و فایل خام', 'legal-archive-period', { value: legal.archivePeriod || 'یک سال خورشیدی' })}
            ${SMUI.formField('ساعت پایان استاندارد مراسم در تالار', 'legal-end-hour', { value: legal.standardEndHour || '۲۴:۰۰' })}
          </div>
          <div class="sm-form-row sm-form-row--2">
            ${SMUI.formField('هزینه هر ساعت اضافه‌کاری هر تصویربردار (تومان)', 'legal-overtime-rate', { value: legal.overtimeRate ? String(legal.overtimeRate) : '۵۰۰,۰۰۰' })}
            ${SMUI.formField('شماره پروانه کسب / شناسه اتحادیه عکاسان', 'legal-license-no', { value: legal.licenseNo || '' })}
          </div>
          ${SMUI.formField('متن پیش‌فرض شروط و تعهدات قرارداد', 'legal-terms-text', { type: 'textarea', value: legal.defaultTerms || '۱. تحویل راش و فیلم تدوین‌شده منوط به تسویه‌حساب کامل قرارداد می‌باشد.\n۲. مسئولیت تامین امنیت تجهیزات و تصویربرداران در محل سالن بر عهده کارفرما است.\n۳. استودیو تعهد می‌نماید تمامی پرسنل آفیش پوشش رسمی و استاندارد صنف را رعایت کنند.' })}
        </div>
      </div>
      <div class="sm-card">
        <div class="sm-card-head"><div class="sm-card-title"><i class="fas fa-signature"></i> مهر و امضای دیجیتال استودیو</div></div>
        <div class="sm-card-body">
          <p style="font-size:.84rem;color:var(--sm-text-muted);line-height:1.7">تصویر مهر رسمی یا امضای دیجیتال آتلیه را وارد کنید تا به صورت خودکار در نسخه چاپی و PDF قراردادهای مشتریان درج شود.</p>
          <div style="display:flex;gap:12px;align-items:center;margin-top:12px">
            <input type="text" id="legal-signature-img" class="sm-input" placeholder="آدرس تصویر یا دیتا URL مهر..." value="${SM.esc(legal.signatureImg || '')}"/>
            <button type="button" class="sm-btn sm-btn-ghost sm-btn-sm" onclick="document.getElementById('legal-sig-file').click()"><i class="fas fa-upload"></i> انتخاب فایل</button>
            <input type="file" id="legal-sig-file" accept="image/*" style="display:none" onchange="SMSettings.uploadSignature(this)"/>
          </div>
          ${legal.signatureImg ? `<div style="margin-top:12px;padding:10px;background:rgba(255,255,255,0.05);border-radius:10px;text-align:center"><img src="${SM.esc(legal.signatureImg)}" style="max-height:80px;object-fit:contain"/></div>` : ''}
        </div>
      </div>
    </div>`
  },

  _automationTab(info) {
    const auto = info.smsAutomation || {}
    return `<div class="sm-settings-grid">
      <div class="sm-card">
        <div class="sm-card-head">
          <div class="sm-card-title"><i class="fas fa-bolt"></i> اتوماسیون هوشمند پیامک و باشگاه مشتریان</div>
          <button type="button" class="sm-btn sm-btn-sm sm-btn-primary" onclick="SMSettings.saveAutomation()"><i class="fas fa-save"></i> ذخیره اتوماسیون</button>
        </div>
        <div class="sm-card-body">
          <div class="sm-toggle-row" style="margin-bottom:14px">
            <label class="sm-toggle">
              <input type="checkbox" id="auto-anniversary" ${auto.anniversaryEnabled !== false ? 'checked' : ''}/>
              <span class="sm-toggle-slider"></span>
            </label>
            <div>
              <strong>ارسال خودکار پیامک تبریک سالگرد ازدواج</strong>
              <div style="font-size:.78rem;color:var(--sm-text-muted)">سالانه در تاریخ سالگرد مراسم، پیامک تبریک همراه با پیشنهاد عکاسی سالگرد ارسال می‌شود.</div>
            </div>
          </div>
          ${SMUI.formField('متن پیامک تبریک سالگرد', 'auto-anniversary-text', { type: 'textarea', value: auto.anniversaryText || 'عروس و داماد عزیز، سالگرد یکی شدنتان مبارک باد 🌸 به همین مناسبت یک عکس یادگاری با ۳۰٪ تخفیف مهمان استودیو ما باشید.' })}

          <div class="sm-toggle-row" style="margin:20px 0 14px">
            <label class="sm-toggle">
              <input type="checkbox" id="auto-remind-installment" ${auto.remindInstallment !== false ? 'checked' : ''}/>
              <span class="sm-toggle-slider"></span>
            </label>
            <div>
              <strong>ارسال خودکار یادآوری سررسید اقساط و تسویه حساب</strong>
              <div style="font-size:.78rem;color:var(--sm-text-muted)">۳ روز قبل از موعد سررسید اقساط یا موعد مراسم، پیامک یادآوری محترمانه ارسال می‌گردد.</div>
            </div>
          </div>
          ${SMUI.formField('متن پیامک یادآوری اقساط', 'auto-remind-text', { type: 'textarea', value: auto.remindText || 'مشتری گرامی استودیو، یادآوری موعد تسویه قسط قرارداد مراسم شما در ۳ روز آینده است. جهت هماهنگی با مدیریت تماس حاصل فرمایید.' })}

          <div class="sm-toggle-row" style="margin:20px 0 14px">
            <label class="sm-toggle">
              <input type="checkbox" id="auto-notify-clip-ready" ${auto.notifyReady !== false ? 'checked' : ''}/>
              <span class="sm-toggle-slider"></span>
            </label>
            <div>
              <strong>پیامک اعلام آماده بودن کلیپ و آلبوم</strong>
              <div style="font-size:.78rem;color:var(--sm-text-muted)">پس از پایان مراحل تدوین و چاپ، لینک تحویل کار به مشتری ارسال می‌شود.</div>
            </div>
          </div>
        </div>
      </div>
    </div>`
  },

  _securityTab(info) {
    const sec = info.securityPolicy || {}
    const sessionTimeout = sec.sessionTimeoutMinutes || 480
    return `<div class="sm-settings-grid">
      <div class="sm-card">
        <div class="sm-card-head">
          <div class="sm-card-title"><i class="fas fa-shield-halved"></i> سیاست‌های امنیتی و کنترل نشست‌ها</div>
          <button type="button" class="sm-btn sm-btn-sm sm-btn-primary" onclick="SMSettings.saveSecurity()"><i class="fas fa-save"></i> ذخیره تنظیمات امنیت</button>
        </div>
        <div class="sm-card-body">
          <div class="sm-form-row sm-form-row--2">
            <div class="sm-form-group">
              <label class="sm-label">زمان انقضای خودکار نشست در صورت عدم فعالیت</label>
              <select id="sec-timeout" class="sm-select">
                <option value="15" ${sessionTimeout === 15 ? 'selected' : ''}>۱۵ دقیقه</option>
                <option value="30" ${sessionTimeout === 30 ? 'selected' : ''}>۳۰ دقیقه</option>
                <option value="60" ${sessionTimeout === 60 ? 'selected' : ''}>۱ ساعت</option>
                <option value="480" ${sessionTimeout === 480 ? 'selected' : ''}>۸ ساعت (استاندارد شیفت کاری)</option>
                <option value="1440" ${sessionTimeout === 1440 ? 'selected' : ''}>۲۴ ساعت</option>
              </select>
            </div>
            <div class="sm-form-group">
              <label class="sm-label">الزام به تغییر رمزهای پیش‌فرض پرسنل</label>
              <select id="sec-force-pw-change" class="sm-select">
                <option value="true" ${sec.forcePwChange !== false ? 'selected' : ''}>فعال (پرسنل در اولین ورود رمز را عوض کنند)</option>
                <option value="false" ${sec.forcePwChange === false ? 'selected' : ''}>اختیاری</option>
              </select>
            </div>
          </div>

          <div style="margin-top:20px;padding:16px;background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.2);border-radius:12px">
            <h4 style="color:#EF4444;margin:0 0 8px"><i class="fas fa-triangle-exclamation"></i> خروج اضطراری از تمام دستگاه‌ها</h4>
            <p style="font-size:.82rem;color:var(--sm-text-muted);line-height:1.7;margin:0 0 12px">در صورتی که حس کردید حسابی در دستگاه دیگری باز مانده است، با زدن این دکمه نشست تمامی کاربران فوراً باطل می‌شود.</p>
            <button type="button" class="sm-btn sm-btn-danger sm-btn-sm" onclick="SMSettings.killAllSessions()"><i class="fas fa-power-off"></i> خروج فوری از همه دستگاه‌ها</button>
          </div>
        </div>
      </div>
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
    return `<div class="sm-card sm-settings-full">
      <div class="sm-card-head">
        <div class="sm-card-title"><i class="fas fa-gauge-high"></i> پیشخوان مدیریتی</div>
        <button type="button" class="sm-btn sm-btn-sm sm-btn-primary" onclick="SM.navigate('dashboard')"><i class="fas fa-eye"></i> مشاهده پیشخوان</button>
      </div>
      <div class="sm-card-body">
        <p style="font-size:.82rem;color:var(--sm-text-muted);line-height:1.7;margin:0 0 16px">
          چیدمان پیشخوان بر اساس اولویت تصمیم‌گیری استودیو ثابت شده تا مقایسه دوره‌ها و محل شاخص‌ها تغییر نکند. تمام کارت‌ها مستقیماً از قراردادها، حسابداری، هزینه‌ها، تقویم و گردش تولید خوانده می‌شوند.
        </p>
        <div class="sm-widget-list">
          ${[
            ['fa-coins', 'شاخص‌های مالی', 'فقط مدیر سیستم و مدیر استودیو'],
            ['fa-chart-line', 'وصول و برآورد', 'شش ماه اخیر با فرمول قابل مشاهده'],
            ['fa-heart-pulse', 'سلامت مالی', 'وصول، نقدینگی، سودآوری و بدهی'],
            ['fa-clapperboard', 'عملیات تولید', 'دریافت، انتخاب، ادیت، بازبینی و تحویل'],
            ['fa-calendar-check', 'مراسم‌های نزدیک', 'تقویم و قراردادهای سی روز آینده']
          ].map(item => `<div class="sm-widget-row"><span class="sm-widget-icon"><i class="fas ${item[0]}"></i></span><span><strong>${item[1]}</strong><small>${item[2]}</small></span></div>`).join('')}
        </div>
      </div>
    </div>`
  },

  _siteTab(info) {
    const links = { ...(typeof SiteBridge !== 'undefined' ? SiteBridge.DEFAULT_LINKS : {}), ...(info.siteLinks || {}) }
    const base = typeof SiteBridge !== 'undefined' ? SiteBridge.appBase() : ''
    const embed = typeof SiteBridge !== 'undefined' ? SiteBridge.embedSnippet() : ''
    return `<div class="sm-settings-grid">
      <div class="sm-card sm-settings-full">
        <div class="sm-card-head"><div class="sm-card-title">اتصال به سایت شما</div>
          <button type="button" class="sm-btn sm-btn-sm sm-btn-primary" onclick="SMSettings.saveSite()"><i class="fas fa-save"></i> ذخیره</button>
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
          <button type="button" class="sm-btn sm-btn-sm sm-btn-ghost" onclick="SMSettings.copyEmbed()"><i class="fas fa-copy"></i> کپی</button>
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
    DB.set('studioInfo', {
      ...prev,
      externalSiteUrl: document.getElementById('site-external')?.value?.trim() || '',
      appBaseUrl: document.getElementById('site-app-base')?.value?.trim() || '',
      siteLinks: links
    })
    SM.toast('تنظیمات سایت ذخیره شد', 'success')
    SM.navigate('settings')
  },

  copyEmbed() {
    const el = document.getElementById('site-embed-code')
    if (el && typeof Utils !== 'undefined') Utils.copyText(el.textContent)
  },

  _messengersTab(info) {
    const baleToken = info.baleBotToken || ''
    const baleUser = info.baleBotUsername || 'mandani_studio_bot'
    const waPhone = info.whatsappPhone || info.phone || ''
    const emailSmtpHost = info.emailSmtpHost || ''
    const emailSmtpPort = info.emailSmtpPort || '465'
    const emailUser = info.emailSmtpUser || ''
    const emailPass = info.emailSmtpPass || ''
    const emailConfigured = !!(emailUser && emailPass)

    return `<div class="sm-card"><div class="sm-card-head"><div class="sm-card-title"><i class="fas fa-paper-plane" style="color:#60a5fa"></i> پیام‌رسان‌ها (بله، واتساپ و ایمیل اختصاصی این استودیو)</div>
        <button type="button" class="sm-btn sm-btn-sm sm-btn-primary" onclick="SMSettings.saveMessengers()"><i class="fas fa-save"></i> ذخیره تنظیمات</button>
      </div>
      <div class="sm-card-body">
        <p style="font-size:.85rem;color:var(--sm-text-muted);margin-bottom:16px;line-height:1.7">
          این تنظیمات در پایگاه داده اختصاصی همین استودیو ذخیره می‌شود. هر استودیو می‌تواند ربات بله، شماره واتساپ و ایمیل اختصاصی خود را داشته باشد یا از مقادیر پیش‌فرض سرور استفاده کند:
        </p>

        <!-- Bale Section -->
        <div style="background:rgba(27,116,228,0.06);border:1px solid rgba(27,116,228,0.25);border-radius:12px;padding:16px;margin-bottom:20px">
          <div style="display:flex;align-items:center;gap:8px;font-weight:800;color:#60a5fa;margin-bottom:8px">
            <i class="fas fa-robot"></i> ۱. تنظیمات ربات رسمی بله (Bale Bot — رایگان، قانونی و بدون فیلتر در ایران)
          </div>
          <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:12px">
            <p style="font-size:.82rem;color:var(--sm-text-muted);margin:0;line-height:1.6">
              کافیست در اپلیکیشن بله به <code dir="ltr">@BotFather</code> پیام دهید، یک بازو با نام استودیو خود بسازید و توکن آن را اینجا وارد فرمایید:
            </p>
            <a href="bale_bot_guide.html" target="_blank" class="sm-btn sm-btn-xs" style="background:rgba(96,165,250,0.15);color:#60a5fa;border:1px solid rgba(96,165,250,0.3);text-decoration:none;display:inline-flex;align-items:center;gap:6px;padding:6px 12px;border-radius:8px;font-weight:700">
              <i class="fas fa-play-circle"></i> مشاهده شبیه‌ساز و راهنمای تصویری گام‌به‌گام
            </a>
          </div>
          ${SMUI.formField('توکن ربات بله (Bot Token)', 'set-bale-token', { value: baleToken, dir: 'ltr', placeholder: 'مثلاً: 123456789:ABCdefGhIjkLmNoPqRsTuvWxYz' })}
          ${SMUI.formField('نام کاربری ربات بله (Username)', 'set-bale-user', { value: baleUser, dir: 'ltr', placeholder: 'مثلاً: mandani_studio_bot' })}
        </div>

        <!-- WhatsApp Section -->
        <div style="background:rgba(37,211,102,0.06);border:1px solid rgba(37,211,102,0.25);border-radius:12px;padding:16px;margin-bottom:20px">
          <div style="display:flex;align-items:center;gap:8px;font-weight:800;color:#4ade80;margin-bottom:8px">
            <i class="fab fa-whatsapp"></i> ۲. شماره واتساپ استودیو (WhatsApp)
          </div>
          <p style="font-size:.82rem;color:var(--sm-text-muted);margin:0 0 12px;line-height:1.6">
            شماره موبایل کاری استودیو جهت ارسال و دریافت خودکار پیام‌های قرارداد و کدهای تایید:
          </p>
          ${SMUI.formField('شماره واتساپ استودیو', 'set-whatsapp-phone', { value: waPhone, dir: 'ltr', placeholder: '0918xxxxxxx' })}
        </div>

        <!-- Email Section — Full SMTP -->
        <div style="background:rgba(245,158,11,0.06);border:1px solid rgba(245,158,11,0.25);border-radius:12px;padding:16px" id="smtp-section">
          <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;margin-bottom:10px">
            <div style="display:flex;align-items:center;gap:8px;font-weight:800;color:#f59e0b">
              <i class="fas fa-envelope"></i> ۳. ایمیل رسمی استودیو (SMTP)
            </div>
            <span id="smtp-status-badge" style="font-size:11px;padding:3px 10px;border-radius:20px;font-weight:700;background:${emailConfigured ? 'rgba(74,222,128,0.15)' : 'rgba(239,68,68,0.15)'};color:${emailConfigured ? '#4ade80' : '#f87171'};border:1px solid ${emailConfigured ? 'rgba(74,222,128,0.4)' : 'rgba(239,68,68,0.4)'}">
              <i class="fas fa-${emailConfigured ? 'check-circle' : 'times-circle'}"></i> ${emailConfigured ? 'پیکربندی شده' : 'پیکربندی نشده'}
            </span>
          </div>

          ${!emailConfigured ? `<div style="background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.3);border-radius:8px;padding:10px 12px;margin-bottom:12px;font-size:12px;color:#fca5a5;line-height:1.7">
            <i class="fas fa-exclamation-triangle"></i> <strong>توجه:</strong> بدون تنظیم SMTP، قابلیت «فراموشی رمز عبور با ایمیل» و «ارسال فاکتور به ایمیل» غیرفعال خواهد بود. کد OTP تولید می‌شود اما به هیچ آدرسی ارسال نمی‌گردد.
          </div>` : ''}

          <p style="font-size:.82rem;color:var(--sm-text-muted);margin:0 0 14px;line-height:1.7">
            جهت ارسال کد بازیابی رمز، فاکتور و قرارداد به ایمیل مراجعین. <strong>برای جیمیل:</strong> ابتدا <a href="https://myaccount.google.com/apppasswords" target="_blank" style="color:#f59e0b">گذرواژه برنامه (App Password)</a> بسازید.
          </p>

          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px">
            <div>
              <label style="font-size:12px;color:var(--sm-text-muted);display:block;margin-bottom:4px">سرور SMTP (Host)</label>
              <input id="set-smtp-host" type="text" dir="ltr" value="${emailSmtpHost}" placeholder="smtp.gmail.com" style="width:100%;box-sizing:border-box" class="sm-input" />
            </div>
            <div>
              <label style="font-size:12px;color:var(--sm-text-muted);display:block;margin-bottom:4px">پورت (Port)</label>
              <select id="set-smtp-port" dir="ltr" class="sm-input" style="width:100%;box-sizing:border-box">
                <option value="465" ${emailSmtpPort === '465' ? 'selected' : ''}>465 (SSL — جیمیل)</option>
                <option value="587" ${emailSmtpPort === '587' ? 'selected' : ''}>587 (TLS — Outlook/Yahoo)</option>
                <option value="25" ${emailSmtpPort === '25' ? 'selected' : ''}>25 (Plain)</option>
              </select>
            </div>
          </div>

          ${SMUI.formField('آدرس ایمیل فرستنده', 'set-email-user', { value: emailUser, dir: 'ltr', placeholder: 'studio@gmail.com', type: 'email' })}
          ${SMUI.formField('گذرواژه برنامه (App Password)', 'set-email-pass', { type: 'password', value: emailPass, dir: 'ltr', placeholder: '۱۶ کاراکتر (مثال: abcd efgh ijkl mnop)' })}

          <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:14px">
            <button type="button" class="sm-btn sm-btn-sm" onclick="SMSettings.testSmtpConnection()" style="background:rgba(245,158,11,0.15);color:#f59e0b;border:1px solid rgba(245,158,11,0.4)">
              <i class="fas fa-plug"></i> تست اتصال SMTP
            </button>
            <button type="button" class="sm-btn sm-btn-sm" onclick="SMSettings.testSmtpSend()" style="background:rgba(96,165,250,0.15);color:#60a5fa;border:1px solid rgba(96,165,250,0.4)">
              <i class="fas fa-paper-plane"></i> ارسال ایمیل آزمایشی
            </button>
          </div>
          <div id="smtp-test-result" style="display:none;margin-top:10px;padding:10px 12px;border-radius:8px;font-size:12px;line-height:1.6"></div>

          <!-- Gmail App Password Guide -->
          <details style="margin-top:14px">
            <summary style="cursor:pointer;font-size:12.5px;font-weight:700;color:#f59e0b;user-select:none"><i class="fas fa-question-circle"></i> راهنمای مرحله‌به‌مرحله ساخت App Password جیمیل</summary>
            <ol style="font-size:11.5px;color:var(--sm-text-muted);line-height:2;padding-right:20px;margin-top:10px">
              <li>وارد حساب Google خود شوید: <a href="https://myaccount.google.com" target="_blank" style="color:#60a5fa">myaccount.google.com</a></li>
              <li>به بخش <strong>Security → 2-Step Verification</strong> بروید و فعال کنید (اجباری).</li>
              <li>در همان صفحه Security به پایین اسکرول کنید → <strong>App passwords</strong> را انتخاب کنید.</li>
              <li>در منوی کشویی «Other (Custom name)» را انتخاب و نام «Studio ERP» وارد کنید.</li>
              <li>کلیک Generate → یک رشته ۱۶ کاراکتری نمایش داده می‌شود.</li>
              <li>این رشته را در فیلد «گذرواژه برنامه» بالا وارد کنید (بدون فاصله).</li>
            </ol>
          </details>
        </div>
      </div></div>`
  },

  async saveMessengers() {
    const baleToken = document.getElementById('set-bale-token')?.value?.trim() || ''
    const baleUser = document.getElementById('set-bale-user')?.value?.trim() || ''
    const waPhone = document.getElementById('set-whatsapp-phone')?.value?.trim() || ''
    const emailUser = document.getElementById('set-email-user')?.value?.trim() || ''
    const emailPass = document.getElementById('set-email-pass')?.value?.trim() || ''
    const emailSmtpHost = document.getElementById('set-smtp-host')?.value?.trim() || 'smtp.gmail.com'
    const emailSmtpPort = document.getElementById('set-smtp-port')?.value || '465'
    const emailSmtpSecure = emailSmtpPort === '465'

    await SecureDB.merge('studioInfo', {
      baleBotToken: baleToken,
      baleBotUsername: baleUser,
      whatsappPhone: waPhone,
      emailSmtpUser: emailUser,
      emailSmtpPass: emailPass,
      emailSmtpHost,
      emailSmtpPort,
      emailSmtpSecure
    })

    if (typeof ServerSync !== 'undefined' && ServerSync.pushNow) {
      ServerSync.pushNow().catch(() => {})
    }

    SM.toast('تنظیمات پیام‌رسان‌های استودیو با موفقیت ذخیره شد ✓', 'success')
    SM.navigate('settings')
  },

  async testSmtpConnection() {
    const resultEl = document.getElementById('smtp-test-result')
    const host = document.getElementById('set-smtp-host')?.value?.trim() || 'smtp.gmail.com'
    const port = document.getElementById('set-smtp-port')?.value || '465'
    const user = document.getElementById('set-email-user')?.value?.trim() || ''
    const pass = document.getElementById('set-email-pass')?.value?.trim() || ''
    if (!user || !pass) {
      if (resultEl) {
        resultEl.style.display = 'block'
        resultEl.style.background = 'rgba(239,68,68,0.1)'
        resultEl.style.border = '1px solid rgba(239,68,68,0.3)'
        resultEl.style.color = '#fca5a5'
        resultEl.innerHTML = '<i class="fas fa-times-circle"></i> لطفاً ابتدا آدرس ایمیل و گذرواژه برنامه را وارد کنید.'
      }
      return
    }
    if (resultEl) {
      resultEl.style.display = 'block'
      resultEl.style.background = 'rgba(96,165,250,0.08)'
      resultEl.style.border = '1px solid rgba(96,165,250,0.2)'
      resultEl.style.color = '#93c5fd'
      resultEl.innerHTML = '<i class="fas fa-spinner fa-spin"></i> در حال بررسی اتصال به سرور ایمیل...'
    }
    try {
      const res = await fetch('/api/email/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ smtpHost: host, smtpPort: port, smtpUser: user, smtpPass: pass, smtpSecure: port === '465' })
      })
      const data = await res.json().catch(() => ({}))
      if (resultEl) {
        if (data.ok) {
          resultEl.style.background = 'rgba(74,222,128,0.1)'
          resultEl.style.border = '1px solid rgba(74,222,128,0.3)'
          resultEl.style.color = '#86efac'
          resultEl.innerHTML = `<i class="fas fa-check-circle"></i> ${data.message || 'اتصال به سرور ایمیل با موفقیت برقرار شد ✓'}`
          // Update badge
          const badge = document.getElementById('smtp-status-badge')
          if (badge) {
            badge.style.background = 'rgba(74,222,128,0.15)'
            badge.style.color = '#4ade80'
            badge.style.border = '1px solid rgba(74,222,128,0.4)'
            badge.innerHTML = '<i class="fas fa-check-circle"></i> متصل و فعال'
          }
        } else {
          resultEl.style.background = 'rgba(239,68,68,0.1)'
          resultEl.style.border = '1px solid rgba(239,68,68,0.3)'
          resultEl.style.color = '#fca5a5'
          resultEl.innerHTML = `<i class="fas fa-times-circle"></i> ${data.error || 'خطا در اتصال به سرور ایمیل'}`
        }
      }
    } catch (e) {
      if (resultEl) {
        resultEl.style.background = 'rgba(239,68,68,0.1)'
        resultEl.style.border = '1px solid rgba(239,68,68,0.3)'
        resultEl.style.color = '#fca5a5'
        resultEl.innerHTML = `<i class="fas fa-times-circle"></i> خطا در برقراری ارتباط با سرور: ${e.message}`
      }
    }
  },

  async testSmtpSend() {
    const resultEl = document.getElementById('smtp-test-result')
    const user = document.getElementById('set-email-user')?.value?.trim() || ''
    const pass = document.getElementById('set-email-pass')?.value?.trim() || ''
    const host = document.getElementById('set-smtp-host')?.value?.trim() || 'smtp.gmail.com'
    const port = document.getElementById('set-smtp-port')?.value || '465'
    if (!user || !pass) {
      if (resultEl) {
        resultEl.style.display = 'block'
        resultEl.style.background = 'rgba(239,68,68,0.1)'
        resultEl.style.border = '1px solid rgba(239,68,68,0.3)'
        resultEl.style.color = '#fca5a5'
        resultEl.innerHTML = '<i class="fas fa-times-circle"></i> ابتدا آدرس ایمیل و گذرواژه را وارد نمایید.'
      }
      return
    }
    if (resultEl) {
      resultEl.style.display = 'block'
      resultEl.style.background = 'rgba(96,165,250,0.08)'
      resultEl.style.border = '1px solid rgba(96,165,250,0.2)'
      resultEl.style.color = '#93c5fd'
      resultEl.innerHTML = `<i class="fas fa-spinner fa-spin"></i> در حال ارسال ایمیل آزمایشی به <strong dir="ltr">${user}</strong>...`
    }
    try {
      const studioName = (typeof DB !== 'undefined' && DB.get ? DB.get('studioInfo')?.name : null) || 'استودیو'
      const res = await fetch('/api/email/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: user,
          subject: `✅ تست SMTP — ${studioName}`,
          html: `<div dir="rtl" style="font-family:Tahoma,sans-serif;padding:20px;background:#0d1117;color:#e6edf3;border-radius:12px"><h2 style="color:#f59e0b">تست اتصال ایمیل استودیو</h2><p>اگر این ایمیل را دریافت کردید، تنظیمات SMTP شما <strong style="color:#4ade80">به درستی پیکربندی شده</strong> است.</p><p style="color:#8b949e;font-size:12px">سیستم مدیریت استودیو CRMSTUDIO</p></div>`,
          smtpHost: host,
          smtpPort: port,
          smtpUser: user,
          smtpPass: pass,
          smtpSecure: port === '465',
          fromName: studioName
        })
      })
      const data = await res.json().catch(() => ({}))
      if (resultEl) {
        if (data.ok) {
          resultEl.style.background = 'rgba(74,222,128,0.1)'
          resultEl.style.border = '1px solid rgba(74,222,128,0.3)'
          resultEl.style.color = '#86efac'
          resultEl.innerHTML = `<i class="fas fa-check-circle"></i> ایمیل آزمایشی با موفقیت به <strong dir="ltr">${user}</strong> ارسال شد! لطفاً صندوق ورودی (و پوشه Spam) را بررسی کنید.`
        } else {
          resultEl.style.background = 'rgba(239,68,68,0.1)'
          resultEl.style.border = '1px solid rgba(239,68,68,0.3)'
          resultEl.style.color = '#fca5a5'
          resultEl.innerHTML = `<i class="fas fa-times-circle"></i> ${data.error || 'خطا در ارسال ایمیل'}`
        }
      }
    } catch (e) {
      if (resultEl) {
        resultEl.style.background = 'rgba(239,68,68,0.1)'
        resultEl.style.border = '1px solid rgba(239,68,68,0.3)'
        resultEl.style.color = '#fca5a5'
        resultEl.innerHTML = `<i class="fas fa-times-circle"></i> خطا در ارتباط با سرور: ${e.message}`
      }
    }
  },

  _smsTab(info) {
    const configured = typeof SmsProvider !== 'undefined' && SmsProvider.isConfigured()
    const user = SM.currentUser()
    const defaultTestPhone = user?.phone || '09'
    return `<div class="sm-card"><div class="sm-card-head"><div class="sm-card-title">تنظیمات پنل پیامک (SMS)</div>
        <button type="button" class="sm-btn sm-btn-sm sm-btn-primary" onclick="SMSettings.saveSms()"><i class="fas fa-save"></i> ذخیره تنظیمات</button>
      </div>
      <div class="sm-card-body">
        <p style="font-size:.85rem;color:var(--sm-text-muted);margin-bottom:14px">
          برای ارسال پیامک اطلاع‌رسانی، تایید قرارداد و کدهای ورود. در صورت ارسال مستقیم از ملی‌پیامک، فیلد <strong>«URL پراکسی» را خالی بگذارید</strong>.
        </p>
        <div style="display:flex;gap:10px;align-items:center;margin-bottom:16px;flex-wrap:wrap">
          ${SMUI.badge(configured ? 'وضعیت اتصال: متصل' : 'وضعیت اتصال: نیاز به تکمیل اطلاعات', configured ? 'success' : 'warning')}
          ${info.smsProvider ? `<span style="font-size:.82rem;color:var(--sm-text-muted)">سامانه: <strong>${SM.esc(info.smsProvider === 'melipayamak' ? 'ملی پیامک' : info.smsProvider)}</strong></span>` : ''}
          ${info.smsLineNumber ? `<span style="font-size:.82rem;color:var(--sm-text-muted)">خط: <code dir="ltr">${SM.esc(info.smsLineNumber)}</code></span>` : ''}
        </div>

        ${SMUI.formField('ارائه‌دهنده پیامک', 'set-sms-provider', { type: 'select', value: info.smsProvider || 'melipayamak', options: [
          { value: '', label: '— انتخاب —' },
          { value: 'melipayamak', label: 'ملی پیامک (پیش‌فرض)' },
          { value: 'kavenegar', label: 'کاوه‌نگار' },
          { value: 'smsir', label: 'SMS.ir' },
          { value: 'farazsms', label: 'فراز SMS' }
        ]})}
        ${SMUI.formField('توکن کنسول / کلید API (API Key)', 'set-sms-key', { value: info.smsApiKey || '', dir: 'ltr', placeholder: 'مثلاً: a1b2c3d4e5f6...' })}
        ${SMUI.formField('شماره خط اختصاصی فرستنده', 'set-sms-line', { value: info.smsLineNumber || '', dir: 'ltr', placeholder: 'مثلاً: 500012345678' })}
        ${SMUI.formField('نام کاربری پنل (اختیاری — برای توکن کنسول خالی بگذارید)', 'set-sms-user', { value: info.smsUsername || '', dir: 'ltr', placeholder: 'username پنل' })}
        ${SMUI.formField('URL پراکسی SMS (اختیاری — برای ارسال مستقیم خالی بگذارید)', 'set-sms-proxy', { value: info.smsProxyUrl || '', dir: 'ltr', placeholder: 'https://xxx.supabase.co/functions/v1/send-sms' })}

        <label class="sm-check-row" style="margin-top:14px">
          <input type="checkbox" id="set-sms-morning" ${info.smsMorningReminders !== false ? 'checked' : ''}/>
          ارسال خودکار یادآوری صبحگاهی تقویم به شماره مدیر
        </label>

        <!-- اتوماسیون هوشمند پیامکی چرخه‌عمر -->
        <div style="margin-top:24px;padding:18px;background:rgba(212,175,55,0.04);border:1px solid rgba(212,175,55,0.3);border-radius:14px">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;flex-wrap:wrap;gap:8px">
            <div style="font-weight:800;font-size:.95rem;color:#f59e0b;display:flex;align-items:center;gap:8px">
              <i class="fas fa-robot"></i> اتوماسیون هوشمند پیامکی چرخه‌عمر (Lifecycle SMS)
            </div>
            <span style="font-size:.78rem;background:rgba(16,185,129,0.15);color:#10b981;border:1px solid rgba(16,185,129,0.3);padding:3px 10px;border-radius:999px;font-weight:700">
              <i class="fas fa-bolt"></i> بدون دخالت دستی
            </span>
          </div>
          <p style="font-size:.82rem;color:var(--sm-text-muted);margin-bottom:14px;line-height:1.6">
            سیستم به طور خودکار سررسید اقساط، تاریخ مراسم و آفیش عوامل را رصد کرده و بدون نیاز به پیگیری دستی، پیامک‌های هوشمند ارسال می‌کند:
          </p>

          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:12px;margin-bottom:16px">
            <label class="sm-check-row" style="background:var(--sm-bg,rgba(0,0,0,0.2));padding:10px 14px;border-radius:10px;border:1px solid var(--sm-border)">
              <input type="checkbox" id="set-sms-auto-installment" checked/>
              <span><strong>💳 یادآوری اقساط و تسویه:</strong> ۳ روز قبل از مراسم همراه با لینک پرداخت شاپرک</span>
            </label>
            <label class="sm-check-row" style="background:var(--sm-bg,rgba(0,0,0,0.2));padding:10px 14px;border-radius:10px;border:1px solid var(--sm-border)">
              <input type="checkbox" id="set-sms-auto-shoot-couple" checked/>
              <span><strong>💒 یادآوری مراسم به زوجین:</strong> ۲۴ ساعت قبل با ساعت حضور و لوکیشن باغ/تالار</span>
            </label>
            <label class="sm-check-row" style="background:var(--sm-bg,rgba(0,0,0,0.2));padding:10px 14px;border-radius:10px;border:1px solid var(--sm-border)">
              <input type="checkbox" id="set-sms-auto-shoot-crew" checked/>
              <span><strong>🎬 یادآوری آفیش به عوامل:</strong> اطلاع‌رسانی به عکاس، فیلمبردار و هلی‌شات</span>
            </label>
            <label class="sm-check-row" style="background:var(--sm-bg,rgba(0,0,0,0.2));padding:10px 14px;border-radius:10px;border:1px solid var(--sm-border)">
              <input type="checkbox" id="set-sms-auto-anniv" checked/>
              <span><strong>🌹 تبریک سالگرد ازدواج:</strong> ارسال پیامک تبریک پس از ۱ سال با کد تخفیف ۲۰٪</span>
            </label>
          </div>

          <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
            <button type="button" id="btn-run-lifecycle-sms" class="sm-btn sm-btn-primary sm-btn-sm" style="background:linear-gradient(135deg,#f59e0b,#d97706);color:#000;font-weight:800" onclick="SMSettings.runLifecycleSmsScan()">
              <i class="fas fa-play"></i> اجرای فوری اسکن و ارسال پیامک‌های امروز
            </button>
            <button type="button" class="sm-btn sm-btn-ghost sm-btn-sm" onclick="SMSettings.showLifecycleLogsModal()">
              <i class="fas fa-history"></i> مشاهده تاریخچه ارسال‌ها
            </button>
          </div>
          <div id="lifecycle-sms-result" style="margin-top:12px;font-size:.85rem;display:none;padding:12px 16px;border-radius:10px"></div>
        </div>

        <div style="margin-top:24px;padding:16px;background:var(--sm-bg-hover, rgba(255,255,255,0.03));border:1px solid var(--sm-border);border-radius:12px">
          <div style="font-weight:700;margin-bottom:6px;display:flex;align-items:center;gap:8px">
            <i class="fas fa-paper-plane" style="color:var(--sm-primary)"></i> تست زنده ارسال پیامک
          </div>
          <p style="font-size:.8rem;color:var(--sm-text-muted);margin-bottom:12px">
            شماره موبایل را وارد کنید و روی دکمه تست کلیک نمایید تا یک پیامک تستی به موبایلتان ارسال شود:
          </p>
          <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
            <input type="tel" id="test-sms-phone" class="sm-input" style="max-width:240px" dir="ltr" placeholder="09xxxxxxxxx" value="${SM.esc(defaultTestPhone)}"/>
            <button type="button" id="btn-test-sms" class="sm-btn sm-btn-primary sm-btn-sm" onclick="SMSettings.testSms()"><i class="fas fa-paper-plane"></i> ارسال پیامک آزمایشی</button>
          </div>
          <div id="test-sms-result" style="margin-top:12px;font-size:.85rem;display:none;padding:10px 14px;border-radius:8px"></div>
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
          <button type="button" class="sm-btn sm-btn-sm sm-btn-primary" onclick="SMSettings.saveBackupSettings()"><i class="fas fa-save"></i> ذخیره</button>
        </div>
        <div class="sm-card-body">
          <label class="sm-check-row sm-check-row--block"><input type="checkbox" id="set-autobackup" ${info.autoBackup ? 'checked' : ''}/> <strong>پشتیبان‌گیری خودکار فعال</strong></label>
          <label class="sm-check-row"><input type="checkbox" id="set-backup-hourly" ${info.backupHourly ? 'checked' : ''}/> هر ساعت (با تاریخ و ساعت شمسی)</label>
          <label class="sm-check-row"><input type="checkbox" id="set-backup-daily" ${info.backupDaily ? 'checked' : ''}/> هر روز — اولین بار در همان روز شمسی</label>
          <label class="sm-check-row sm-check-row--block" style="margin-top:10px"><input type="checkbox" id="set-backup-download" ${info.backupAutoDownload ? 'checked' : ''}/> دانلود خودکار فایل JSON</label>
          <div class="sm-backup-folder-row">
            <label class="sm-label">پوشهٔ ذخیره (یادداشت شخصی)</label>
            <div class="sm-backup-folder-pick">
              <button type="button" class="sm-btn sm-btn-ghost" onclick="SMSettings.pickBackupFolder()"><i class="fas fa-folder-open"></i> انتخاب پوشه</button>
              <input type="text" class="sm-input" id="set-backup-path" value="${SM.esc(info.backupPathNote || '')}" placeholder="مثلاً: Backup روی Desktop"/>
            </div>
            <p class="sm-backup-hint">فایل‌ها با نام شمسی ذخیره می‌شوند — نمونه: <code dir="ltr">${SM.esc(sampleName)}</code></p>
          </div>
          <div style="margin-top:14px;padding-top:12px;border-top:1px solid var(--sm-border)">
            <label class="sm-label"><i class="fas fa-envelope"></i> ایمیل / جیمیل جهت ارسال پشتیبان</label>
            <div style="display:flex;gap:8px;align-items:center;margin-top:4px">
              <input type="email" class="sm-input" id="set-backup-email" dir="ltr" value="${SM.esc(info.backupEmail || info.email || '')}" placeholder="example@gmail.com"/>
              <button type="button" class="sm-btn sm-btn-ghost" onclick="SMSettings.backupToEmail()"><i class="fab fa-google"></i> ارسال به جیمیل</button>
            </div>
          </div>
          <div style="margin-top:14px;padding-top:12px;border-top:1px solid var(--sm-border)">
            <label class="sm-label"><i class="fas fa-robot"></i> پشتیبان‌گیری ابری به کانال یا ربات بله / تلگرام</label>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:4px">
              <input type="text" class="sm-input" id="set-backup-bale-token" dir="ltr" value="${SM.esc(info.baleBotToken || '')}" placeholder="توکن ربات بله یا تلگرام"/>
              <input type="text" class="sm-input" id="set-backup-bale-chat" dir="ltr" value="${SM.esc(info.baleChatId || '')}" placeholder="Chat ID / شناسه عددی چت یا کانال"/>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px">
              <input type="text" class="sm-input" id="set-backup-bale-channel" dir="ltr" value="${SM.esc(info.baleChannelLink || '')}" placeholder="لینک کانال بله: https://ble.ir/..."/>
              <input type="text" class="sm-input" id="set-backup-tg-channel" dir="ltr" value="${SM.esc(info.telegramChannelLink || '')}" placeholder="لینک کانال تلگرام: https://t.me/..."/>
            </div>
            <div style="margin-top:8px;display:flex;gap:8px">
              <button type="button" class="sm-btn sm-btn-ghost sm-btn-sm" onclick="SMSettings.backupToBot('bale')"><i class="fas fa-paper-plane"></i> ارسال فوری فایل به بله</button>
              <button type="button" class="sm-btn sm-btn-ghost sm-btn-sm" onclick="SMSettings.backupToBot('telegram')"><i class="fab fa-telegram"></i> ارسال به تلگرام</button>
            </div>

            <!-- آموزش گام‌به‌گام اتصال به کانال پشتیبان -->
            <div style="margin-top:12px;background:rgba(16,185,129,0.06);border:1px solid rgba(16,185,129,0.2);border-radius:10px;padding:12px;font-size:0.76rem;line-height:1.75;color:rgba(255,255,255,0.8)">
              <div style="font-weight:800;color:var(--sm-success);margin-bottom:4px"><i class="fas fa-circle-info"></i> راهنمای اتصال پشتیبان به کانال خصوصی:</div>
              ۱. در بله یا تلگرام یک <strong>کانال خصوصی (Private)</strong> اختصاصی به نام استودیوی خود بسازید.<br>
              ۲. ربات خود را به عنوان <strong>مدیر (Admin)</strong> کانال با دسترسی ارسال فایل اضافه نمایید.<br>
              ۳. شناسه عددی کانال (Chat ID که معمولاً با منفی شروع می‌شود، مانند <code>-100...</code>) را در کادر Chat ID قرار دهید.<br>
              ۴. لینک کانال را جهت یادداشت در کادر بالا ذخیره کنید و دکمه تست ارسال را بزنید.
            </div>
          </div>
          <div class="sm-backup-status" style="margin-top:14px">
            <span>زمان‌بندی: ${SMUI.badge(sched, info.autoBackup ? 'success' : 'muted')}</span>
            <span>آخرین پشتیبان: <strong>${SM.esc(lastDisplay)}</strong>${info.backupLastLabel ? ` (${SM.esc(info.backupLastLabel)})` : ''}</span>
          </div>
        </div>
      </div>
      <div class="sm-card">
        <div class="sm-card-head"><div class="sm-card-title"><i class="fas fa-database"></i> ذخیره و بازیابی دستی</div></div>
        <div class="sm-card-body">
          <button type="button" class="sm-btn sm-btn-primary sm-btn-block" onclick="SMSettings.backupNow()"><i class="fas fa-download"></i> دانلود فوری فایل پشتیبان (JSON)</button>
          <button type="button" class="sm-btn sm-btn-ghost sm-btn-block" style="margin-top:8px" onclick="SMSettings.backupToFolder()"><i class="fas fa-folder-plus"></i> ذخیره مستقیم در پوشه انتخابی سیستم</button>
          <div class="sm-backup-drop" id="sm-backup-drop" onclick="document.getElementById('sm-restore-input').click()">
            <i class="fas fa-folder-open"></i>
            <strong>باز کردن و بازیابی فایل پشتیبان</strong>
            <span>کلیک کنید یا فایل JSON را اینجا بکشید و رها کنید</span>
          </div>
          <input type="file" id="sm-restore-input" accept=".json,application/json" hidden onchange="SMSettings.restore(this)"/>
          <div id="sm-backup-list" class="sm-backup-list"></div>
        </div>
      </div>
    </div>`
  },

  _gatewayTab(info) {
    const isTaxEnabled = info.taxEnabled !== false
    const taxRate = info.taxRate !== undefined ? info.taxRate : 10
    const taxMode = info.taxMode || 'exclusive'
    const provider = info.gatewayProvider || 'zarinpal'
    const merchantId = info.gatewayMerchantId || ''
    const isGatewayEnabled = info.gatewayEnabled !== false
    const ecoCode = info.taxEconomyCode || ''

    return `<div class="sm-settings-grid">
      <div class="sm-card">
        <div class="sm-card-head">
          <div class="sm-card-title"><i class="fas fa-credit-card"></i> اتصال درگاه پرداخت آنلاین شاپرک</div>
          <button type="button" class="sm-btn sm-btn-sm sm-btn-primary" onclick="SMSettings.saveGatewaySettings()"><i class="fas fa-save"></i> ذخیره تنظیمات</button>
        </div>
        <div class="sm-card-body">
          <label class="sm-check-row sm-check-row--block">
            <input type="checkbox" id="set-gateway-enabled" ${isGatewayEnabled ? 'checked' : ''}/>
            <strong>پرداخت آنلاین برای مشتریان فعال باشد</strong>
          </label>

          <div style="margin-top:14px">
            <label class="sm-label">ارائه‌دهنده درگاه پرداخت این استودیو</label>
            <select class="sm-select" id="set-gateway-provider" onchange="SMSettings.onGatewayProviderChange(this.value)">
              <option value="zarinpal" ${provider === 'zarinpal' ? 'selected' : ''}>زرین‌پال (ZarinPal REST v4)</option>
              <option value="zibal" ${provider === 'zibal' ? 'selected' : ''}>زیبال (Zibal Payment Gateway)</option>
              <option value="nextpay" ${provider === 'nextpay' ? 'selected' : ''}>نکست‌پی (NextPay)</option>
              <option value="payir" ${provider === 'payir' ? 'selected' : ''}>Pay.ir (شبکه پرداخت پی)</option>
              <option value="idpay" ${provider === 'idpay' ? 'selected' : ''}>آیدی‌پی (IDPay)</option>
              <option value="sandbox" ${provider === 'sandbox' ? 'selected' : ''}>درگاه شبیه‌ساز امن (تستی بدون نیاز به مرچنت)</option>
            </select>
          </div>

          <div style="margin-top:12px">
            <label class="sm-label" id="lbl-merchant-id">مرچنت‌کد / کلید API اختصاصی استودیو (Merchant ID)</label>
            <input type="text" class="sm-input" id="set-gateway-merchant" dir="ltr" value="${SM.esc(merchantId)}" placeholder="مثال: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"/>
          </div>

          <div style="margin-top:12px;display:flex;gap:8px">
            <button type="button" class="sm-btn sm-btn-ghost sm-btn-sm" onclick="SMSettings.testGatewayConnection()"><i class="fas fa-plug-circle-check"></i> تست اعتبارسنجی درگاه</button>
            <a href="../invoice.html" target="_blank" class="sm-btn sm-btn-ghost sm-btn-sm"><i class="fas fa-arrow-up-right-from-square"></i> مشاهده نمونه صفحه فاکتور</a>
          </div>

          <!-- باکس آموزش راهنما -->
          <div class="sm-guide-box" style="margin-top:16px;background:rgba(16,185,129,0.06);border:1px solid rgba(16,185,129,0.2);border-radius:12px;padding:14px;">
            <div style="font-weight:800;color:var(--sm-success);font-size:0.85rem;margin-bottom:8px;display:flex;align-items:center;gap:6px">
              <i class="fas fa-circle-question"></i> راهنمای دریافت و تنظیم درگاه پرداخت استودیو:
            </div>
            <ol style="font-size:0.78rem;color:rgba(255,255,255,0.75);line-height:1.8;padding-right:18px">
              <li>در وب‌سایت درگاه انتخابی (مانند <strong>zarinpal.com</strong> یا <strong>zibal.ir</strong>) به نام استودیو یا شخص خود ثبت‌نام کنید.</li>
              <li>در پنل درگاه، روی <strong>درگاه جدید</strong> کلیک کرده و شماره شبا و نام استودیو را وارد کنید.</li>
              <li>کد مرچنت ۳۶ کاراکتری را کپی کرده و در کادر بالا قرار دهید.</li>
              <li>آدرس بازگشت (Callback URL) در پنل درگاه به صورت خودکار به صفحه فاکتور دامنه شما متصل می‌شود.</li>
            </ol>
          </div>
        </div>
      </div>

      <div class="sm-card">
        <div class="sm-card-head">
          <div class="sm-card-title"><i class="fas fa-receipt"></i> محاسبه مالیات بر ارزش افزوده (VAT)</div>
        </div>
        <div class="sm-card-body">
          <label class="sm-check-row sm-check-row--block">
            <input type="checkbox" id="set-tax-enabled" ${isTaxEnabled ? 'checked' : ''}/>
            <strong>محاسبه و نمایش مالیات بر ارزش افزوده روی فاکتورها</strong>
          </label>

          <div style="margin-top:14px;display:grid;grid-template-columns:1fr 1fr;gap:12px">
            <div>
              <label class="sm-label">درصد مالیات بر ارزش افزوده (%)</label>
              <input type="number" class="sm-input" id="set-tax-rate" dir="ltr" min="0" max="100" value="${taxRate}"/>
            </div>
            <div>
              <label class="sm-label">روش اعمال در فاکتور</label>
              <select class="sm-select" id="set-tax-mode">
                <option value="exclusive" ${taxMode === 'exclusive' ? 'selected' : ''}>اضافه بر مبلغ توافق‌شده (افزایش فاکتور)</option>
                <option value="inclusive" ${taxMode === 'inclusive' ? 'selected' : ''}>مشمول در مبلغ قرارداد (بدون افزایش فاکتور)</option>
              </select>
            </div>
          </div>

          <div style="margin-top:12px">
            <label class="sm-label">شماره اقتصادی / کد یکتای مالیاتی مؤدیان (اختیاری)</label>
            <input type="text" class="sm-input" id="set-tax-eco" dir="ltr" value="${SM.esc(ecoCode)}" placeholder="کد اقتصادی جهت درج در پیش‌فاکتور رسمی"/>
          </div>

          <!-- باکس راهنمای مالیاتی -->
          <div class="sm-guide-box" style="margin-top:16px;background:rgba(245,158,11,0.06);border:1px solid rgba(245,158,11,0.2);border-radius:12px;padding:14px;">
            <div style="font-weight:800;color:var(--sm-warning);font-size:0.85rem;margin-bottom:8px;display:flex;align-items:center;gap:6px">
              <i class="fas fa-scale-balanced"></i> راهنمای مالیات خدمات تصویربرداری و عکاسی:
            </div>
            <p style="font-size:0.78rem;color:rgba(255,255,255,0.75);line-height:1.8">
              بر اساس قوانین مالیاتی، استودیوها می‌توانند نرخ ۱۰٪ مالیات بر ارزش افزوده را به صورت تفکیک‌شده در فاکتورهای رسمی درج نمایند. سیستم به صورت خودکار مانده بدهی و اقساط را با احتساب مالیات محاسبه می‌کند تا اظهارنامه فصلی بدون مغایرت صادر شود.
            </p>
          </div>
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
            <button type="button" class="sm-btn sm-btn-sm sm-btn-ghost" onclick="SMSettings.downloadBackup(${JSON.stringify(String(k))})"><i class="fas fa-download"></i></button>
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
          <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px">
            <button type="button" class="sm-btn sm-btn-primary" onclick="SMSettings.saveCloudConfig()"><i class="fas fa-save"></i> ذخیره تنظیمات</button>
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
            <button type="button" class="sm-btn sm-btn-primary" onclick="SMSettings.cloudSignIn()"><i class="fas fa-sign-in-alt"></i> ورود</button>
            <button type="button" class="sm-btn sm-btn-ghost" onclick="SMSettings.cloudSignUp()"><i class="fas fa-user-plus"></i> ثبت‌نام + ساخت استودیو</button>
            <button type="button" class="sm-btn sm-btn-ghost" onclick="SMSettings.cloudSignOut()"><i class="fas fa-sign-out-alt"></i> خروج</button>
          </div>
        </div>
      </div>
      <div class="sm-card">
        <div class="sm-card-head"><div class="sm-card-title"><i class="fas fa-arrows-rotate"></i> Sync دستی</div></div>
        <div class="sm-card-body">
          <p style="font-size:.78rem;color:var(--sm-text-muted);margin:0 0 10px">آخرین entity sync: ${SM.esc(lastEntity)} · snapshot: ${SM.esc(last)}</p>
          <p style="font-size:.72rem;color:var(--sm-text-muted);margin:0 0 12px">Studio ID: <code dir="ltr">${SM.esc(info.supabaseStudioId || '—')}</code></p>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <button type="button" class="sm-btn sm-btn-primary" onclick="SMSettings.cloudPush()"><i class="fas fa-cloud-upload-alt"></i> ارسال کامل</button>
            <button type="button" class="sm-btn sm-btn-ghost" onclick="SMSettings.cloudPull()"><i class="fas fa-cloud-download-alt"></i> دریافت کامل</button>
            <button type="button" class="sm-btn sm-btn-ghost" onclick="SMSettings.cloudPushEntities()"><i class="fas fa-table"></i> فقط entity</button>
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
                <button type="button" class="sm-btn sm-btn-sm sm-btn-primary" onclick="SMSettings.resolveSyncConflict(${JSON.stringify(String(c.entityType))},${JSON.stringify(String(c.localId))},'local')">نگه‌داشتن محلی</button>
                <button type="button" class="sm-btn sm-btn-sm sm-btn-ghost" onclick="SMSettings.resolveSyncConflict(${JSON.stringify(String(c.entityType))},${JSON.stringify(String(c.localId))},'remote')">نگه‌داشتن ابری</button>
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
    await SecureDB.merge('studioInfo', {
      ...DB.get('studioInfo'),
      supabaseUrl: url,
      supabaseAnonKey: anonKey,
      cloudEnabled: enabled,
      cloudUnifyPassword: unify
    })
    Cloud._client = null
    await DB.flush?.()
    SM.toast('تنظیمات ابر ذخیره شد', 'success')
    SMSettings.setTab('cloud')
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
      <div class="sm-card sm-settings-full">
        <div class="sm-card-head">
          <div class="sm-card-title"><i class="fas fa-cloud-arrow-up"></i> وضعیت نسخه و به‌روزرسانی زنده سیستم</div>
          <span id="sm-system-ver-badge">${SMUI.badge('نسخه ' + (AppConfig.APP_VERSION || '6.2.1'), 'info')}</span>
        </div>
        <div class="sm-card-body">
          <div id="sm-system-update-container">
            <p style="font-size:.85rem;color:var(--sm-text-muted);line-height:1.7;margin:0 0 12px">
              پایش و استعلام مستقیم آخرین کدهای منتشرشده روی گیت‌هاب همراه با <strong>تهیه خودکار فایل پشتیبان (Snapshot)</strong> قبل از هرگونه تغییر.
            </p>
            <div style="display:flex;gap:8px;flex-wrap:wrap">
              <button type="button" class="sm-btn sm-btn-primary" onclick="SMSettings.checkSystemUpdate()">
                <i class="fas fa-rotate"></i> بررسی انتشار نسخه جدید در گیت‌هاب
              </button>
              <button type="button" class="sm-btn sm-btn-ghost" onclick="SMSettings.confirmSystemUpdate()">
                <i class="fas fa-rocket"></i> اجرای دستی به‌روزرسانی سرور
              </button>
            </div>
          </div>
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
              <button type="button" class="sm-btn sm-btn-warning" onclick="SMSettings.wipeOperational()">
                <i class="fas fa-broom"></i> پاکسازی داده‌های کاری
              </button>
            </div>
            <div class="sm-danger-box sm-danger-box--full">
              <h4><i class="fas fa-trash-restore"></i> بازنشانی کامل</h4>
              <p>همه چیز صفر می‌شود و مدیر پیش‌فرض از نو ساخته می‌شود.</p>
              <button type="button" class="sm-btn sm-btn-danger" onclick="SMSettings.factoryReset()">
                <i class="fas fa-trash-restore"></i> بازنشانی کامل سیستم
              </button>
            </div>
          </div>
          <p style="font-size:.72rem;color:var(--sm-text-muted);margin-top:14px">
            <strong>نسخه:</strong> ${AppConfig.APP_VERSION} · <strong>DB:</strong> v${DB.getStorageInfo?.()?.version || '—'}
          </p>
        </div>
      </div>
    </div>`
  },

  async checkSystemUpdate(silent = false) {
    const container = document.getElementById('sm-system-update-container')
    if (!silent && container) {
      container.innerHTML = `<p style="font-size:.85rem;color:var(--sm-text-muted)"><i class="fas fa-spinner fa-spin"></i> در حال ارتباط با مخزن گیت‌هاب و بررسی نسخه‌ها...</p>`
    }

    try {
      const res = await fetch('/api/system/check-update')
      const d = await res.json().catch(() => ({}))
      if (!res.ok || !d.ok) {
        if (!silent) SM.toast(d.error || 'خطا در بررسی به‌روزرسانی', 'error')
        return
      }

      if (container) {
        if (d.updateAvailable) {
          container.innerHTML = `
            <div style="background:linear-gradient(135deg,rgba(245,158,11,0.12) 0%,rgba(20,20,26,0.85) 100%);border:1px solid rgba(245,158,11,0.35);border-radius:12px;padding:16px;margin-bottom:12px">
              <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
                <span style="color:#f59e0b;font-weight:800;font-size:14px"><i class="fas fa-sparkles"></i> نسخه جدید در گیت‌هاب آماده است!</span>
                <span class="sm-badge sm-badge-warning" dir="ltr">${d.latestCommit}</span>
              </div>
              <div style="font-size:12.5px;color:#e5e7eb;margin-bottom:10px;line-height:1.6">
                <strong>پیام تغییرات:</strong> ${SM.esc(d.latestMessage || 'به‌روزرسانی جدید استودیو')}<br>
                <small style="color:var(--sm-text-muted)">تاریخ انتشار: ${SM.esc(d.latestDate || '—')} · کامیت فعلی سرور: ${d.currentCommit}</small>
              </div>
              <button type="button" class="sm-btn sm-btn-primary" onclick="SMSettings.confirmSystemUpdate()" style="width:100%;padding:11px">
                <i class="fas fa-cloud-arrow-down"></i> تایید و ارتقای دستی سیستم به آخرین نسخه گیت‌هاب
              </button>
            </div>`
          if (!silent) SM.toast('نسخه جدید در گیت‌هاب یافت شد!', 'warning')
        } else {
          container.innerHTML = `
            <div style="background:rgba(34,197,94,0.08);border:1px solid rgba(34,197,94,0.25);border-radius:12px;padding:14px;margin-bottom:12px">
              <div style="color:#22c55e;font-size:13.5px;font-weight:700;display:flex;align-items:center;gap:8px">
                <i class="fas fa-circle-check"></i> سیستم شما کاملاً به‌روز است
              </div>
              <p style="margin:6px 0 10px;font-size:12px;color:rgba(255,255,255,0.7)">
                آخرین کامیت فعال روی سرور: <code dir="ltr">${d.currentCommit}</code> (${SM.esc(d.latestMessage || 'نسخه جاری')})
              </p>
              <div style="display:flex;gap:8px">
                <button type="button" class="sm-btn sm-btn-xs sm-btn-ghost" onclick="SMSettings.checkSystemUpdate()">
                  <i class="fas fa-rotate"></i> بررسی مجدد
                </button>
                <button type="button" class="sm-btn sm-btn-xs sm-btn-primary" onclick="SMSettings.confirmSystemUpdate()">
                  <i class="fas fa-rocket"></i> اعمال مجدد کدهای سرور (Re-sync)
                </button>
              </div>
            </div>`
          if (!silent) SM.toast('سیستم کاملاً با گیت‌هاب به‌روز و همگام است', 'success')
        }
      }
    } catch (e) {
      if (!silent) SM.toast('خطا در بررسی وضعیت آپدیت: ' + e.message, 'error')
    }
  },

  confirmSystemUpdate() {
    SMUI.modal('⚠️ تایید و اجرای به‌روزرسانی زنده سرور', `
      <div style="text-align:right;padding:4px 0">
        <div style="background:rgba(245,158,11,0.1);border:1px solid rgba(245,158,11,0.25);border-radius:12px;padding:12px;margin-bottom:14px">
          <p style="margin:0 0 8px 0;font-size:13px;color:#f59e0b;font-weight:700">
            <i class="fas fa-shield-halved"></i> سیستم قبل از آپدیت به صورت خودکار پشتیبان می‌گیرد!
          </p>
          <p style="margin:0;font-size:12px;color:rgba(255,255,255,0.8);line-height:1.7">
            قبل از اعمال تغییرات، یک نسخه پشتیبان کامل (Snapshot) از تمامی قراردادها، اسناد مالی و اطلاعات استودیوها در دایرکتوری امن سرور (<code dir="ltr">/var/backups/crmstudio/</code>) ذخیره می‌گردد.
          </p>
        </div>

        <p style="font-size:12.5px;color:rgba(255,255,255,0.7);line-height:1.8;margin:0 0 16px 0">
          پس از کلیک روی تایید، سرور کدهای نسخه جدید را مستقیماً از گیت‌هاب دریافت کرده، اعتبارسنجی را انجام داده و بدون قطعی مجدداً راه‌اندازی می‌شود.
        </p>

        <div style="display:flex;flex-direction:column;gap:8px">
          <button type="button" class="sm-btn sm-btn-ghost" onclick="SMSettings.backupNow(); SM.toast('فایل پشتیبان با موفقیت دانلود شد', 'success')" style="border:1px solid rgba(255,255,255,0.15)">
            <i class="fas fa-download"></i> ۱. دانلود نسخه پشتیبان آفلاین روی دستگاه (اختیاری)
          </button>
          <button type="button" class="sm-btn sm-btn-primary" onclick="SMSettings.executeServerUpdate()" style="padding:12px">
            <i class="fas fa-rocket"></i> ۲. تایید و اجرای به‌روزرسانی زنده سرور (با بکاپ خودکار)
          </button>
        </div>
      </div>`, {
      width: 490
    })
  },

  async executeServerUpdate() {
    SMUI.closeModal()
    SM.toast('در حال تهیه پشتیبان خودکار سرور و دریافت تغییرات از گیت‌هاب...', 'info', 10000)
    if (typeof AudioNotifier !== 'undefined') AudioNotifier.playSent()

    const adminKey = localStorage.getItem('system_admin_key') || (typeof AppConfig !== 'undefined' && AppConfig.SYSTEM_UPDATE_KEY) || ''
    try {
      const res = await fetch('/api/system/update', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-key': adminKey
        }
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.ok) {
        return SM.toast(data.error || 'خطا در اجرای به‌روزرسانی سرور', 'error')
      }

      if (typeof AudioNotifier !== 'undefined') AudioNotifier.playContract()
      SM.toast('✅ فرآیند ارتقای سرور با موفقیت انجام شد. سیستم در حال بررسی سلامت نسخه جدید است...', 'success', 8000)

      setTimeout(() => {
        SMSettings.checkSystemUpdate(true)
      }, 3500)
    } catch (e) {
      SM.toast('خطا در ارتباط با سرور: ' + e.message, 'error')
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

  onLogoPick(input) {
    const file = input.files?.[0]
    if (!file || !file.type.startsWith('image/')) return SM.toast('فقط تصویر', 'error')
    if (file.size > 800000) return SM.toast('حداکثر ۸۰۰KB', 'error')
    const reader = new FileReader()
    reader.onload = () => {
      SMSettings._pendingLogo = reader.result
      const prev = document.getElementById('sm-logo-preview')
      const av = document.getElementById('sm-profile-avatar-preview')
      if (prev) prev.innerHTML = `<img src="${reader.result}" alt="logo"/>`
      if (av) av.innerHTML = `<img src="${reader.result}" alt="logo"/>`
      SM.toast('لوگو آماده ذخیره است — دکمه ذخیره را بزنید', 'info')
    }
    reader.readAsDataURL(file)
    input.value = ''
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

    if (name) DB.update('users', user.id, { name, email: email || user.email || '' })
    if (phone && phone !== user.phone) {
      if (DB.find('users', u => u.id !== user.id && Utils.normalizePhone(u.phone) === phone)) {
        return SM.toast('این موبایل قبلاً ثبت شده', 'error')
      }
      DB.update('users', user.id, { phone })
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
    await SecureDB.merge('studioInfo', {
      smsProxyUrl: document.getElementById('set-sms-proxy')?.value?.trim() || '',
      smsProvider: document.getElementById('set-sms-provider')?.value?.trim() || '',
      smsUsername: document.getElementById('set-sms-user')?.value?.trim() || '',
      smsApiKey: document.getElementById('set-sms-key')?.value?.trim() || '',
      smsLineNumber: document.getElementById('set-sms-line')?.value?.trim() || '',
      smsMorningReminders: document.getElementById('set-sms-morning')?.checked !== false
    })
    SM.toast('تنظیمات پیامک ذخیره شد', 'success')
    SM.navigate('settings')
  },

  async testSms() {
    const btn = document.getElementById('btn-test-sms')
    const resEl = document.getElementById('test-sms-result')
    const phoneInput = document.getElementById('test-sms-phone')?.value?.trim()
    const phone = typeof Utils !== 'undefined' && Utils.normalizePhone ? Utils.normalizePhone(phoneInput) : phoneInput

    if (!phone || !/^09\d{9}$/.test(phone)) {
      SM.toast('لطفاً شماره موبایل معتبر ۱۱ رقمی (مثل 0912...) وارد کنید', 'warning')
      return
    }

    const proxyUrl = document.getElementById('set-sms-proxy')?.value?.trim() || ''
    const provider = document.getElementById('set-sms-provider')?.value?.trim() || ''
    const username = document.getElementById('set-sms-user')?.value?.trim() || ''
    const apiKey = document.getElementById('set-sms-key')?.value?.trim() || ''
    const lineNumber = document.getElementById('set-sms-line')?.value?.trim() || ''

    if (!provider && !proxyUrl) {
      SM.toast('لطفاً ارائه‌دهنده پیامک را مشخص کنید', 'warning')
      return
    }

    await SecureDB.merge('studioInfo', {
      smsProxyUrl: proxyUrl,
      smsProvider: provider,
      smsUsername: username,
      smsApiKey: apiKey,
      smsLineNumber: lineNumber
    })

    if (btn) {
      btn.disabled = true
      btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> در حال ارسال...'
    }
    if (resEl) {
      resEl.style.display = 'block'
      resEl.style.background = 'rgba(255,255,255,0.05)'
      resEl.style.border = '1px solid var(--sm-border)'
      resEl.style.color = 'var(--sm-text)'
      resEl.innerHTML = '<i class="fas fa-spinner fa-spin"></i> در حال ارسال پیامک به ' + SM.esc(phone) + '...'
    }

    try {
      const testMsg = 'تست سامانه CRMSTUDIO ERP: اتصال به پنل پیامک با موفقیت انجام شد.'
      const res = await SmsProvider.sendStudio(phone, testMsg)
      if (res && res.ok) {
        SM.toast('پیامک تستی با موفقیت ارسال شد!', 'success')
        if (resEl) {
          resEl.style.display = 'block'
          resEl.style.background = 'rgba(16, 185, 129, 0.15)'
          resEl.style.border = '1px solid #10b981'
          resEl.style.color = '#10b981'
          resEl.innerHTML = '<i class="fas fa-check-circle"></i> <strong>ارسال موفق:</strong> پیامک آزمایشی با موفقیت به شماره ' + SM.esc(phone) + ' فرستاده شد.'
        }
      } else {
        const errMsg = res?.error || 'خطا در ارسال پیامک'
        SM.toast(errMsg, 'error')
        if (resEl) {
          resEl.style.display = 'block'
          resEl.style.background = 'rgba(239, 68, 68, 0.15)'
          resEl.style.border = '1px solid #ef4444'
          resEl.style.color = '#ef4444'
          resEl.innerHTML = '<i class="fas fa-exclamation-triangle"></i> <strong>خطا:</strong> ' + SM.esc(errMsg)
        }
      }
    } catch (err) {
      const msg = String(err?.message || err)
      SM.toast(msg, 'error')
      if (resEl) {
        resEl.style.display = 'block'
        resEl.style.background = 'rgba(239, 68, 68, 0.15)'
        resEl.style.border = '1px solid #ef4444'
        resEl.style.color = '#ef4444'
        resEl.innerHTML = '<i class="fas fa-exclamation-triangle"></i> ' + SM.esc(msg)
      }
    } finally {
      if (btn) {
        btn.disabled = false
        btn.innerHTML = '<i class="fas fa-paper-plane"></i> ارسال پیامک آزمایشی'
      }
    }
  },

  /* ── اجرای اسکن و ارسال پیامک‌های هوشمند چرخه‌عمر ── */
  async runLifecycleSmsScan() {
    const btn = document.getElementById('btn-run-lifecycle-sms')
    const resEl = document.getElementById('lifecycle-sms-result')

    if (btn) {
      btn.disabled = true
      btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> در حال بررسی قراردادها و ارسال...'
    }
    if (resEl) {
      resEl.style.display = 'block'
      resEl.style.background = 'rgba(255,255,255,0.05)'
      resEl.style.border = '1px solid var(--sm-border)'
      resEl.style.color = 'var(--sm-text)'
      resEl.innerHTML = '<i class="fas fa-spinner fa-spin"></i> در حال اسکن پرونده‌ها، اقساط، آفیش فردا و سالگردهای امروز...'
    }

    try {
      if (typeof SmartLifecycleSMS === 'undefined') {
        throw new Error('ماژول اتوماسیون پیامک در دسترس نیست')
      }

      // ذخیره وضعیت چک‌باکس‌ها
      SmartLifecycleSMS.saveConfig({
        enabled: true,
        enableInstallmentReminder: document.getElementById('set-sms-auto-installment')?.checked !== false,
        enableShootCoupleReminder: document.getElementById('set-sms-auto-shoot-couple')?.checked !== false,
        enableShootCrewReminder: document.getElementById('set-sms-auto-shoot-crew')?.checked !== false,
        enableAnniversaryCongrats: document.getElementById('set-sms-auto-anniv')?.checked !== false
      })

      const res = await SmartLifecycleSMS.scanAndExecute({ force: true })
      if (res && res.ok) {
        const msg = `اسکن پایان یافت: ${res.totalSent} پیامک ارسال شد (${res.installmentsSent} قسط، ${res.shootCoupleSent} زوجین، ${res.shootCrewSent} عوامل، ${res.anniversarySent} سالگرد) · ${res.skipped} مورد از قبل ارسال شده بود.`
        SM.toast(msg, 'success')
        if (resEl) {
          resEl.style.display = 'block'
          resEl.style.background = 'rgba(16, 185, 129, 0.15)'
          resEl.style.border = '1px solid #10b981'
          resEl.style.color = '#10b981'
          resEl.innerHTML = `<i class="fas fa-check-circle"></i> <strong>عملیات با موفقیت انجام شد:</strong> ${SM.esc(msg)}`
        }
      } else {
        throw new Error(res?.error || 'خطا در اجرای اتوماسیون')
      }
    } catch (err) {
      const msg = String(err?.message || err)
      SM.toast(msg, 'error')
      if (resEl) {
        resEl.style.display = 'block'
        resEl.style.background = 'rgba(239, 68, 68, 0.15)'
        resEl.style.border = '1px solid #ef4444'
        resEl.style.color = '#ef4444'
        resEl.innerHTML = `<i class="fas fa-exclamation-triangle"></i> <strong>خطا:</strong> ${SM.esc(msg)}`
      }
    } finally {
      if (btn) {
        btn.disabled = false
        btn.innerHTML = '<i class="fas fa-play"></i> اجرای فوری اسکن و ارسال پیامک‌های امروز'
      }
    }
  },

  showLifecycleLogsModal() {
    const logs = typeof SmartLifecycleSMS !== 'undefined' ? SmartLifecycleSMS.getLogs() : []
    const typeLabels = {
      installment: 'یادآوری قسط',
      shoot_couple: 'یادآوری مراسم به زوجین',
      shoot_crew: 'یادآوری آفیش عوامل',
      anniversary: 'تبریک سالگرد ازدواج'
    }

    const html = `
      <div style="max-height:65vh;overflow-y:auto">
        ${logs.length ? `
          <table class="sm-table" style="width:100%;font-size:.82rem">
            <thead>
              <tr>
                <th>نوع</th>
                <th>گیرنده</th>
                <th>شماره تماس</th>
                <th>تاریخ ارسال</th>
                <th>متن خلاصه</th>
              </tr>
            </thead>
            <tbody>
              ${logs.map(l => `
                <tr>
                  <td><span class="sm-badge sm-badge-primary">${SM.esc(typeLabels[l.type] || l.type)}</span></td>
                  <td><strong>${SM.esc(l.recipient || '—')}</strong></td>
                  <td dir="ltr">${SM.esc(l.phone || '—')}</td>
                  <td>${SM.esc(l.dateFa || l.timestamp?.slice(0, 10) || '—')}</td>
                  <td style="max-width:240px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${SM.esc(l.text || '')}">${SM.esc(l.text || '—')}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        ` : '<div style="text-align:center;padding:32px;color:var(--sm-text-muted)">هنوز پیامکی از طریق اتوماسیون ارسال نشده است.</div>'}
      </div>`

    SMUI.dialog({
      title: '📋 تاریخچه پیامک‌های هوشمند ارسال‌شده',
      body: html,
      buttons: [{ label: 'بستن', type: 'ghost', action: () => SMUI.closeDialog() }]
    })
  },

  async saveBackupSettings() {
    await SecureDB.merge('studioInfo', {
      autoBackup: !!document.getElementById('set-autobackup')?.checked,
      backupHourly: !!document.getElementById('set-backup-hourly')?.checked,
      backupDaily: !!document.getElementById('set-backup-daily')?.checked,
      backupAutoDownload: !!document.getElementById('set-backup-download')?.checked,
      backupPathNote: document.getElementById('set-backup-path')?.value?.trim() || '',
      backupEmail: document.getElementById('set-backup-email')?.value?.trim() || '',
      baleBotToken: document.getElementById('set-backup-bale-token')?.value?.trim() || '',
      baleChatId: document.getElementById('set-backup-bale-chat')?.value?.trim() || '',
      baleChannelLink: document.getElementById('set-backup-bale-channel')?.value?.trim() || '',
      telegramChannelLink: document.getElementById('set-backup-tg-channel')?.value?.trim() || ''
    })
    if (typeof BackupService !== 'undefined') BackupService.restart()
    SM.toast('تنظیمات پشتیبان ذخیره شد', 'success')
    SM.navigate('settings')
  },

  async saveGatewaySettings() {
    await SecureDB.merge('studioInfo', {
      gatewayEnabled: !!document.getElementById('set-gateway-enabled')?.checked,
      gatewayProvider: document.getElementById('set-gateway-provider')?.value || 'zarinpal',
      gatewayMerchantId: document.getElementById('set-gateway-merchant')?.value?.trim() || '',
      taxEnabled: !!document.getElementById('set-tax-enabled')?.checked,
      taxRate: Number(document.getElementById('set-tax-rate')?.value) || 0,
      taxMode: document.getElementById('set-tax-mode')?.value || 'exclusive',
      taxEconomyCode: document.getElementById('set-tax-eco')?.value?.trim() || ''
    })
    SM.toast('تنظیمات درگاه بانکی و مالیات ذخیره شد ✓', 'success')
    SM.navigate('settings')
  },

  onGatewayProviderChange(val) {
    const lbl = document.getElementById('lbl-merchant-id')
    const inp = document.getElementById('set-gateway-merchant')
    if (!lbl || !inp) return
    if (val === 'zarinpal') {
      lbl.innerText = 'کد مرچنت ۳۶ رقمی زرین‌پال (Merchant ID)'
      inp.placeholder = 'مثال: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx'
    } else if (val === 'zibal') {
      lbl.innerText = 'مرچنت کد زیبال (Zibal Merchant Key)'
      inp.placeholder = 'مثال: zibal... یا کد مرچنت'
    } else if (val === 'sandbox') {
      lbl.innerText = 'شناسه شبیه‌ساز تستی (اختیاری)'
      inp.placeholder = 'تستی — نیازی به کلید واقعی نیست'
    } else {
      lbl.innerText = `کلید اختصاصی API درگاه ${val}`
      inp.placeholder = 'API Key'
    }
  },

  async testGatewayConnection() {
    const provider = document.getElementById('set-gateway-provider')?.value || 'zarinpal'
    const merchant = document.getElementById('set-gateway-merchant')?.value?.trim() || ''
    if (provider !== 'sandbox' && !merchant) {
      return SM.toast('لطفاً کد مرچنت یا کلید API درگاه را وارد نمایید', 'error')
    }
    SM.toast(`در حال تست اتصال به سرور درگاه شاپرک (${provider})...`, 'info')
    try {
      const res = await fetch('/api/payment/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: 10000,
          gateway: provider,
          merchantId: merchant,
          description: 'تست اعتبارسنجی درگاه استودیو',
          callbackUrl: '/invoice.html'
        })
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok && data.ok) {
        SM.toast(`اتصال به درگاه شاپرک (${provider}) با موفقیت برقرار شد ✓`, 'success')
      } else {
        SM.toast(data.error || 'خطا در ارتباط با درگاه پرداخت', 'error')
      }
    } catch (err) {
      SM.toast('خطا در تست درگاه: ' + err.message, 'error')
    }
  },

  async backupToBot(botType = 'bale') {
    const token = document.getElementById('set-backup-bale-token')?.value?.trim() || SM.studio()?.baleBotToken || ''
    const chatId = document.getElementById('set-backup-bale-chat')?.value?.trim() || SM.studio()?.baleChatId || ''
    if (typeof BackupService !== 'undefined' && BackupService.sendToBot) {
      SM.toast('در حال ارسال فایل پشتیبان به ربات...', 'info')
      const res = await BackupService.sendToBot(botType, { token, chatId })
      if (res.ok) {
        SM.toast(res.message || 'فایل دیتابیس با موفقیت به ربات ارسال شد ✓', 'success')
      } else {
        SM.toast(res.error || 'خطا در ارسال فایل به ربات', 'error')
      }
    }
  },

  async backupToFolder() {
    if (typeof BackupService !== 'undefined' && BackupService.saveToFolderPicker) {
      const res = await BackupService.saveToFolderPicker('manual')
      if (res.ok) {
        SM.toast(res.savedToFile ? `فایل «${res.fileName}» در پوشه انتخابی ذخیره شد` : 'فایل پشتیبان دانلود شد', 'success')
      } else if (!res.cancelled) {
        SM.toast(res.error || 'خطا در ذخیره فایل', 'error')
      }
    } else {
      this.backupNow()
    }
  },

  async backupToEmail() {
    const emailInput = document.getElementById('set-backup-email')?.value?.trim()
    const info = SM.studio()
    const targetEmail = emailInput || info.backupEmail || info.email || SM.user()?.email || ''
    if (!targetEmail) {
      return SM.toast('لطفاً آدرس ایمیل یا جیمیل را در کادر مربوطه وارد کنید', 'error')
    }
    if (typeof BackupService !== 'undefined' && BackupService.sendToEmail) {
      const res = await BackupService.sendToEmail(targetEmail)
      if (res.ok) {
        SM.toast(`صفحه ارسال به جیمیل (${res.email}) باز شد و فایل دانلود گردید`, 'success')
      } else {
        SM.toast(res.error || 'خطا در ارسال به ایمیل', 'error')
      }
    }
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

  async saveLegal() {
    const prev = SM.studio()
    const legal = {
      ...(prev.legalRules || {}),
      cancelRate30: Number(document.getElementById('legal-cancel-30')?.value || 30),
      cancelRate15: Number(document.getElementById('legal-cancel-15')?.value || 70),
      archivePeriod: document.getElementById('legal-archive-period')?.value?.trim() || 'یک سال خورشیدی',
      standardEndHour: document.getElementById('legal-end-hour')?.value?.trim() || '۲۴:۰۰',
      overtimeRate: document.getElementById('legal-overtime-rate')?.value?.trim() || '۵۰۰,۰۰۰',
      licenseNo: document.getElementById('legal-license-no')?.value?.trim() || '',
      defaultTerms: document.getElementById('legal-terms-text')?.value?.trim() || '',
      signatureImg: document.getElementById('legal-signature-img')?.value?.trim() || ''
    }
    await SecureDB.merge('studioInfo', { legalRules: legal })
    SM.toast('ضوابط صنفی و قرارداد با موفقیت ذخیره شد', 'success')
    SM.navigate('settings')
  },

  uploadSignature(input) {
    const file = input?.files?.[0]
    if (!file) return
    if (file.size > 2 * 1024 * 1024) {
      SM.toast('حجم تصویر نباید بیشتر از ۲ مگابایت باشد', 'error')
      return
    }
    const reader = new FileReader()
    reader.onload = async (e) => {
      const dataUrl = e.target.result
      const sigInput = document.getElementById('legal-signature-img')
      if (sigInput) sigInput.value = dataUrl
      await this.saveLegal()
    }
    reader.readAsDataURL(file)
  },

  async saveAutomation() {
    const prev = SM.studio()
    const auto = {
      ...(prev.smsAutomation || {}),
      anniversaryEnabled: !!document.getElementById('auto-anniversary')?.checked,
      anniversaryText: document.getElementById('auto-anniversary-text')?.value?.trim() || '',
      remindInstallment: !!document.getElementById('auto-remind-installment')?.checked,
      remindText: document.getElementById('auto-remind-text')?.value?.trim() || '',
      notifyReady: !!document.getElementById('auto-notify-clip-ready')?.checked
    }
    await SecureDB.merge('studioInfo', { smsAutomation: auto })
    SM.toast('تنظیمات اتوماسیون هوشمند پیامک ذخیره شد', 'success')
    SM.navigate('settings')
  },

  async saveSecurity() {
    const prev = SM.studio()
    const sec = {
      ...(prev.securityPolicy || {}),
      sessionTimeoutMinutes: Number(document.getElementById('sec-timeout')?.value || 480),
      forcePwChange: document.getElementById('sec-force-pw-change')?.value === 'true'
    }
    await SecureDB.merge('studioInfo', { securityPolicy: sec })
    SM.toast('تنظیمات و سیاست‌های امنیتی ذخیره شد', 'success')
    SM.navigate('settings')
  },

  killAllSessions() {
    if (!confirm('آیا مطمئن هستید که می‌خواهید از تمام نشست‌ها و دستگاه‌ها خارج شوید؟ نشست فعلی نیز بسته خواهد شد.')) return
    try {
      localStorage.removeItem('crm_session_token')
      localStorage.removeItem('crm_current_user')
      sessionStorage.clear()
      SM.toast('تمام نشست‌ها با موفقیت خاتمه یافت. در حال انتقال به صفحه ورود...', 'info')
      setTimeout(() => {
        window.location.href = '../index.html'
      }, 1000)
    } catch {
      window.location.href = '../index.html'
    }
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

  async restore(input) {
    const file = input.files?.[0]
    if (!file) return
    const text = await file.text()
    const result = await DB.importJSON(text)
    if (result.ok) { SM.toast('بازیابی شد — بارگذاری مجدد', 'success'); location.reload() }
    else SM.toast(result.error || 'خطا', 'error')
    input.value = ''
  }
}

SMModules.settings = {
  setTab(tab) { SMSettings.setTab(tab) },
  render(el) { SMSettings.render(el) },
  saveStudio() { SMSettings.saveStudio() },
  saveLegal() { SMSettings.saveLegal() },
  saveAutomation() { SMSettings.saveAutomation() },
  saveSecurity() { SMSettings.saveSecurity() },
  saveSms() { SMSettings.saveSms() },
  testSms() { SMSettings.testSms() },
  backup() { SMSettings.backupNow() },
  restore(input) { SMSettings.restore(input) }
}

window.SMSettings = SMSettings
