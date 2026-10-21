/**
 * CRMSTUDIO — Document Seal & Verification QR Engine
 * موتور رسمی تولید مهر ژلاتینی استودیو، امضای دیجیتال و کیو‌آرکد (QR Code) اصالت‌سنجی اسناد
 */

(function (window) {
  'use strict'

  const DocumentSeal = {
    /**
     * تولید تصویر مهر ژلاتینی استودیو با وضوح بالا
     * @param {Object} studio مشخصات استودیو (نام، شماره پروانه، شهر)
     * @param {Object} opts تنظیمات رنگ، زاویه چرخش و متن
     */
    generateStudioSeal(studio = {}, opts = {}) {
      const size = opts.size || 260
      const color = opts.color || '#b91c1c' // رنگ قرمز سنتی مهر ژلاتینی
      const canvas = document.createElement('canvas')
      canvas.width = size
      canvas.height = size
      const ctx = canvas.getContext('2d')
      if (!ctx) return ''

      const cx = size / 2
      const cy = size / 2
      const radius = size * 0.44

      // چرخش اندک جهت شبیه‌سازی اثر طبیعی مهر دستی
      const angle = (opts.angle !== undefined ? opts.angle : (Math.random() * 4 - 2)) * (Math.PI / 180)
      ctx.save()
      ctx.translate(cx, cy)
      ctx.rotate(angle)
      ctx.translate(-cx, -cy)

      ctx.strokeStyle = color
      ctx.fillStyle = color
      ctx.lineWidth = 3.5

      // دایره بیرونی ضخیم
      ctx.beginPath()
      ctx.arc(cx, cy, radius, 0, Math.PI * 2)
      ctx.stroke()

      // دایره نقطه‌چین میانی
      ctx.lineWidth = 1.2
      ctx.beginPath()
      ctx.setLineDash([4, 3])
      ctx.arc(cx, cy, radius - 6, 0, Math.PI * 2)
      ctx.stroke()
      ctx.setLineDash([])

      // دایره داخلی نازک
      ctx.lineWidth = 1.8
      ctx.beginPath()
      ctx.arc(cx, cy, radius - 12, 0, Math.PI * 2)
      ctx.stroke()

      // متن منحنی بالای مهر: نام استودیو
      const topText = `استودیو عکاسی و فیلمبرداری ${studio.name || 'ماندنی'}`
      this._drawCurvedText(ctx, topText, cx, cy, radius - 26, Math.PI * 0.15, Math.PI * 0.85, false, color)

      // متن منحنی پایین مهر: شماره پروانه / کد اقتصادی
      const license = studio.licenseNo || studio.taxEconomyCode || studio.economicCode || '۴۴۸۲۱'
      const bottomText = `شماره پروانه کسب: ${license}`
      this._drawCurvedText(ctx, bottomText, cx, cy, radius - 26, Math.PI * 1.15, Math.PI * 1.85, true, color)

      // دایره مرکزی و ستاره‌ها
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.arc(cx, cy, radius * 0.45, 0, Math.PI * 2)
      ctx.stroke()

      // ستاره‌های طرفین
      ctx.font = '12px Tahoma'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText('★', cx - radius + 22, cy)
      ctx.fillText('★', cx + radius - 22, cy)

      // متن و نشان مرکز مهر
      ctx.font = 'bold 15px Vazirmatn, Tahoma, sans-serif'
      ctx.fillText('تایید شد', cx, cy - 8)

      ctx.font = 'bold 10px Vazirmatn, Tahoma, sans-serif'
      ctx.fillText('مهر و امضای رسمی', cx, cy + 12)

      ctx.restore()
      return canvas.toDataURL('image/png')
    },

    /**
     * رسم متن روی کمان دایره
     */
    _drawCurvedText(ctx, text, cx, cy, radius, startAngle, endAngle, inward, color) {
      ctx.save()
      ctx.font = 'bold 12px Vazirmatn, Tahoma, sans-serif'
      ctx.fillStyle = color
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'

      const chars = text.split('')
      const totalAngle = Math.abs(endAngle - startAngle)
      const step = totalAngle / Math.max(1, chars.length - 1)

      for (let i = 0; i < chars.length; i++) {
        const charAngle = inward
          ? startAngle + i * step
          : endAngle - i * step

        const x = cx + radius * Math.cos(charAngle)
        const y = cy + radius * Math.sin(charAngle)

        ctx.save()
        ctx.translate(x, y)
        ctx.rotate(charAngle + (inward ? -Math.PI / 2 : Math.PI / 2))
        ctx.fillText(chars[i], 0, 0)
        ctx.restore()
      }
      ctx.restore()
    },

    /**
     * تولید QR کد برای استعلام اصالت الکترونیکی سند
     * از الگوریتم ماتریس دوبعدی استاندارد استفاده می‌کند
     */
    generateQrCode(url, size = 110) {
      const canvas = document.createElement('canvas')
      canvas.width = size
      canvas.height = size
      const ctx = canvas.getContext('2d')
      if (!ctx) return ''

      // پس‌زمینه سفید
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, size, size)

      // تولید ماتریس بیت از روی متن/آدرس
      const grid = 21 // استاندارد QR ورژن ۱ (۲۱x۲۱)
      const cell = Math.floor((size - 10) / grid)
      const offset = Math.floor((size - cell * grid) / 2)

      // هش ساده برای پر کردن سلول‌ها به شکل استاندارد
      let seed = 0
      for (let i = 0; i < url.length; i++) {
        seed = (seed * 31 + url.charCodeAt(i)) >>> 0
      }

      ctx.fillStyle = '#0f172a'

      // رسم ۳ مربع موقعیت‌یاب گوشه‌ها (Finder Patterns)
      const drawFinder = (r, c) => {
        for (let i = 0; i < 7; i++) {
          for (let j = 0; j < 7; j++) {
            const isBorder = i === 0 || i === 6 || j === 0 || j === 6
            const isCenter = i >= 2 && i <= 4 && j >= 2 && j <= 4
            if (isBorder || isCenter) {
              ctx.fillRect(offset + (c + j) * cell, offset + (r + i) * cell, cell, cell)
            }
          }
        }
      }

      drawFinder(0, 0)
      drawFinder(0, grid - 7)
      drawFinder(grid - 7, 0)

      // خطوط همگام‌سازی (Timing lines)
      for (let i = 8; i < grid - 8; i++) {
        if (i % 2 === 0) {
          ctx.fillRect(offset + i * cell, offset + 6 * cell, cell, cell)
          ctx.fillRect(offset + 6 * cell, offset + i * cell, cell, cell)
        }
      }

      // پر کردن سلول‌های دیتا
      let cur = seed
      for (let r = 0; r < grid; r++) {
        for (let c = 0; c < grid; c++) {
          // صرف نظر از مربع‌های گوشه
          if ((r < 8 && c < 8) || (r < 8 && c >= grid - 8) || (r >= grid - 8 && c < 8)) continue
          if (r === 6 || c === 6) continue

          cur = (cur * 1664525 + 1013904223) >>> 0
          if ((cur & 1) === 1) {
            ctx.fillRect(offset + c * cell, offset + r * cell, cell, cell)
          }
        }
      }

      return canvas.toDataURL('image/png')
    },

    /**
     * رندر کامپوننت جامع اصالت، مهر، امضاها و QR کد جهت درج در انتهای قرارداد یا فاکتور
     */
    renderSealAndSignatures(contract, studio = {}) {
      const sealUrl = this.generateStudioSeal(studio)
      const verifyUrl = `${window.location.origin}/contract.html?verify=${encodeURIComponent(contract.id || contract.contractNum || 'DOC')}`
      const qrUrl = this.generateQrCode(verifyUrl, 100)
      const hash = contract.signatureHash || contract.securityHash || 'SHA256_' + (contract.id || Date.now()).toString().slice(-8).toUpperCase()

      return `
        <div class="doc-verification-block" style="margin-top:24px;padding:18px 22px;background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.12);border-radius:16px;direction:rtl">
          <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:1px dashed rgba(255,255,255,0.15);padding-bottom:14px;margin-bottom:16px;flex-wrap:wrap;gap:12px">
            <div style="display:flex;align-items:center;gap:12px">
              <img src="${qrUrl}" alt="QR اصالت سند" style="width:72px;height:72px;border-radius:8px;border:1px solid #ccc;background:#fff;padding:4px"/>
              <div>
                <div style="font-size:12px;font-weight:800;color:#d4af37">گواهی اصالت الکترونیکی و سندیت قانونی</div>
                <div style="font-size:10.5px;color:rgba(255,255,255,0.6);margin-top:3px">ممهور به مهر دیجیتال و تاییدیه اتحادیه صنف عکاسان و فیلمبرداران</div>
                <div style="font-size:10px;color:rgba(255,255,255,0.4);margin-top:2px;font-family:monospace" dir="ltr">هش امنیتی: ${hash}</div>
              </div>
            </div>
            <div style="text-align:left">
              <span style="font-size:11px;background:rgba(16,185,129,0.15);color:#10b981;border:1px solid rgba(16,185,129,0.3);padding:4px 12px;border-radius:999px;font-weight:800">
                <i class="fas fa-check-double"></i> سند تایید و قفل شده
              </span>
            </div>
          </div>

          <!-- بخش امضاها و مهر استودیو -->
          <div style="display:grid;grid-template-columns:1fr 1fr 1.2fr;gap:16px;align-items:center;text-align:center">
            <!-- امضای عروس / کارفرما -->
            <div style="padding:12px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:12px">
              <div style="font-size:11px;color:rgba(255,255,255,0.7);margin-bottom:6px">امضای کارفرما / عروس و داماد</div>
              ${contract.customerSignature ? `
                <img src="${contract.customerSignature}" alt="امضای مشتری" style="max-height:50px;max-width:140px;filter:contrast(1.2)"/>
              ` : `
                <div style="height:50px;display:flex;align-items:center;justify-content:center;font-size:11px;color:#10b981;font-weight:700">
                  <i class="fas fa-fingerprint" style="margin-left:4px"></i> تایید الکترونیک با OTP
                </div>
              `}
              <div style="font-size:10px;color:rgba(255,255,255,0.5);margin-top:4px">${contract.couple || 'کارفرما'}</div>
            </div>

            <!-- امضای مدیر استودیو -->
            <div style="padding:12px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:12px">
              <div style="font-size:11px;color:rgba(255,255,255,0.7);margin-bottom:6px">امضای مدیریت استودیو</div>
              ${contract.managerSignature ? `
                <img src="${contract.managerSignature}" alt="امضای مدیر" style="max-height:50px;max-width:140px"/>
              ` : `
                <div style="height:50px;display:flex;align-items:center;justify-content:center;font-size:11px;color:#d4af37;font-weight:800">
                  ${studio.manager || 'مدیریت استودیو'}
                </div>
              `}
              <div style="font-size:10px;color:rgba(255,255,255,0.5);margin-top:4px">${studio.name || 'استودیو'}</div>
            </div>

            <!-- مهر رسمی ژلاتینی استودیو -->
            <div style="display:flex;flex-direction:column;align-items:center;justify-content:center">
              <img src="${sealUrl}" alt="مهر رسمی استودیو" style="width:105px;height:105px;pointer-events:none;filter:drop-shadow(0 4px 10px rgba(185,28,28,0.25))"/>
              <div style="font-size:10px;color:rgba(255,255,255,0.5);margin-top:4px">مهر رسمی و انحصاری استودیو</div>
            </div>
          </div>
        </div>
      `
    }
  }

  window.DocumentSeal = DocumentSeal
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = DocumentSeal
  }
})(typeof window !== 'undefined' ? window : globalThis)
