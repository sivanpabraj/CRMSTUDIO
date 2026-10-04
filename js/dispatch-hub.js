/* ═══════════════════════════════════════════════════════════════════
   DispatchHub — سامانه هوشمند ارسال چندکاناله قراردادها و اعلانات
   پشتیبانی همزمان از:
   ۱. ارسال ایمیل رسمی (HTML Email via SMTP)
   ۲. ارسال فوری در پیام‌رسان‌ها (واتساپ، ایتا، بله، تلگرام)
   ۳. پرتال آنلاین مشتریان و پرسنل (In-App Contract & Digital Signature)
   ═══════════════════════════════════════════════════════════════════ */

const DispatchHub = {
  getStudioInfo() {
    return (typeof DB !== 'undefined' && DB.get ? DB.get('studioInfo') : null) || {
      name: 'استودیو فیلم و عکس ماندنی',
      phone: '09187766554',
      joinCode: 'MND-7821',
      address: 'کردستان، مریوان'
    }
  },

  getBaseUrl() {
    if (typeof window !== 'undefined' && window.location) {
      return `${window.location.origin}/app/`
    }
    return 'http://studiomandani.ir/app/'
  },

  /**
   * ساخت محتوای متنی تمیز و جذاب برای پیام‌رسان‌ها
   */
  buildContractShareContent(contract) {
    const studio = this.getStudioInfo()
    const couple = contract.couple || `${contract.bride || ''} و ${contract.groom || ''}`.trim() || 'عروس و داماد گرامی'
    const num = contract.contractNum || contract.id || '—'
    const date = contract.eventDate || contract.date || '—'
    const total = Number(contract.total || contract.finalAmount || 0)
    const deposit = Number(contract.deposit || 0)
    const remaining = Math.max(0, total - deposit)
    const portalUrl = `${this.getBaseUrl()}customer.html?contract=${encodeURIComponent(contract.id || num)}`

    const text = `🌸 با سلام و تبریک فراوان خدمت شما زوج گرامی، «${couple}»\n` +
      `قرارداد رسمی تصویربرداری و عکاسی شما در «${studio.name}» با موفقیت تنظیم و ثبت گردید.\n\n` +
      `📋 شماره قرارداد: ${num}\n` +
      `📅 تاریخ مراسم: ${date}\n` +
      `💰 مبلغ کل: ${Number(total).toLocaleString('fa-IR')} تومان\n` +
      `💵 بیعانه دریافتی: ${Number(deposit).toLocaleString('fa-IR')} تومان\n` +
      `⏳ مانده حساب: ${Number(remaining).toLocaleString('fa-IR')} تومان\n\n` +
      `جهت مطالعه کلیه تعهدات، مفاد قانونی و تایید و امضای دیجیتال قرارداد، روی لینک زیر کلیک فرمایید:\n` +
      `🔗 ${portalUrl}\n\n` +
      `📱 راهنمای ورود به پرتال اختصاصی:\n` +
      `• نام کاربری: شماره موبایل شما\n` +
      `• رمز عبور: شماره قرارداد (${num})\n\n` +
      `با آرزوی زیباترین لحظات — ${studio.name}`

    return { couple, num, date, total, deposit, remaining, portalUrl, text }
  },

  /**
   * ساخت قالب HTML لوکس ایمیل قرارداد
   */
  buildContractEmailHtml(contract) {
    const studio = this.getStudioInfo()
    const info = this.buildContractShareContent(contract)

    return `
      <!DOCTYPE html>
      <html lang="fa" dir="rtl">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>قرارداد رسمی #${info.num} — ${studio.name}</title>
      </head>
      <body style="margin:0;padding:24px 10px;background-color:#0B0B0E;font-family:Tahoma, 'Segoe UI', sans-serif;direction:rtl;text-align:right;color:#E5E7EB;">
        <table align="center" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width:620px;background:linear-gradient(180deg,#141419 0%,#0F0F14 100%);border-radius:18px;border:1px solid rgba(245,158,11,0.25);overflow:hidden;box-shadow:0 12px 36px rgba(0,0,0,0.6);">
          <!-- Header -->
          <tr>
            <td style="padding:28px 24px;text-align:center;background:linear-gradient(135deg,rgba(245,158,11,0.12) 0%,rgba(255,85,0,0.08) 100%);border-bottom:1px solid rgba(255,255,255,0.08);">
              <div style="font-size:26px;margin-bottom:6px;">💒</div>
              <h1 style="margin:0;font-size:20px;color:#F59E0B;font-weight:800;letter-spacing:-0.5px;">${studio.name}</h1>
              <p style="margin:6px 0 0;font-size:12px;color:rgba(255,255,255,0.6);">قرارداد رسمی خدمات سینمایی، عکاسی و مستندسازی مراسم</p>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:28px 24px;">
              <p style="font-size:15px;line-height:1.7;color:#FFFFFF;margin-top:0;">
                با سلام و شادباش فراوان،<br>
                قرارداد رسمی شما زوج محترم، <strong>${info.couple}</strong>، در سامانه هوشمند استودیو تنظیم گردیده است.
              </p>

              <!-- Contract Box -->
              <table width="100%" cellpadding="10" cellspacing="0" style="margin:20px 0;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:12px;font-size:13px;color:#D1D5DB;">
                <tr>
                  <td width="35%" style="border-bottom:1px solid rgba(255,255,255,0.05);color:#9CA3AF;">شماره قرارداد:</td>
                  <td style="border-bottom:1px solid rgba(255,255,255,0.05);font-weight:bold;color:#F59E0B;" dir="ltr">${info.num}</td>
                </tr>
                <tr>
                  <td style="border-bottom:1px solid rgba(255,255,255,0.05);color:#9CA3AF;">تاریخ برگزاری مراسم:</td>
                  <td style="border-bottom:1px solid rgba(255,255,255,0.05);font-weight:bold;" dir="ltr">${info.date}</td>
                </tr>
                <tr>
                  <td style="border-bottom:1px solid rgba(255,255,255,0.05);color:#9CA3AF;">مبلغ کل قرارداد:</td>
                  <td style="border-bottom:1px solid rgba(255,255,255,0.05);font-weight:bold;">${Number(info.total).toLocaleString('fa-IR')} تومان</td>
                </tr>
                <tr>
                  <td style="border-bottom:1px solid rgba(255,255,255,0.05);color:#9CA3AF;">بیعانه پرداخت‌شده:</td>
                  <td style="border-bottom:1px solid rgba(255,255,255,0.05);color:#10B981;font-weight:bold;">${Number(info.deposit).toLocaleString('fa-IR')} تومان</td>
                </tr>
                <tr>
                  <td style="color:#9CA3AF;">مانده حساب:</td>
                  <td style="font-weight:bold;color:${info.remaining <= 0 ? '#10B981' : '#F59E0B'};">${Number(info.remaining).toLocaleString('fa-IR')} تومان</td>
                </tr>
              </table>

              <!-- CTA Button -->
              <div style="text-align:center;margin:32px 0 20px;">
                <a href="${info.portalUrl}" target="_blank" style="display:inline-block;padding:14px 32px;background:linear-gradient(135deg,#FF5500 0%,#E85A19 100%);color:#FFFFFF;text-decoration:none;font-weight:bold;font-size:14px;border-radius:10px;box-shadow:0 6px 20px rgba(255,85,0,0.35);">
                  📜 مشاهده و امضای آنلاین قرارداد (می‌پذیرم)
                </a>
              </div>

              <!-- Login Instruction Box -->
              <div style="background:rgba(245,158,11,0.08);border:1px dashed rgba(245,158,11,0.3);border-radius:10px;padding:14px 16px;font-size:12px;line-height:1.7;color:#FDE68A;">
                <strong>💡 راهنمای ورود به پرتال اختصاصی:</strong><br>
                شما می‌توانید در هر زمان با شماره موبایل ثبت‌شده خود و شماره قرارداد (<strong>${info.num}</strong>) به عنوان رمز عبور، به پرتال مراجعه کرده و روند پیشرفت پروژه، تدوین فیلم، تحویل راش‌ها و تاییدیه قرارداد را پیگیری فرمایید.
              </div>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:18px 24px;background:rgba(0,0,0,0.3);text-align:center;border-top:1px solid rgba(255,255,255,0.05);font-size:11px;color:rgba(255,255,255,0.4);">
              این پیام به صورت سیستمی و خودکار توسط اتوماسیون ${studio.name} ارسال شده است.
            </td>
          </tr>
        </table>
      </body>
      </html>
    `
  },

  /**
   * ارسال ایمیل از طریق سرور اختصاصی
   */
  async sendEmail(to, subject, html, text) {
    try {
      const res = await fetch('/api/email/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to, subject, html, text })
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.ok) {
        return { ok: false, error: data.error || 'خطا در ارسال ایمیل' }
      }
      return { ok: true, queued: !!data.queued, messageId: data.messageId }
    } catch (e) {
      return { ok: false, error: e.message || 'عدم اتصال به سرور ارسال ایمیل' }
    }
  },

  openWhatsApp(phone, text) {
    let clean = String(phone || '').replace(/[^0-9]/g, '')
    if (clean.startsWith('09')) clean = '98' + clean.slice(1)
    else if (clean.startsWith('9')) clean = '98' + clean
    const url = `https://api.whatsapp.com/send?phone=${clean}&text=${encodeURIComponent(text)}`
    window.open(url, '_blank')
  },

  openEitaa(portalUrl, text) {
    const url = `https://eitaa.com/share/url?url=${encodeURIComponent(portalUrl)}&text=${encodeURIComponent(text)}`
    window.open(url, '_blank')
  },

  openBale(portalUrl, text) {
    const url = `https://ble.ir/share/compile?text=${encodeURIComponent(text + '\n' + portalUrl)}`
    window.open(url, '_blank')
  },

  openTelegram(portalUrl, text) {
    const url = `https://t.me/share/url?url=${encodeURIComponent(portalUrl)}&text=${encodeURIComponent(text)}`
    window.open(url, '_blank')
  },

  copyToClipboard(text, successMsg = 'متن با موفقیت کپی شد ✓') {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => {
        if (typeof Utils !== 'undefined' && Utils.toast) Utils.toast(successMsg, 'success')
        else alert(successMsg)
      }).catch(() => {
        this._fallbackCopy(text, successMsg)
      })
    } else {
      this._fallbackCopy(text, successMsg)
    }
  },

  _fallbackCopy(text, successMsg) {
    const t = document.createElement('textarea')
    t.value = text
    document.body.appendChild(t)
    t.select()
    try {
      document.execCommand('copy')
      if (typeof Utils !== 'undefined' && Utils.toast) Utils.toast(successMsg, 'success')
      else alert(successMsg)
    } catch {
      prompt('متن را کپی کنید:', text)
    }
    document.body.removeChild(t)
  },

  /**
   * نمایش مودال جامع ارسال ۳ کاناله قرارداد
   */
  showContractShareModal(contract) {
    const info = this.buildContractShareContent(contract)
    const phone = contract.phoneGroom || contract.phoneBride || contract.groomPhone || contract.phone || ''
    const email = contract.email || contract.customerEmail || ''

    // ساخت دیالوگ
    const modalId = 'dispatch-hub-modal'
    document.getElementById(modalId)?.remove()

    const modal = document.createElement('div')
    modal.id = modalId
    modal.className = 'dispatch-modal-backdrop'
    modal.style.cssText = `
      position:fixed;top:0;left:0;right:0;bottom:0;
      background:rgba(0,0,0,0.85);backdrop-filter:blur(10px);
      z-index:99999;display:flex;align-items:center;justify-content:center;
      padding:16px;direction:rtl;font-family:Vazirmatn,sans-serif;
    `

    modal.innerHTML = `
      <div style="background:#131317;border:1px solid rgba(245,158,11,0.3);border-radius:18px;max-width:540px;width:100%;box-shadow:0 24px 60px rgba(0,0,0,0.7);overflow:hidden;color:#fff">
        <!-- Header -->
        <div style="padding:16px 20px;background:linear-gradient(135deg,rgba(245,158,11,0.15) 0%,rgba(20,20,24,0.9) 100%);border-bottom:1px solid rgba(255,255,255,0.08);display:flex;justify-content:space-between;align-items:center">
          <div>
            <div style="font-weight:800;font-size:15px;color:#F59E0B;display:flex;align-items:center;gap:8px">
              <i class="fas fa-paper-plane"></i>
              <span>ارسال هوشمند قرارداد #${info.num}</span>
            </div>
            <div style="font-size:11.5px;color:rgba(255,255,255,0.6);margin-top:2px">
              مشتری: <strong>${info.couple}</strong> · تاریخ مراسم: ${info.date}
            </div>
          </div>
          <button type="button" onclick="document.getElementById('${modalId}').remove()" style="background:none;border:none;color:rgba(255,255,255,0.6);font-size:18px;cursor:pointer;padding:4px 8px">&times;</button>
        </div>

        <!-- Body Tabs -->
        <div style="padding:20px;">
          <!-- Channel 1: Instant Messengers -->
          <div style="margin-bottom:20px;padding:14px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:12px">
            <div style="font-weight:700;font-size:13px;color:#10b981;margin-bottom:8px;display:flex;align-items:center;gap:6px">
              <i class="fab fa-whatsapp"></i> کانال ۱: ارسال سریع در پیام‌رسان‌ها (با ۱ کلیک — بدون هزینه SMS)
            </div>
            <p style="font-size:11.5px;color:rgba(255,255,255,0.65);margin:0 0 12px;line-height:1.6">
              متن کامل قرارداد و لینک مستقیم تاییدیه در پیام‌رسان باز شده و بلافاصله برای مشتری ارسال می‌گردد:
            </p>
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:8px">
              <button type="button" class="portal-btn" style="background:#25D366;color:#fff;border:none;padding:9px 12px;border-radius:8px;font-weight:700;font-size:12px;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px" onclick="DispatchHub.openWhatsApp('${phone}', \`${info.text.replace(/`/g, '\\`')}\`)">
                <i class="fab fa-whatsapp"></i> واتساپ
              </button>
              <button type="button" class="portal-btn" style="background:#e07e2a;color:#fff;border:none;padding:9px 12px;border-radius:8px;font-weight:700;font-size:12px;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px" onclick="DispatchHub.openEitaa('${info.portalUrl}', \`${info.text.replace(/`/g, '\\`')}\`)">
                <i class="fas fa-comment-dots"></i> ایتا
              </button>
              <button type="button" class="portal-btn" style="background:#1b74e4;color:#fff;border:none;padding:9px 12px;border-radius:8px;font-weight:700;font-size:12px;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px" onclick="DispatchHub.openBale('${info.portalUrl}', \`${info.text.replace(/`/g, '\\`')}\`)">
                <i class="fas fa-paper-plane"></i> بله
              </button>
              <button type="button" class="portal-btn" style="background:#229ED9;color:#fff;border:none;padding:9px 12px;border-radius:8px;font-weight:700;font-size:12px;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px" onclick="DispatchHub.openTelegram('${info.portalUrl}', \`${info.text.replace(/`/g, '\\`')}\`)">
                <i class="fab fa-telegram-plane"></i> تلگرام
              </button>
            </div>
            <div style="margin-top:10px;text-align:left">
              <button type="button" style="background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.12);color:#fff;padding:6px 12px;border-radius:6px;font-size:11.5px;cursor:pointer" onclick="DispatchHub.copyToClipboard(\`${info.text.replace(/`/g, '\\`')}\`, 'متن قرارداد و لینک کپی شد ✓')">
                <i class="fas fa-copy"></i> کپی کامل متن و لینک
              </button>
            </div>
          </div>

          <!-- Channel 2: Email -->
          <div style="margin-bottom:20px;padding:14px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:12px">
            <div style="font-weight:700;font-size:13px;color:#38bdf8;margin-bottom:8px;display:flex;align-items:center;gap:6px">
              <i class="fas fa-envelope"></i> کانال ۲: ارسال نسخه رسمی به ایمیل (لوکس و رایگان)
            </div>
            <div style="display:flex;gap:8px;margin-bottom:8px">
              <input type="email" id="share-target-email" class="ltr" dir="ltr" value="${email}" placeholder="client@gmail.com" style="flex:1;background:rgba(0,0,0,0.4);border:1px solid rgba(255,255,255,0.15);padding:8px 12px;border-radius:8px;color:#fff;font-size:12.5px" />
              <button type="button" id="btn-send-email-action" class="portal-btn portal-btn-primary" style="background:#0284c7;color:#fff;border:none;padding:8px 14px;border-radius:8px;font-weight:700;font-size:12px;cursor:pointer;white-space:nowrap" onclick="DispatchHub.triggerEmailDispatch('${contract.id}')">
                <i class="fas fa-paper-plane"></i> ارسال ایمیل
              </button>
            </div>
            <div id="share-email-status" style="font-size:11.5px;display:none"></div>
          </div>

          <!-- Channel 3: In-App Customer Portal -->
          <div style="padding:14px;background:rgba(245,158,11,0.05);border:1px solid rgba(245,158,11,0.2);border-radius:12px">
            <div style="font-weight:700;font-size:13px;color:#f59e0b;margin-bottom:6px;display:flex;align-items:center;gap:6px">
              <i class="fas fa-laptop-code"></i> کانال ۳: ورود به پرتال مشتری (In-App)
            </div>
            <div style="font-size:12px;color:rgba(255,255,255,0.8);line-height:1.7">
              مشتری می‌تواند در هر زمان مستقیماً با اطلاعات زیر وارد شود:<br>
              • آدرس پرتال: <strong dir="ltr"><a href="${info.portalUrl}" target="_blank" style="color:#F59E0B">${info.portalUrl}</a></strong><br>
              • شماره تماس: <strong dir="ltr">${phone || 'شماره ثبت‌شده در فرم'}</strong><br>
              • رمز عبور مشتری: <strong dir="ltr">${info.num}</strong>
            </div>
          </div>
        </div>

        <!-- Footer -->
        <div style="padding:12px 20px;background:rgba(0,0,0,0.25);border-top:1px solid rgba(255,255,255,0.06);display:flex;justify-content:flex-end">
          <button type="button" class="portal-btn" onclick="document.getElementById('${modalId}').remove()" style="background:rgba(255,255,255,0.08);color:#fff;border:none;padding:8px 18px;border-radius:8px;font-size:12px;cursor:pointer">
            بستن پنجره
          </button>
        </div>
      </div>
    `

    document.body.appendChild(modal)
  },

  async triggerEmailDispatch(contractId) {
    const input = document.getElementById('share-target-email')
    const email = input?.value?.trim()
    const statusEl = document.getElementById('share-email-status')
    const btn = document.getElementById('btn-send-email-action')

    if (!email || !email.includes('@')) {
      if (statusEl) {
        statusEl.innerHTML = '<span style="color:#ef4444">لطفاً آدرس ایمیل معتبر وارد کنید</span>'
        statusEl.style.display = 'block'
      }
      return
    }

    const contract = (typeof DB !== 'undefined' && DB.find ? DB.find('contracts', c => c.id === contractId) : null)
    if (!contract) return

    if (btn) {
      btn.disabled = true
      btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> ارسال...'
    }

    const html = this.buildContractEmailHtml(contract)
    const studio = this.getStudioInfo()
    const subject = `قرارداد رسمی #${contract.contractNum || contract.id} — ${studio.name}`

    const res = await this.sendEmail(email, subject, html)
    if (btn) {
      btn.disabled = false
      btn.innerHTML = '<i class="fas fa-paper-plane"></i> ارسال ایمیل'
    }

    if (statusEl) {
      if (res.ok) {
        statusEl.innerHTML = `<span style="color:#10b981"><i class="fas fa-check-circle"></i> ${res.queued ? 'ایمیل در صف تحویل قرار گرفت' : 'ایمیل با موفقیت ارسال شد ✓'}</span>`
        if (typeof Utils !== 'undefined' && Utils.toast) Utils.toast('ایمیل قرارداد ارسال شد', 'success')
      } else {
        statusEl.innerHTML = `<span style="color:#ef4444">${res.error || 'خطا در ارسال ایمیل'}</span>`
      }
      statusEl.style.display = 'block'
    }
  },

  /**
   * نمایش مودال دعوت همکار و پرسنل با ۳ روش
   */
  showStaffInviteModal(user, joinCode) {
    const studio = this.getStudioInfo()
    const jCode = joinCode || studio.joinCode || 'MND-7821'
    const name = user.name || 'همکار گرامی'
    const phone = user.phone || ''
    const loginUrl = `${this.getBaseUrl()}index.html`

    const text = `🌸 سلام و وقت‌بخیر ${name} عزیز\n` +
      `دعوت‌نامه رسمی همکاری شما در «${studio.name}» صادر گردید.\n\n` +
      `🔑 کد اختصاصی اتصال به استودیو: ${jCode}\n` +
      `📱 نام کاربری / موبایل: ${phone}\n` +
      `🔗 ورود به پرتال پرسنل:\n${loginUrl}\n\n` +
      `جهت مشاهده تایم‌لاین مراسم، آفیش‌ها و امضای تفاهم‌نامه همکاری، با کد بالا وارد شوید.\n` +
      `— مدیریت ${studio.name}`

    const modalId = 'staff-invite-modal'
    document.getElementById(modalId)?.remove()

    const modal = document.createElement('div')
    modal.id = modalId
    modal.className = 'dispatch-modal-backdrop'
    modal.style.cssText = `
      position:fixed;top:0;left:0;right:0;bottom:0;
      background:rgba(0,0,0,0.85);backdrop-filter:blur(10px);
      z-index:99999;display:flex;align-items:center;justify-content:center;
      padding:16px;direction:rtl;font-family:Vazirmatn,sans-serif;
    `

    modal.innerHTML = `
      <div style="background:#131317;border:1px solid rgba(255,85,0,0.3);border-radius:18px;max-width:520px;width:100%;box-shadow:0 24px 60px rgba(0,0,0,0.7);overflow:hidden;color:#fff">
        <div style="padding:16px 20px;background:linear-gradient(135deg,rgba(255,85,0,0.15) 0%,rgba(20,20,24,0.9) 100%);border-bottom:1px solid rgba(255,255,255,0.08);display:flex;justify-content:space-between;align-items:center">
          <div style="font-weight:800;font-size:15px;color:#FF5500;display:flex;align-items:center;gap:8px">
            <i class="fas fa-user-plus"></i>
            <span>دعوت‌نامه پرسنل — ${name}</span>
          </div>
          <button type="button" onclick="document.getElementById('${modalId}').remove()" style="background:none;border:none;color:rgba(255,255,255,0.6);font-size:18px;cursor:pointer">&times;</button>
        </div>
        <div style="padding:20px;">
          <!-- Join code highlight -->
          <div style="text-align:center;padding:16px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.1);border-radius:12px;margin-bottom:16px">
            <span style="font-size:12px;color:rgba(255,255,255,0.65);display:block;margin-bottom:4px">کد اختصاصی اتصال به این استودیو:</span>
            <div style="font-size:26px;font-weight:900;letter-spacing:4px;color:#F59E0B;font-family:monospace" dir="ltr">${jCode}</div>
          </div>

          <div style="font-weight:700;font-size:12.5px;margin-bottom:8px;color:#10b981">ارسال سریع به پرسنل در پیام‌رسان:</div>
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:8px;margin-bottom:16px">
            <button type="button" class="portal-btn" style="background:#25D366;color:#fff;border:none;padding:9px;border-radius:8px;font-size:12px;cursor:pointer" onclick="DispatchHub.openWhatsApp('${phone}', \`${text.replace(/`/g, '\\`')}\`)">
              <i class="fab fa-whatsapp"></i> واتساپ
            </button>
            <button type="button" class="portal-btn" style="background:#e07e2a;color:#fff;border:none;padding:9px;border-radius:8px;font-size:12px;cursor:pointer" onclick="DispatchHub.openEitaa('${loginUrl}', \`${text.replace(/`/g, '\\`')}\`)">
              <i class="fas fa-comment-dots"></i> ایتا
            </button>
            <button type="button" class="portal-btn" style="background:#229ED9;color:#fff;border:none;padding:9px;border-radius:8px;font-size:12px;cursor:pointer" onclick="DispatchHub.openTelegram('${loginUrl}', \`${text.replace(/`/g, '\\`')}\`)">
              <i class="fab fa-telegram-plane"></i> تلگرام
            </button>
          </div>

          <div style="display:flex;gap:8px">
            <button type="button" style="flex:1;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.12);color:#fff;padding:8px 12px;border-radius:8px;font-size:12px;cursor:pointer" onclick="DispatchHub.copyToClipboard('${jCode}', 'کد اختصاصی کپی شد ✓')">
              <i class="fas fa-key"></i> کپی کد اتصال
            </button>
            <button type="button" style="flex:1;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.12);color:#fff;padding:8px 12px;border-radius:8px;font-size:12px;cursor:pointer" onclick="DispatchHub.copyToClipboard(\`${text.replace(/`/g, '\\`')}\`, 'متن کامل دعوت کپی شد ✓')">
              <i class="fas fa-copy"></i> کپی متن پیام
            </button>
          </div>
        </div>
      </div>
    `
    document.body.appendChild(modal)
  }
}

if (typeof window !== 'undefined') {
  window.DispatchHub = DispatchHub
}
