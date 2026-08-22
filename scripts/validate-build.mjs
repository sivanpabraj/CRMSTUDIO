import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const required = [
  'dist/index.html', 'dist/site.html', 'dist/start.html', 'dist/studio-m/index.html',
  'dist/studio-m/auth-callback.html', 'dist/manifest.json', 'dist/health.json', 'dist/offline-assets.json'
]
for (const file of required) if (!existsSync(file)) throw new Error(`missing release artifact: ${file}`)

const health = JSON.parse(readFileSync('dist/health.json', 'utf8'))
const pkg = JSON.parse(readFileSync('package.json', 'utf8'))
if (health.version !== pkg.version) throw new Error('built health version does not match package version')
const offline = JSON.parse(readFileSync('dist/offline-assets.json', 'utf8'))
if (offline.version !== pkg.version || !Array.isArray(offline.assets)) throw new Error('offline manifest metadata mismatch')
for (const asset of offline.assets) {
  if (/^(?:https?:|\/\/)|(?:^|\/)\.\.(?:\/|$)/i.test(asset)) throw new Error(`unsafe offline asset path: ${asset}`)
  if (!existsSync(join('dist', asset))) throw new Error(`offline manifest references missing asset: ${asset}`)
}

const buildFlags = readFileSync('dist/js/build-flags.js', 'utf8')
if (!/Object\.freeze\(\{"localDemo":false\}\)/.test(buildFlags)) {
  throw new Error('release artifact enables local demo identity')
}

const files = []
const walk = dir => {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) walk(path)
    else files.push(path)
  }
}
walk('dist')
const forbidden = files.filter(path => /(^|\/)(\.env(?:\.|$)|.*\.(?:pem|key|p12|sql))$/i.test(relative('dist', path)))
if (forbidden.length) throw new Error(`sensitive files in build: ${forbidden.join(', ')}`)

for (const path of files.filter(file => file.endsWith('.html'))) {
  const html = readFileSync(path, 'utf8')
  if (/<script\b(?![^>]*\bsrc\s*=)[^>]*>/i.test(html)) {
    throw new Error(`inline script in release HTML: ${relative('dist', path)}`)
  }
  if (/\son[a-z]+\s*=/i.test(html)) {
    throw new Error(`inline event handler in release HTML: ${relative('dist', path)}`)
  }
}

const initialJs = files
  .filter(path => path.endsWith('.js') && relative('dist', path).startsWith('assets/'))
  .reduce((sum, path) => sum + statSync(path).size, 0)
if (initialJs > 350_000) throw new Error(`initial bundled JavaScript ${initialJs} exceeds temporary 350KB raw ceiling`)
console.log(`build artifact ok — ${files.length} files, ${initialJs} bytes initial bundled JavaScript`)
