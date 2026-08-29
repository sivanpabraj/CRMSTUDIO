/* ══════════════════════════════════════════════
   MAN — Personnel Profile Editor
   ══════════════════════════════════════════════ */

const PortalProfile = {
  render(personnel, user) {
    const el = document.getElementById('portal-content')
    if (!el || !user) return

    const roles = personnel?.roles?.length ? personnel.roles : (user.roles || [])
    const roleNames = roles.map(r => RolesHelper.emoji(r) + ' ' + RolesHelper.title(r)).join('، ') || '—'
    const avatar = user.avatar || personnel?.name?.charAt(0) || user.name?.charAt(0) || 'پ'
    const profile = personnel?.profile || {}

    el.innerHTML = `
      <div class="profile-page">
        <div class="profile-hero">
          <div class="profile-avatar-wrap">
            <div class="profile-avatar-lg" id="profile-avatar-preview">${user.avatarImage ? Utils.safeImgHtml(user.avatarImage, 'style="width:100%;height:100%;object-fit:cover;border-radius:50%"') : Utils.escapeHtml(avatar)}</div>
            <label class="profile-avatar-upload" title="تغییر عکس">
              <input type="file" accept="image/*" id="prof-avatar-file" style="display:none" data-csp-action="PortalProfile.onAvatarPick" data-csp-event="change" data-csp-pass-event/>
              📷
            </label>
          </div>
          <div class="profile-hero-info">
            <h2>${Utils.escapeHtml(personnel?.name || user.name || 'پرسنل')}</h2>
            <p>${Utils.escapeHtml(roleNames)}</p>
            ${personnel?.jobs ? `<span class="profile-badge">📋 ${Utils.fmtNum(personnel.jobs)} پروژه انجام‌شده</span>` : ''}
          </div>
        </div>

        <div class="profile-card">
          <h3>👤 مشخصات فردی</h3>
          <div class="profile-form">
            <label class="profile-label">نام و نام‌خانوادگی</label>
            <input class="profile-input" id="prof-name" value="${Utils.escapeHtml(personnel?.name || user.name || '')}" placeholder="نام کامل"/>

            <label class="profile-label">شماره موبایل</label>
            <input class="profile-input ltr" id="prof-phone" value="${Utils.escapeHtml(personnel?.phone || user.phone || '')}" inputmode="numeric" placeholder="09123456789"/>

            <label class="profile-label">ایمیل (اختیاری)</label>
            <input class="profile-input ltr" id="prof-email" type="email" value="${Utils.escapeHtml(profile.email || user.email || '')}" placeholder="example@mail.com"/>

            <label class="profile-label">درباره من / توضیحات (اختیاری)</label>
            <textarea class="profile-textarea" id="prof-bio" rows="3" placeholder="تخصص، تجربه، توضیحات...">${Utils.escapeHtml(profile.bio || '')}</textarea>
          </div>
        </div>

        <div class="profile-card">
          <h3>💳 اطلاعات پرداخت</h3>
          <p class="profile-hint">برای واریز حقوق و دستمزد پروژه‌ها</p>
          <div class="profile-form">
            <label class="profile-label">شماره کارت</label>
            <input class="profile-input ltr" id="prof-card" value="${Utils.escapeHtml(profile.bankCard || '')}" inputmode="numeric" placeholder="6037-xxxx-xxxx-xxxx"/>

            <label class="profile-label">شماره شبا</label>
            <input class="profile-input ltr" id="prof-sheba" value="${Utils.escapeHtml(profile.sheba || '')}" placeholder="IRxxxxxxxxxxxxxxxxxxxxxx"/>
          </div>
        </div>

        <div class="profile-card">
          <h3>🔒 تغییر رمز عبور</h3>
          <div class="profile-form">
            <label class="profile-label">رمز فعلی</label>
            <input class="profile-input" id="prof-pw-current" type="password" autocomplete="current-password" placeholder="رمز فعلی"/>

            <label class="profile-label">رمز جدید</label>
            <input class="profile-input" id="prof-pw-new" type="password" autocomplete="new-password" placeholder="حداقل ${AppConfig.MIN_PASSWORD_LENGTH} کاراکتر"/>

            <label class="profile-label">تکرار رمز جدید</label>
            <input class="profile-input" id="prof-pw-confirm" type="password" autocomplete="new-password" placeholder="تکرار رمز جدید"/>
          </div>
        </div>

        <div class="profile-card profile-readonly">
          <h3>ℹ️ اطلاعات حساب</h3>
          <div class="profile-info-row"><span>نقش‌ها</span><span>${Utils.escapeHtml(roleNames)}</span></div>
          <div class="profile-info-row"><span>تاریخ عضویت</span><span>${personnel?.createdAt || user.createdAt || '—'}</span></div>
          <div class="profile-info-row"><span>وضعیت</span><span>${user.status === 'active' ? '✅ فعال' : '⏳ در انتظار'}</span></div>
          <p class="profile-hint">تغییر نقش‌ها فقط توسط مدیر استودیو امکان‌پذیر است.</p>
        </div>

        <div class="profile-card">
          <h3>🎨 ظاهر شیشه‌ای</h3>
          <p class="profile-hint">پس‌زمینه و رنگ تم پرتال پرسنل</p>
          <div id="portal-glass-picker"></div>
        </div>

        <div class="profile-actions">
          <button class="portal-btn portal-btn-primary" data-csp-action="PortalProfile.save">💾 ذخیره تغییرات</button>
        </div>
      </div>`

    document.getElementById('prof-name')?.addEventListener('input', e => {
      const preview = document.getElementById('profile-avatar-preview')
      const v = e.target.value.trim()
      if (preview && v && !user.avatarImage) preview.textContent = v.charAt(0)
    })
    if (typeof GlassTheme !== 'undefined') GlassTheme.renderInlinePicker('portal-glass-picker')
  },

  _pendingAvatar: null,

  onAvatarPick(ev) {
    const file = ev.target.files?.[0]
    if (!file) return
    if (file.size > 500000) { Utils.toast('حداکثر ۵۰۰ کیلوبایت', 'error'); return }
    const reader = new FileReader()
    reader.onload = () => {
      this._pendingAvatar = reader.result
      const preview = document.getElementById('profile-avatar-preview')
      if (preview) preview.innerHTML = `<img src="${reader.result}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:50%"/>`
    }
    reader.readAsDataURL(file)
  },

  _readForm() {
    return {
      name: document.getElementById('prof-name')?.value?.trim() || '',
      phone: Utils.normalizePhone(document.getElementById('prof-phone')?.value?.trim() || ''),
      email: document.getElementById('prof-email')?.value?.trim() || '',
      bio: document.getElementById('prof-bio')?.value?.trim() || '',
      bankCard: document.getElementById('prof-card')?.value?.replace(/\s/g, '') || '',
      sheba: document.getElementById('prof-sheba')?.value?.trim().toUpperCase() || '',
      pwCurrent: document.getElementById('prof-pw-current')?.value || '',
      pwNew: document.getElementById('prof-pw-new')?.value || '',
      pwConfirm: document.getElementById('prof-pw-confirm')?.value || ''
    }
  },

  async _verifyPassword(user, password) {
    if (!password) return true
    password = Utils.normalizePassword(password)
    return Utils.verifyPassword(password, user.password, user.salt || '')
  },

  async save() {
    const user = Auth.currentUser()
    if (!user) { Utils.toast('لطفاً دوباره وارد شوید', 'error'); return }

    const f = this._readForm()
    if (!f.name) { Utils.toast('نام الزامی است', 'error'); return }
    if (!Utils.isValidPhone(f.phone)) { Utils.toast('شماره موبایل نامعتبر است', 'error'); return }

    const dupUser = DB.get('users').find(u =>
      u.id !== user.id && Utils.normalizePhone(u.phone) === f.phone
    )
    if (dupUser) { Utils.toast('این شماره موبایل قبلاً ثبت شده', 'error'); return }

    const dupPerson = DB.get('personnel').find(p => {
      const mine = DB.findPersonnelByUserId(user.id)
      return p.id !== mine?.id && Utils.normalizePhone(p.phone) === f.phone
    })
    if (dupPerson) { Utils.toast('این شماره موبایل برای پرسنل دیگری ثبت شده', 'error'); return }

    const wantsPwChange = f.pwNew || f.pwConfirm || f.pwCurrent
    if (wantsPwChange) {
      if (!f.pwCurrent) { Utils.toast('رمز فعلی را وارد کنید', 'error'); return }
      if (!(await this._verifyPassword(user, f.pwCurrent))) {
        Utils.toast('رمز فعلی اشتباه است', 'error')
        return
      }
      const pwErr = Auth.validatePassword(f.pwNew)
      if (pwErr) { Utils.toast(pwErr, 'error'); return }
      if (f.pwNew !== f.pwConfirm) { Utils.toast('رمز جدید و تکرار آن یکسان نیست', 'error'); return }
    }

    const profileData = { email: f.email, bio: f.bio, bankCard: f.bankCard, sheba: f.sheba }
    const avatar = f.name.charAt(0) || 'پ'

    const userUpdates = { name: f.name, phone: f.phone, avatar, email: f.email || '' }
    if (this._pendingAvatar) userUpdates.avatarImage = this._pendingAvatar
    if (wantsPwChange) {
      const creds = await Auth.hashCredentials(f.pwNew)
      userUpdates.password = creds.password
      userUpdates.salt = creds.salt
    }
    await SecureDB.update('users', user.id, userUpdates)

    let personnel = DB.findPersonnelByUserId(user.id) || DB.findPersonnelByPhone(user.phone)
    if (personnel) {
      await SecureDB.update('personnel', personnel.id, {
        name: f.name,
        phone: f.phone,
        profile: { ...(personnel.profile || {}), ...profileData }
      })
    } else {
      personnel = DB.syncPersonnelFromUser(DB.find('users', u => u.id === user.id))
      if (personnel) {
        await SecureDB.update('personnel', personnel.id, { profile: profileData })
      }
    }

    Portal.state.currentUser = DB.find('users', u => u.id === user.id)
    const updatedPersonnel = DB.findPersonnelByUserId(user.id) || DB.findPersonnelByPhone(f.phone)
    this._pendingAvatar = null
    DB.log('profile_update', `پرسنل "${f.name}" پروفایل خود را ویرایش کرد`)
    Utils.toast('✅ پروفایل با موفقیت ذخیره شد', 'success')

    if (wantsPwChange) {
      document.getElementById('prof-pw-current').value = ''
      document.getElementById('prof-pw-new').value = ''
      document.getElementById('prof-pw-confirm').value = ''
    }

    Portal.updateShellIdentity(updatedPersonnel?.name || Portal.state.currentUser?.name)
    PortalProfile.render(updatedPersonnel, Portal.state.currentUser)
  }
}

window.PortalProfile = PortalProfile
