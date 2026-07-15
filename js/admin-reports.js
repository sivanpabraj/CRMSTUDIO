/* ══════════════════════════════════════════════
   MAN — Admin Reports & Section Exports
   خروجی بخش‌به‌بخش + گزارش هفتگی مدیریت
   ══════════════════════════════════════════════ */

;(function () {
  const SECTIONS = [
    { id: 'finance', title: 'مالی', desc: 'واریز، برداشت، تراز', icon: 'fa-wallet', clr: '#22C55E' },
    { id: 'contracts', title: 'قرارداد و مشتری', desc: 'لیست قراردادها و مانده‌ها', icon: 'fa-file-signature', clr: '#C9A96E' },
    { id: 'events', title: 'ایست مراسمات', desc: 'مراسم هفته جاری و پیش‌رو', icon: 'fa-calendar-days', clr: '#F59E0B' },
    { id: 'banks', title: 'بانک‌ها', desc: 'موجودی حساب‌ها', icon: 'fa-university', clr: '#3B82F6' },
    { id: 'print', title: 'چاپخانه', desc: 'سفارش چاپ و آلبوم', icon: 'fa-images', clr: '#8B5CF6' },
    { id: 'personnel', title: 'پرسنل', desc: 'همکاران و پرداخت‌ها', icon: 'fa-users', clr: '#0EA5E9' },
    { id: 'pipeline', title: 'وضعیت کارها', desc: 'تدوین، تحویل، مشکل‌دار', icon: 'fa-tasks', clr: '#EF4444' }
  ]

  const AdminReports = {
    REPORT_SECTIONS: SECTIONS,

    getWeekJalaliRange() {
      const end = Utils.todayJalali()
      const d = new Date()
      d.setDate(d.getDate() - 6)
      const [jy, jm, jd] = Utils.gregorianToJalali(d.getFullYear(), d.getMonth() + 1, d.getDate())
      const start = `${jy}/${String(jm).padStart(2, '0')}/${String(jd).padStart(2, '0')}`
      return { start, end, label: `${start} تا ${end}` }
    },

    _inRange(dateStr, range) {
      if (!range || !dateStr) return true
      const d = String(dateStr).slice(0, 10)
      return d >= range.start && d <= range.end
    },

    _studioName() {
      return DB.get('studioInfo')?.name || AppConfig.DEFAULT_STUDIO_NAME
    },

    _esc(s) {
      return Utils.escapeHtml(s == null ? '' : String(s))
    },

    _statusLabel(s) {
      return typeof Admin !== 'undefined' && Admin.contractStatus ? Admin.contractStatus(s) : (s || '—')
    },

    compileSectionData(section, weekly = false) {
      const range = weekly ? this.getWeekJalaliRange() : null
      const fmt = Utils.fmtNum

      if (section === 'finance') {
        const transactions = DB.get('transactions').filter(t => this._inRange(t.date || t.createdAt, range))
        const deposits = transactions.filter(t => Utils.isTxIncome(t.type))
        const withdrawals = transactions.filter(t => Utils.isTxExpense(t.type))
        return {
          title: weekly ? 'گزارش مالی — ۷ روز اخیر' : 'گزارش مالی',
          summary: [
            ['واریزها', fmt(deposits.reduce((s, t) => s + (t.amount || 0), 0)) + ' تومان', deposits.length + ' تراکنش'],
            ['برداشت‌ها', fmt(withdrawals.reduce((s, t) => s + (t.amount || 0), 0)) + ' تومان', withdrawals.length + ' تراکنش'],
            ['خالص', fmt(deposits.reduce((s, t) => s + (t.amount || 0), 0) - withdrawals.reduce((s, t) => s + (t.amount || 0), 0)) + ' تومان', '']
          ],
          rows: transactions.map(t => [
            t.date || '—',
            Utils.isTxIncome(t.type) ? 'واریز' : 'برداشت',
            fmt(t.amount || 0),
            t.party || t.description || '—'
          ]),
          headers: ['تاریخ', 'نوع', 'مبلغ', 'شرح']
        }
      }

      if (section === 'contracts') {
        let contracts = DB.get('contracts')
        if (weekly) {
          contracts = contracts.filter(c =>
            this._inRange(c.createdAt, range) ||
            this._inRange(c.eventDate, range) ||
            (c.balance || 0) > 0
          )
        }
        const remaining = contracts.filter(c => (c.balance || 0) > 0 && c.status !== 'cancelled')
        return {
          title: weekly ? 'قراردادها و مانده‌ها — هفتگی' : 'گزارش قرارداد و مشتری',
          summary: [
            ['کل قراردادها', fmt(contracts.length), ''],
            ['باقی‌مانده (مانده حساب)', fmt(remaining.length), fmt(remaining.reduce((s, c) => s + (c.balance || 0), 0)) + ' تومان']
          ],
          rows: contracts.map(c => [
            c.contractNum || '—',
            `${c.groom || '—'} و ${c.bride || '—'}`,
            c.eventDate || '—',
            fmt(c.total || 0),
            fmt(c.balance || 0),
            this._statusLabel(c.status)
          ]),
          headers: ['شماره', 'مشتری', 'تاریخ مراسم', 'مبلغ کل', 'مانده', 'وضعیت']
        }
      }

      if (section === 'events') {
        const contracts = DB.get('contracts').filter(c => {
          if (c.status === 'cancelled') return false
          if (!c.eventDate) return false
          if (weekly) {
            const days = Utils.daysUntil(c.eventDate)
            return days >= 0 && days <= 7
          }
          const days = Utils.daysUntil(c.eventDate)
          return days >= 0 && days <= 30
        }).sort((a, b) => (a.eventDate || '').localeCompare(b.eventDate || ''))
        return {
          title: weekly ? 'ایست مراسمات — ۷ روز آینده' : 'ایست مراسمات — ۳۰ روز آینده',
          summary: [['مراسم', fmt(contracts.length), '']],
          rows: contracts.map(c => {
            const days = Utils.daysUntil(c.eventDate)
            return [
              c.eventDate || '—',
              days === 0 ? 'امروز' : days > 0 ? fmt(days) + ' روز بعد' : fmt(Math.abs(days)) + ' روز پیش',
              `${c.groom || '—'} و ${c.bride || '—'}`,
              c.venue || '—',
              this._statusLabel(c.status)
            ]
          }),
          headers: ['تاریخ', 'فاصله', 'عروس و داماد', 'سالن', 'وضعیت']
        }
      }

      if (section === 'banks') {
        const banks = DB.get('banks')
        const total = banks.reduce((s, b) => s + (b.balance || 0), 0)
        return {
          title: 'گزارش بانک‌ها و صندوق',
          summary: [['جمع موجودی', fmt(total) + ' تومان', fmt(banks.length) + ' حساب']],
          rows: banks.map(b => [b.icon || '🏦', b.name || '—', b.account || b.accountNumber || '—', fmt(b.balance || 0)]),
          headers: ['', 'نام', 'حساب', 'موجودی']
        }
      }

      if (section === 'print') {
        if (typeof PhotoHouse !== 'undefined') PhotoHouse.migrateLegacyOrders?.()
        let orders = DB.get('printOrders') || []
        if (weekly) orders = orders.filter(o => this._inRange(o.createdAt || o.date, range))
        const total = orders.reduce((s, o) => s + (o.totalAmount || 0), 0)
        return {
          title: weekly ? 'چاپخانه — ۷ روز اخیر' : 'گزارش چاپخانه',
          summary: [['سفارشات', fmt(orders.length), fmt(total) + ' تومان']],
          rows: orders.map(o => {
            const st = PhotoHouse?.ORDER_STATUS?.[o.status]?.label || o.status || '—'
            return [o.customerName || o.couple || '—', st, fmt(o.totalAmount || 0), o.createdAt || '—']
          }),
          headers: ['مشتری', 'وضعیت', 'مبلغ', 'تاریخ']
        }
      }

      if (section === 'personnel') {
        const personnel = DB.get('personnel')
        const payments = (DB.get('salaryPayments') || []).filter(p => this._inRange(p.date || p.month, range))
        const active = personnel.filter(p => p.status === 'active').length
        return {
          title: weekly ? 'پرسنل — ۷ روز اخیر' : 'گزارش پرسنل',
          summary: [
            ['پرسنل فعال', fmt(active), 'از ' + fmt(personnel.length)],
            ['پرداخت پرسنل', fmt(payments.reduce((s, p) => s + (p.amount || 0), 0)) + ' تومان', fmt(payments.length) + ' مورد']
          ],
          rows: personnel.map(p => [
            p.name || '—',
            p.phone || '—',
            (p.roles || []).map(r => getRoleTitle(r)).join('، ') || '—',
            p.status === 'active' ? 'فعال' : p.status === 'pending' ? 'در انتظار' : 'غیرفعال',
            fmt(p.jobs || 0)
          ]),
          headers: ['نام', 'موبایل', 'نقش', 'وضعیت', 'تعداد کار']
        }
      }

      if (section === 'pipeline') {
        const contracts = DB.get('contracts')
        const editing = contracts.filter(c => c.status === 'editing' || c.status === 'review' || c._editing)
        const delivered = contracts.filter(c => c.status === 'done' || c.delivered)
        const issues = contracts.filter(c => c.status === 'issue')
        const active = contracts.filter(c => c.status === 'active' || c.status === 'new' || !c.status)
        const rows = []
        const push = (group, list) => list.forEach(c => rows.push([group, `${c.groom || '—'} و ${c.bride || '—'}`, c.eventDate || '—', this._statusLabel(c.status)]))
        push('در حال تدوین', editing)
        push('مشکل‌دار', issues)
        push('تحویل شده', weekly ? delivered.filter(c => this._inRange(c.deliveryDate || c.updatedAt, range)) : delivered.slice(0, 50))
        push('در حال انجام', active.slice(0, 30))
        const issueLogs = (DB.get('issues') || []).filter(i => i.status !== 'resolved')
        issueLogs.forEach(i => rows.push(['مشکل سیستم', i.title || i.desc || '—', i.date || '—', i.status || '—']))
        return {
          title: weekly ? 'وضعیت کارها — هفتگی' : 'گزارش وضعیت کارها',
          summary: [
            ['تدوین', fmt(editing.length), ''],
            ['مشکل‌دار', fmt(issues.length + issueLogs.length), ''],
            ['تحویل شده', fmt(delivered.length), ''],
            ['فعال', fmt(active.length), '']
          ],
          rows,
          headers: ['دسته', 'پروژه', 'تاریخ', 'وضعیت']
        }
      }

      return { title: 'گزارش', summary: [], rows: [], headers: [] }
    },

    buildReportDocument(title, subtitle, summary, headers, rows) {
      const _fmt = Utils.fmtNum
      const studio = this._studioName()
      const today = Utils.today()
      return `
        <div data-report-root style="direction:rtl;font-family:Vazirmatn,Tahoma,Arial,sans-serif;padding:28px 24px;color:#1a1a2e;background:#fff;min-width:720px">
          <div style="text-align:center;border-bottom:3px solid #C9A96E;padding-bottom:14px;margin-bottom:18px">
            <div style="font-size:11px;color:#888;margin-bottom:4px">${this._esc(studio)}</div>
            <div style="font-size:20px;font-weight:800;color:#C9A96E">${this._esc(title)}</div>
            <div style="font-size:12px;color:#666;margin-top:6px">${this._esc(subtitle || '')} — ${today}</div>
          </div>
          ${summary.length ? `<div style="display:flex;flex-wrap:wrap;gap:10px;margin-bottom:18px">
            ${summary.map(([lbl, val, sub]) => `
              <div style="flex:1;min-width:120px;background:#f8f6f0;border:1px solid #ede9e0;border-radius:10px;padding:12px;text-align:center">
                <div style="font-size:18px;font-weight:800;color:#C9A96E">${val}</div>
                <div style="font-size:11px;color:#666">${this._esc(lbl)}</div>
                ${sub ? `<div style="font-size:10px;color:#999;margin-top:2px">${this._esc(sub)}</div>` : ''}
              </div>`).join('')}
          </div>` : ''}
          <table style="width:100%;border-collapse:collapse;font-size:11px">
            <thead><tr style="background:#1a1a2e;color:#fff">
              ${headers.map(h => `<th style="padding:8px 10px;text-align:right;font-weight:600">${this._esc(h)}</th>`).join('')}
            </tr></thead>
            <tbody>
              ${rows.length ? rows.map((r, i) => `
                <tr style="background:${i % 2 ? '#f9f8f4' : '#fff'};border-bottom:1px solid #eee">
                  ${r.map(cell => `<td style="padding:7px 10px">${this._esc(cell)}</td>`).join('')}
                </tr>`).join('') : `<tr><td colspan="${headers.length}" style="padding:20px;text-align:center;color:#999">داده‌ای ثبت نشده</td></tr>`}
            </tbody>
          </table>
          <div style="margin-top:20px;padding-top:10px;border-top:1px solid #ddd;font-size:10px;color:#999;text-align:center">
            MAN — گزارش سیستم مدیریت مراسم — ${today}
          </div>
        </div>`
    },

    buildWeeklyManagerHtml() {
      const range = this.getWeekJalaliRange()
      const parts = SECTIONS.map(sec => {
        const data = this.compileSectionData(sec.id, true)
        return this.buildReportDocument(
          data.title,
          'بازه: ' + range.label,
          data.summary,
          data.headers,
          data.rows.slice(0, 40)
        ).replace('data-report-root', 'data-report-part')
      })
      const studio = this._studioName()
      return `
        <div data-report-root style="direction:rtl;font-family:Vazirmatn,Tahoma,sans-serif;background:#fff;padding:20px">
          <div style="text-align:center;padding:24px;border:2px solid #C9A96E;border-radius:12px;margin-bottom:24px">
            <div style="font-size:22px;font-weight:900;color:#C9A96E">گزارش مدیریت — یک هفته</div>
            <div style="font-size:14px;margin-top:8px">${this._esc(studio)}</div>
            <div style="font-size:12px;color:#666;margin-top:4px">از ${range.start} تا ${range.end}</div>
          </div>
          ${parts.join('<div style="page-break-before:always;margin-top:20px"></div>')}
        </div>`
    },

    getReportExportPanelHtml() {
      const week = this.getWeekJalaliRange()
      const cards = SECTIONS.map(s => `
        <div class="report-export-card">
          <div class="report-export-head" style="--card-clr:${s.clr}">
            <i class="fas ${s.icon}"></i>
            <div>
              <div class="report-export-title">${s.title}</div>
              <div class="report-export-desc">${s.desc}</div>
            </div>
          </div>
          <div class="report-export-actions">
            <button type="button" class="btn btn-sm btn-ghost" onclick="Admin.exportSectionReport('${s.id}','pdf')" title="PDF"><i class="fas fa-file-pdf"></i> PDF</button>
            <button type="button" class="btn btn-sm btn-ghost" onclick="Admin.exportSectionReport('${s.id}','jpg')" title="تصویر"><i class="fas fa-image"></i> JPG</button>
            <button type="button" class="btn btn-sm btn-ghost" onclick="Admin.exportSectionReport('${s.id}','csv')" title="CSV"><i class="fas fa-file-csv"></i> CSV</button>
          </div>
        </div>`).join('')

      return `
        <div class="admin-card report-export-hub" style="margin-top:16px">
          <div class="admin-card-header">
            <div class="admin-card-title"><i class="fas fa-file-export" style="color:var(--clr-primary);margin-left:6px"></i> خروجی بخش‌به‌بخش</div>
          </div>
          <div class="admin-card-body">
            <p style="font-size:0.82rem;color:var(--clr-text-muted);margin:0 0 14px;line-height:1.7">هر بخش را جداگانه به صورت PDF، تصویر JPG یا فایل CSV دریافت کنید.</p>
            <div class="report-export-grid">${cards}</div>
          </div>
        </div>

        <div class="admin-card report-weekly-card" style="margin-top:16px;border-color:color-mix(in srgb,var(--clr-primary) 35%,transparent)">
          <div class="admin-card-header">
            <div class="admin-card-title"><i class="fas fa-chart-line" style="color:var(--clr-primary);margin-left:6px"></i> گزارش مدیریت — یک هفته</div>
          </div>
          <div class="admin-card-body">
            <p style="font-size:0.85rem;margin:0 0 12px;line-height:1.8">
              گزارش جامع مدیر شامل: <strong>مالی</strong> (واریز و برداشت)، <strong>قراردادهای باقی‌مانده</strong>، <strong>بانک‌ها</strong>، <strong>چاپخانه</strong>، <strong>پرسنل</strong>، <strong>ایست مراسمات</strong> و <strong>وضعیت کارها</strong> (تدوین، تحویل، مشکل‌دار) — بازه: <span class="ltr">${week.label}</span>
            </p>
            <div style="display:flex;gap:8px;flex-wrap:wrap">
              <button type="button" class="btn btn-primary" onclick="Admin.exportWeeklyManagerReport('pdf')"><i class="fas fa-file-pdf"></i> PDF گزارش هفتگی</button>
              <button type="button" class="btn btn-ghost" onclick="Admin.exportWeeklyManagerReport('jpg')"><i class="fas fa-image"></i> JPG گزارش هفتگی</button>
              <button type="button" class="btn btn-ghost" onclick="Admin.exportWeeklyManagerReport('csv')"><i class="fas fa-file-csv"></i> CSV خلاصه هفتگی</button>
            </div>
          </div>
        </div>`
    },

    _mountHtml(html) {
      const wrap = document.createElement('div')
      wrap.style.cssText = 'position:fixed;left:-9999px;top:0;z-index:-1'
      wrap.innerHTML = html
      document.body.appendChild(wrap)
      return wrap
    },

    async _exportPdf(html, filename) {
      if (typeof html2pdf === 'undefined') {
        Utils.toast('کتابخانه PDF در دسترس نیست', 'error')
        return
      }
      const wrap = this._mountHtml(html)
      const el = wrap.querySelector('[data-report-root]') || wrap
      try {
        Utils.toast('در حال ساخت PDF...', 'info')
        await html2pdf().set({
          margin: [8, 6, 8, 6],
          filename: filename + '.pdf',
          image: { type: 'jpeg', quality: 0.95 },
          html2canvas: { scale: 2, useCORS: true, logging: false },
          jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
        }).from(el).save()
        Utils.toast('PDF با موفقیت ذخیره شد', 'success')
      } catch {
        Utils.toast('خطا در ساخت PDF', 'error')
      } finally {
        wrap.remove()
      }
    },

    async _exportJpg(html, filename) {
      const wrap = this._mountHtml(html)
      const el = wrap.querySelector('[data-report-root]') || wrap
      try {
        Utils.toast('در حال ساخت تصویر...', 'info')
        let canvas
        if (typeof html2canvas !== 'undefined') {
          canvas = await html2canvas(el, { scale: 2, useCORS: true, logging: false, backgroundColor: '#ffffff' })
        } else if (typeof html2pdf !== 'undefined') {
          await this._exportPdf(html, filename)
          return
        } else {
          Utils.toast('ابزار ساخت تصویر موجود نیست — از PDF استفاده کنید', 'error')
          return
        }
        const a = document.createElement('a')
        a.href = canvas.toDataURL('image/jpeg', 0.92)
        a.download = filename + '.jpg'
        a.click()
        Utils.toast('تصویر JPG ذخیره شد', 'success')
      } catch {
        Utils.toast('خطا در ساخت JPG', 'error')
      } finally {
        wrap.remove()
      }
    },

    _exportCsv(filename, headers, rows) {
      const csv = [headers.join(','), ...rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))].join('\n')
      const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename + '.csv'
      a.click()
      URL.revokeObjectURL(url)
      Utils.toast('فایل CSV ذخیره شد', 'success')
    },

    async exportSectionReport(section, format = 'pdf') {
      const meta = SECTIONS.find(s => s.id === section)
      if (!meta) { Utils.toast('بخش نامعتبر', 'error'); return }
      const data = this.compileSectionData(section, false)
      const base = `گزارش_${section}_${Utils.todayISO()}`
      if (format === 'csv') {
        this._exportCsv(base, data.headers, data.rows)
        return
      }
      const html = this.buildReportDocument(data.title, meta.desc, data.summary, data.headers, data.rows)
      if (format === 'jpg') await this._exportJpg(html, base)
      else await this._exportPdf(html, base)
    },

    async exportWeeklyManagerReport(format = 'pdf') {
      const base = `گزارش_مدیریت_هفتگی_${Utils.todayISO()}`
      if (format === 'csv') {
        const lines = [['بخش', 'شاخص', 'مقدار', 'توضیح']]
        SECTIONS.forEach(sec => {
          const data = this.compileSectionData(sec.id, true)
          data.summary.forEach(([lbl, val, sub]) => lines.push([data.title, lbl, val, sub || '']))
          if (!data.summary.length) lines.push([data.title, '—', fmt(data.rows.length) + ' ردیف', ''])
        })
        this._exportCsv(base, lines[0], lines.slice(1))
        return
      }
      const html = this.buildWeeklyManagerHtml()
      if (format === 'jpg') await this._exportJpg(html, base)
      else await this._exportPdf(html, base)
    }
  }

  if (typeof Admin !== 'undefined') Object.assign(Admin, AdminReports)
})()
