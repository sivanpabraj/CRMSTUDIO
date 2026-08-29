import { readFileSync, readdirSync } from 'node:fs'

const pkg = JSON.parse(readFileSync('package.json', 'utf8'))
const lock = JSON.parse(readFileSync('package-lock.json', 'utf8'))
const manifest = JSON.parse(readFileSync('manifest.json', 'utf8'))
const health = JSON.parse(readFileSync('public/health.json', 'utf8'))
const appConfig = readFileSync('js/config.js', 'utf8')
const appVersion = appConfig.match(/APP_VERSION:\s*['"]([^'"]+)['"]/)?.[1]
const versions = new Map([
  ['package.json', pkg.version],
  ['package-lock.json', lock.version],
  ['package-lock root', lock.packages?.['']?.version],
  ['manifest.json', manifest.version],
  ['public/health.json', health.version],
  ['js/config.js', appVersion]
])

for (const [source, version] of versions) {
  if (version !== pkg.version) throw new Error(`${source} version ${version} does not match ${pkg.version}`)
}
if (pkg.version !== '1.1.0') throw new Error(`release version must be 1.1.0, got ${pkg.version}`)
const migrations = readdirSync('supabase/migrations').filter(name => /^\d{3}_.+\.sql$/.test(name)).sort()
const expectedLastMigration = '044_server_authority_and_backup_retirement.sql'
if (migrations.at(-1) !== expectedLastMigration) {
  throw new Error(`v1.1.0 migration manifest must end at ${expectedLastMigration}, got ${migrations.at(-1)}`)
}
const requiredDomainMigrations = [
  '20260826220440_erp_domain_finance_authority.sql',
  '20260826220447_erp_payroll_cheque_personnel_contracts.sql',
  '20260827003000_erp_personnel_portal_authority.sql'
]
const migrationFiles = new Set(readdirSync('supabase/migrations'))
for (const migration of requiredDomainMigrations) {
  if (!migrationFiles.has(migration)) throw new Error(`v1.1.0 is missing required ERP migration ${migration}`)
}
if (process.env.RELEASE_REQUIRE_TAG === '1' && process.env.GITHUB_REF_TYPE !== 'tag') {
  throw new Error('release workflow must run from an immutable version tag')
}
if (process.env.GITHUB_REF_TYPE === 'tag') {
  const expected = `v${pkg.version}`
  if (process.env.GITHUB_REF_NAME !== expected) {
    throw new Error(`release tag ${process.env.GITHUB_REF_NAME} does not match ${expected}`)
  }
}
const major = Number(process.versions.node.split('.')[0])
if (major < 22 || major >= 25) throw new Error(`Node ${process.versions.node} is outside supported range >=22 <25`)
console.log(`release metadata ok — v${pkg.version}, Node ${process.versions.node}`)
