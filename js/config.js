/* ══════════════════════════════════════════════
   تالار — تنظیمات یکپارچه اپلیکیشن v6.3.0
   ══════════════════════════════════════════════ */

const AppConfig = {
  APP_NAME: 'Mandani Studio ERP',
  DEFAULT_STUDIO_NAME: 'استودیو فیلم و عکس ماندنی',
  STUDIO_NAME_EN: 'Mandani Studio',
  APP_VERSION: '6.3.0',
  BUILD_DATE: '2026-10-09',
  SW_CACHE: 'mandani-studio-v48',

  STUDIO: {
    NAME: 'استودیو فیلم و عکس ماندنی',
    NAME_EN: 'Mandani Studio',
    BADGE: 'Mandani Studio ERP • نسخه اختصاصی ماندنی',
    HERO_TITLE_PREFIX: 'اکوسیستم یکپارچه',
    HERO_TITLE_ACCENT: 'استودیو فیلم و عکس ماندنی',
    HERO_SUBTITLE: 'بستری هوشمند و اختصاصی برای قراردادهای دیجیتال، زمان‌بندی آفیش، حسابداری یکپارچه و تحویل فایل مشتریان.',
    CARD_TITLE: 'ورود به مدیریت استودیو ماندنی',
    LOGIN_BTN: 'ورود به پنل استودیو ماندنی',
    HOME_LINK_TEXT: 'صفحه اصلی استودیو ماندنی',
    HOME_LINK_URL: '/',
    WEBSITE: 'http://studiomandani.ir'
  },

  getStudioName() {
    try {
      if (typeof DB !== 'undefined' && DB.get) {
        const info = DB.get('studioInfo')
        if (info && info.name && info.name.trim() && info.name !== 'Studio ERP' && info.name !== 'Studio M') {
          return info.name.trim()
        }
      }
      const raw = localStorage.getItem('studio_db_v5') || localStorage.getItem('studio_db_v4')
      if (raw) {
        const d = JSON.parse(raw)
        if (d.studioInfo?.name && d.studioInfo.name !== 'Studio ERP' && d.studioInfo.name !== 'Studio M') {
          return d.studioInfo.name.trim()
        }
      }
    } catch { /* */ }
    return this.STUDIO.NAME
  },

  DB_KEY: 'studio_db_v5',
  DB_VERSION: 21,
  IDB_NAME: 'talar_studio_v5',
  IDB_STORE: 'main',
  IDB_BACKUP_STORE: 'backups',

  SESSION_KEY: 'talar_session',
  THEME_KEY: 'talar_theme',
  WALLPAPER_KEY: 'talar_wallpaper',
  ACCENT_KEY: 'talar_accent',
  DRAFT_KEY: 'talar_contract_draft',
  CHANGELOG_SEEN_KEY: 'talar_changelog_v630_seen',

  LEGACY_DB_KEYS: ['studio_db_v4', 'talar_db_v3'],
  BACKUP_PREFIX: 'studio_bu_',

  MIN_PASSWORD_LENGTH: 6,
  INITIAL_ADMIN_PHONE: '09121000000',
  INITIAL_ADMIN_PASSWORD: '12345678',

  DEFAULT_SMS: {
    provider: 'melipayamak',
    apiKey: '',
    lineNumber: '',
    proxyUrl: '',
    username: ''
  },

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

  SHOW_DEMO_OTP: false,

  CHANGELOG: [
    { icon: '🏆', title: 'نسخه ۶.۳.۰', desc: 'پک کیفیت ۱۰: واریز await، هزینه↔پرسنل/آلبوم، مسیر نقش‌ها، auth پایدارتر، کش PWA v48' },
    { icon: '🛠', title: 'نسخه ۶.۲.۵', desc: 'پک مهندسی: مالی واحد، آفیش خودکار، سرچ Ctrl+K، بریف صبح، فیش مشتری' },
    { icon: '📋', title: 'نسخه ۶.۲.۴', desc: 'گزارش بازبینی، کارت مرحله پرتال مشتری' },
    { icon: '🧠', title: 'مغز استودیو', desc: 'هشدار بدهی/چک، پاسخ مقید به داده' },
    { icon: '🔍', title: 'سرچ سراسری', desc: 'ذره‌بین + Ctrl+K' },
    { icon: '💰', title: 'نسخه ۶.۲.۳', desc: 'نمای مالی مدرن' },
    { icon: '✨', title: 'نسخه ۶.۲.۲', desc: 'تم شیشه‌ای، KPI، PWA' },
    { icon: '🚀', title: 'CRMSTUDIO ERP 6.1', desc: 'پلتفرم جامع مدیریت سازمانی' }
  ]
}

window.AppConfig = AppConfig
