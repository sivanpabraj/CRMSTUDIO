import { beforeEach, describe, expect, it, vi } from 'vitest'

describe('FileStorage security', () => {
  beforeEach(async () => {
    vi.resetModules()
    vi.stubGlobal('window', {})
    await import('../js/file-storage.js')
  })

  it('accepts only matched safe MIME and extensions', () => {
    const storage = window.FileStorage
    expect(storage.validate({ name: 'photo.jpg', type: 'image/jpeg', size: 100 }).ok).toBe(true)
    expect(storage.validate({ name: 'payload.html', type: 'text/html', size: 100 }).ok).toBe(false)
    expect(storage.validate({ name: 'fake.pdf.exe', type: 'application/pdf', size: 100 }).ok).toBe(false)
    expect(storage.validate({ name: 'huge.png', type: 'image/png', size: storage.MAX_BYTES + 1 }).ok).toBe(false)
  })

  it('uses expiring signed URLs instead of public bucket URLs', async () => {
    const createSignedUrl = vi.fn().mockResolvedValue({ data: { signedUrl: 'https://signed.example/file' }, error: null })
    vi.stubGlobal('Cloud', {
      isEnabled: () => true,
      isConfigured: () => true,
      client: async () => ({ storage: { from: () => ({ createSignedUrl }) } })
    })
    const result = await window.FileStorage.signedUrl('studio/asset/file.pdf', 9999)
    expect(result.ok).toBe(true)
    expect(result.expiresIn).toBe(900)
    expect(createSignedUrl).toHaveBeenCalledWith('studio/asset/file.pdf', 900)
  })
})
