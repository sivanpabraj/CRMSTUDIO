const base = String(process.env.DEPLOYMENT_APP_URL || '').replace(/\/+$/, '')
const parsedBase = new URL(base)
const localHttp = parsedBase.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(parsedBase.hostname)
if (parsedBase.protocol !== 'https:' && !localHttp) {
  throw new Error('DEPLOYMENT_APP_URL must be HTTPS (HTTP is allowed only for local container smoke)')
}

const targets = [
  { url: `${base}/site.html`, strictScript: false },
  { url: `${base}/index.html`, strictScript: true },
  { url: `${base}/studio-m/`, strictScript: true }
]
for (const target of targets) {
  const { url, strictScript } = target
  const response = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(15000) })
  if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}`)
  const required = {
    'x-content-type-options': 'nosniff',
    'x-request-id': '',
    'x-frame-options': 'SAMEORIGIN',
    'x-permitted-cross-domain-policies': 'none',
    'referrer-policy': 'strict-origin-when-cross-origin',
    'permissions-policy': 'camera=()',
    'cross-origin-opener-policy': 'same-origin',
    'cross-origin-resource-policy': 'same-origin',
    'content-security-policy': "default-src 'self'"
  }
  for (const [header, expected] of Object.entries(required)) {
    const value = response.headers.get(header) || ''
    if ((expected && !value.toLowerCase().includes(expected.toLowerCase())) || (!expected && !value.trim())) {
      throw new Error(`${url} missing required ${header}`)
    }
  }
  const csp = response.headers.get('content-security-policy') || ''
  const scriptDirective = csp.split(';').map(value => value.trim()).find(value => value.startsWith('script-src ')) || ''
  if (strictScript && scriptDirective.includes("'unsafe-inline'")) {
    throw new Error(`${url} permits unsafe-inline scripts`)
  }
  if (!localHttp && !response.headers.get('strict-transport-security')?.includes('max-age=')) {
    throw new Error(`${url} missing HSTS over HTTPS`)
  }
  const html = await response.text()
  if (!/<html[\s>]/i.test(html)) throw new Error(`${url} did not return HTML`)
}

const health = await fetch(`${base}/health.json`, { cache: 'no-store', signal: AbortSignal.timeout(15000) })
if (!health.ok) throw new Error(`health endpoint returned HTTP ${health.status}`)
if (!/no-store/i.test(health.headers.get('cache-control') || '')) throw new Error('health endpoint is cacheable')
const healthBody = await health.json()
if (healthBody.status !== 'ok' || healthBody.version !== '1.1.0') throw new Error('health metadata mismatch')

const manifest = await fetch(`${base}/offline-assets.json`, { cache: 'no-store', signal: AbortSignal.timeout(15000) })
if (!manifest.ok || !/no-store/i.test(manifest.headers.get('cache-control') || '')) {
  throw new Error('offline manifest is missing or cacheable')
}

console.log(`deployment security smoke passed (${targets.length} routes)`)
