/* Studio ERP — Service Worker v48
 * Offline-first shell + stale-while-revalidate for static assets.
 * Network-only for API / Supabase / non-GET.
 */
const CACHE_VERSION = 'mandani-studio-v48'
const SHELL_CACHE = `${CACHE_VERSION}-shell`
const ASSET_CACHE = `${CACHE_VERSION}-assets`

const SHELL_URLS = [
  './',
  './site.html',
  './start.html',
  './join.html',
  './index.html',
  './admin.html',
  './contract.html',
  './customer.html',
  './customer-login.html',
  './crew.html',
  './studio-m/index.html',
  './manifest.json',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png'
]

const ASSET_EXT = /\.(js|css|woff2?|ttf|png|svg|webp|ico|json)(\?.*)?$/i
const API_HOST = /(supabase\.co|supabase\.in|googleapis\.com|cloudflare)/i

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) =>
      cache.addAll(SHELL_URLS.map((u) => new Request(u, { cache: 'reload' }))).catch(() => {
        /* partial shell ok */
      })
    ).then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k.startsWith('studio-erp-') && k !== SHELL_CACHE && k !== ASSET_CACHE)
          .map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  )
})

function isNavigation(request) {
  return request.mode === 'navigate' ||
    (request.method === 'GET' && request.headers.get('accept')?.includes('text/html'))
}

function isApiRequest(url) {
  return API_HOST.test(url.hostname) ||
    url.pathname.startsWith('/api/') ||
    url.pathname.includes('/functions/v1/')
}

async function networkFirst(request) {
  try {
    const response = await fetch(request)
    if (response && response.ok && request.method === 'GET') {
      const cache = await caches.open(SHELL_CACHE)
      cache.put(request, response.clone())
    }
    return response
  } catch {
    const cached = await caches.match(request)
    if (cached) return cached
    if (isNavigation(request)) {
      return (await caches.match('./site.html')) ||
        (await caches.match('./index.html')) ||
        new Response('آفلاین — اتصال برقرار نیست', {
          status: 503,
          headers: { 'Content-Type': 'text/plain; charset=utf-8' }
        })
    }
    throw new Error('offline')
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(ASSET_CACHE)
  const cached = await cache.match(request)
  const networkPromise = fetch(request).then((response) => {
    if (response && response.ok) cache.put(request, response.clone())
    return response
  }).catch(() => null)
  return cached || (await networkPromise) || Response.error()
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  let url
  try {
    url = new URL(request.url)
  } catch {
    return
  }

  if (url.origin !== self.location.origin) {
    if (isApiRequest(url)) return
    return
  }

  if (isApiRequest(url)) return

  if (isNavigation(request)) {
    event.respondWith(networkFirst(request))
    return
  }

  if (ASSET_EXT.test(url.pathname)) {
    event.respondWith(staleWhileRevalidate(request))
    return
  }

  event.respondWith(networkFirst(request))
})

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting()
  if (event.data === 'CLEAR_CACHES') {
    event.waitUntil(
      caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
    )
  }
})
