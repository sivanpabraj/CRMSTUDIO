/* Studio M — Bookings module (extracted from modules.js) */
if (typeof SMModules === 'undefined') window.SMModules = {}

const BOOKING_STATUS = {
  scheduled: 'زمان‌بندی شده',
  confirmed: 'تأیید شده',
  pending_deposit: 'در انتظار بیعانه',
  cancelled: 'لغو شده'
}

SMModules.bookings = {
  _statusLabel(s) { return BOOKING_STATUS[s] || s || '—' },

  render(el) {
    const bookings = SMH.filterBySearch(DB.get('bookings'), ['title', 'client', 'phone', 'date', 'code', 'packageName'])
    el.innerHTML = `
      ${SMUI.sectionHead('رزرو و مشاوره آنلاین', 'مدیریت نوبت‌های استودیو، مشاوره و رزروهای وب‌سایت', SMH.addBtn('SMModules.bookings.add()'))}
      ${SMUI.moduleSearch('bookings', 'جستجو در رزروها — نام مشتری، شماره موبایل، پکیج، تاریخ...')}
      ${SMUI.table(
        ['عنوان / شاخه', 'تاریخ و ساعت', 'مشتری و تماس', 'پکیج و بیعانه', 'وضعیت', SM.t('actions')],
        bookings.map(b => {
          const badgeType = b.status === 'confirmed' ? 'success' : (b.status === 'pending_deposit' ? 'warning' : (b.status === 'cancelled' ? 'danger' : 'info'))
          return `<tr>
            <td>
              <strong>${SM.esc(b.title || 'رزرو نوبت')}</strong>
              ${b.branchTitle ? `<div style="font-size:11px;color:#0071E3;margin-top:2px">${SM.esc(b.branchTitle)}</div>` : ''}
              ${b.code ? `<code style="font-size:10px;color:rgba(255,255,255,0.5)">#${SM.esc(b.code)}</code>` : ''}
            </td>
            <td>
              <div>${SM.esc(b.date)}</div>
              <div dir="ltr" style="font-size:11.5px;color:rgba(255,255,255,0.6)">${SM.esc(b.time || b.timeSlot || '—')}</div>
            </td>
            <td>
              <div>${SM.esc(b.client || '—')}</div>
              ${b.phone ? `<div dir="ltr" style="font-size:11.5px"><a href="tel:${SM.esc(b.phone)}" style="color:#38bdf8;text-decoration:none"><i class="fas fa-phone-flip" style="font-size:10px"></i> ${SM.esc(b.phone)}</a></div>` : ''}
            </td>
            <td>
              <div>${SM.esc(b.packageName || 'عکاسی استاندارد')}</div>
              ${b.deposit ? `<div style="font-size:11.5px;color:#34d399;font-weight:700">${Number(b.deposit).toLocaleString('fa-IR')} ت بیعانه</div>` : ''}
            </td>
            <td>${SMUI.badge(this._statusLabel(b.status), badgeType)}</td>
            ${SMUI.tableActionsCell(`SMModules.bookings.view('${b.id}')`, `SMModules.bookings.edit('${b.id}')`)}
          </tr>`
        })
      )}`
  },

  view(id) {
    const b = DB.find('bookings', x => x.id === id)
    if (!b) return
    const statusType = b.status === 'confirmed' ? 'success' : (b.status === 'pending_deposit' ? 'warning' : (b.status === 'cancelled' ? 'danger' : 'info'))
    const waUrl = b.phone ? `https://wa.me/${b.phone.replace(/^0/, '98')}?text=${encodeURIComponent('سلام ' + (b.client || '') + ' عزیز، در رابطه با رزرو نوبت عکاسی استودیو در تاریخ ' + (b.date || '') + ' خدمتتون پیام دادم.')}` : null

    SM.pushSubView(b.title || 'جزئیات رزرو نوبت', () => `
      <div class="sm-card"><div class="sm-card-body">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px;border-bottom:1px solid rgba(255,255,255,0.08);padding-bottom:12px">
          <div>
            <h3 style="margin:0;font-size:16px;font-weight:800;color:#fff">${SM.esc(b.title || 'نوبت استودیو')}</h3>
            ${b.branchTitle ? `<div style="font-size:12px;color:#0071E3;margin-top:4px">${SM.esc(b.branchTitle)} ${b.code ? `· کد: ${SM.esc(b.code)}` : ''}</div>` : ''}
          </div>
          <div>${SMUI.badge(this._statusLabel(b.status), statusType)}</div>
        </div>

        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;font-size:13px;line-height:1.8">
          <div><strong>📅 تاریخ:</strong> ${SM.esc(b.date)}</div>
          <div><strong>⏰ ساعت / بازه:</strong> ${SM.esc(b.time || b.timeSlot || '—')}</div>
          <div><strong>👤 مشتری:</strong> ${SM.esc(b.client || '—')}</div>
          <div><strong>📱 شماره تماس:</strong> ${b.phone ? `<a href="tel:${SM.esc(b.phone)}" style="color:#38bdf8">${SM.esc(b.phone)}</a>` : '—'}</div>
          <div><strong>📦 پکیج انتخابی:</strong> ${SM.esc(b.packageName || '—')}</div>
          <div><strong>💰 مبلغ کل پکیج:</strong> ${b.totalPrice ? Number(b.totalPrice).toLocaleString('fa-IR') + ' تومان' : '—'}</div>
          <div><strong>💳 بیعانه پرداختی:</strong> ${b.deposit ? Number(b.deposit).toLocaleString('fa-IR') + ' تومان' : '۰ تومان'}</div>
          <div><strong>⚖️ مانده تسویه:</strong> ${b.remaining ? Number(b.remaining).toLocaleString('fa-IR') + ' تومان' : '—'}</div>
          ${b.city ? `<div><strong>📍 شهر / لوکیشن:</strong> ${SM.esc(b.city)}</div>` : ''}
          ${b.source ? `<div><strong>🌐 مبدا ثبت:</strong> ${b.source === 'online' ? 'سامانه رزرواسیون آنلاین وب‌سایت' : 'ثبت دستی در پنل'}</div>` : ''}
        </div>

        ${b.notes ? `
          <div style="margin-top:14px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:10px;padding:12px">
            <strong style="color:rgba(255,255,255,0.7);font-size:12px">یادداشت مشتری / توضیحات:</strong>
            <p style="margin:4px 0 0;font-size:12.5px;color:#e2e8f0">${SM.esc(b.notes)}</p>
          </div>
        ` : ''}

        <div style="margin-top:20px;display:flex;gap:10px;flex-wrap:wrap">
          <button type="button" class="sm-btn sm-btn-primary" onclick="SMModules.bookings.edit('${b.id}')"><i class="fas fa-edit"></i> ${SM.t('edit')}</button>
          ${b.phone ? `
            <a href="tel:${SM.esc(b.phone)}" class="sm-btn" style="background:#0284c7;color:#fff;text-decoration:none"><i class="fas fa-phone"></i> تماس تلفنی</a>
            ${waUrl ? `<a href="${waUrl}" target="_blank" rel="noopener noreferrer" class="sm-btn" style="background:#16a34a;color:#fff;text-decoration:none"><i class="fab fa-whatsapp"></i> واتساپ مشتری</a>` : ''}
          ` : ''}
        </div>
      </div></div>`)
  },

  add() { this._form(null) },
  edit(id) { this._form(DB.find('bookings', b => b.id === id)) },

  _form(item) {
    SMUI.modal(item ? 'ویرایش نوبت رزرو' : 'افزودن نوبت رزرو جدید', `
      ${SMUI.formField('عنوان نوبت', 'bk-title', { value: item?.title || '', placeholder: 'مثلاً: عکاسی فرمالیته یا مشاوره حضوری' })}
      ${SMUI.formField('شاخه / پکیج', 'bk-branch', { value: item?.branchTitle || item?.packageName || '', placeholder: 'مثلاً: عروسی، کودک یا مدلینگ' })}
      ${SMUI.formField('نام مشتری', 'bk-client', { value: item?.client || '' })}
      ${SMUI.formField('شماره همراه مشتری', 'bk-phone', { value: item?.phone || '', dir: 'ltr', placeholder: '0912...' })}
      ${SMUI.formField('تاریخ', 'bk-date', { value: item?.date || Utils.todayJalali() })}
      ${SMUI.formField('ساعت یا تایم‌اسلات', 'bk-time', { value: item?.time || item?.timeSlot || '14:00', dir: 'ltr' })}
      ${SMUI.formField('مبلغ بیعانه (تومان)', 'bk-deposit', { type: 'number', value: item?.deposit || '', dir: 'ltr' })}
      ${SMUI.formField('وضعیت نوبت', 'bk-status', { type: 'select', value: item?.status || 'scheduled', options: [
        { value: 'scheduled', label: 'زمان‌بندی شده' },
        { value: 'confirmed', label: 'تأیید شده' },
        { value: 'pending_deposit', label: 'در انتظار بیعانه' },
        { value: 'cancelled', label: 'لغو شده' }
      ]})}
      ${SMUI.formField('توضیحات و یادداشت', 'bk-notes', { type: 'textarea', value: item?.notes || '' })}`, {
      width: 480,
      onSave: async () => {
        const d = SMUI.readForm(['bk-title', 'bk-branch', 'bk-client', 'bk-phone', 'bk-date', 'bk-time', 'bk-deposit', 'bk-status', 'bk-notes'])
        if (!d['bk-title']) return SM.toast('عنوان نوبت الزامی است', 'error')

        // نگهداری کلیه فیلدهای رزرو آنلاین و جلوگیری از تخریب داده
        const data = {
          ...(item || {}),
          title: d['bk-title'],
          branchTitle: d['bk-branch'] || item?.branchTitle || '',
          client: d['bk-client'] || '',
          phone: d['bk-phone'] || '',
          date: d['bk-date'] || Utils.todayJalali(),
          time: d['bk-time'] || '14:00',
          deposit: Number(d['bk-deposit']) || item?.deposit || 0,
          status: d['bk-status'] || 'scheduled',
          notes: d['bk-notes'] || ''
        }

        if (item) await SecureDB.update('bookings', item.id, data)
        else await SecureDB.insert('bookings', data)

        SMH.refresh('bookings')
        SM.toast('نوبت با موفقیت ذخیره شد ✓', 'success')
      },
      onDelete: item ? () => SMH.remove('bookings', item.id, 'bookings') : null
    })
  }
}
