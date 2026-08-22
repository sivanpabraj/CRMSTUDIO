import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const offenders = []
for (const name of readdirSync('tests').filter(name => name.endsWith('.test.js'))) {
  const path = join('tests', name)
  const source = readFileSync(path, 'utf8')
  const readsImplementation = /readFileSync\s*\(/.test(source)
  const stringAssertion = /expect\s*\([^\n]+\)\s*\.\s*(?:not\s*\.)?(?:toContain|toMatch)\s*\(/.test(source)
  if (readsImplementation && stringAssertion) offenders.push(path)
}

if (offenders.length) {
  console.error('behavior-test gate failed: source-string assertions are not release evidence')
  for (const path of offenders) console.error(`- ${path}`)
  console.error('Replace UI checks with Playwright behavior and SQL checks with pgTAP on Supabase local.')
  process.exit(1)
}
console.log('behavior-test gate ok — no source-string assertions found')
