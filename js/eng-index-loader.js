/** لودر کامل + رفع تعویض رمز اجباری پرسنل */
;(function () {
  var list = [
    'js/eng-harden-weakpoints.js',
    'js/eng-force-pw-fix.js',
    'js/saas-studio-context.js',
    'js/saas-studio-picker.js',
    'js/saas-dual-read.js',
    'js/saas-write-bridge.js',
    'js/eng-connectivity-hub.js',
    'js/eng-auth-recover.js',
    'js/eng-remaining-complete.js',
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
