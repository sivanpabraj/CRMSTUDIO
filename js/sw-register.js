(() => {
  if (!('serviceWorker' in navigator)) return;

  // Resolve path when inside /studio-m/ subdir
  const swPath = location.pathname.includes('/studio-m/') ? '../sw.js' : 'sw.js';

  navigator.serviceWorker.register(swPath).catch(() => {
    /* silent: PWA is optional */
  });
})();

