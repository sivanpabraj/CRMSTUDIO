import { existsSync, readFileSync, readdirSync } from 'node:fs'

const fail = (message) => {
  console.error(`repository validation failed: ${message}`)
  process.exitCode = 1
}

for (const required of ['package-lock.json', '.env.example', 'Dockerfile', 'docker/nginx.conf']) {
  if (!existsSync(required)) fail(`missing required file: ${required}`)
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
if (existsSync('admin.html') || existsSync('admin.js') || existsSync('admin.css')) {
  fail('classic admin source must not be shipped')
}

if (process.exitCode) process.exit(process.exitCode)
console.log(`repository invariants ok (${migrations.length} migrations)`)
