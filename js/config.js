/* ══════════════════════════════════════════════
   تالار — تنظیمات یکپارچه اپلیکیشن v5
   ══════════════════════════════════════════════ */

const AppConfig = {
  APP_NAME: 'Studio M',
  DEFAULT_STUDIO_NAME: 'Studio M',
  APP_VERSION: '6.0.0',
  BUILD_DATE: '2026-07-04',
  SW_CACHE: 'studio-m-v23',

  DB_KEY: 'studio_db_v5',
  DB_VERSION: 23,
  IDB_NAME: 'talar_studio_v5',
  IDB_STORE: 'main',
  IDB_BACKUP_STORE: 'backups',

  SESSION_KEY: 'talar_session',
  THEME_KEY: 'talar_theme',
  WALLPAPER_KEY: 'talar_wallpaper',
  ACCENT_KEY: 'talar_accent',
  DRAFT_KEY: 'talar_contract_draft',
  CHANGELOG_SEEN_KEY: 'talar_changelog_v60_seen',

  LEGACY_DB_KEYS: ['studio_db_v4', 'talar_db_v3'],
  BACKUP_PREFIX: 'studio_bu_',

  MIN_PASSWORD_LENGTH: 8,
  /** فقط برای seed تست محلی — در production رمز تصادفی ساخته می‌شود */
  INITIAL_ADMIN_PHONE: '09121000000',
  INITIAL_ADMIN_PASSWORD: '12345678',

  isLocalDev() {
    try {
      const h = location.hostname
      return h === 'localhost' || h === '127.0.0.1' || h === '::1'
    } catch { return false }
  },

  isProduction() {
    return !this.isLocalDev()
  },
  SESSION_TIMEOUT_MS: 8 * 60 * 60 * 1000,
  CUSTOMER_SESSION_MS: 24 * 60 * 60 * 1000,
  LOCKOUT_THRESHOLD: 8,
  LOCKOUT_DURATION_MS: 15 * 60 * 1000,
  PBKDF2_ITERATIONS: 120000,
  OTP_LOGIN_PROOF_KEY: 'talar_otp_login_proof',
  CSRF_KEY: 'talar_csrf',

  OTP_TTL_MS: 5 * 60 * 1000,
  OTP_RESEND_COOLDOWN_MS: 60 * 1000,
  OTP_MAX_SENDS_PER_HOUR: 3,
  OTP_MAX_VERIFY_ATTEMPTS: 5,

  /** نمایش کد OTP در UI فقط در dev/local */
  SHOW_DEMO_OTP: false,

  CHANGELOG: [
    { icon: '🚀', title: 'Studio M 6.0', desc: 'پلتفرم ERP کامل — داشبورد پریمیوم، تقویم، تایم‌لاین عروسی، فاکتور، حقوق، کتابخانه رسانه، تأیید پیامکی قرارداد و بیشتر' },
    { icon: '🌐', title: 'نسخه ۵.۷', desc: 'سایت عمومی، کد عضویت استودیو، جداسازی ورود مدیر/پرسنل/مشتری، پنل تنظیمات با کد و لینک' },
    { icon: '🗄️', title: 'IndexedDB', desc: 'ذخیره‌سازی تا ۵۰MB+ با مهاجرت خودکار از localStorage' },
    { icon: '🔐', title: 'امنیت', desc: 'رمز حداقل ۸ کاراکتر + سیستم مجوز نقش‌ها' },
    { icon: '📦', title: 'پشتیبان‌گیری', desc: 'بک‌آپ در IndexedDB جدا — بدون پر شدن localStorage' },
    { icon: '⚡', title: 'Vite Dev Server', desc: 'اجرای سریع با npm run dev' },
    { icon: '🎨', title: 'UI', desc: 'صفحه بارگذاری و اعلان نسخه جدید' },
    { icon: '🧹', title: 'یکپارچه‌سازی', desc: 'نام‌گذاری و Service Worker به‌روز' },
    { icon: '✨', title: 'تم شیشه‌ای', desc: 'پس‌زمینه پویا، دکمه‌های شیشه‌ای و رنگ‌بندی جذاب در همه بخش‌ها' }
  ]
}

window.AppConfig = AppConfig
