/** لودر پک مهندسی روی صفحه ورود/پرتال */
;(function () {
  var list = [
    'js/auth-server-bridge.js',
    'js/eng-auth-db-fix.js',
    'js/eng-auth-recover.js',
    'js/studio-core-finance.js',
    'js/eng-error-guard.js',
    'js/eng-contract-afish.js',
    'js/eng-staff-notify.js',
    'js/eng-global-search.js',
    'js/eng-morning-brief.js',
    'js/eng-whatsapp.js'
  ]
  list.forEach(function (src) {
    if (document.querySelector('script[src="' + src + '"]')) return
    var s = document.createElement('script')
    s.src = src
    s.defer = true
    document.body.appendChild(s)
  })
})()
