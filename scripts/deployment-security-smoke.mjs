const base = String(process.env.DEPLOYMENT_APP_URL || '').replace(/\/+$/, '')
if (!/^https:\/\//i.test(base)) throw new Error('DEPLOYMENT_APP_URL must be an HTTPS origin')

const targets = [`${base}/site.html`, `${base}/studio-m/`]
for (const url of targets) {
  const response = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(15000) })
  if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}`)
  const required = {
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'SAMEORIGIN',
    'referrer-policy': 'strict-origin-when-cross-origin',
    'content-security-policy': "default-src 'self'"
  }
  for (const [header, expected] of Object.entries(required)) {
    const value = response.headers.get(header) || ''
    if (!value.toLowerCase().includes(expected.toLowerCase())) {
      throw new Error(`${url} missing required ${header}`)
    }
  }
  const html = await response.text()
  if (!/<html[\s>]/i.test(html)) throw new Error(`${url} did not return HTML`)
}

console.log(`deployment security smoke passed (${targets.length} routes)`)
