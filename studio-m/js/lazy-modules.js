/* Route-scoped loader: keeps the authenticated shell below the launch budget. */
(() => {
  'use strict'

  const ROUTE_FILES = Object.freeze({
    dashboard: ['js/dashboard.js'],
    crm: ['js/modules-crm.js'],
    bookings: ['js/modules-bookings.js'],
    timeline: ['js/modules-bookings.js'],
    contracts: ['../js/package-catalog.js', '../js/finance-sync.js', 'js/modules-contracts.js'],
    packages: ['../js/package-catalog.js', 'js/modules-packages.js'],
    invoices: ['../js/finance-sync.js', 'js/modules-invoices.js'],
    accounting: ['../js/finance-sync.js', '../js/cheques.js', 'js/accounting.js'],
    expenses: ['../js/finance-sync.js', 'js/modules-expenses.js'],
    reports: ['js/attendance.js', 'js/reports.js'],
    employees: ['../js/sms.js', '../js/portal-invite.js', 'js/portal-mgmt.js', 'js/employees.js'],
    attendance: ['js/attendance.js'],
    payroll: ['../js/finance-sync.js', 'js/payroll.js'],
    equipment: ['js/equipment.js'],
    custody: ['js/custody.js'],
    files: ['../js/file-storage.js', 'js/modules-misc.js'],
    workflow: ['js/workflow.js'],
    notifications: ['../js/notify-hub.js', 'js/modules-misc.js'],
    inbox: ['../js/inbox-shared.js', 'js/inbox.js'],
    messaging: ['../js/messaging-shared.js', '../js/sms.js', 'js/messaging.js'],
    portal: ['../js/messaging-shared.js', '../js/sms.js', '../js/portal-invite.js', 'js/portal-mgmt.js'],
    settings: ['../js/backup-service.js', '../js/file-storage.js', '../js/factory-reset.js', '../js/site-bridge.js', '../js/sms.js', 'js/settings.js'],
    audit: ['js/modules-misc.js'],
    users: ['../js/sms.js', '../js/portal-invite.js', 'js/modules-misc.js'],
    api: ['js/modules-misc.js'],
    calendar: ['js/calendar.js']
  })

  const loaded = new Set()
  const pending = new Map()
  const MODULE_FILES = new Set(['../js/finance-sync.js'])

  function loadScript(src) {
    if (loaded.has(src)) return Promise.resolve()
    if (pending.has(src)) return pending.get(src)
    const promise = new Promise((resolve, reject) => {
      const script = document.createElement('script')
      script.src = src
      if (MODULE_FILES.has(src)) script.type = 'module'
      script.async = false
      script.dataset.smLazy = src
      script.addEventListener('load', () => {
        loaded.add(src)
        pending.delete(src)
        resolve()
      }, { once: true })
      script.addEventListener('error', () => {
        pending.delete(src)
        reject(new Error(`Failed to load ${src}`))
      }, { once: true })
      document.head.appendChild(script)
    })
    pending.set(src, promise)
    return promise
  }

  window.SMLazyModules = {
    filesFor(route) { return [...(ROUTE_FILES[route] || [])] },
    isLoaded(route) { return this.filesFor(route).every(file => loaded.has(file)) },
    async ensure(route) {
      for (const file of this.filesFor(route)) await loadScript(file)
      return true
    }
  }
})()
