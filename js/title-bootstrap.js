/* عنوان صفحه ورود — بدون inline script در HTML */
;(function () {
  try {
    var raw = localStorage.getItem('studio_db_v5') || localStorage.getItem('studio_db_v4')
    if (!raw) return
    var d = JSON.parse(raw)
    var n = d.studioInfo && d.studioInfo.name
    if (n && n !== 'Studio M' && d.studioInfo.setupCompleted) {
      document.title = 'ورود — ' + n
    }
  } catch { /* ignore */ }
})()
