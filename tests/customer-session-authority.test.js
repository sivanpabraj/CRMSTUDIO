import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

function memoryStorage() {
  return {
    data: {},
    getItem(key) { return this.data[key] ?? null },
    setItem(key, value) { this.data[key] = String(value) },
    removeItem(key) { delete this.data[key] }
  }
}

describe('customer session server authority boundary', () => {
  let CustomerSession
  let sessionStorage
  let contract

  beforeEach(async () => {
    vi.resetModules()
    sessionStorage = memoryStorage()
    contract = { id: 'local-contract', groomPhone: '09121234567', status: 'active' }
    vi.stubGlobal('window', {})
    vi.stubGlobal('sessionStorage', sessionStorage)
    vi.stubGlobal('AppConfig', {
      CUSTOMER_SESSION_MS: 60_000,
      allowsLocalIdentity: () => false
    })
    vi.stubGlobal('Utils', {
      normalizePhone: value => String(value || '').replace(/\D/g, ''),
      storage: { get: vi.fn((_key, fallback) => fallback), set: vi.fn(), remove: vi.fn() }
    })
    vi.stubGlobal('DB', {
      find: vi.fn((_name, predicate) => predicate(contract) ? contract : null)
    })
    vi.stubGlobal('SignedProof', {
      verifyObject: vi.fn(async () => true),
      signObject: vi.fn(async value => ({ ...value, sig: 'signed' }))
    })
    vi.stubGlobal('Cloud', {
      isConfigured: () => true,
      claimCustomerContracts: vi.fn(async () => ({ ok: true, contracts: [] }))
    })
    await import('../js/customer-session.js')
    CustomerSession = window.CustomerSession
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  function persist(overrides = {}) {
    sessionStorage.setItem(CustomerSession.KEY, JSON.stringify({
      contractId: contract.id,
      cloudContractId: 'cloud-contract',
      studioId: 'studio-1',
      phone: '09121234567',
      token: 'token',
      expiresAt: Date.now() + 30_000,
      sig: 'signed',
      ...overrides
    }))
  }

  it('rejects a forged local session when the server grants no matching contract', async () => {
    persist()
    await expect(CustomerSession.get()).resolves.toBeNull()
    expect(sessionStorage.getItem(CustomerSession.KEY)).toBeNull()
    expect(Cloud.claimCustomerContracts).toHaveBeenCalledOnce()
  })

  it('accepts only an exact server-authorized contract and tenant pair', async () => {
    Cloud.claimCustomerContracts.mockResolvedValue({
      ok: true,
      contracts: [{ contract_id: 'cloud-contract', studio_id: 'studio-1' }]
    })
    persist()
    await expect(CustomerSession.get()).resolves.toMatchObject({
      contractId: contract.id,
      cloudContractId: 'cloud-contract',
      studioId: 'studio-1',
      contract
    })
  })

  it('fails closed when cloud authority is missing, unavailable, or cross-tenant', async () => {
    persist({ cloudContractId: '' })
    await expect(CustomerSession.get()).resolves.toBeNull()

    persist()
    Cloud.claimCustomerContracts.mockRejectedValueOnce(new Error('offline'))
    await expect(CustomerSession.get()).resolves.toBeNull()

    persist()
    Cloud.claimCustomerContracts.mockResolvedValueOnce({
      ok: true,
      contracts: [{ contract_id: 'cloud-contract', studio_id: 'other-studio' }]
    })
    await expect(CustomerSession.get()).resolves.toBeNull()
  })

  it('refuses to persist a production customer session without server identifiers', async () => {
    await expect(CustomerSession.save({ contractId: contract.id }))
      .rejects.toThrow('server_customer_context_required')
    await CustomerSession.save({
      contractId: contract.id,
      cloudContractId: 'cloud-contract',
      studioId: 'studio-1'
    })
    expect(sessionStorage.getItem(CustomerSession.KEY)).toContain('cloud-contract')
  })

  it('keeps the isolated local-demo workflow available without cloud authority', async () => {
    AppConfig.allowsLocalIdentity = () => true
    persist({ cloudContractId: '', studioId: '' })
    await expect(CustomerSession.get()).resolves.toMatchObject({ contractId: contract.id, contract })
    expect(Cloud.claimCustomerContracts).not.toHaveBeenCalled()
  })
})
