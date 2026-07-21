/* Studio M — Page context bar (where am I?) */
const PageNav = {
  PAGES: {
    login: { icon: 'fa-door-open', fa: 'ورود', en: 'Login', parent: null },
    dashboard: { icon: 'fa-chart-line', fa: 'داشبورد', en: 'Studio M Dashboard', parent: 'login', href: 'studio-m/#dashboard' },
    contracts: { icon: 'fa-file-signature', fa: 'قراردادها', en: 'Contracts', parent: 'dashboard', href: 'studio-m/#contracts' },
    contractNew: { icon: 'fa-file-circle-plus', fa: 'ثبت قرارداد جدید', en: 'New Contract', parent: 'contracts', href: 'contract.html' },
    // Classic admin removed from public nav — break-glass only via Settings → SignedProof
    staff: { icon: 'fa-user-tie', fa: 'پورتال پرسنل', en: 'Staff Portal', parent: 'login', href: 'index.html?view=portal' },
    customer: { icon: 'fa-heart', fa: 'پورتال مشتری', en: 'Customer Portal', parent: null, href: 'index.html' }
  },

  /** جلوگیری از تکرار studio-m/studio-m/... در breadcrumb */
  resolveHref(href) {
    if (!href) return ''
    const inStudio = /\/studio-m\/?(?:index\.html)?$/i.test(location.pathname)
      || location.pathname.includes('/studio-m/')
    const hashRoute = href.match(/^studio-m\/#(.+)$/)
    if (hashRoute && inStudio) return `#${hashRoute[1]}`
    if (href.startsWith('contract.html') && inStudio) return `../contract.html`
    if (href.startsWith('admin.html') && inStudio) return `../admin.html?classic=1`
    if (href.startsWith('index.html') && inStudio) return `../${href}`
    return href
  },

  render(pageId, containerId = 'page-nav') {
    const page = this.PAGES[pageId]
    if (!page) return
    const el = document.getElementById(containerId)
    if (!el) return
    const trail = []
    let cur = page
    while (cur) {
      trail.unshift(cur)
      cur = cur.parent ? this.PAGES[cur.parent] : null
    }
    el.innerHTML = `
      <nav class="page-nav" aria-label="مسیر صفحه">
        ${trail.map((p, i) => {
          const isLast = i === trail.length - 1
          const href = p.href && !isLast ? this.resolveHref(p.href) : ''
          const inner = `<i class="fas ${p.icon}"></i><span>${p.fa}</span>`
          return `${i ? '<span class="page-nav-sep">/</span>' : ''}${
            href ? `<a class="page-nav-link" href="${href}">${inner}</a>` : `<span class="page-nav-current">${inner}</span>`
          }`
        }).join('')}
      </nav>`
  }
}

window.PageNav = PageNav
