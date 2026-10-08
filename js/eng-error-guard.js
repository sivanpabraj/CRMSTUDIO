/** جلوگیری از صفحه خاموش به‌خاطر خطای JS */
;(function () {
  'use strict'
  window.addEventListener('error', (ev) => {
    try {
      console.error('[eng-guard]', ev.error || ev.message)
      if (typeof Utils !== 'undefined' && Utils.toast) {
        Utils.toast('خطای موقت — صفحه را تازه کنید', 'error')
      }
    } catch { /* */ }
  })
  window.addEventListener('unhandledrejection', (ev) => {
    try {
      console.error('[eng-guard:promise]', ev.reason)
    } catch { /* */ }
  })
})()
