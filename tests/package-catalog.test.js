import { beforeEach, describe, expect, it, vi } from 'vitest'

describe('PackageCatalog', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.stubGlobal('window', {})
  })

  it('keeps only studio production services in the built-in catalog', async () => {
    await import('../js/package-catalog.js')
    const catalog = window.PackageCatalog
    const labels = catalog.ADDONS.map(item => item.label).join(' ')

    expect(labels).not.toMatch(/لباس|اکسسوری|نورپردازی|آتش.?بازی|دسته.?گل|ماشین عروس|تشریفات/)
    expect(catalog.TIERS).toHaveProperty('economic')
    expect(catalog.TIERS).toHaveProperty('cip')
    expect(catalog.TIERS).toHaveProperty('custom')
  })

  it('does not seed out-of-scope customer reminder templates', async () => {
    await import('../js/messaging-shared.js')
    const templates = window.MessagingShared.DEFAULT_TEMPLATES
      .map(item => `${item.name} ${item.text}`)
      .join(' ')

    expect(templates).not.toMatch(/لباس|کت و شلوار|کفش رسمی|رقص ورودی|نورپردازی|آتش.?بازی/)
  })

  it('captures an immutable contract snapshot with its own total and version', async () => {
    await import('../js/package-catalog.js')
    const catalog = window.PackageCatalog
    const source = {
      id: 'pkg-1',
      version: 3,
      tier: 'gold',
      name: 'گلد',
      video: { cameras: 3, quality: '4k', price: 10_000, price4k: 2_000, clip: true },
      album: { enabled: true, size: '30x30', photoCount: 30, price: 5_000 },
      customItems: [{ label: 'تدوین ویژه', price: 3_000 }]
    }

    const snapshot = catalog.snapshot(source)
    source.video.price = 99_000
    source.customItems[0].price = 77_000

    expect(snapshot.sourcePackageId).toBe('pkg-1')
    expect(snapshot.sourceVersion).toBe(3)
    expect(snapshot.total).toBe(20_000)
    expect(snapshot.video.price).toBe(10_000)
    expect(snapshot.customItems[0].price).toBe(3_000)
  })
})
