/**
 * CRMSTUDIO — Smart Lifecycle SMS Automation
 * سامانه اتوماسیون هوشمند پیامکی چرخه‌عمر مشتری و پرسنل:
 * ۱. یادآوری سررسید اقساط و مانده حساب با لینک پرداخت آنلاین درگاه شاپرک
 * ۲. یادآوری روز مراسم به عروس و داماد (ساعت، لوکیشن، توصیه‌ها)
 * ۳. یادآوری آفیش و ساعت حضور به عوامل اجرایی (عکاس، فیلمبردار، هلی‌شات)
 * ۴. تبریک خودکار سالگرد ازدواج با کد تخفیف اختصاصی استودیو
 */

(function (window) {
  'use strict'

  const SmartLifecycleSMS = {
    STORAGE_KEY: 'sent_lifecycle_sms_logs',

    /**
     * تنظیمات پیش‌فرض اتوماسیون استودیو
     */
    getConfig() {
      const db = typeof DB !== 'undefined' ? DB : (window.DB || null)
      const studio = (db && db.get ? db.get('studioInfo') : null) || {}
      const saved = (db && db.get ? db.get('lifecycleSmsSettings') : null) || {}

      return {
        enabled: saved.enabled !== false,
        installmentDaysBefore: Number(saved.installmentDaysBefore) || 3,
        shootDaysBefore: Number(saved.shootDaysBefore) || 1, // 1 روز قبل (فردا)
        enableInstallmentReminder: saved.enableInstallmentReminder !== false,
        enableShootCoupleReminder: saved.enableShootCoupleReminder !== false,
        enableShootCrewReminder: saved.enableShootCrewReminder !== false,
        enableAnniversaryCongrats: saved.enableAnniversaryCongrats !== false,
        anniversaryDiscountPercent: Number(saved.anniversaryDiscountPercent) || 20,
        studioName: studio.name || 'استودیو عکاسی و فیلم',
        studioPhone: studio.phone || '',
        ...saved
      }
    },

    saveConfig(cfg) {
      const db = typeof DB !== 'undefined' ? DB : (window.DB || null)
      if (db && db.set) {
        db.set('lifecycleSmsSettings', cfg)
      }
    },

    /**
     * لاگ پیامک‌های ارسالی برای جلوگیری از ارسال تکراری در یک روز
     */
    getLogs() {
      const db = typeof DB !== 'undefined' ? DB : (window.DB || null)
      if (db && db.get) {
        return db.get(this.STORAGE_KEY) || []
      }
      try {
        return JSON.parse(localStorage.getItem(this.STORAGE_KEY) || '[]')
      } catch {
        return []
      }
    },

    _recordLog(entry) {
      const db = typeof DB !== 'undefined' ? DB : (window.DB || null)
      const logs = this.getLogs()
      logs.unshift({
        id: 'lsms_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
        timestamp: new Date().toISOString(),
        dateFa: typeof Utils !== 'undefined' && Utils.todayJalali ? Utils.todayJalali() : '',
        ...entry
      })
      // نگهداری ۵۰۰ لاگ اخیر
      const trimmed = logs.slice(0, 500)
      if (db && db.set) {
        db.set(this.STORAGE_KEY, trimmed)
      }
      try {
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(trimmed))
      } catch { /* ignore */ }
    },

    _isAlreadySent(key) {
      const today = typeof Utils !== 'undefined' && Utils.todayJalali ? Utils.todayJalali() : new Date().toISOString().slice(0, 10)
      const logs = this.getLogs()
      return logs.some(l => l.key === key && (l.dateFa === today || (l.timestamp && l.timestamp.startsWith(today))))
    },

    /**
     * فرمت ۳ رقم ۳ رقم ارقام فارسی
     */
    _fmtNum(n) {
      const val = Number(n) || 0
      if (typeof Utils !== 'undefined' && Utils.fmtNum) return Utils.fmtNum(val)
      return val.toLocaleString('fa-IR')
    },

    /**
     * ۱. ساخت متن یادآوری قسط
     */
    buildInstallmentMessage(contract, balance, studio) {
      const couple = contract.couple || `${contract.bride || ''} و ${contract.groom || ''}`.trim() || 'مشتری گرامی'
      const invoiceUrl = typeof PaymentGateway !== 'undefined' && typeof PaymentGateway.createInvoiceUrl === 'function'
        ? PaymentGateway.createInvoiceUrl(contract.id)
        : (typeof PaymentGateway !== 'undefined' && typeof PaymentGateway.generateInvoiceUrl === 'function'
          ? PaymentGateway.generateInvoiceUrl(contract.id)
          : (typeof window !== 'undefined' && window.location ? window.location.origin + `/invoice.html?cid=${contract.id}` : `/invoice.html?cid=${contract.id}`))

      return `عروس و داماد گرامی «${couple}»\n` +
        `با سلام، یادآوری سررسید پرداخت قسط در استودیو ${studio.name}.\n` +
        `شماره پرونده: #${contract.contractNum || contract.id}\n` +
        `مانده حساب: ${this._fmtNum(balance)} تومان\n` +
        `پرداخت آنلاین و آنی از درگاه امن شاپرک:\n${invoiceUrl}\n` +
        `استودیو ${studio.name} · تلفن: ${studio.phone || ''}`
    },

    /**
     * ۲. ساخت متن یادآوری مراسم به عروس و داماد
     */
    buildShootCoupleMessage(contract, studio) {
      const couple = contract.couple || `${contract.bride || ''} و ${contract.groom || ''}`.trim() || 'عزیز'
      const venue = contract.venue || contract.location || 'لوکیشن اعلام شده'
      const time = contract.callTime || contract.startTime || 'طبق برنامه توافق‌شده'

      return `زوج گرامی «${couple}»؛ سلام و درود 🌸\n` +
        `به امید رقم خوردن باشکوه‌ترین و زیباترین لحظات زندگی مشترک شما!\n` +
        `یادآوری مراسم تصویربرداری فردا:\n` +
        `📅 تاریخ: ${contract.eventDate || contract.date || 'فردا'}\n` +
        `⏰ ساعت حضور: ${time}\n` +
        `📍 لوکیشن / تالار: ${venue}\n` +
        `تلفن هماهنگی سرپرست تصویربرداری: ${studio.phone || ''}\n` +
        `استودیو ${studio.name}`
    },

    /**
     * ۳. ساخت متن یادآوری آفیش به عوامل اجرایی
     */
    buildShootCrewMessage(personnel, contract, role, studio) {
      const couple = contract.couple || `${contract.bride || ''} و ${contract.groom || ''}`.trim() || 'مراسم'
      const venue = contract.venue || contract.location || 'لوکیشن'
      const time = contract.callTime || contract.startTime || 'به‌موقع'

      return `همکار گرامی «${personnel.name || 'عوامل اجرایی'}»\n` +
        `یادآوری آفیش فردا (${contract.eventDate || contract.date}):\n` +
        `🎬 پروژه: ${couple}\n` +
        `🎯 نقش شما: ${role || 'تصویربردار / عکاس'}\n` +
        `⏰ ساعت حضور: ${time}\n` +
        `📍 لوکیشن: ${venue}\n` +
        `لطفاً تجهیزات رزرو شده را در پنل عوامل چک نمایید.\n` +
        `استودیو ${studio.name}`
    },

    /**
     * ۴. ساخت متن تبریک سالگرد ازدواج
     */
    buildAnniversaryMessage(contract, studio, discountPercent) {
      const couple = contract.couple || `${contract.bride || ''} و ${contract.groom || ''}`.trim() || 'عزیز'
      const code = 'ANNIV-' + (contract.contractNum || contract.id || 'VIP').replace(/[^a-zA-Z0-9]/g, '')

      return `زوج پرمهر، «${couple}» گرامی 🌹\n` +
        `یک سال از زیباترین روز زندگی مشترک شما گذشت؛ سالگرد پیوندتان مبارک باد!\n` +
        `هدیه استودیو ${studio.name} به شما:\n` +
        `🎁 ${this._fmtNum(discountPercent)}٪ تخفیف عکاسی سالگرد با کد اختصاصی: ${code}\n` +
        `برای رزرو وقت سالگرد با ما تماس بگیرید: ${studio.phone || ''}\n` +
        `همواره شاد و عاشق باشید 💖`
    },

    /**
     * ارسال پیامک از طریق SmsProvider
     */
    async _sendSMS(phone, text) {
      if (!phone) return { ok: false, error: 'شماره تلفن خالی است' }
      if (typeof SmsProvider !== 'undefined' && SmsProvider.sendStudio) {
        return SmsProvider.sendStudio(phone, text)
      }
      return { ok: true, mocked: true }
    },

    /**
     * اسکن جامع کلیه قراردادها و پرسنل و اجرای اتوماسیون
     */
    async scanAndExecute(opts = {}) {
      const db = typeof DB !== 'undefined' ? DB : (window.DB || null)
      if (!db || !db.get) return { ok: false, error: 'دیتابیس در دسترس نیست' }

      const cfg = this.getConfig()
      if (!cfg.enabled && !opts.force) {
        return { ok: false, error: 'اتوماسیون پیامک در تنظیمات غیرفعال است' }
      }

      const studio = db.get('studioInfo') || {}
      const contracts = db.get('contracts') || []
      const persProjects = db.get('persProjects') || []
      const personnelList = db.get('personnel') || []
      const today = typeof Utils !== 'undefined' && Utils.todayJalali ? Utils.todayJalali() : ''

      const results = {
        scannedContracts: contracts.length,
        installmentsSent: 0,
        shootCoupleSent: 0,
        shootCrewSent: 0,
        anniversarySent: 0,
        skipped: 0,
        errors: []
      }

      // ۱. بررسی یادآوری اقساط و مانده حساب
      if (cfg.enableInstallmentReminder) {
        for (const c of contracts) {
          if (c.status === 'cancelled') continue
          const total = Number(c.total || c.finalAmount || 0)
          const paid = Number(c.paid || 0)
          const balance = Math.max(0, total - paid)
          if (balance <= 0) continue

          const phone = c.phoneBride || c.phoneGroom || c.phone
          if (!phone) continue

          // بررسی روزهای مانده به تاریخ مراسم یا قسط
          const targetDate = c.eventDate || c.date
          if (!targetDate) continue

          const daysLeft = typeof Utils !== 'undefined' && Utils.daysUntil ? Utils.daysUntil(targetDate) : null
          if (daysLeft !== null && daysLeft >= 0 && daysLeft <= cfg.installmentDaysBefore) {
            const key = `installment_${c.id}_${today}`
            if (!this._isAlreadySent(key)) {
              const text = this.buildInstallmentMessage(c, balance, studio)
              const res = await this._sendSMS(phone, text)
              if (res.ok) {
                results.installmentsSent++
                this._recordLog({
                  key,
                  type: 'installment',
                  contractId: c.id,
                  recipient: c.couple || `${c.bride || ''} و ${c.groom || ''}`,
                  phone,
                  text
                })
              } else {
                results.errors.push({ type: 'installment', contractId: c.id, error: res.error })
              }
            } else {
              results.skipped++
            }
          }
        }
      }

      // ۲. بررسی یادآوری مراسم به عروس و داماد
      if (cfg.enableShootCoupleReminder) {
        for (const c of contracts) {
          if (c.status === 'cancelled') continue
          const targetDate = c.eventDate || c.date
          if (!targetDate) continue

          const phone = c.phoneBride || c.phoneGroom || c.phone
          if (!phone) continue

          const daysLeft = typeof Utils !== 'undefined' && Utils.daysUntil ? Utils.daysUntil(targetDate) : null
          if (daysLeft !== null && daysLeft >= 0 && daysLeft <= cfg.shootDaysBefore) {
            const key = `shoot_couple_${c.id}_${today}`
            if (!this._isAlreadySent(key)) {
              const text = this.buildShootCoupleMessage(c, studio)
              const res = await this._sendSMS(phone, text)
              if (res.ok) {
                results.shootCoupleSent++
                this._recordLog({
                  key,
                  type: 'shoot_couple',
                  contractId: c.id,
                  recipient: c.couple || `${c.bride || ''} و ${c.groom || ''}`,
                  phone,
                  text
                })
              } else {
                results.errors.push({ type: 'shoot_couple', contractId: c.id, error: res.error })
              }
            } else {
              results.skipped++
            }
          }
        }
      }

      // ۳. بررسی یادآوری آفیش به عوامل اجرایی
      if (cfg.enableShootCrewReminder) {
        for (const pp of persProjects) {
          if (pp.status === 'rejected' || pp.status === 'cancelled') continue
          const targetDate = pp.eventDate || pp.date
          if (!targetDate) continue

          const daysLeft = typeof Utils !== 'undefined' && Utils.daysUntil ? Utils.daysUntil(targetDate) : null
          if (daysLeft !== null && daysLeft >= 0 && daysLeft <= cfg.shootDaysBefore) {
            const c = contracts.find(x => x.id === pp.contractId) || {}
            const p = personnelList.find(x => x.id === pp.personnelId)
            const phone = p?.phone || pp.phone
            if (!phone) continue

            const key = `shoot_crew_${pp.contractId}_${pp.personnelId}_${today}`
            if (!this._isAlreadySent(key)) {
              const text = this.buildShootCrewMessage(p || { name: pp.personnelName }, c, pp.role, studio)
              const res = await this._sendSMS(phone, text)
              if (res.ok) {
                results.shootCrewSent++
                this._recordLog({
                  key,
                  type: 'shoot_crew',
                  contractId: c.id,
                  personnelId: pp.personnelId,
                  recipient: p?.name || pp.personnelName || 'همکار',
                  phone,
                  text
                })
              } else {
                results.errors.push({ type: 'shoot_crew', contractId: c.id, personnelId: pp.personnelId, error: res.error })
              }
            } else {
              results.skipped++
            }
          }
        }
      }

      // ۴. بررسی سالگرد ازدواج (۱ سال قبل در همین ماه و روز)
      if (cfg.enableAnniversaryCongrats && today) {
        const todayParts = today.split('/')
        if (todayParts.length === 3) {
          const currentYear = parseInt(todayParts[0], 10)
          const targetMonth = todayParts[1]
          const targetDay = todayParts[2]

          for (const c of contracts) {
            if (c.status === 'cancelled') continue
            const evDate = c.eventDate || c.date
            if (!evDate) continue
            const evParts = evDate.split('/')
            if (evParts.length === 3) {
              const evYear = parseInt(evParts[0], 10)
              const evMonth = evParts[1]
              const evDay = evParts[2]

              // سالگرد ۱ یا چند سال کامل
              if (evMonth === targetMonth && evDay === targetDay && currentYear > evYear) {
                const phone = c.phoneBride || c.phoneGroom || c.phone
                if (!phone) continue

                const key = `anniversary_${c.id}_${today}`
                if (!this._isAlreadySent(key)) {
                  const text = this.buildAnniversaryMessage(c, studio, cfg.anniversaryDiscountPercent)
                  const res = await this._sendSMS(phone, text)
                  if (res.ok) {
                    results.anniversarySent++
                    this._recordLog({
                      key,
                      type: 'anniversary',
                      contractId: c.id,
                      recipient: c.couple || `${c.bride || ''} و ${c.groom || ''}`,
                      phone,
                      text
                    })
                  } else {
                    results.errors.push({ type: 'anniversary', contractId: c.id, error: res.error })
                  }
                } else {
                  results.skipped++
                }
              }
            }
          }
        }
      }

      results.totalSent = results.installmentsSent + results.shootCoupleSent + results.shootCrewSent + results.anniversarySent
      return { ok: true, ...results }
    }
  }

  window.SmartLifecycleSMS = SmartLifecycleSMS
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = SmartLifecycleSMS
  }
})(typeof window !== 'undefined' ? window : globalThis)
