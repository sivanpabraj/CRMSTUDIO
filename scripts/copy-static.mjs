/**
 * Copy vanilla JS/CSS assets into dist/ after Vite build.
 * HTML entries reference js/*.js directly — they are not bundled by Vite.
 */
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { assertProductionSupabaseConfig, injectStaticPublicEnv, renderStaticBuildFlags } from './lib/static-public-env.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const dist = join(root, 'dist')
assertProductionSupabaseConfig(process.env)

function copy(src, dest) {
  const from = join(root, src)
  const to = join(dist, dest)
  if (!existsSync(from)) return
  mkdirSync(dirname(to), { recursive: true })
  cpSync(from, to, { recursive: true })
  console.log(`copy-static: ${src} → dist/${dest}`)
}

copy('js', 'js')
writeFileSync(join(dist, 'js/build-flags.js'), renderStaticBuildFlags(process.env))
console.log('copy-static: injected immutable build capability flags')
const cloudDist = join(dist, 'js/cloud.js')
if (existsSync(cloudDist)) {
  const source = readFileSync(cloudDist, 'utf8')
  writeFileSync(cloudDist, injectStaticPublicEnv(source, process.env))
  console.log('copy-static: injected trusted public Supabase build config')
}
copy('css', 'css')
copy('icons', 'icons')
copy('studio-m/js', 'studio-m/js')
copy('studio-m/css', 'studio-m/css')
copy('studio-m/index.html', 'studio-m/index.html')
for (const html of ['site.html', 'start.html', 'index.html', 'join.html', 'contract.html', 'customer.html']) {
  copy(html, html)
}

for (const file of ['sw.js', 'manifest.json', 'contract.css', 'contract.js']) {
  const from = join(root, file)
  if (existsSync(from)) {
    cpSync(from, join(dist, file))
    console.log(`copy-static: ${file} → dist/${file}`)
  }
}

// Compatibility redirect only; no classic source is shipped.
const adminDist = join(dist, 'admin.html')
writeFileSync(adminDist, `<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
  <meta charset="UTF-8"/>
  <meta http-equiv="refresh" content="0;url=studio-m/"/>
  <title>Studio M Pro</title>
</head>
<body>
  <p>پنل کلاسیک در بیلد عمومی موجود نیست. <a href="studio-m/">Studio M Pro</a></p>
</body>
</html>
`)
console.log('copy-static: admin.html → permanent Studio M redirect')

const required = [
  'js/lib/observability.js',
  'js/lib/list-page.js',
  'js/lib/secure-db-policy.js',
  'js/lib/finance-outbox.js',
  'js/lib/plan-limits.js',
  'js/erp-runtime.js',
  'studio-m/index.html',
  'studio-m/js/events.js',
  'studio-m/js/modules.js',
  'studio-m/js/modules-bookings.js',
  'studio-m/js/modules-contracts.js',
  'studio-m/js/modules-packages.js',
  'studio-m/js/modules-invoices.js',
  'studio-m/js/modules-expenses.js',
  'studio-m/js/modules-misc.js'
]
const missing = required.filter(p => !existsSync(join(dist, p)))
if (missing.length) {
  console.error('copy-static: missing required assets:', missing.join(', '))
  process.exit(1)
}
console.log('copy-static: required assets ok')

function walk(dir, prefix = '') {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name
    return entry.isDirectory() ? walk(join(dir, entry.name), relative) : [relative]
  })
}

const offlineAssets = walk(dist)
  .filter(file => /\.(?:html?|css|js|svg|png|webp|ico|woff2?)$/i.test(file))
  .filter(file => !/(?:^|\/)sw\.js$/i.test(file))
  .sort()
writeFileSync(join(dist, 'offline-assets.json'), `${JSON.stringify({ version: '1.1.0', assets: offlineAssets })}\n`)
console.log(`copy-static: offline manifest ok (${offlineAssets.length} assets)`)
