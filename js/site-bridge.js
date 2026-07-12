/* ══════════════════════════════════════════════
   SiteBridge — اتصال سایت خارجی · لینک‌های ورود
   ══════════════════════════════════════════════ */

const SiteBridge = {
  DEFAULT_LINKS: {
    customerLabel: 'پیگیری مراسم',
    customerDesc: 'وضعیت عروسی، درخواست‌ها و پشتیبانی',
    managerLabel: 'مدیریت استودیو',
    managerDesc: 'ورود مدیر — قرارداد، مالی، پرسنل',
    staffLabel: 'ورود پرسنل',
    staffDesc: 'پروژه‌ها و وظایف تیم'
  },

  getStudio() {
    if (typeof DB !== 'undefined' && DB.get) {
      return DB.get('studioInfo') || {}
    }
    try {
      const raw = localStorage.getItem(AppConfig.DB_KEY)
      if (raw) return JSON.parse(raw).studioInfo || {}
    } catch { /* */ }
    return {}
  },

  getLinks() {
    const info = this.getStudio()
    return { ...this.DEFAULT_LINKS, ...(info.siteLinks || {}) }
  },

  appBase() {
    const info = this.getStudio()
    if (info.appBaseUrl) return info.appBaseUrl.replace(/\/+$/, '')
    if (typeof location !== 'undefined') {
      return location.origin + location.pathname.replace(/[^/]*$/, '').replace(/\/+$/, '')
    }
    return ''
  },

  url(path) {
    const base = this.appBase()
    const p = String(path || '').replace(/^\//, '')
    return base ? `${base}/${p}` : p
  },

  loginUrl() {
    return this.url('index.html')
  },

  managerLoginUrl() {
    return this.url('index.html')
  },

  customerLoginUrl() {
    return this.url('index.html')
  },

  staffLoginUrl() {
    return this.url('index.html')
  },

  sitePageUrl() {
    return this.url('site.html')
  },

  embedSnippet() {
    const _base = this.appBase()
    return `<!-- Studio M — ورود -->
<a href="${this.loginUrl()}" style="display:inline-block;padding:12px 24px;background:#F59E0B;color:#111;border-radius:12px;text-decoration:none;font-weight:700">ورود / پیگیری</a>`
  },

  defaultSiteLinksForStudio(name) {
    return {
      ...this.DEFAULT_LINKS,
      customerLabel: 'پیگیری مراسم',
      managerLabel: name ? `مدیریت ${name}` : 'مدیریت استودیو'
    }
  },

  applyPageBranding(root) {
    const info = this.getStudio()
    const name = (info.name || '').trim()
    const links = this.getLinks()
    root = root || document

    const titleEl = root.querySelector('[data-site-title]')
    if (titleEl) titleEl.textContent = name || 'استودیو عکاسی'

    const subEl = root.querySelector('[data-site-sub]')
    if (subEl) {
      subEl.textContent = info.tagline || 'قرارداد، پرسنل، مشتری و مالی — یک پلتفرم یکپارچه'
    }

    const logoEl = root.querySelector('[data-site-logo]')
    if (logoEl && info.logo) {
      logoEl.innerHTML = Utils.safeImgHtml(info.logo, 'style="width:100%;height:100%;object-fit:contain;border-radius:inherit"')
    }

    const custLabel = root.querySelector('[data-link-customer-label]')
    const custDesc = root.querySelector('[data-link-customer-desc]')
    const mgrLabel = root.querySelector('[data-link-manager-label]')
    const mgrDesc = root.querySelector('[data-link-manager-desc]')
    if (custLabel) custLabel.textContent = links.customerLabel
    if (custDesc) custDesc.textContent = links.customerDesc
    if (mgrLabel) mgrLabel.textContent = links.managerLabel
    if (mgrDesc) mgrDesc.textContent = links.managerDesc

    const loginA = root.querySelector('[data-href-login]')
    if (loginA) loginA.href = this.loginUrl()

    const custA = root.querySelector('[data-href-customer]')
    const mgrA = root.querySelector('[data-href-manager]')
    const staffA = root.querySelector('[data-href-staff]')
    if (custA) custA.href = this.loginUrl()
    if (mgrA) mgrA.href = this.loginUrl()
    if (staffA) staffA.href = this.loginUrl()

    if (name && document.title.includes('MAN')) {
      document.title = document.title.replace('MAN', name)
    }
  },

  async initSitePage() {
    if (typeof DB !== 'undefined' && DB.ready) await DB.ready
    if (typeof Studio !== 'undefined') Studio.ensureIdentity()
    this.applyPageBranding()
    const ver = document.getElementById('app-ver')
    if (ver) ver.textContent = AppConfig.APP_VERSION
  }
}

window.SiteBridge = SiteBridge
