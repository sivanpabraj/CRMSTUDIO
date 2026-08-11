#!/usr/bin/env node
/**
 * Migrate simple inline onclick handlers in studio-m/js to SMEvents.attrs.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '../studio-m/js')

function migrate(src) {
  let out = src
  let changes = 0

  const skipFiles = new Set(['events.js']) // don't touch itself

  // onclick="Foo.bar()"
  out = out.replace(
    /(?:type="button"\s+)?onclick="([A-Za-z_$][\w.$]*)\(\)"/g,
    (_, fn) => {
      changes++
      return `\${SMEvents.attrs('${fn}')}`
    }
  )

  // onclick="Foo.bar('static')"
  out = out.replace(
    /(?:type="button"\s+)?onclick="([A-Za-z_$][\w.$]*)\('([^'\\]*)'\)"/g,
    (_, fn, arg) => {
      changes++
      return `\${SMEvents.attrs('${fn}', ${JSON.stringify([arg])})}`
    }
  )

  // onclick="Foo.bar('${expr}')"
  out = out.replace(
    /(?:type="button"\s+)?onclick="([A-Za-z_$][\w.$]*)\('\$\{([^}]+)\}'\)"/g,
    (_, fn, expr) => {
      changes++
      return `\${SMEvents.attrs('${fn}', [${expr}])}`
    }
  )

  // onclick="Foo.bar(${expr})"  numeric/ident
  out = out.replace(
    /(?:type="button"\s+)?onclick="([A-Za-z_$][\w.$]*)\(\$\{([^}]+)\}\)"/g,
    (_, fn, expr) => {
      changes++
      return `\${SMEvents.attrs('${fn}', [${expr}])}`
    }
  )

  return { out, changes }
}

let total = 0
for (const name of fs.readdirSync(dir).filter(f => f.endsWith('.js'))) {
  if (name === 'events.js') continue
  const file = path.join(dir, name)
  const src = fs.readFileSync(file, 'utf8')
  const { out, changes } = migrate(src)
  if (changes) {
    fs.writeFileSync(file, out)
    console.log(`${name}: ${changes}`)
    total += changes
  }
}
console.log(`total conversions: ${total}`)
