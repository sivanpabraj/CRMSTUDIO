import { existsSync, readFileSync, readdirSync } from 'node:fs'

const fail = (message) => {
  console.error(`repository validation failed: ${message}`)
  process.exitCode = 1
}

for (const required of ['package-lock.json', '.env.example', 'Dockerfile', 'docker/nginx.conf']) {
  if (!existsSync(required)) fail(`missing required file: ${required}`)
}

const nginx = readFileSync('docker/nginx.conf', 'utf8')
const cspHeaders = [...nginx.matchAll(/Content-Security-Policy\s+"([^"]+)"/g)].map(match => match[1])
if (!cspHeaders.length) fail('nginx must define a Content-Security-Policy')
for (const csp of cspHeaders) {
  const scriptDirective = csp.split(';').map(value => value.trim())
    .find(value => value.startsWith('script-src '))
  if (!scriptDirective) fail('every nginx CSP must define script-src')
  else if (scriptDirective.includes("'unsafe-inline'")) fail('nginx script-src must not allow unsafe-inline')
}

const migrations = readdirSync('supabase/migrations')
  .filter((name) => /^\d{3}_.+\.sql$/.test(name))
  .sort()
const numbers = migrations.map((name) => Number(name.slice(0, 3)))
if (new Set(numbers).size !== numbers.length) fail('duplicate migration number')
for (let i = 1; i < numbers.length; i++) {
  if (numbers[i] !== numbers[i - 1] + 1) {
    fail(`migration gap between ${migrations[i - 1]} and ${migrations[i]}`)
  }
}

const workflow = readFileSync('.github/workflows/ci.yml', 'utf8')
if (workflow.includes('pull_request_target:')) fail('pull_request_target is forbidden')
if (!workflow.includes('permissions:\n  contents: read')) fail('CI must use read-only token permissions')
for (const check of ['quality', 'security', 'sast', 'e2e', 'container', 'database']) {
  if (!workflow.includes(`  ${check}:`)) fail(`CI is missing required ${check} job`)
}
for (const gate of ['npm run test:coverage', 'npm run security:scan', 'npm run sbom']) {
  if (!workflow.includes(gate)) fail(`CI is missing required supply-chain/quality gate: ${gate}`)
}
for (const workflowName of readdirSync('.github/workflows').filter(name => name.endsWith('.yml'))) {
  const source = readFileSync(`.github/workflows/${workflowName}`, 'utf8')
  for (const match of source.matchAll(/^\s*-?\s*uses:\s*([^\s@]+)@([^\s#]+)/gm)) {
    const [, action, revision] = match
    if (!/^[a-f0-9]{40}$/.test(revision)) {
      fail(`${workflowName}: action ${action} must be pinned to a full commit SHA, got ${revision}`)
    }
  }
}
const releaseWorkflow = readFileSync('.github/workflows/release.yml', 'utf8')
for (const command of ['supabase db reset --local', 'supabase test db', 'E2E_REQUIRE_AUTH', 'npm run test:coverage', 'npm run sbom', 'SHA256SUMS']) {
  if (!releaseWorkflow.includes(command)) fail(`release workflow is missing gate: ${command}`)
}
const vitestConfig = readFileSync('vitest.config.js', 'utf8')
for (const threshold of ['statements: 80', 'branches: 80', 'statements: 90', 'branches: 90']) {
  if (!vitestConfig.includes(threshold)) fail(`coverage policy is missing threshold: ${threshold}`)
}
const opsWorkflow = readFileSync('.github/workflows/ops-check.yml', 'utf8')
for (const requiredSecret of ['SUPABASE_DB_URL', 'DEPLOYMENT_HEALTH_URL', 'DEPLOYMENT_APP_URL']) {
  if (!opsWorkflow.includes(requiredSecret)) fail(`operations workflow is missing ${requiredSecret}`)
}
if (existsSync('admin.html') || existsSync('admin.js') || existsSync('admin.css')) {
  fail('classic admin source must not be shipped')
}

if (process.exitCode) process.exit(process.exitCode)
console.log(`repository invariants ok (${migrations.length} migrations)`)
