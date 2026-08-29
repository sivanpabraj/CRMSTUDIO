import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'

const lock = JSON.parse(readFileSync('package-lock.json', 'utf8'))
const pkg = JSON.parse(readFileSync('package.json', 'utf8'))
const packages = Object.entries(lock.packages || {})
  .filter(([path, data]) => path && data?.version)
  .map(([path, data]) => ({
    SPDXID: `SPDXRef-${path.replace(/[^a-zA-Z0-9.-]/g, '-')}`,
    name: path.replace(/^node_modules\//, ''),
    versionInfo: data.version,
    downloadLocation: data.resolved || 'NOASSERTION',
    filesAnalyzed: false,
    licenseConcluded: data.license || 'NOASSERTION'
  }))
const document = {
  spdxVersion: 'SPDX-2.3', dataLicense: 'CC0-1.0', SPDXID: 'SPDXRef-DOCUMENT',
  name: `${pkg.name}-${pkg.version}`, documentNamespace: `https://crmstudio.invalid/sbom/${pkg.version}`,
  creationInfo: { created: new Date().toISOString(), creators: ['Tool: CRMSTUDIO generate-sbom.mjs'] },
  packages
}
mkdirSync('artifacts', { recursive: true })
writeFileSync('artifacts/sbom.spdx.json', `${JSON.stringify(document, null, 2)}\n`)
console.log(`SBOM generated — ${packages.length} packages`)
