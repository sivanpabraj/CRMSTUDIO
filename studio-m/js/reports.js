/* Studio M — گزارش جامع استودیو (PDF / JPG) */

const SMReports = {
  collect() {
    const rows = (name) => (typeof DB.active === 'function'
      ? DB.active(name)
      : (DB.get(name) || []).filter(i => i && !i._deleted))

    const contracts = rows('contracts')
    const activeContracts = contracts.filter(c => c.status !== 'cancelled')
    const cancelled = contracts.filter(c => c.status === 'cancelled')
    const contractTotal = contracts.reduce((s, c) => s + (c.total || 0), 0)
    const outstanding = contracts.reduce((s, c) => s + Math.max(0, (c.total || 0) - (c.deposit || 0) - (c.paid || 0)), 0)

    const tx = rows('transactions')
    const deposits = tx.filter(t => t.type === 'deposit')
    const withdrawals = tx.filter(t => t.type === 'withdrawal')
    const depositSum = deposits.reduce((s, t) => s + (t.amount || 0), 0)
    const withdrawalSum = withdrawals.reduce((s, t) => s + (t.amount || 0), 0)

    const invoices = rows('invoices')
    const invIn = invoices.filter(i => (i.direction || 'in') === 'in').reduce((s, i) => s + (i.amount || 0), 0)
    const _invOut = invoices.filter(i => i.direction === 'out').reduce((s, i) => s + (i.amount || 0), 0)

    const personnel = rows('personnel')
    const activeStaff = personnel.filter(p => p.status === 'active')
    const cheques = rows('cheques')
    const pendingCheques = cheques.filter(c => c.status === 'pending' || !c.status)

    const bookings = rows('bookings')
    const confirmedBookings = bookings.filter(b => b.status === 'confirmed')
    const timelines = rows('timelines')
    const packages = rows('packages')
    const expenses = rows('expenses')
    const expenseSum = expenses.reduce((s, e) => s + (e.amount || 0), 0)
    const banks = rows('banks')
    const bankBalance = banks.reduce((s, b) => s + (b.balance || 0), 0)

    const printOrders = rows('printOrders')
    const equipment = rows('equipment')
    const customerRequests = rows('customerRequests')
    const pendingRequests = customerRequests.filter(r => r.status === 'pending' || r.status === 'open')
    const resolvedRequests = customerRequests.filter(r => r.status === 'done' || r.status === 'resolved' || r.status === 'completed')
    const attendance = rows('attendance')
    const attMonth = typeof SMAttendance !== 'undefined'
      ? SMAttendance.reportSummary(Utils.parseJalaliToday().jy, Utils.parseJalaliToday().jm)
      : { present: 0, absent: 0, hours: 0, total: attendance.length, staffWithRecords: 0 }
    const persProjects = rows('persProjects')
    const reminders = rows('calendarReminders')
    const appointments = rows('appointments')
    const workflows = rows('workflows')
    const albums = rows('albums')

    const upcomingEvents = contracts.filter(c => {
      if (c.status === 'cancelled') return false
      const d = typeof Utils !== 'undefined' ? Utils.daysUntil(c.eventDate || c.date) : null
      return d !== null && d >= 0 && d <= 30
    })

    return {
      generatedAt: Utils.todayJalali(),
      studio: SM.studio().name || 'Studio M',
      sections: [
        {
          id: 'main',
          title: 'اصلی — رزرو و برنامه',
          icon: 'fa-calendar-days',
          color: '#0071E3',
          items: [
            { label: 'رزرو و مشاوره', value: bookings.length, sub: `${confirmedBookings.length} تأیید‌شده` },
            { label: 'مراسم ۳۰ روز آینده', value: upcomingEvents.length, sub: 'از تقویم / قرارداد' },
            { label: 'یادآوری تقویم', value: reminders.length, sub: `${appointments.length} نوبت` },
            { label: 'تایم‌لاین عروسی', value: timelines.length, sub: 'برنامه روز مراسم' }
          ]
        },
        {
          id: 'business',
          title: 'کسب‌وکار — قرارداد و پکیج',
          icon: 'fa-file-signature',
          color: '#5856D6',
          items: [
            { label: 'کل قراردادها', value: contracts.length, sub: `${activeContracts.length} فعال` },
            { label: 'قرارداد لغوشده', value: cancelled.length, sub: '—' },
            { label: 'جمع مبلغ قراردادها', value: SM.fmt(contractTotal), sub: 'تومان', isText: true },
            { label: 'مانده مشتریان', value: SM.fmt(outstanding), sub: 'تومان', isText: true },
            { label: 'پکیج قیمت', value: packages.length, sub: 'سیلور، گلد، VIP…' }
          ]
        },
        {
          id: 'finance',
          title: 'مالی — فاکتور و حسابداری',
          icon: 'fa-coins',
          color: '#34C759',
          items: [
            { label: 'فاکتور ثبت‌شده', value: invoices.length, sub: `واریزی ${SM.fmt(invIn)} ت` },
            { label: 'واریز (حسابداری)', value: deposits.length, sub: `${SM.fmt(depositSum)} تومان`, isText: true },
            { label: 'برداشت (حسابداری)', value: withdrawals.length, sub: `${SM.fmt(withdrawalSum)} تومان`, isText: true },
            { label: 'مانده گردش', value: SM.fmt(depositSum - withdrawalSum), sub: 'واریز − برداشت', isText: true },
            { label: 'حساب بانکی', value: banks.length, sub: `موجودی ${SM.fmt(bankBalance)} ت` },
            { label: 'چک', value: cheques.length, sub: `${pendingCheques.length} در انتظار` },
            { label: 'هزینه‌های جاری', value: expenses.length, sub: `${SM.fmt(expenseSum)} تومان` }
          ]
        },
        {
          id: 'hr',
          title: 'پرسنل و همکاران',
          icon: 'fa-users',
          color: '#009688',
          items: [
            { label: 'پرسنل', value: personnel.length, sub: `${activeStaff.length} فعال` },
            { label: 'پروژه / آفیش', value: persProjects.length, sub: 'همکاری مراسم' },
            { label: 'حضور این ماه', value: attMonth.present, sub: `${attMonth.absent.toLocaleString('fa-IR')} غیبت · ${attMonth.hours.toLocaleString('fa-IR')} ساعت` },
            { label: 'کل ثبت حضور', value: attendance.length, sub: `${attMonth.staffWithRecords} نفر این ماه` }
          ]
        },
        {
          id: 'customer',
          title: 'مشتری و رضایت',
          icon: 'fa-heart',
          color: '#FF375F',
          items: [
            { label: 'درخواست مشتری', value: customerRequests.length, sub: `${pendingRequests.length} باز · ${resolvedRequests.length} انجام‌شده` },
            { label: 'آلبوم', value: albums.length, sub: 'طراحی / چاپ' }
          ]
        },
        {
          id: 'assets',
          title: 'چاپ، تجهیزات، گردش کار',
          icon: 'fa-camera',
          color: '#E68619',
          items: [
            { label: 'سفارش چاپ', value: printOrders.length, sub: 'چاپخانه / آلبوم' },
            { label: 'تجهیزات', value: equipment.length, sub: 'استودیو' },
            { label: 'امانات مشتری', value: (typeof DB.active === 'function' ? DB.active('customerCustody') : (DB.get('customerCustody') || []).filter(c => !c._deleted)).filter(c => c.status !== 'returned' && !c.returnedAt).length, sub: 'در استودیو' },
            { label: 'گردش کار تدوین', value: workflows.length, sub: 'پایپ‌لاین' }
          ]
        }
      ]
    }
  },

  render(el) {
    const data = this.collect()
    el.innerHTML = `
      ${SMUI.sectionHead('گزارش‌ها', `خلاصه صفر تا صد استودیو — ${data.generatedAt}`, `
        <div class="sm-rep-export-btns">
          <button type="button" class="sm-btn sm-btn-primary" ${SMEvents.attrs('SMReports.exportPDF')}><i class="fas fa-file-pdf"></i> خروجی PDF</button>
          <button type="button" class="sm-btn sm-btn-ghost" ${SMEvents.attrs('SMReports.exportJPG')}><i class="fas fa-image"></i> خروجی JPG</button>
        </div>`)}
      <p class="sm-rep-intro">گزارش لحظه‌ای از همه بخش‌های برنامه: رزرو، تقویم، قرارداد، پکیج، فاکتور، حسابداری، پرسنل، مشتری و چاپ.
      برای ذخیرهٔ فایل داده (پشتیبان) به <button type="button" class="sm-link-btn" ${SMEvents.attrs('SM.openSettingsTab', ['backup'])}>تنظیمات → پشتیبان</button> بروید.</p>
      <div id="sm-report-screen">${this._screenHtml(data)}</div>
      <div id="sm-report-doc-wrap" class="sm-rep-doc-hidden" aria-hidden="true">${this._docHtml(data)}</div>`
  },

  _screenHtml(data) {
    return data.sections.map(sec => `
      <div class="sm-rep-section" style="--rep-color:${sec.color}">
        <div class="sm-rep-section-head">
          <i class="fas ${sec.icon}"></i>
          <h3>${SM.esc(sec.title)}</h3>
        </div>
        <div class="sm-rep-grid">
          ${sec.items.map(it => `
            <div class="sm-rep-card">
              <div class="sm-rep-card-val">${it.isText ? SM.esc(String(it.value)) : Number(it.value).toLocaleString('fa-IR')}</div>
              <div class="sm-rep-card-lbl">${SM.esc(it.label)}</div>
              ${it.sub ? `<div class="sm-rep-card-sub">${SM.esc(it.sub)}</div>` : ''}
            </div>`).join('')}
        </div>
      </div>`).join('')
  },

  _docHtml(data) {
    return `<div id="sm-report-doc" class="sm-report-doc" dir="rtl">
      <div class="sm-report-doc-head">
        <div>
          <strong>${SM.esc(data.studio)}</strong>
          <span>گزارش جامع استودیو</span>
        </div>
        <div class="sm-report-doc-date">تاریخ: ${SM.esc(data.generatedAt)}</div>
      </div>
      ${data.sections.map(sec => `
        <div class="sm-report-doc-section">
          <h4>${SM.esc(sec.title)}</h4>
          <table class="sm-report-doc-table">
            <thead><tr><th>عنوان</th><th>مقدار</th><th>توضیح</th></tr></thead>
            <tbody>
              ${sec.items.map(it => `
                <tr>
                  <td>${SM.esc(it.label)}</td>
                  <td><strong>${it.isText ? SM.esc(String(it.value)) : Number(it.value).toLocaleString('fa-IR')}</strong></td>
                  <td>${SM.esc(it.sub || '—')}</td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>`).join('')}
      <div class="sm-report-doc-foot">Studio M Pro · گزارش خودکار · ${SM.esc(data.generatedAt)}</div>
    </div>`
  },

  _getDocEl() {
    let el = document.getElementById('sm-report-doc')
    if (!el) {
      const data = this.collect()
      const wrap = document.createElement('div')
      wrap.innerHTML = this._docHtml(data)
      document.body.appendChild(wrap.firstElementChild)
      el = document.getElementById('sm-report-doc')
    }
    return el
  },

  exportPDF() {
    const el = this._getDocEl()
    const fname = `گزارش-استودیو-${Utils.todayJalali().replace(/\//g, '')}.pdf`
    if (typeof html2pdf !== 'undefined') {
      html2pdf().set({
        margin: [10, 10, 10, 10],
        filename: fname,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff' },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
      }).from(el).save().then(() => SM.toast('PDF ذخیره شد', 'success'))
        .catch(() => SM.toast('خطا در ساخت PDF', 'error'))
    } else {
      SM.toast('ابزار PDF بارگذاری نشده — صفحه را رفرش کنید', 'error')
    }
  },

  exportJPG() {
    const el = this._getDocEl()
    const fname = `گزارش-استودیو-${Utils.todayJalali().replace(/\//g, '')}.jpg`
    const save = (canvas) => {
      const a = document.createElement('a')
      a.download = fname
      a.href = canvas.toDataURL('image/jpeg', 0.92)
      a.click()
      SM.toast('عکس JPG ذخیره شد', 'success')
    }
    if (typeof html2canvas !== 'undefined') {
      html2canvas(el, { scale: 2, useCORS: true, backgroundColor: '#ffffff' }).then(save)
        .catch(() => SM.toast('خطا در ساخت تصویر', 'error'))
    } else if (typeof html2pdf !== 'undefined') {
      html2pdf().set({ html2canvas: { scale: 2, backgroundColor: '#fff' } }).from(el).toCanvas()
        .then(canvas => save(canvas))
        .catch(() => SM.toast('خطا در ساخت تصویر', 'error'))
    } else {
      SM.toast('ابزار تصویر بارگذاری نشده', 'error')
    }
  }
}

SMModules.reports = {
  render(el) { SMReports.render(el) },
  exportPDF() { SMReports.exportPDF() },
  exportJPG() { SMReports.exportJPG() }
}

window.SMReports = SMReports
