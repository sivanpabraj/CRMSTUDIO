/** بارگذاری پک مهندسی — یک نقطه */
;(function () {
  'use strict'
  const scripts = [
    'js/studio-core-finance.js',
    'js/eng-error-guard.js',
    'js/eng-contract-afish.js',
    'js/eng-staff-notify.js',
    'js/eng-global-search.js',
    'js/eng-morning-brief.js',
    'js/eng-whatsapp.js',
    'js/eng-customer-receipt.js'
  ]
  scripts.forEach((src) => {
    if (document.querySelector(`script[src="${src}"]`)) return
    const s = document.createElement('script')
    s.src = src
    s.defer = true
    document.head.appendChild(s)
  })
})()
