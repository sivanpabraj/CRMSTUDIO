#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '../studio-m/js')

for (const name of fs.readdirSync(dir).filter(f => f.endsWith('.js'))) {
  const file = path.join(dir, name)
  let src = fs.readFileSync(file, 'utf8')
  const before = src

  src = src.replace(
    /onclick="event\.stopPropagation\(\);([A-Za-z_$][\w.$]*)\('\$\{([^}]+)\}'\)"/g,
    (_, fn, expr) => '${SMEvents.attrs(\'' + fn + '\', [' + expr + '])} data-sm-stop="1"'
  )

  src = src.replace(
    /onclick="event\.stopPropagation\(\);([A-Za-z_$][\w.$]*)\('([^'\\]+)'\)"/g,
    (_, fn, arg) => '${SMEvents.attrs(\'' + fn + '\', ' + JSON.stringify([arg]) + ')} data-sm-stop="1"'
  )

  // Multi-arg: SMMessaging.sendOne('${t.id}','${c.id}')
  src = src.replace(
    /onclick="([A-Za-z_$][\w.$]*)\('\$\{([^}]+)\}','\$\{([^}]+)\}'\)"/g,
    (_, fn, a, b) => '${SMEvents.attrs(\'' + fn + '\', [' + a + ', ' + b + '])}'
  )

  // SMH.remove('col','${id}','route')
  src = src.replace(
    /onclick="SMH\.remove\('([^']+)','\$\{([^}]+)\}','([^']+)'\)"/g,
    (_, col, expr, route) => '${SMEvents.attrs(\'SMH.remove\', [\'' + col + '\', ' + expr + ', \'' + route + '\'])}'
  )

  // SMH.deleteInModal
  src = src.replace(
    /onclick="SMH\.deleteInModal\('\$\{([^}]+)\}','\$\{([^}]+)\}','\$\{([^}]+)\}'\)"/g,
    (_, a, b, c) => '${SMEvents.attrs(\'SMH.deleteInModal\', [' + a + ', ' + b + ', ' + c + '])}'
  )

  if (src !== before) {
    fs.writeFileSync(file, src)
    console.log('fixed', name)
  }
}
