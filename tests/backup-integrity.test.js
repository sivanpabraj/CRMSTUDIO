import { beforeEach, describe, expect, it, vi } from 'vitest'

describe('BackupService integrity envelope', () => {
  beforeEach(async () => {
    vi.resetModules()
    vi.stubGlobal('window', {})
    await import('../js/backup-service.js')
  })

  it('round-trips a verified backup payload', async () => {
    const source = JSON.stringify({ users: [], contracts: [], studioInfo: { name: 'ماندنی' } })
    const archive = await window.BackupService.envelope(source)
    const decoded = await window.BackupService.decode(archive)
    expect(decoded).toMatchObject({ ok: true, verified: true, legacy: false, payload: source })
  })

  it('rejects modified backup payloads', async () => {
    const source = JSON.stringify({ users: [], contracts: [], studioInfo: {} })
    const archive = JSON.parse(await window.BackupService.envelope(source))
    archive.payload = archive.payload.replace('contracts', 'payments')
    await expect(window.BackupService.decode(JSON.stringify(archive))).resolves.toMatchObject({ ok: false })
  })

  it('keeps old plain JSON backups importable with an explicit legacy flag', async () => {
    const source = JSON.stringify({ users: [], contracts: [], studioInfo: {} })
    await expect(window.BackupService.decode(source)).resolves.toMatchObject({ ok: true, legacy: true, payload: source })
  })
})
