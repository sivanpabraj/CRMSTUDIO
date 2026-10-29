import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

describe('Production Readiness & Deployment Suite — CRMSTUDIO v6.5.0', () => {
  const root = process.cwd()

  it('package.json has valid start, server:sync and build scripts', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf-8'))
    expect(pkg.scripts.start).toBe('node server/sync-server.mjs')
    expect(pkg.scripts['server:sync']).toBe('node server/sync-server.mjs')
    expect(pkg.scripts.build).toContain('vite build')
    expect(pkg.scripts.build).toContain('copy-static.mjs')
  })

  it('vite.config.js includes all key HTML entry points in rollupOptions', () => {
    const viteConfig = fs.readFileSync(path.join(root, 'vite.config.js'), 'utf-8')
    expect(viteConfig).toContain("booking: resolve(__dirname, 'booking.html')")
    expect(viteConfig).toContain("crew: resolve(__dirname, 'crew.html')")
    expect(viteConfig).toContain("invoice: resolve(__dirname, 'invoice.html')")
    expect(viteConfig).toContain("landing: resolve(__dirname, 'landing.html')")
    expect(viteConfig).toContain("contract: resolve(__dirname, 'contract.html')")
    expect(viteConfig).toContain("customer: resolve(__dirname, 'customer.html')")
  })

  it('scripts/copy-static.mjs copies icons, guides and health.json to dist', () => {
    const copyScript = fs.readFileSync(path.join(root, 'scripts/copy-static.mjs'), 'utf-8')
    expect(copyScript).toContain("copy('icons', 'icons')")
    expect(copyScript).toContain("'health.json'")
    expect(copyScript).toContain("'bale_bot_guide.html'")
    expect(copyScript).toContain("'studio_architecture_ai_map.html'")
  })

  it('docker/nginx.conf includes API proxy pass, security headers and gzip', () => {
    const nginxConf = fs.readFileSync(path.join(root, 'docker/nginx.conf'), 'utf-8')
    expect(nginxConf).toContain('location /api/ {')
    expect(nginxConf).toContain('proxy_pass http://127.0.0.1:3000;')
    expect(nginxConf).toContain('gzip on;')
    expect(nginxConf).toContain('X-Frame-Options SAMEORIGIN')
    expect(nginxConf).toContain('Content-Security-Policy')
  })

  it('docker-compose.yml defines sync-server and frontend with volumes and healthchecks', () => {
    expect(fs.existsSync(path.join(root, 'docker-compose.yml'))).toBe(true)
    const compose = fs.readFileSync(path.join(root, 'docker-compose.yml'), 'utf-8')
    expect(compose).toContain('sync-server:')
    expect(compose).toContain('frontend:')
    expect(compose).toContain('crmstudio_data:')
    expect(compose).toContain('crmstudio_backups:')
  })

  it('docker/Dockerfile.server exists with healthcheck and node runner', () => {
    expect(fs.existsSync(path.join(root, 'docker/Dockerfile.server'))).toBe(true)
    const dockerfile = fs.readFileSync(path.join(root, 'docker/Dockerfile.server'), 'utf-8')
    expect(dockerfile).toContain('CMD ["node", "server/sync-server.mjs"]')
    expect(dockerfile).toContain('HEALTHCHECK')
  })

  it('.env.example documents all critical production variables', () => {
    const envExample = fs.readFileSync(path.join(root, '.env.example'), 'utf-8')
    expect(envExample).toContain('PORT=3000')
    expect(envExample).toContain('DATA_DIR=/var/lib/crmstudio')
    expect(envExample).toContain('SYSTEM_UPDATE_KEY=')
    expect(envExample).toContain('MELIPAYAMAK_API_KEY=')
    expect(envExample).toContain('SMTP_HOST=')
    expect(envExample).toContain('BALE_BOT_TOKEN=')
  })

  it('server/crmstudio-backup.sh handles DATA_DIR dynamically with fallback', () => {
    const backupScript = fs.readFileSync(path.join(root, 'server/crmstudio-backup.sh'), 'utf-8')
    expect(backupScript).toContain('DATA_DIR="${DATA_DIR:-/var/lib/crmstudio}"')
    expect(backupScript).toContain('TENANTS_DIR="$DATA_DIR/tenants"')
  })

  it('production dist directory contains all compiled HTML pages and assets', () => {
    expect(fs.existsSync(path.join(root, 'dist/booking.html'))).toBe(true)
    expect(fs.existsSync(path.join(root, 'dist/crew.html'))).toBe(true)
    expect(fs.existsSync(path.join(root, 'dist/invoice.html'))).toBe(true)
    expect(fs.existsSync(path.join(root, 'dist/landing.html'))).toBe(true)
    expect(fs.existsSync(path.join(root, 'dist/site.html'))).toBe(true)
    expect(fs.existsSync(path.join(root, 'dist/contract.html'))).toBe(true)
    expect(fs.existsSync(path.join(root, 'dist/customer.html'))).toBe(true)
    expect(fs.existsSync(path.join(root, 'dist/icons/icon-192.png'))).toBe(true)
    expect(fs.existsSync(path.join(root, 'dist/manifest.json'))).toBe(true)
    expect(fs.existsSync(path.join(root, 'dist/health.json'))).toBe(true)
  })
})
