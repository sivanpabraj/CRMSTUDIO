/**
 * CRMSTUDIO — Online Booking & Interactive Jalali Calendar Engine
 * سیستم رزرواسیون آنلاین، انتخاب شاخه و خدمات، محاسبه ساعت طلایی و پرداخت بیعانه
 */

(function (window) {
  'use strict'

  function getDB() {
    if (typeof DB !== 'undefined') return DB
    if (typeof window !== 'undefined' && window.DB) return window.DB
    return null
  }

  const OnlineBooking = {
    BRANCHES: {
      wedding: {
        id: 'wedding',
        title: 'عروسی، عقد و فرمالیته',
        emoji: '💒',
        icon: 'fa-ring',
        basePrice: 15000000,
        depositRate: 0.20,
        defaultDuration: '۵ الی ۸ ساعت',
        packages: [
          { id: 'pkg_wed_standard', name: 'پکیج استاندارد مراسم', price: 15000000, desc: 'تصویربرداری 4K، یک دوربین، تدوین کامل، عکس سرمجلسی' },
          { id: 'pkg_wed_vip', name: 'پکیج VIP لوکس فرمالیته + تالار', price: 28000000, desc: 'دو دوربین 4K، هلی‌شات، آلبوم ایتالیایی نفیس، تحویل مستر خام' },
          { id: 'pkg_wed_royal', name: 'پکیج سلطنتی Royal فرمالیته شمال/جنوب', price: 45000000, desc: 'تیم کامل، کرین، هلی‌شات، اصلاح رنگ داوینچی، ۲ آلبوم ژورنال و ریلز' }
        ],
        addons: [
          { id: 'add_drone', name: 'تصویربرداری هوایی هلی‌شات (Drone 4K)', price: 3500000 },
          { id: 'add_reels', name: 'پکیج ۳ عدد ریلز و کلیپ عمودی اینستاگرام', price: 2200000 },
          { id: 'add_express', name: 'تحویل اکسپرس فوری (۴۸ ساعته)', price: 4000000 }
        ]
      },
      newborn_kids: {
        id: 'newborn_kids',
        title: 'کودک، نوزاد و جشن تولد',
        emoji: '👶',
        icon: 'fa-baby',
        basePrice: 2800000,
        depositRate: 0.25,
        defaultDuration: '۱ الی ۲ ساعت',
        packages: [
          { id: 'pkg_kid_standard', name: 'پکیج آتلیه تم کودک', price: 2800000, desc: '۵ فایل رتوش‌شده، ۲ تم دکور تولد، چاپ ۲ عدد عکس روی شاسی' },
          { id: 'pkg_kid_vip', name: 'پکیج VIP آتلیه + فتوبوک ژورنال', price: 5500000, desc: '۱۰ فایل ادیت‌شده، آلبوم ژورنال ۲۰×۴۰ با طراحی اختصاصی، ویدیو کلیپ کوتاه' }
        ],
        addons: [
          { id: 'add_cake', name: 'تم اختصاصی کیک و تولد با اکسسوری استریل', price: 900000 },
          { id: 'add_reels_kid', name: 'ریلز شاد اینستاگرامی با موزیک تولد', price: 1200000 }
        ]
      },
      maternity: {
        id: 'maternity',
        title: 'بارداری و تعیین جنسیت',
        emoji: '🤰',
        icon: 'fa-heart',
        basePrice: 3200000,
        depositRate: 0.25,
        defaultDuration: '۱.۵ ساعت',
        packages: [
          { id: 'pkg_mat_standard', name: 'پکیج پرتره بارداری آتلیه', price: 3200000, desc: '۶ فایل با رتوش تخصصی پوست و نورپردازی ملایم' },
          { id: 'pkg_mat_vip', name: 'پکیج VIP بارداری + کلیپ تعیین جنسیت', price: 6800000, desc: 'عکاسی در باغ اختصاصی، ۱۰ فایل ادیت‌شده، کلیپ تیزر تعیین جنسیت' }
        ],
        addons: [
          { id: 'add_gown', name: 'لباس بارداری حریر و اکسسوری ژورنال استودیو', price: 800000 },
          { id: 'add_chasi_mat', name: 'چاپ عکس ماندگار سرمجلسی ۵۰×۷۰', price: 950000 }
        ]
      },
      modeling: {
        id: 'modeling',
        title: 'مدلینگ، پرتره شخصی و فشن',
        emoji: '📸',
        icon: 'fa-camera',
        basePrice: 2500000,
        depositRate: 0.30,
        defaultDuration: '۱ الی ۲ ساعت',
        packages: [
          { id: 'pkg_mod_standard', name: 'پکیج پرتره استودیویی و پرسونال برندینگ', price: 2500000, desc: '۵ شات رتوش مجله‌ای فرکانسی، نورپردازی های‌کی/لو‌کی' },
          { id: 'pkg_mod_fashion', name: 'پکیج فشن فضای باز / لوکیشن خیابانی', price: 4800000, desc: '۱۰ شات مستر، اصلاح رنگ سینمایی، استوری‌بورد استایلینگ' }
        ],
        addons: [
          { id: 'add_lighting', name: 'ست نورپردازی پرتابل فضای باز Profoto', price: 1500000 },
          { id: 'add_reels_mod', name: 'تیزر عمودی ریلز ترنزیشن‌دار فشن', price: 1800000 }
        ]
      },
      commercial: {
        id: 'commercial',
        title: 'تیزر تجاری، تبلیغاتی و ریلز برند',
        emoji: '🎬',
        icon: 'fa-film',
        basePrice: 8000000,
        depositRate: 0.30,
        defaultDuration: '۳ الی ۶ ساعت',
        packages: [
          { id: 'pkg_com_reels', name: 'بسته ۳ عدد ریلز تجاری و معرفی محصول', price: 8000000, desc: 'فیلمبرداری 4K عمودی، نورپردازی تجاری، صداگذاری و زیرنویس' },
          { id: 'pkg_com_teaser', name: 'تیزر رسمی صنعتی برند و کارخانه', price: 18000000, desc: 'فیلمبرداری سینمایی با FX3، داوینچی ریزالو، نریشن و موشن‌گرافیک' }
        ],
        addons: [
          { id: 'add_narration', name: 'نریشن حرفه‌ای گوینده رادیو / تلویزیون', price: 2500000 },
          { id: 'add_drone_com', name: 'تصویربرداری هوایی از مجموعه و انبارها', price: 3000000 }
        ]
      }
    },

    TIME_SLOTS: [
      { id: 'morning', title: 'شیفت صبحگاهی', range: '۱۰:۰۰ الی ۱۳:۰۰', icon: 'fa-sun', desc: 'نور طبیعی آتلیه / جلسه اول' },
      { id: 'golden_hour', title: 'ساعت طلایی نور (عصر)', range: 'ساعت طلایی نور خورشید', icon: 'fa-cloud-sun', isGolden: true, desc: 'ایده‌آل‌ترین نور برای عکاسی رمانتیک و فضای باز' },
      { id: 'night', title: 'شیفت عصر و شب', range: '۱۸:۳۰ الی ۲۲:۳۰', icon: 'fa-moon', desc: 'مراسم تالار / عکاسی استودیویی با نورپردازی ویژه' }
    ],

    /**
     * وضعیت رزرو روزهای یک ماه جلالی را بررسی می‌کند
     */
    checkMonthAvailability(jy, jm) {
      const db = getDB()
      const bookings = (db && db.get ? db.get('bookings') : []) || []
      const contracts = (db && db.get ? db.get('contracts') : []) || []

      const pad = n => String(n).padStart(2, '0')
      const monthPrefix = `${jy}/${pad(jm)}/`

      const daysBusy = {}
      bookings.forEach(b => {
        if (b.date && b.date.startsWith(monthPrefix) && b.status !== 'cancelled') {
          daysBusy[b.date] = (daysBusy[b.date] || 0) + 1
        }
      })
      contracts.forEach(c => {
        const d = c.eventDate || c.date
        if (d && d.startsWith(monthPrefix) && c.status !== 'cancelled') {
          daysBusy[d] = (daysBusy[d] || 0) + 2
        }
      })

      return daysBusy
    },

    /**
     * اسلات‌های زمانی یک تاریخ مشخص را به همراه ساعت طلایی نور محاسبه می‌کند
     */
    getTimeSlotsForDate(dateStr, cityName = 'تهران') {
      let goldenTimeDesc = '۱۶:۳۰ الی ۱۷:۳۰'
      if (typeof window.GoldenHourWeather !== 'undefined' && window.GoldenHourWeather.calculateSolarTimes) {
        const solar = window.GoldenHourWeather.calculateSolarTimes(dateStr, cityName)
        if (solar && solar.goldenHourEve) {
          goldenTimeDesc = `${solar.goldenHourEve.start} الی ${solar.goldenHourEve.end}`
        }
      }

      return this.TIME_SLOTS.map(slot => {
        if (slot.isGolden) {
          return {
            ...slot,
            range: goldenTimeDesc,
            badge: '☀️ ساعت طلایی نور'
          }
        }
        return slot
      })
    },

    /**
     * محاسبه مبلغ کل و بیعانه
     */
    calculatePricing(branchId, packageId, selectedAddonIds = []) {
      const branch = this.BRANCHES[branchId] || this.BRANCHES.wedding
      const pkg = branch.packages.find(p => p.id === packageId) || branch.packages[0]

      let total = pkg.price
      const addons = []
      selectedAddonIds.forEach(addId => {
        const match = branch.addons.find(a => a.id === addId)
        if (match) {
          total += match.price
          addons.push(match)
        }
      })

      const deposit = Math.round(total * branch.depositRate)
      return {
        branch,
        package: pkg,
        addons,
        totalPrice: total,
        depositAmount: deposit,
        remainingAmount: total - deposit
      }
    },

    /**
     * ثبت رسمی رزرو در دیتابیس استودیو و تولید کارت رزرو
     */
    async submitBooking(data = {}) {
      const {
        branchId = 'wedding',
        packageId = '',
        addonIds = [],
        date = '',
        slotId = 'golden_hour',
        clientName = '',
        clientPhone = '',
        city = 'مریوان',
        notes = '',
        paymentMethod = 'online_gateway'
      } = data

      if (!clientName || !clientName.trim()) {
        return { ok: false, error: 'نام و نام‌خانوادگی مراجع الزامی است' }
      }
      if (!clientPhone || !window.Utils || !window.Utils.isValidPhone(clientPhone)) {
        return { ok: false, error: 'شماره موبایل وارد شده معتبر نیست (مثال: 09181234567)' }
      }
      if (!date) {
        return { ok: false, error: 'لطفاً تاریخ نوبت عکاسی را انتخاب نمایید' }
      }

      const pricing = this.calculatePricing(branchId, packageId, addonIds)
      const bookingCode = 'BK-' + (typeof window.Utils !== 'undefined' ? window.Utils.todayJalali().replace(/\//g, '').slice(2, 6) : '1405') + '-' + Math.floor(1000 + Math.random() * 9000)
      const bookingId = 'bk_' + Date.now()

      const slots = this.getTimeSlotsForDate(date, city)
      const selectedSlot = slots.find(s => s.id === slotId) || slots[0]

      const newBooking = {
        id: bookingId,
        code: bookingCode,
        title: `رزرو ${pricing.branch.title} — ${clientName}`,
        branch: branchId,
        branchTitle: pricing.branch.title,
        client: clientName.trim(),
        phone: window.Utils ? window.Utils.normalizePhone(clientPhone) : clientPhone,
        date,
        time: selectedSlot.range,
        timeSlot: selectedSlot.title,
        packageId: pricing.package.id,
        packageName: pricing.package.name,
        addons: pricing.addons.map(a => a.name),
        totalPrice: pricing.totalPrice,
        deposit: pricing.depositAmount,
        remaining: pricing.remainingAmount,
        city,
        notes: notes.trim(),
        paymentMethod,
        paymentStatus: 'pending',
        status: 'confirmed',
        source: 'online_booking',
        createdAt: new Date().toISOString()
      }

      // تلاش جهت همگام‌سازی ابری مستقیم با سرور استودیو
      try {
        if (typeof fetch !== 'undefined') {
          const sRes = await fetch('/api/public/booking', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              ...newBooking,
              clientName: newBooking.client,
              clientPhone: newBooking.phone
            })
          }).catch(() => null)
          if (sRes && sRes.ok) {
            const sData = await sRes.json().catch(() => null)
            if (sData && sData.booking) {
              newBooking.code = sData.code || newBooking.code
              newBooking.id = sData.booking.id || newBooking.id
            }
          }
        }
      } catch { /* آفلاین — ادامه ذخیره محلی */ }

      const db = getDB()
      if (typeof window.SecureDB !== 'undefined' && window.SecureDB.insert) {
        await window.SecureDB.insert('bookings', newBooking)
      } else if (db && db.insert) {
        db.insert('bookings', newBooking)
      }

      // افزودن خودکار به لیست سرنخ‌ها (leads) در صورت تمایل استودیو
      try {
        const lead = {
          id: 'lead_' + Date.now(),
          name: clientName.trim(),
          phone: newBooking.phone,
          category: branchId,
          stage: 'won',
          budget: pricing.totalPrice,
          eventDate: date,
          source: 'آنلاین',
          notes: `ثبت رزرو آنلاین ${bookingCode} — بیعانه: ${pricing.depositAmount.toLocaleString('fa-IR')} تومان`,
          createdAt: new Date().toISOString()
        }
        if (typeof window.SecureDB !== 'undefined' && window.SecureDB.insert) {
          await window.SecureDB.insert('leads', lead)
        } else if (db && db.insert) {
          db.insert('leads', lead)
        }
      } catch { /* skip lead if error */ }

      // لاگ سیستم
      if (db && db.log) {
        db.log('booking_created', `رزرو آنلاین ${bookingCode} برای ${clientName} در تاریخ ${date} ثبت گردید`)
      }

      return {
        ok: true,
        booking: newBooking,
        pricing
      }
    },

    /**
     * رندر کارت نهایی لوکس رزرو با مهر ژلاتینی و کد QR
     */
    renderBookingCard(booking, studio = {}) {
      const studioName = studio.name || (typeof window.DB !== 'undefined' && window.DB.get ? window.DB.get('studioInfo')?.name : null) || 'استودیو فیلم و عکس ماندنی'
      const qrData = `https://studiomandani.ir/booking?code=${booking.code}&client=${encodeURIComponent(booking.client)}`

      let qrHtml = ''
      let sealHtml = ''

      if (typeof window.DocumentSeal !== 'undefined') {
        const qrImg = window.DocumentSeal.generateQrCode(qrData, 120)
        qrHtml = `<img src="${qrImg}" alt="QR اصالت نوبت" style="width:90px;height:90px;border-radius:10px;border:1px solid rgba(255,255,255,0.15);background:#fff;padding:4px" />`

        const sealImg = window.DocumentSeal.generateStudioSeal(studio, { size: 130, colorScheme: 'crimson' })
        sealHtml = `<img src="${sealImg}" alt="مهر استودیو" style="width:110px;height:110px;transform:rotate(-8deg);filter:drop-shadow(0 4px 12px rgba(220,38,38,0.3))" />`
      }

      return `
        <div class="booking-pass-card" style="direction:rtl;text-align:right;background:linear-gradient(145deg,#12131a,#1a1b26);border:1px solid rgba(212,175,55,0.4);border-radius:24px;padding:28px;max-width:580px;margin:20px auto;box-shadow:0 24px 60px rgba(0,0,0,0.7);color:#f1f5f9;font-family:Vazirmatn,system-ui,sans-serif;position:relative;overflow:hidden">
          <div style="position:absolute;top:-40px;left:-40px;width:140px;height:140px;background:radial-gradient(circle,rgba(212,175,55,0.18),transparent 70%);border-radius:50%;pointer-events:none"></div>
          
          <div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:1px solid rgba(255,255,255,0.1);padding-bottom:18px;margin-bottom:20px">
            <div>
              <div style="display:inline-block;padding:3px 10px;border-radius:12px;background:rgba(212,175,55,0.15);color:#d4af37;font-size:11px;font-weight:700;margin-bottom:6px">
                کارت رسمی رزرواسیون استودیو
              </div>
              <h2 style="margin:0;font-size:1.35rem;font-weight:900;color:#f8fafc">${studioName}</h2>
              <div style="font-size:12px;color:#94a3b8;margin-top:4px">کد رهگیری نوبت: <strong dir="ltr" style="color:#d4af37;font-family:monospace;letter-spacing:1px">${booking.code}</strong></div>
            </div>
            <div style="text-align:center">
              ${qrHtml}
              <div style="font-size:10px;color:#94a3b8;margin-top:4px">اصالت‌سنجی دیجیتال</div>
            </div>
          </div>

          <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:16px;padding:16px;margin-bottom:20px">
            <div>
              <span style="font-size:11.5px;color:#94a3b8;display:block">نام و نام‌خانوادگی:</span>
              <strong style="font-size:14px;color:#fff">${booking.client}</strong>
            </div>
            <div>
              <span style="font-size:11.5px;color:#94a3b8;display:block">شماره تماس مراجع:</span>
              <strong dir="ltr" style="font-size:14px;color:#fff">${booking.phone}</strong>
            </div>
            <div>
              <span style="font-size:11.5px;color:#94a3b8;display:block">شاخه عکاسی و پکیج:</span>
              <strong style="font-size:13px;color:#38bdf8">${booking.branchTitle} (${booking.packageName})</strong>
            </div>
            <div>
              <span style="font-size:11.5px;color:#94a3b8;display:block">تاریخ و ساعت نوبت:</span>
              <strong style="font-size:13px;color:#4ade80">${booking.date} — ${booking.time}</strong>
            </div>
          </div>

          <div style="background:rgba(212,175,55,0.06);border:1px dashed rgba(212,175,55,0.3);border-radius:14px;padding:14px 18px;margin-bottom:20px;display:flex;justify-content:space-between;align-items:center">
            <div>
              <div style="font-size:12px;color:#cbd5e1">مبلغ بیعانه پرداخت شده:</div>
              <div style="font-size:1.25rem;font-weight:900;color:#d4af37">${Number(booking.deposit).toLocaleString('fa-IR')} <span style="font-size:12px;font-weight:normal">تومان</span></div>
            </div>
            <div style="text-align:left">
              <span style="display:inline-block;padding:4px 12px;border-radius:20px;background:rgba(74,222,128,0.15);color:#4ade80;font-size:11px;font-weight:700">
                <i class="fas fa-check-circle"></i> وضعیت: تأیید قطعی استودیو
              </span>
              <div style="font-size:11px;color:#94a3b8;margin-top:4px">مانده: ${Number(booking.remaining).toLocaleString('fa-IR')} تومان</div>
            </div>
          </div>

          <div style="display:flex;justify-content:space-between;align-items:center;padding-top:12px;border-top:1px solid rgba(255,255,255,0.08)">
            <div style="font-size:11px;color:#64748b;line-height:1.7;max-width:340px">
              📍 حضور به موقع در استودیو / لوکیشن مراسم الزامی است.<br>
              📞 پشتیبانی و تغییر احتمالی نوبت: ${studio.phone || '09181234567'}
            </div>
            <div style="text-align:center">
              ${sealHtml}
            </div>
          </div>
        </div>
      `
    }
  }

  window.OnlineBooking = OnlineBooking
})(typeof window !== 'undefined' ? window : globalThis)
