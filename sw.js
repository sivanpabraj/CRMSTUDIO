/* Studio M — Service Worker (offline shell + asset cache) */
const CACHE = 'studio-m-v1.1.0'

const ASSETS = [
  './site.html',
  './start.html',
  './join.html',
  './index.html',
  './contract.html',
  './customer.html',
  './studio-m/index.html',
  './icons/icon.svg'
]

const NETWORK_FIRST = /\.(js|css|html?)$|\/$/
const manifestUrl = new URL('./offline-assets.json', self.registration?.scope || self.location.href).href

async function precacheAssets(cache) {
  const response = await fetch(manifestUrl, { cache: 'no-store' })
  if (!response.ok) throw new Error(`offline manifest unavailable (${response.status})`)
  const manifest = await response.json()
  if (manifest.version !== '1.1.0' || !Array.isArray(manifest.assets)) {
    throw new Error('offline manifest version mismatch')
  }
  const urls = manifest.assets.map(asset => new URL(asset, self.registration?.scope || self.location.href).href)
  await cache.addAll([...new Set([...ASSETS, manifestUrl, ...urls])])
}

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then(precacheAssets))
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
  if (e.request.method !== 'GET') return
  const url = new URL(e.request.url)
  if (url.origin !== self.location.origin) return
  if (url.pathname.endsWith('/health.json') || url.pathname.endsWith('/version.json')) return

  const scopePath = new URL(self.registration?.scope || self.location.href).pathname
  const relativePath = url.pathname.startsWith(scopePath) ? url.pathname.slice(scopePath.length) : ''
  const isStatic = /^(?:assets|css|icons|js|studio-m\/(?:css|js))\//.test(relativePath) ||
    /^(?:site|start|join|index|contract|customer|customer-login|admin)\.html$/.test(relativePath) ||
    /^(?:contract\.css|contract\.js|manifest\.json|offline-assets\.json)$/.test(relativePath)
  if (!isStatic) return

  const networkFirst = NETWORK_FIRST.test(url.pathname)

  e.respondWith(
    networkFirst
      ? fetch(e.request).then(res => {
        if (res.ok && res.type === 'basic' && !hasNoStore(res)) {
          caches.open(CACHE).then(cache => cache.put(e.request, res.clone()))
        }
        return res
      }).catch(() => caches.match(e.request))
      : caches.match(e.request).then(cached => {
        const fetchPromise = fetch(e.request).then(res => {
          if (res.ok && res.type === 'basic' && !hasNoStore(res)) {
            caches.open(CACHE).then(cache => cache.put(e.request, res.clone()))
          }
          return res
        }).catch(() => cached)
        return cached || fetchPromise
      })
  )
})

function hasNoStore(response) {
  return /(?:^|,)\s*(?:no-store|private)\s*(?:,|$)/i.test(response.headers.get('cache-control') || '')
}
