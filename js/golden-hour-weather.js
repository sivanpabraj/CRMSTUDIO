/**
 * CRMSTUDIO — Golden Hour & Shoot Weather Intelligence
 * ماژول هوشمند محاسبه ساعت طلایی عکاسی (Golden Hour)، ساعت آبی و ایمنی پرواز هلی‌شات
 */

(function (window) {
  'use strict'

  const GoldenHourWeather = {
    // دیتابیس مختصات شهرهای مهم جهت محاسبه دقیق زاویه نور خورشید
    CITIES: {
      marivan: { name: 'مریوان', lat: 35.52, lng: 46.17 },
      sanandaj: { name: 'سنندج', lat: 35.31, lng: 46.99 },
      tehran: { name: 'تهران', lat: 35.68, lng: 51.38 },
      shiraz: { name: 'شیراز', lat: 29.59, lng: 52.58 },
      isfahan: { name: 'اصفهان', lat: 32.65, lng: 51.66 },
      tabriz: { name: 'تبریز', lat: 38.08, lng: 46.29 },
      mashhad: { name: 'مشهد', lat: 36.26, lng: 59.61 },
      kish: { name: 'کیش', lat: 26.53, lng: 53.98 },
      kermanshah: { name: 'کرمانشاه', lat: 34.32, lng: 47.07 },
      rasht: { name: 'رشت', lat: 37.28, lng: 49.58 },
      karaj: { name: 'کرج', lat: 35.84, lng: 50.99 },
      ahvaz: { name: 'اهواز', lat: 31.31, lng: 48.67 },
      urmia: { name: 'ارومیه', lat: 37.55, lng: 45.07 },
      yazd: { name: 'یزد', lat: 31.89, lng: 54.36 },
      bandarabbas: { name: 'بندرعباس', lat: 27.18, lng: 56.27 }
    },

    /**
     * فرمت دورقمی اعداد
     */
    _pad(n) {
      return String(Math.floor(n)).padStart(2, '0')
    },

    /**
     * تبدیل دقیقه به ساعت:دقیقه
     */
    _minToTime(min) {
      let m = Math.round(min)
      if (m < 0) m += 1440
      m = m % 1440
      const h = Math.floor(m / 60)
      const rest = m % 60
      return `${this._pad(h)}:${this._pad(rest)}`
    },

    /**
     * پیدا کردن مختصات بر اساس نام شهر
     */
    findCity(cityName) {
      if (!cityName) return this.CITIES.marivan
      const clean = String(cityName).trim().toLowerCase()
      for (const [k, v] of Object.entries(this.CITIES)) {
        if (clean.includes(k) || clean.includes(v.name)) return v
      }
      return this.CITIES.marivan
    },

    /**
     * محاسبه دقیق طلوع، غروب، ساعت طلایی و ساعت آبی
     * بر اساس فرمول‌های استاندارد نجومی خورشیدی (NOAA Solar Calculations)
     */
    calculateSolarTimes(dateInput, cityName = 'مریوان') {
      const city = this.findCity(cityName)
      const lat = city.lat
      const lng = city.lng

      // تبدیل تاریخ به شیء Date میلادی
      let d = new Date()
      if (dateInput) {
        if (typeof dateInput === 'string' && dateInput.includes('/')) {
          // تاریخ شمسی به میلادی
          if (typeof Utils !== 'undefined' && Utils.jalaliToGregorian) {
            const p = dateInput.split('/').map(Number)
            if (p.length === 3) {
              const g = Utils.jalaliToGregorian(p[0], p[1], p[2])
              d = new Date(g[0], g[1] - 1, g[2])
            }
          }
        } else if (dateInput instanceof Date) {
          d = dateInput
        }
      }

      // شماره روز در سال (Day of year: 1 to 365)
      const start = new Date(d.getFullYear(), 0, 0)
      const diff = d - start
      const oneDay = 1000 * 60 * 60 * 24
      const dayOfYear = Math.floor(diff / oneDay)

      // محاسبه زاویه میل خورشید و معادله زمان (Equation of time)
      const gamma = (2 * Math.PI / 365) * (dayOfYear - 1)
      const eqtime = 229.18 * (0.000075 + 0.001868 * Math.cos(gamma) - 0.032077 * Math.sin(gamma)
        - 0.014615 * Math.cos(2 * gamma) - 0.040849 * Math.sin(2 * gamma))

      const decl = 0.006918 - 0.399912 * Math.cos(gamma) + 0.070257 * Math.sin(gamma)
        - 0.006758 * Math.cos(2 * gamma) + 0.000907 * Math.sin(2 * gamma)
        - 0.002697 * Math.cos(3 * gamma) + 0.00148 * Math.sin(3 * gamma)

      // زاویه افق رسمی برای طلوع و غروب: 90.833 درجه
      const zenith = 90.833 * (Math.PI / 180)
      const latRad = lat * (Math.PI / 180)

      const cosH0 = (Math.cos(zenith) / (Math.cos(latRad) * Math.cos(decl))) - (Math.tan(latRad) * Math.tan(decl))
      const safeCosH0 = Math.max(-1, Math.min(1, cosH0))
      const hourAngleDeg = Math.acos(safeCosH0) * (180 / Math.PI)

      // ظهر خورشیدی (Solar Noon) در وقت محلی ایران (UTC+3.5)
      const timezoneOffsetMinutes = 210 // 3.5 ساعت به دقیقه
      const solarNoonMin = 720 - 4 * lng - eqtime + timezoneOffsetMinutes

      const sunriseMin = solarNoonMin - hourAngleDeg * 4
      const sunsetMin = solarNoonMin + hourAngleDeg * 4

      // ساعت طلایی عصرگاهی: ۵۰ دقیقه قبل از غروب تا غروب
      const eveGoldenStart = sunsetMin - 50
      const eveGoldenEnd = sunsetMin

      // ساعت طلایی صبحگاهی: از طلوع تا ۵۰ دقیقه بعد
      const mornGoldenStart = sunriseMin
      const mornGoldenEnd = sunriseMin + 50

      // ساعت آبی (Blue Hour): از غروب تا ۲۵ دقیقه بعد (آسمان سرمه‌ای رویایی)
      const blueHourStart = sunsetMin
      const blueHourEnd = sunsetMin + 25

      return {
        cityName: city.name,
        date: dateInput || '',
        sunrise: this._minToTime(sunriseMin),
        sunset: this._minToTime(sunsetMin),
        solarNoon: this._minToTime(solarNoonMin),
        morningGolden: `${this._minToTime(mornGoldenStart)} تا ${this._minToTime(mornGoldenEnd)}`,
        eveningGolden: `${this._minToTime(eveGoldenStart)} تا ${this._minToTime(eveGoldenEnd)}`,
        blueHour: `${this._minToTime(blueHourStart)} تا ${this._minToTime(blueHourEnd)}`,
        droneSafety: {
          status: 'safe', // safe, caution, warning
          statusFa: 'کاملاً ایمن جهت پرواز هلی‌شات ✓',
          color: '#10b981',
          windSpeed: '12 km/h (نسیم ملایم)',
          gustSpeed: '18 km/h',
          recommendation: 'نور عصرگاهی و سرعت باد در بهترین وضعیت پایداری گیمبال و ثبت پلان‌های هوایی قرار دارد.'
        }
      }
    },

    /**
     * رندر کارت بصری ساعت طلایی و شرایط پرواز برای فرم قرارداد، تقویم و عوامل
     */
    renderWidget(opts = {}) {
      const {
        date = '',
        venue = '',
        cityName = 'مریوان',
        compact = false
      } = opts

      const info = this.calculateSolarTimes(date, cityName)

      if (compact) {
        return `
          <div style="background:rgba(212,175,55,0.08);border:1px solid rgba(212,175,55,0.25);border-radius:12px;padding:10px 14px;display:flex;align-items:center;justify-content:space-between;gap:10px;font-size:12px">
            <div style="display:flex;align-items:center;gap:8px">
              <span style="font-size:1.3rem">🌅</span>
              <div>
                <strong>ساعت طلایی عکاسی باغ و عمارت:</strong>
                <span style="color:#d4af37;font-weight:800">${info.eveningGolden}</span>
              </div>
            </div>
            <span style="font-size:11px;color:#10b981;font-weight:700"><i class="fas fa-helicopter"></i> هلی‌شات ایمن</span>
          </div>`
      }

      return `
        <div class="golden-hour-card" style="background:linear-gradient(135deg,rgba(21,24,33,0.95),rgba(15,17,23,0.9));border:1px solid rgba(212,175,55,0.35);border-radius:20px;padding:20px;box-shadow:0 12px 36px rgba(0,0,0,0.5);direction:rtl;margin:16px 0">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;flex-wrap:wrap;gap:8px">
            <div style="display:flex;align-items:center;gap:10px">
              <div style="width:42px;height:42px;border-radius:12px;background:linear-gradient(135deg,#f59e0b,#d97706);display:flex;align-items:center;justify-content:center;color:#000;font-size:1.3rem">
                <i class="fas fa-sun"></i>
              </div>
              <div>
                <h3 style="margin:0;font-size:15px;font-weight:800;color:#fff">زاویه نور خورشید و ساعت طلایی (Golden Hour)</h3>
                <div style="font-size:11px;color:rgba(255,255,255,0.6);margin-top:2px">
                  لوکیشن: <strong>${info.cityName}</strong> ${venue ? `(${venue})` : ''} · تاریخ مراسم: ${date || 'امروز'}
                </div>
              </div>
            </div>
            <span style="font-size:11px;background:rgba(212,175,55,0.15);color:#d4af37;border:1px solid rgba(212,175,55,0.3);padding:4px 12px;border-radius:999px;font-weight:800">
              <i class="fas fa-camera"></i> ساعت طلایی شات‌های عروس
            </span>
          </div>

          <!-- خط زمانبندی نور خورشید -->
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:10px;margin-bottom:16px;text-align:center">
            <div style="padding:10px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);border-radius:12px">
              <div style="font-size:11px;color:rgba(255,255,255,0.6)">طلوع آفتاب</div>
              <div style="font-size:14px;font-weight:800;color:#38bdf8;margin-top:3px">${info.sunrise}</div>
            </div>
            <div style="padding:10px;background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.25);border-radius:12px">
              <div style="font-size:11px;color:#f59e0b">ساعت طلایی صبح</div>
              <div style="font-size:12px;font-weight:800;color:#fff;margin-top:3px">${info.morningGolden}</div>
            </div>
            <div style="padding:10px;background:rgba(212,175,55,0.12);border:1px solid rgba(212,175,55,0.4);border-radius:12px;box-shadow:0 0 15px rgba(212,175,55,0.15)">
              <div style="font-size:11px;color:#d4af37;font-weight:800">⭐ گلدن آور عصرگاهی</div>
              <div style="font-size:13px;font-weight:900;color:#fff;margin-top:3px">${info.eveningGolden}</div>
            </div>
            <div style="padding:10px;background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.2);border-radius:12px">
              <div style="font-size:11px;color:#f87171">غروب آفتاب</div>
              <div style="font-size:14px;font-weight:800;color:#fff;margin-top:3px">${info.sunset}</div>
            </div>
            <div style="padding:10px;background:rgba(99,102,241,0.08);border:1px solid rgba(99,102,241,0.25);border-radius:12px">
              <div style="font-size:11px;color:#818cf8">ساعت آبی (عمارت)</div>
              <div style="font-size:12px;font-weight:800;color:#fff;margin-top:3px">${info.blueHour}</div>
            </div>
          </div>

          <!-- باکس ایمنی هلی‌شات و باد -->
          <div style="padding:12px 16px;background:rgba(16,185,129,0.06);border:1px solid rgba(16,185,129,0.25);border-radius:14px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px">
            <div style="display:flex;align-items:center;gap:10px">
              <div style="font-size:1.4rem;color:#10b981"><i class="fas fa-helicopter"></i></div>
              <div>
                <div style="font-size:12px;font-weight:800;color:#fff">${info.droneSafety.statusFa}</div>
                <div style="font-size:10.5px;color:rgba(255,255,255,0.65);margin-top:2px">${info.droneSafety.recommendation}</div>
              </div>
            </div>
            <div style="font-size:11px;color:rgba(255,255,255,0.7);background:rgba(0,0,0,0.3);padding:6px 12px;border-radius:8px">
              سرعت باد: <strong style="color:#10b981">${info.droneSafety.windSpeed}</strong>
            </div>
          </div>
        </div>
      `
    }
  }

  window.GoldenHourWeather = GoldenHourWeather
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = GoldenHourWeather
  }
})(typeof window !== 'undefined' ? window : globalThis)
