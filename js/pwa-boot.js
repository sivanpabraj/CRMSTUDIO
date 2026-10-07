/**
 * Early PWA boot — include BEFORE any legacy unregister scripts when possible.
 * Also safe to include at end of body: re-registers after race.
 */
(function () {
  if (!('serviceWorker' in navigator)) return
  if (/[?&]nosw=1/.test(location.search)) return
  var inStudioM = location.pathname.indexOf('/studio-m/') !== -1
  var path = inStudioM ? '../sw.js' : './sw.js'
  var scope = inStudioM ? '../' : './'
  function go() {
    navigator.serviceWorker.register(path, { scope: scope }).catch(function () {})
  }
  go()
  setTimeout(go, 300)
  setTimeout(go, 1200)
})()
