/**
 * Copy vanilla JS/CSS assets into dist/ after Vite build.
 * HTML entries reference js/*.js directly — they are not bundled by Vite.
 */
import { cpSync, existsSync, mkdirSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const dist = join(root, 'dist')

function copy(src, dest) {
  const from = join(root, src)
  const to = join(dist, dest)
  if (!existsSync(from)) return
  mkdirSync(dirname(to), { recursive: true })
  cpSync(from, to, { recursive: true })
  console.log(`copy-static: ${src} → dist/${dest}`)
}

copy('js', 'js')
copy('css', 'css')
copy('icons', 'icons')
copy('studio-m/js', 'studio-m/js')
copy('studio-m/css', 'studio-m/css')

for (const file of ['sw.js', 'manifest.json', 'admin.css', 'contract.css', 'admin.js', 'contract.js']) {
  const from = join(root, file)
  if (existsSync(from)) {
    cpSync(from, join(dist, file))
    console.log(`copy-static: ${file} → dist/${file}`)
  }
}
