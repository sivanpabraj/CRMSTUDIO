import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const root = process.cwd()
const ignored = new Set(['.git', 'node_modules', 'dist', 'test-results', 'playwright-report'])
const textExt = /\.(?:js|mjs|ts|html|css|json|md|sql|toml|ya?ml|env|txt)$/i
const findings = []
const rules = [
  ['private key', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ['Supabase service-role JWT', /eyJ[a-zA-Z0-9_-]{20,}\.eyJ[a-zA-Z0-9_-]{20,}\.[a-zA-Z0-9_-]{20,}/],
  ['hardcoded bootstrap password', /(?:INITIAL_ADMIN_PASSWORD|DEFAULT_PASSWORD)\s*[:=]\s*['"][^'"]+['"]/],
  ['hardcoded SMS secret', /(?:smsApiKey|serviceRoleKey)\s*[:=]\s*['"][^'"$]{12,}['"]/i]
]

function walk(dir) {
  for (const name of readdirSync(dir)) {
    if (ignored.has(name)) continue
    const path = join(dir, name)
    const stat = statSync(path)
    if (stat.isDirectory()) walk(path)
    else if (textExt.test(name) || name === '.env.example') scan(path)
  }
}

function scan(path) {
  if (path.endsWith('scripts/security-scan.mjs')) return
  const lines = readFileSync(path, 'utf8').split('\n')
  lines.forEach((line, index) => rules.forEach(([label, pattern]) => {
    if (pattern.test(line)) findings.push(`${relative(root, path)}:${index + 1} — ${label}`)
  }))
}

walk(root)
if (findings.length) {
  console.error(`security scan failed:\n${findings.join('\n')}`)
  process.exit(1)
}
console.log('security scan ok — no committed high-risk secret pattern found')
