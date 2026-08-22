import { afterEach, describe, expect, it } from 'vitest'
import { createServer } from 'node:http'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const servers = []

afterEach(async () => {
  await Promise.all(servers.splice(0).map(server => new Promise(resolve => server.close(resolve))))
})

async function fixture({ unsafeStudioScript = false } = {}) {
  const server = createServer((request, response) => {
    const strict = request.url === '/index.html' || request.url === '/studio-m/'
    const script = strict && !unsafeStudioScript ? "script-src 'self'" : "script-src 'self' 'unsafe-inline'"
    const headers = {
      'X-Content-Type-Options': 'nosniff',
      'X-Request-ID': 'fixture-request-id',
      'X-Frame-Options': 'SAMEORIGIN',
      'X-Permitted-Cross-Domain-Policies': 'none',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Permissions-Policy': 'camera=(), microphone=()',
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Resource-Policy': 'same-origin',
      'Content-Security-Policy': `default-src 'self'; ${script}`,
      'Cache-Control': ['/health.json', '/offline-assets.json'].includes(request.url) ? 'no-store' : 'no-cache'
    }
    response.writeHead(200, { ...headers, 'Content-Type': request.url === '/health.json' ? 'application/json' : 'text/html' })
    response.end(request.url === '/health.json'
      ? JSON.stringify({ status: 'ok', version: '1.0.1' })
      : request.url === '/offline-assets.json' ? JSON.stringify({ version: '1.0.1', assets: [] })
      : '<!doctype html><html lang="fa"><title>fixture</title></html>')
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  servers.push(server)
  return `http://127.0.0.1:${server.address().port}`
}

describe('deployed network security smoke', () => {
  it('accepts a local container with strict auth/Studio CSP and non-cacheable health', async () => {
    const base = await fixture()
    const result = await execFileAsync(process.execPath, ['scripts/deployment-security-smoke.mjs'], {
      env: { ...process.env, DEPLOYMENT_APP_URL: base }
    })
    expect(result.stdout).toMatch(/passed \(3 routes\)/)
  })

  it('rejects unsafe-inline scripts on the Studio shell', async () => {
    const base = await fixture({ unsafeStudioScript: true })
    await expect(execFileAsync(process.execPath, ['scripts/deployment-security-smoke.mjs'], {
      env: { ...process.env, DEPLOYMENT_APP_URL: base }
    })).rejects.toMatchObject({ stderr: expect.stringContaining('permits unsafe-inline scripts') })
  })

  it('refuses to run the production network preflight against plain HTTP', async () => {
    await expect(execFileAsync(process.execPath, ['scripts/network-preflight.mjs'], {
      env: { ...process.env, DEPLOYMENT_APP_URL: 'http://127.0.0.1:8080' }
    })).rejects.toMatchObject({ stderr: expect.stringContaining('requires an HTTPS deployment URL') })
  })
})
