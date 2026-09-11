/* Studio M — Service Worker (offline shell + asset cache) */
const CACHE = 'studio-m-v23'

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
  e.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(ASSETS).catch(() => {}))
  )
  self.skipWaiting()
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  )
  self.clients.claim()
})

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url)
  if (url.origin !== self.location.origin) return

  const networkFirst = NETWORK_FIRST.test(url.pathname)

  e.respondWith(
    networkFirst
      ? fetch(e.request).then(res => {
        if (res.ok && res.type === 'basic') {
          caches.open(CACHE).then(cache => cache.put(e.request, res.clone()))
        }
        return res
      }).catch(() => caches.match(e.request))
      : caches.match(e.request).then(cached => {
        const fetchPromise = fetch(e.request).then(res => {
          if (res.ok && res.type === 'basic') {
            caches.open(CACHE).then(cache => cache.put(e.request, res.clone()))
          }
          return res
        }).catch(() => cached)
        return cached || fetchPromise
      })
  )
})
