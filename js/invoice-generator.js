/**
 * CRMSTUDIO — Multi-Template Invoice & Receipt Generator
 * موتور جامع صدور انواع فاکتور (رسمی، سینمایی، A5 اداری، فیش حرارتی)
 * با پشتیبانی از خروجی PDF، تصویر باکیفیت JPG، و اشتراک‌گذاری در پیام‌رسان‌ها
 */

(function (window) {
  'use strict'

  /**
   * تبدیل ارقام انگلیسی به فارسی
   */
  function toPersianDigits(n) {
    const f = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹']
    return String(n ?? '').replace(/[0-9]/g, w => f[+w])
  }

  /**
   * فرمت عدد ۳ رقم ۳ رقم
   */
  function fmtNum(n) {
    const val = Number(n) || 0
    return toPersianDigits(val.toLocaleString('en-US'))
  }

  /**
   * تبدیل عدد به حروف فارسی
   */
  function numberToWordsFa(num) {
    const n = Math.floor(Math.abs(Number(num) || 0))
    if (n === 0) return 'صفر'

    const yekan = ['', 'یک', 'دو', 'سه', 'چهار', 'پنج', 'شش', 'هفت', 'هشت', 'نه']
    const dahha = ['', 'ده', 'بیست', 'سی', 'چهل', 'پنجاه', 'شصت', 'هفتاد', 'هشتاد', 'نود']
    const dahyek = ['ده', 'یازده', 'دوازده', 'سیزده', 'چهارده', 'پانزده', 'شانزده', 'هفده', 'هجده', 'نوزده']
    const sadha = ['', 'یکصد', 'دویست', 'سیصد', 'چهارصد', 'پانصد', 'ششصد', 'هفتصد', 'هشتصد', 'نهصد']
    const scale = ['', 'هزار', 'میلیون', 'میلیارد', 'تریلیون']

    function chunkToWords(c) {
      const s = Math.floor(c / 100)
      const d = Math.floor((c % 100) / 10)
      const y = c % 10
      const parts = []

      if (s > 0) parts.push(sadha[s])
      if (d === 1) {
        parts.push(dahyek[y])
      } else {
        if (d > 1) parts.push(dahha[d])
        if (y > 0) parts.push(yekan[y])
      }
      return parts.join(' و ')
    }

    const chunks = []
    let temp = n
    while (temp > 0) {
      chunks.push(temp % 1000)
      temp = Math.floor(temp / 1000)
    }

    const words = []
    for (let i = chunks.length - 1; i >= 0; i--) {
      const c = chunks[i]
      if (c > 0) {
        const text = chunkToWords(c)
        const sc = scale[i]
        words.push(sc ? `${text} ${sc}` : text)
      }
    }
    return words.join(' و ')
  }

  const InvoiceGenerator = {
    _activeTemplate: 'official',
    _activeData: null,
    toPersianDigits,
    fmtNum,
    numberToWordsFa,

    /**
     * واکشی اطلاعات استودیو، تراکنش یا قرارداد
     */
    prepareData(opts = {}) {
      const db = typeof DB !== 'undefined' ? DB : (window.DB || null)
      const studio = (db && db.get ? db.get('studioInfo') : null) || {}

      let data = {
        invoiceNumber: opts.invoiceNumber || 'INV-' + Date.now().toString().slice(-6),
        issueDate: opts.issueDate || (typeof Utils !== 'undefined' ? Utils.todayJalali() : new Date().toLocaleDateString('fa-IR')),
        type: opts.type || 'deposit', // deposit, withdrawal, cancellation, personnel_settlement, official_sale
        title: opts.title || 'صورتحساب رسمی',
        customerName: opts.customerName || '',
        customerPhone: opts.customerPhone || '',
        customerNid: opts.customerNid || '',
        customerAddress: opts.customerAddress || '—',
        amount: Number(opts.amount) || 0,
        subtotal: Number(opts.subtotal) || Number(opts.amount) || 0,
        discount: Number(opts.discount) || 0,
        taxRate: opts.taxRate !== undefined ? Number(opts.taxRate) : (studio.taxEnabled !== false ? (studio.taxRate || 10) : 0),
        taxAmount: 0,
        finalTotal: 0,
        purpose: opts.purpose || 'خدمات فیلمبرداری و عکاسی مراسم',
        items: Array.isArray(opts.items) && opts.items.length ? opts.items : [],
        contractNum: opts.contractNum || '',
        bankName: opts.bankName || '',
        accountNumber: opts.accountNumber || '',
        traceNumber: opts.traceNumber || '',
        notes: opts.notes || '',
        cancellationFee: Number(opts.cancellationFee) || 0,
        refundAmount: Number(opts.refundAmount) || 0,
        studioName: studio.name || 'استودیو عکاسی و فیلم',
        studioManager: studio.manager || '',
        studioPhone: studio.phone || '',
        studioAddress: studio.address || '—',
        studioEconomicCode: studio.taxEconomyCode || studio.economicCode || '—',
        studioNationalId: studio.nationalId || '—'
      }

      // اگر از روی تراکنش حسابداری آمده باشد
      if (opts.txId && db && db.find) {
        const tx = db.find('transactions', x => x.id === opts.txId)
        if (tx) {
          const bank = tx.bankId ? db.find('banks', b => b.id === tx.bankId) : null
          const contract = tx.contractId ? db.find('contracts', c => c.id === tx.contractId) : null
          data.invoiceNumber = tx.referenceId || tx.id || data.invoiceNumber
          data.issueDate = tx.date || data.issueDate
          data.type = tx.type === 'deposit' ? 'deposit' : (tx.purposeCategory === 'cancellation_refund' ? 'cancellation' : 'withdrawal')
          data.amount = Number(tx.amount) || 0
          data.customerName = tx.client || (contract ? (contract.couple || `${contract.bride || ''} و ${contract.groom || ''}`.trim()) : '') || 'مشتری'
          data.purpose = tx.purpose || (tx.type === 'deposit' ? 'دریافت وجه قرارداد / قسط' : 'پرداخت هزینه / برداشت')
          data.bankName = bank ? (bank.name || bank.bank || '') : ''
          data.traceNumber = tx.transactionRef || tx.referenceId || ''
          data.contractNum = contract ? (contract.contractNum || contract.id) : ''
          data.notes = tx.notes || ''
        }
      }

      // اگر از روی قرارداد آمده باشد
      if (opts.contractId && db && db.find) {
        const c = db.find('contracts', x => x.id === opts.contractId)
        if (c) {
          data.contractNum = c.contractNum || c.id
          data.customerName = c.couple || `${c.bride || ''} و ${c.groom || ''}`.trim() || 'مشتری'
          data.customerPhone = c.phoneBride || c.phoneGroom || ''
          data.customerNid = c.brideNid || c.groomNid || ''
          if (!data.amount) data.amount = Number(c.total || 0)
          if (opts.type === 'cancellation' && c.cancelRecord) {
            data.cancellationFee = Number(c.cancelRecord.cancellationFee || 0)
            data.refundAmount = Number(c.cancelRecord.refundAmount || c.cancelRecord.paidAmount || 0)
            data.notes = c.cancelRecord.refundNotes || 'استرداد وجه طبق ضوابط کنسلی صنف عکاسان'
          }
        }
      }

      // اگر آیتم‌های جدول کالا وجود نداشت، یک ردیف پیش‌فرض تولید شود
      if (!data.items.length) {
        data.items = [
          {
            desc: data.purpose || 'خدمات تخصصی فیلمبرداری و عکاسی استودیو',
            qty: 1,
            unit: 'پروژه',
            unitPrice: data.amount,
            totalPrice: data.amount,
            discount: data.discount
          }
        ]
      }

      // محاسبه مالیات بر ارزش افزوده
      const sub = data.items.reduce((s, it) => s + (Number(it.totalPrice || it.unitPrice || 0) - Number(it.discount || 0)), 0)
      data.subtotal = sub
      if (data.taxRate > 0) {
        data.taxAmount = Math.round(sub * (data.taxRate / 100))
        data.finalTotal = sub + data.taxAmount
      } else {
        data.taxAmount = 0
        data.finalTotal = sub
      }

      this._activeData = data
      return data
    },

    /**
     * رندر قالب ۱: فاکتور رسمی استاندارد دارایی و صنف (ماده ۱۶۹ مکرر)
     */
    renderOfficialHtml(data) {
      const typeLabel = {
        deposit: 'صورتحساب رسمی فروش کالا و خدمات',
        withdrawal: 'رسید رسمی پرداخت و تسویه هزینه',
        cancellation: 'صورتحساب ابطال قرارداد و استرداد وجه',
        personnel_settlement: 'سند رسمی تسویه دستمزد عوامل اجرایی'
      }[data.type] || 'صورتحساب رسمی'

      return `
        <div id="invoice-render-target" class="inv-paper inv-paper--official" style="background:#fff;color:#111;padding:28px;border:1px solid #999;font-family:'Vazirmatn',sans-serif;font-size:12px;line-height:1.6;width:100%;max-width:780px;margin:0 auto;box-sizing:border-box;">
          <!-- سربرگ رسمی -->
          <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid #222;padding-bottom:12px;margin-bottom:14px;">
            <div style="width:28%">
              <div style="font-weight:900;font-size:16px">${data.studioName}</div>
              <div style="font-size:10px;color:#555">مدیریت: ${data.studioManager}</div>
            </div>
            <div style="width:44%;text-align:center">
              <h2 style="margin:0;font-size:17px;font-weight:900;font-family:'Estedad',sans-serif">${typeLabel}</h2>
              <div style="font-size:10px;color:#444;margin-top:4px">نسخه رسمی امور مالیاتی و اتحادیه صنف عکاسان و فیلمبرداران</div>
            </div>
            <div style="width:28%;text-align:left;font-size:11px">
              <div>شماره: <strong dir="ltr">${toPersianDigits(data.invoiceNumber)}</strong></div>
              <div>تاریخ: <strong>${toPersianDigits(data.issueDate)}</strong></div>
              ${data.contractNum ? `<div>شماره پرونده: <strong>${toPersianDigits(data.contractNum)}</strong></div>` : ''}
            </div>
          </div>

          <!-- مشخصات فروشنده -->
          <div style="border:1px solid #444;border-radius:6px;margin-bottom:10px;overflow:hidden">
            <div style="background:#f1f3f5;font-weight:800;padding:4px 10px;font-size:11px;border-bottom:1px solid #444">مشخصات فروشنده / ارائه‌دهنده خدمت</div>
            <div style="display:grid;grid-template-columns:2fr 1.2fr 1.2fr;gap:8px;padding:8px 10px;font-size:11px">
              <div>نام شخص / شرکت: <strong>${data.studioName}</strong></div>
              <div>شماره اقتصادی: <strong dir="ltr">${toPersianDigits(data.studioEconomicCode)}</strong></div>
              <div>تلفن تماس: <span dir="ltr">${toPersianDigits(data.studioPhone)}</span></div>
              <div style="grid-column:1/-1">نشانی: ${data.studioAddress}</div>
            </div>
          </div>

          <!-- مشخصات خریدار -->
          <div style="border:1px solid #444;border-radius:6px;margin-bottom:14px;overflow:hidden">
            <div style="background:#f1f3f5;font-weight:800;padding:4px 10px;font-size:11px;border-bottom:1px solid #444">مشخصات خریدار / متقاضی</div>
            <div style="display:grid;grid-template-columns:2fr 1.2fr 1.2fr;gap:8px;padding:8px 10px;font-size:11px">
              <div>نام و نام خانوادگی: <strong>${data.customerName || 'مشتری گرامی'}</strong></div>
              <div>کد ملی: <strong dir="ltr">${toPersianDigits(data.customerNid || '—')}</strong></div>
              <div>شماره همراه: <span dir="ltr">${toPersianDigits(data.customerPhone || '—')}</span></div>
              <div style="grid-column:1/-1">نشانی خریدار: ${data.customerAddress}</div>
            </div>
          </div>

          <!-- جدول اقلام -->
          <table style="width:100%;border-collapse:collapse;margin-bottom:12px;font-size:11px;text-align:center" border="1" bordercolor="#444">
            <thead style="background:#f1f3f5;font-weight:800">
              <tr>
                <th style="padding:6px;width:35px">ردیف</th>
                <th style="padding:6px">شرح کالا یا خدمات تصویربرداری</th>
                <th style="padding:6px;width:50px">تعداد</th>
                <th style="padding:6px;width:110px">مبلغ واحد (تومان)</th>
                <th style="padding:6px;width:70px">تخفیف</th>
                <th style="padding:6px;width:120px">مبلغ پس از تخفیف</th>
              </tr>
            </thead>
            <tbody>
              ${data.items.map((it, idx) => `
                <tr>
                  <td style="padding:6px">${toPersianDigits(idx + 1)}</td>
                  <td style="padding:6px;text-align:right">${it.desc}</td>
                  <td style="padding:6px">${toPersianDigits(it.qty || 1)}</td>
                  <td style="padding:6px">${fmtNum(it.unitPrice)}</td>
                  <td style="padding:6px">${fmtNum(it.discount || 0)}</td>
                  <td style="padding:6px;font-weight:700">${fmtNum(Number(it.totalPrice || it.unitPrice) - Number(it.discount || 0))}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>

          <!-- جمع کل و مالیات -->
          <div style="display:grid;grid-template-columns:2fr 1.5fr;gap:12px;margin-bottom:18px">
            <div style="border:1px solid #777;border-radius:6px;padding:10px;font-size:11px;display:flex;flex-direction:column;justify-content:space-between">
              <div>
                <strong>مبلغ قابل پرداخت به حروف:</strong><br>
                <span style="font-size:12px;font-weight:800;color:#059669">${numberToWordsFa(data.finalTotal)} تومان تمام</span>
              </div>
              ${data.notes ? `<div style="margin-top:6px;color:#555">یادداشت: ${data.notes}</div>` : ''}
              ${data.traceNumber ? `<div style="margin-top:4px">کد رهگیری بانکی: <strong dir="ltr">${toPersianDigits(data.traceNumber)}</strong></div>` : ''}
            </div>

            <div style="border:1px solid #777;border-radius:6px;padding:8px 12px;font-size:11px">
              <div style="display:flex;justify-content:space-between;padding:4px 0"><span>جمع خالص خدمات:</span><span>${fmtNum(data.subtotal)} تومان</span></div>
              ${data.taxRate > 0 ? `
                <div style="display:flex;justify-content:space-between;padding:4px 0"><span>مالیات بر ارزش افزوده (${toPersianDigits(data.taxRate)}٪):</span><span style="color:#d97706">+ ${fmtNum(data.taxAmount)} تومان</span></div>
              ` : ''}
              ${data.cancellationFee > 0 ? `
                <div style="display:flex;justify-content:space-between;padding:4px 0"><span>کسر خسارت فسخ صنف:</span><span style="color:#dc2626">− ${fmtNum(data.cancellationFee)} تومان</span></div>
              ` : ''}
              <div style="display:flex;justify-content:space-between;padding:6px 0;border-top:2px solid #222;font-weight:900;font-size:13px">
                <span>جمع کل نهایی:</span>
                <span style="color:#059669">${fmtNum(data.finalTotal)} تومان</span>
              </div>
            </div>
          </div>

          <!-- امضا و مهر -->
          <div style="display:flex;justify-content:space-between;align-items:center;text-align:center;padding:16px 14px 8px;font-size:11px;border-top:1px dashed #888;margin-top:10px">
            <div style="width:34%">
              <div>مهر و امضای امور مالی / مدیریت استودیو</div>
              <div style="height:65px;display:flex;align-items:center;justify-content:center">
                ${typeof DocumentSeal !== 'undefined' ? `<img src="${DocumentSeal.generateStudioSeal({ name: data.studioName, licenseNo: data.studioEconomicCode })}" alt="مهر" style="width:75px;height:75px;pointer-events:none"/>` : ''}
              </div>
              <div style="font-weight:700">${data.studioName}</div>
            </div>
            <div style="width:28%;display:flex;flex-direction:column;align-items:center;justify-content:center">
              ${typeof DocumentSeal !== 'undefined' ? `
                <img src="${DocumentSeal.generateQrCode(window.location.origin + '/invoice.html?id=' + data.invoiceNumber, 80)}" alt="QR" style="width:64px;height:64px;border:1px solid #ddd;padding:3px;background:#fff;border-radius:6px"/>
                <div style="font-size:9px;color:#666;margin-top:2px">استعلام اصالت رسمی سند</div>
              ` : ''}
            </div>
            <div style="width:34%">
              <div>امضا و اثر انگشت خریدار / متقاضی</div>
              <div style="height:65px;display:flex;align-items:center;justify-content:center">
                <span style="color:#10b981;font-weight:700;font-size:11px"><i class="fas fa-check-circle"></i> تایید الکترونیک با رمز یکبارمصرف</span>
              </div>
              <div style="font-weight:700">${data.customerName || 'مشتری'}</div>
            </div>
          </div>
        </div>
      `
    },

    /**
     * رندر قالب ۲: فاکتور سینمایی لوکس استودیو (Obsidian Gold)
     */
    renderCinemaLuxuryHtml(data) {
      return `
        <div id="invoice-render-target" class="inv-paper inv-paper--cinema" style="background:#0c0d12;color:#f3f4f6;padding:32px;border:1px solid rgba(212,175,55,0.4);border-radius:20px;font-family:'Vazirmatn',sans-serif;font-size:12px;line-height:1.6;width:100%;max-width:760px;margin:0 auto;box-sizing:border-box;box-shadow:0 24px 60px rgba(0,0,0,0.8);">
          <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid rgba(212,175,55,0.3);padding-bottom:18px;margin-bottom:20px;">
            <div style="display:flex;align-items:center;gap:12px">
              <div style="width:50px;height:50px;border-radius:14px;background:linear-gradient(135deg,#d4af37,#996515);display:flex;align-items:center;justify-content:center;color:#000;font-size:1.4rem"><i class="fas fa-camera"></i></div>
              <div>
                <h1 style="margin:0;font-size:18px;font-weight:900;color:#fff;font-family:'Estedad',sans-serif">${data.studioName}</h1>
                <div style="font-size:10px;color:#d4af37;letter-spacing:1px">CINEMA & PHOTOGRAPHY STUDIO</div>
              </div>
            </div>
            <div style="text-align:left;font-size:11px">
              <div style="display:inline-block;padding:4px 12px;background:rgba(212,175,55,0.15);border:1px solid rgba(212,175,55,0.4);border-radius:999px;color:#d4af37;font-weight:800;margin-bottom:6px">سند رسمی فاکتور</div>
              <div style="color:rgba(255,255,255,0.7)">شماره: <span dir="ltr">${toPersianDigits(data.invoiceNumber)}</span></div>
              <div style="color:rgba(255,255,255,0.7)">تاریخ: ${toPersianDigits(data.issueDate)}</div>
            </div>
          </div>

          <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:14px;padding:16px;margin-bottom:20px">
            <div>
              <div style="font-size:10px;color:#d4af37;margin-bottom:4px">مشخصات قرارداد و کارفرما</div>
              <div style="font-size:14px;font-weight:800;color:#fff">${data.customerName || 'عروس و داماد گرامی'}</div>
              <div style="font-size:11px;color:rgba(255,255,255,0.6);margin-top:2px">تلفن: ${data.customerPhone || '—'} · پرونده: #${data.contractNum || '—'}</div>
            </div>
            <div style="text-align:left">
              <div style="font-size:10px;color:#d4af37;margin-bottom:4px">روش تسویه و وضعیت سند</div>
              <div style="font-size:13px;font-weight:800;color:#10b981"><i class="fas fa-check-circle"></i> تایید و تسویه شده در سیستم</div>
              <div style="font-size:11px;color:rgba(255,255,255,0.6);margin-top:2px">حساب: ${data.bankName || 'صندوق مرکزی'} ${data.traceNumber ? `· رهگیری: ${data.traceNumber}` : ''}</div>
            </div>
          </div>

          <!-- لیست خدمات -->
          <div style="margin-bottom:20px">
            <div style="padding:8px 12px;background:rgba(212,175,55,0.08);border-radius:8px;font-weight:800;color:#d4af37;display:flex;justify-content:space-between;margin-bottom:8px">
              <span>شرح خدمت و پکیج</span>
              <span>مبلغ نهایی (تومان)</span>
            </div>
            ${data.items.map(it => `
              <div style="display:flex;justify-content:space-between;align-items:center;padding:12px;background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.05);border-radius:10px;margin-bottom:6px">
                <div>
                  <div style="font-weight:700;color:#fff">${it.desc}</div>
                  <div style="font-size:10px;color:rgba(255,255,255,0.5)">تعداد: ${it.qty || 1} ${it.unit || 'جلسه'}</div>
                </div>
                <div style="font-size:13px;font-weight:800;color:#d4af37">${fmtNum(it.totalPrice || it.unitPrice)} تومان</div>
              </div>
            `).join('')}
          </div>

          <!-- باکس قیمت نهایی -->
          <div style="background:linear-gradient(135deg,rgba(212,175,55,0.12),rgba(212,175,55,0.04));border:1px solid rgba(212,175,55,0.3);border-radius:14px;padding:18px;display:flex;justify-content:space-between;align-items:center;margin-bottom:24px">
            <div>
              <div style="font-size:11px;color:#d4af37">مبلغ قابل پرداخت با احتساب کلیه کسورات و مالیات:</div>
              <div style="font-size:12px;color:rgba(255,255,255,0.8);margin-top:4px">${numberToWordsFa(data.finalTotal)} تومان</div>
            </div>
            <div style="text-align:left">
              <div style="font-family:'Estedad',sans-serif;font-size:22px;font-weight:900;color:#d4af37">${fmtNum(data.finalTotal)} <span style="font-size:11px;font-weight:normal">تومان</span></div>
            </div>
          </div>

          <div style="display:flex;justify-content:space-between;border-top:1px dashed rgba(255,255,255,0.15);padding-top:16px;font-size:10px;color:rgba(255,255,255,0.5)">
            <div>CRMSTUDIO · شناسه امنیت سند: ${Math.random().toString(36).slice(2, 10).toUpperCase()}</div>
            <div>تاییدیه معتبر استودیو عکاسی و فیلمبرداری ${data.studioName}</div>
          </div>
        </div>
      `
    },

    /**
     * رندر قالب ۳: رسید استاندارد حسابداری A5
     */
    renderStandardA5Html(data) {
      return `
        <div id="invoice-render-target" class="inv-paper inv-paper--a5" style="background:#fff;color:#222;padding:22px;border:1px solid #aaa;font-family:'Vazirmatn',sans-serif;font-size:11px;line-height:1.5;width:100%;max-width:680px;margin:0 auto;box-sizing:border-box;">
          <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid #333;padding-bottom:10px;margin-bottom:12px;">
            <div>
              <strong style="font-size:15px">${data.studioName}</strong>
              <div style="font-size:10px;color:#666">سند اداری مالی و رسید حسابداری</div>
            </div>
            <div style="text-align:center">
              <h3 style="margin:0;font-size:14px;font-weight:800">برگه ${data.type === 'deposit' ? 'دریافت وجه (واریز)' : (data.type === 'cancellation' ? 'ابطال و استرداد' : 'پرداخت وجه')}</h3>
            </div>
            <div style="text-align:left;font-size:10px">
              <div>شماره سند: <strong dir="ltr">${toPersianDigits(data.invoiceNumber)}</strong></div>
              <div>تاریخ: ${toPersianDigits(data.issueDate)}</div>
            </div>
          </div>

          <table style="width:100%;border-collapse:collapse;margin-bottom:14px" border="1" bordercolor="#ccc">
            <tr>
              <td style="padding:6px;background:#f9f9f9;width:25%">طرف حساب / دریافت‌کننده:</td>
              <td style="padding:6px;font-weight:700">${data.customerName || '—'}</td>
              <td style="padding:6px;background:#f9f9f9;width:20%">شماره تماس:</td>
              <td style="padding:6px" dir="ltr">${data.customerPhone || '—'}</td>
            </tr>
            <tr>
              <td style="padding:6px;background:#f9f9f9">بابت / شرح سند:</td>
              <td style="padding:6px" colspan="3">${data.purpose}</td>
            </tr>
            <tr>
              <td style="padding:6px;background:#f9f9f9">حساب بانکی / صندوق:</td>
              <td style="padding:6px">${data.bankName || 'صندوق استودیو'}</td>
              <td style="padding:6px;background:#f9f9f9">کد پیگیری:</td>
              <td style="padding:6px" dir="ltr">${data.traceNumber || '—'}</td>
            </tr>
            <tr>
              <td style="padding:6px;background:#f9f9f9">مبلغ سند:</td>
              <td style="padding:6px;font-size:13px;font-weight:900;color:#059669">${fmtNum(data.finalTotal)} تومان</td>
              <td style="padding:6px;background:#f9f9f9">به حروف:</td>
              <td style="padding:6px">${numberToWordsFa(data.finalTotal)} تومان</td>
            </tr>
          </table>

          <div style="display:flex;justify-content:space-between;text-align:center;padding:12px 16px 4px;font-size:10px">
            <div>تنظیم‌کننده / صندوق‌دار<div style="height:40px"></div>________________</div>
            <div>مدیر مالی استودیو<div style="height:40px"></div>________________</div>
            <div>امضا و تایید دریافت‌کننده<div style="height:40px"></div>________________</div>
          </div>
        </div>
      `
    },

    /**
     * رندر قالب ۴: فیش حرارتی ۸۰ میلی‌متری مخصوص فیش‌پرینتر POS
     */
    renderThermalPosHtml(data) {
      return `
        <div id="invoice-render-target" class="inv-paper inv-paper--thermal" style="background:#fff;color:#000;padding:16px 12px;border:1px dashed #666;font-family:'Vazirmatn',monospace;font-size:11px;line-height:1.5;width:320px;margin:0 auto;box-sizing:border-box;text-align:center">
          <div style="font-weight:900;font-size:15px;margin-bottom:2px">${data.studioName}</div>
          <div style="font-size:10px">فیش صندوق و تایید تراکنش</div>
          <div style="margin:8px 0;border-top:1px dashed #000"></div>

          <div style="display:flex;justify-content:space-between;font-size:10px">
            <span>شماره: ${toPersianDigits(data.invoiceNumber)}</span>
            <span>تاریخ: ${toPersianDigits(data.issueDate)}</span>
          </div>
          <div style="text-align:right;font-size:10px;margin:4px 0">
            مشتری: <strong>${data.customerName || 'مشتری گرامی'}</strong>
          </div>
          ${data.contractNum ? `<div style="text-align:right;font-size:10px">قرارداد: #${toPersianDigits(data.contractNum)}</div>` : ''}

          <div style="margin:8px 0;border-top:1px dashed #000"></div>
          <div style="text-align:right;margin-bottom:8px">
            <div>بابت: ${data.purpose}</div>
            ${data.traceNumber ? `<div>پیگیری: ${toPersianDigits(data.traceNumber)}</div>` : ''}
          </div>

          <div style="background:#f0f0f0;padding:8px;border-radius:6px;margin:10px 0">
            <div style="font-size:10px">مبلغ دریافتی:</div>
            <div style="font-size:16px;font-weight:900">${fmtNum(data.finalTotal)} تومان</div>
            <div style="font-size:9px;margin-top:2px">${numberToWordsFa(data.finalTotal)} ت</div>
          </div>

          <div style="margin:8px 0;border-top:1px dashed #000"></div>
          <div style="font-size:9px;color:#444">
            از حسن انتخاب و اعتماد شما سپاسگزاریم<br>
            تلفن تماس: ${toPersianDigits(data.studioPhone)}
          </div>
        </div>
      `
    },

    /**
     * رندر محتوای قالب فعال
     */
    renderActiveTemplate() {
      const data = this._activeData
      if (!data) return ''
      if (this._activeTemplate === 'official') return this.renderOfficialHtml(data)
      if (this._activeTemplate === 'cinema_luxury') return this.renderCinemaLuxuryHtml(data)
      if (this._activeTemplate === 'standard_a5') return this.renderStandardA5Html(data)
      if (this._activeTemplate === 'thermal_pos') return this.renderThermalPosHtml(data)
      return this.renderOfficialHtml(data)
    },

    /**
     * سوییچ زنده بین قالب‌ها
     */
    switchTemplate(templateId) {
      this._activeTemplate = templateId
      const container = document.getElementById('inv-preview-container')
      if (container) {
        container.innerHTML = this.renderActiveTemplate()
      }
      document.querySelectorAll('.inv-tpl-tab').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tpl === templateId)
      })
    },

    /**
     * باز کردن مدال جامع پیش‌نمایش و صدور فاکتور
     */
    openModal(opts = {}) {
      this.prepareData(opts)
      this._activeTemplate = opts.template || 'official'

      const modalId = 'invoice-modal-' + Date.now()
      const overlay = document.createElement('div')
      overlay.id = modalId
      overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.8);backdrop-filter:blur(12px);z-index:999999;display:flex;align-items:center;justify-content:center;padding:16px;direction:rtl'

      overlay.innerHTML = `
        <div style="background:#16181d;border:1px solid rgba(255,255,255,0.12);border-radius:24px;width:100%;max-width:880px;max-height:92vh;display:flex;flex-direction:column;box-shadow:0 30px 90px rgba(0,0,0,0.7);overflow:hidden">
          <!-- هدر مدال -->
          <div style="padding:16px 22px;border-bottom:1px solid rgba(255,255,255,0.08);display:flex;justify-content:space-between;align-items:center">
            <div style="display:flex;align-items:center;gap:10px">
              <i class="fas fa-file-invoice" style="color:#10b981;font-size:1.2rem"></i>
              <strong style="color:#fff;font-size:1rem">صدور و خروجی فاکتور رسمی / رسید حسابداری</strong>
            </div>
            <button type="button" id="inv-modal-close" style="background:none;border:none;color:#9ca3af;font-size:1.3rem;cursor:pointer">✕</button>
          </div>

          <!-- نوار انتخاب مدل قالب فاکتور -->
          <div style="padding:12px 22px;background:rgba(0,0,0,0.25);border-bottom:1px solid rgba(255,255,255,0.06);display:flex;gap:8px;overflow-x:auto">
            <button type="button" class="inv-tpl-tab active" data-tpl="official" onclick="InvoiceGenerator.switchTemplate('official')" style="padding:8px 14px;border-radius:10px;border:1px solid rgba(255,255,255,0.1);background:rgba(255,255,255,0.05);color:#fff;font-size:0.8rem;font-weight:700;cursor:pointer;display:flex;align-items:center;gap:6px">
              <i class="fas fa-building-columns"></i> فاکتور رسمی دارایی (ماده ۱۶۹)
            </button>
            <button type="button" class="inv-tpl-tab" data-tpl="cinema_luxury" onclick="InvoiceGenerator.switchTemplate('cinema_luxury')" style="padding:8px 14px;border-radius:10px;border:1px solid rgba(255,255,255,0.1);background:rgba(255,255,255,0.05);color:#fff;font-size:0.8rem;font-weight:700;cursor:pointer;display:flex;align-items:center;gap:6px">
              <i class="fas fa-crown" style="color:#f59e0b"></i> فاکتور لوکس سینمایی
            </button>
            <button type="button" class="inv-tpl-tab" data-tpl="standard_a5" onclick="InvoiceGenerator.switchTemplate('standard_a5')" style="padding:8px 14px;border-radius:10px;border:1px solid rgba(255,255,255,0.1);background:rgba(255,255,255,0.05);color:#fff;font-size:0.8rem;font-weight:700;cursor:pointer;display:flex;align-items:center;gap:6px">
              <i class="fas fa-file-lines"></i> رسید حسابداری A5
            </button>
            <button type="button" class="inv-tpl-tab" data-tpl="thermal_pos" onclick="InvoiceGenerator.switchTemplate('thermal_pos')" style="padding:8px 14px;border-radius:10px;border:1px solid rgba(255,255,255,0.1);background:rgba(255,255,255,0.05);color:#fff;font-size:0.8rem;font-weight:700;cursor:pointer;display:flex;align-items:center;gap:6px">
              <i class="fas fa-receipt"></i> فیش حرارتی ۸۰mm
            </button>
          </div>

          <!-- بدنه پیش‌نمایش -->
          <div style="flex:1;overflow-y:auto;padding:24px;background:#0d0e12" id="inv-preview-container">
            ${this.renderActiveTemplate()}
          </div>

          <!-- فوتر دکمه‌های اقدام (PDF / JPG / بله / پرینت) -->
          <div style="padding:14px 22px;border-top:1px solid rgba(255,255,255,0.08);background:#16181d;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px">
            <div style="display:flex;gap:8px">
              <button type="button" class="sm-btn sm-btn-primary" onclick="InvoiceGenerator.exportPDF()" style="padding:10px 18px;border-radius:10px;display:flex;align-items:center;gap:6px;font-weight:800">
                <i class="fas fa-file-pdf"></i> ذخیره به صورت PDF
              </button>
              <button type="button" class="sm-btn sm-btn-ghost" onclick="InvoiceGenerator.exportJPG()" style="padding:10px 18px;border-radius:10px;background:rgba(16,185,129,0.15);border:1px solid rgba(16,185,129,0.4);color:#10b981;display:flex;align-items:center;gap:6px;font-weight:800">
                <i class="fas fa-file-image"></i> ذخیره عکس JPG (ارسال سریع)
              </button>
            </div>

            <div style="display:flex;gap:8px">
              <button type="button" class="sm-btn sm-btn-ghost" onclick="InvoiceGenerator.shareToMessenger('bale')" style="padding:8px 12px;border-radius:8px">
                <i class="fas fa-paper-plane"></i> ارسال در بله
              </button>
              <button type="button" class="sm-btn sm-btn-ghost" onclick="InvoiceGenerator.shareToMessenger('whatsapp')" style="padding:8px 12px;border-radius:8px">
                <i class="fab fa-whatsapp"></i> واتساپ
              </button>
              <button type="button" class="sm-btn sm-btn-ghost" onclick="window.print()" style="padding:8px 12px;border-radius:8px">
                <i class="fas fa-print"></i> پرینت
              </button>
            </div>
          </div>
        </div>
      `

      document.body.appendChild(overlay)
      document.getElementById('inv-modal-close').onclick = () => overlay.remove()
    },

    /**
     * خروجی مستقیم به فایل باکیفیت PDF
     */
    async exportPDF() {
      const el = document.getElementById('invoice-render-target')
      if (!el) return
      const data = this._activeData || {}
      const fname = `فاکتور-${data.invoiceNumber || Date.now()}.pdf`

      if (typeof window.html2pdf !== 'undefined') {
        const opt = {
          margin: 10,
          filename: fname,
          image: { type: 'jpeg', quality: 0.98 },
          html2canvas: { scale: 2, useCORS: true, logging: false, backgroundColor: '#ffffff' },
          jsPDF: { unit: 'mm', format: this._activeTemplate === 'standard_a5' ? 'a5' : 'a4', orientation: 'portrait' }
        }
        if (typeof window.Utils !== 'undefined' && window.Utils.toast) window.Utils.toast('در حال تولید فایل PDF با کیفیت بالا...', 'info')
        window.html2pdf().set(opt).from(el).save().then(() => {
          if (typeof window.Utils !== 'undefined' && window.Utils.toast) window.Utils.toast('فایل PDF با موفقیت ذخیره شد ✓', 'success')
        }).catch(err => {
          console.warn('[PDF Error]', err)
          window.print()
        })
      } else {
        window.print()
      }
    },

    /**
     * خروجی مستقیم به فایل عکس باکیفیت JPG جهت اشتراک‌گذاری در شبکه‌های اجتماعی
     */
    async exportJPG() {
      const el = document.getElementById('invoice-render-target')
      if (!el) return
      const data = this._activeData || {}
      const fname = `فاکتور-${data.invoiceNumber || Date.now()}.jpg`

      if (typeof window.html2canvas !== 'undefined') {
        if (typeof window.Utils !== 'undefined' && window.Utils.toast) window.Utils.toast('در حال پردازش و ساخت تصویر باکیفیت JPG...', 'info')
        try {
          const canvas = await window.html2canvas(el, {
            scale: 2,
            useCORS: true,
            logging: false,
            backgroundColor: this._activeTemplate === 'cinema_luxury' ? '#0c0d12' : '#ffffff'
          })
          const imgData = canvas.toDataURL('image/jpeg', 0.95)
          const link = document.createElement('a')
          link.href = imgData
          link.download = fname
          link.click()
          if (typeof window.Utils !== 'undefined' && window.Utils.toast) window.Utils.toast('تصویر فاکتور (JPG) با موفقیت دانلود شد ✓', 'success')
        } catch (err) {
          console.warn('[JPG Error]', err)
          if (typeof window.Utils !== 'undefined' && window.Utils.toast) window.Utils.toast('خطا در ساخت عکس: ' + err.message, 'error')
        }
      } else {
        if (typeof window.Utils !== 'undefined' && window.Utils.toast) window.Utils.toast('کتابخانه تصویرساز در دسترس نیست', 'error')
      }
    },

    /**
     * اشتراک‌گذاری متن و جزییات فاکتور در بله یا واتساپ
     */
    shareToMessenger(messenger = 'bale') {
      const data = this._activeData || {}
      const text = `📄 صورتحساب رسمی استودیو ${data.studioName}\nشماره فاکتور: ${data.invoiceNumber}\nتاریخ: ${data.issueDate}\nمشتری گرامی: ${data.customerName || 'کارفرما'}\nبابت: ${data.purpose}\nمبلغ قابل پرداخت: ${fmtNum(data.finalTotal)} تومان\nوضعیت: تایید شده ✓`

      if (messenger === 'bale') {
        const url = `https://ble.ir/share/url?url=&text=${encodeURIComponent(text)}`
        window.open(url, '_blank')
      } else if (messenger === 'whatsapp') {
        const phone = (data.customerPhone || '').replace(/^0/, '98')
        const url = `https://api.whatsapp.com/send?phone=${encodeURIComponent(phone)}&text=${encodeURIComponent(text)}`
        window.open(url, '_blank')
      }
    }
  }

  window.InvoiceGenerator = InvoiceGenerator
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = InvoiceGenerator
  }
})(typeof window !== 'undefined' ? window : globalThis)
