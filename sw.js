/* Studio ERP — Service Worker (offline shell + asset cache) */
const CACHE = 'studio-erp-v40'

const ASSETS = [
  './site.html',
  './start.html',
  './join.html',
  './index.html',
  './admin.html',
  './contract.html',
  './customer.html',
  './studio-m/index.html',
  './icons/icon.svg'
]

const NETWORK_FIRST = /\.(js|css|html?)$|\/$/

self.addEventListener('install', (e) => {
  self.skipWaiting()
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.map(k => caches.delete(k)))
    ).then(() => {
      if (self.registration) {
        return self.registration.unregister()
      }
    })
  )
  self.clients.claim()
})

self.addEventListener('fetch', (e) => {
  // Always fetch fresh from network
  e.respondWith(fetch(e.request).catch(() => caches.match(e.request)))
})
