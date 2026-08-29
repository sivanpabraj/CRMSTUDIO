import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DomainApi, randomKey } from '../js/domain-api.js'

const STUDIO_ID = '11111111-1111-4111-8111-111111111111'
const CHALLENGE_ID = '22222222-2222-4222-8222-222222222222'

describe('DomainApi server authority boundary', () => {
  let rpc
  beforeEach(() => {
    rpc = vi.fn().mockResolvedValue({ data: { ok: true, verified: true }, error: null })
    vi.stubGlobal('window', {
      Cloud: {
        isEnabled: () => true,
        client: vi.fn().mockResolvedValue({ rpc }),
        session: vi.fn().mockResolvedValue({ access_token: 'token' }),
        studioCloudConfig: () => ({ studioId: STUDIO_ID }),
        resolvedConfig: () => ({ url: 'https://project.supabase.co', anonKey: 'publishable' })
      },
      ErpRuntime: { state: () => ({ ledgerVersion: 7 }) }
    })
  })
  afterEach(() => vi.unstubAllGlobals())

  it('rejects missing cloud authority', async () => {
    window.Cloud.isEnabled = () => false
    await expect(DomainApi._context()).rejects.toThrow('اتصال ابری')
  })

  it('rejects malformed tenant context', async () => {
    window.Cloud.studioCloudConfig = () => ({ studioId: 'bad' })
    await expect(DomainApi._context()).rejects.toThrow('نشست معتبر')
  })

  it('surfaces typed RPC failures without leaking multiline details', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: '42501', message: 'denied\nsecret' } })
    await expect(DomainApi._rpc('x', {})).rejects.toMatchObject({ message: 'denied', code: '42501' })
  })

  it('requests OTP without sending a browser-generated code or text', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ ok: true, challengeId: CHALLENGE_ID })
    }))
    const result = await DomainApi.requestContractOtp({ role: 'groom', phone: '09121234567' })
    expect(result.challengeId).toBe(CHALLENGE_ID)
    const request = JSON.parse(fetch.mock.calls[0][1].body)
    expect(request).toMatchObject({ action: 'contract_otp', role: 'groom', phone: '09121234567' })
    expect(request).not.toHaveProperty('code')
    expect(request).not.toHaveProperty('text')
  })

  it('requests personnel contract OTP without exposing phone, code or message', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ ok: true, challengeId: CHALLENGE_ID })
    }))
    await expect(DomainApi.requestPersonnelContractOtp(STUDIO_ID)).resolves.toMatchObject({ challengeId: CHALLENGE_ID })
    const request = JSON.parse(fetch.mock.calls[0][1].body)
    expect(request).toEqual({ action: 'personnel_contract_otp', contractId: STUDIO_ID })
    expect(request).not.toHaveProperty('phone')
    expect(request).not.toHaveProperty('code')
    expect(request).not.toHaveProperty('text')
  })

  it('fails closed for malformed and rejected personnel contract OTP requests', async () => {
    vi.stubGlobal('fetch', vi.fn())
    await expect(DomainApi.requestPersonnelContractOtp('bad')).rejects.toThrow('نامعتبر')
    expect(fetch).not.toHaveBeenCalled()
    await expect(DomainApi.acceptPersonnelContract(STUDIO_ID, 1, 'bad', '1')).rejects.toThrow('نامعتبر')
    fetch.mockResolvedValueOnce({ ok: false, json: vi.fn().mockRejectedValue(new Error('bad json')) })
    await expect(DomainApi.requestPersonnelContractOtp(STUDIO_ID)).rejects.toThrow('ناموفق')
  })

  it('fails malformed OTP requests before network', async () => {
    vi.stubGlobal('fetch', vi.fn())
    await expect(DomainApi.requestContractOtp({ role: 'owner', phone: '1' })).rejects.toThrow('نامعتبر')
    expect(fetch).not.toHaveBeenCalled()
    await expect(DomainApi.verifyContractOtp('bad', '1')).rejects.toThrow('نامعتبر')
  })

  it('rejects typed invalid OTP results even when transport succeeds', async () => {
    rpc.mockResolvedValueOnce({ data: { ok: false, verified: false, error: 'contract_otp_invalid' }, error: null })
    await expect(DomainApi.verifyContractOtp(CHALLENGE_ID, '123456')).rejects.toThrow('contract_otp_invalid')
    rpc.mockResolvedValueOnce({ data: { ok: false, error: 'personnel_contract_otp_invalid' }, error: null })
    await expect(DomainApi.acceptPersonnelContract(CHALLENGE_ID, 1, STUDIO_ID, '123456'))
      .rejects.toThrow('personnel_contract_otp_invalid')
  })

  it('rejects failed OTP HTTP responses and can resolve studio membership fallback', async () => {
    window.Cloud.studioCloudConfig = () => ({ studioId: '' })
    window.Cloud._loadMemberStudioId = vi.fn().mockResolvedValue(STUDIO_ID)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, json: vi.fn().mockResolvedValue({ error: 'denied' }) }))
    await expect(DomainApi.requestContractOtp({ role: 'bride', phone: '09121234567' })).rejects.toThrow('denied')
    window.Cloud.client = vi.fn().mockResolvedValue(null)
    await expect(DomainApi._context()).rejects.toThrow('نشست معتبر')
  })

  it('calls dedicated RPCs with tenant and optimistic ledger version', async () => {
    await DomainApi.verifyContractOtp(CHALLENGE_ID, '123456')
    await DomainApi.createContractWithDeposit({ contract: { total: 10 }, challenges: { groom: CHALLENGE_ID } })
    await DomainApi.recordPayroll({ personnelUserId: CHALLENGE_ID, grossIrr: 100, bankId: 'bank' }, 'payroll:key')
    await DomainApi.registerCheque({ chequeNumber: '1' })
    await DomainApi.saveBankAccount({ title: 'Main' })
    await DomainApi.transitionCheque({ chequeId: CHALLENGE_ID, expectedVersion: 1, status: 'cleared' })
    await DomainApi.createPersonnelContract({ personnelUserId: CHALLENGE_ID })
    await DomainApi.respondPersonnelContract(CHALLENGE_ID, 1, true)
    await DomainApi.acceptPersonnelContract(CHALLENGE_ID, 1, STUDIO_ID, '123456')
    await DomainApi.assignPersonnel({ workOrderId: CHALLENGE_ID, userId: STUDIO_ID, role: 'camera', startsAt: 'a', endsAt: 'b' })
    await DomainApi.respondAssignment(CHALLENGE_ID, 1, true)
    await DomainApi.completeAssignment(CHALLENGE_ID, 2)
    await DomainApi.recordAttendance('check_in')
    await DomainApi.saveAttendance({ personnelUserId: CHALLENGE_ID, checkInAt: '2026-01-01T00:00:00Z' })
    await DomainApi.transitionWorkOrder(CHALLENGE_ID, 2, 'editing', 'note')
    await DomainApi.cancelContract({ contractId: CHALLENGE_ID, expectedVersion: 2, reason: 'cancel reason' })
    await DomainApi.transitionContract({ contractId: CHALLENGE_ID, expectedVersion: 3, status: 'done' })
    await DomainApi.rescheduleContract({ contractId: CHALLENGE_ID, expectedVersion: 3,
      eventDate: '1405/06/01', startsAt: 'a', endsAt: 'b', reason: 'move reason' })
    expect(rpc.mock.calls.map(call => call[0])).toEqual([
      'verify_contract_otp', 'create_contract_with_deposit', 'record_payroll_payment',
      'register_cheque', 'save_bank_account', 'transition_cheque',
      'create_personnel_contract', 'respond_personnel_contract', 'accept_personnel_contract_with_otp',
      'assign_personnel_to_work_order', 'respond_work_order_assignment', 'complete_own_work_order_assignment',
      'record_attendance_action', 'save_attendance_override', 'transition_work_order_status',
      'cancel_contract_with_refund_v2', 'transition_contract_status', 'reschedule_contract_event_v2'
    ])
    expect(rpc.mock.calls[2][1].p_payload.expectedLedgerVersion).toBe(7)
    expect(rpc.mock.calls[5][1].p_expected_ledger_version).toBe(7)
    expect(rpc.mock.calls[15][1]).toMatchObject({ p_refund_irr: 0, p_penalty_irr: 0, p_bank_id: null })
  })

  it('covers explicit concurrency versions and nullable command fields', async () => {
    await DomainApi.createContractWithDeposit({ contract: {}, deposit: {}, challenges: {}, idempotencyKey: 'contract:key' })
    await DomainApi.recordPayroll({ expectedLedgerVersion: 0 }, 'payroll:key')
    await DomainApi.saveBankAccount({}, CHALLENGE_ID, 2)
    await DomainApi.transitionCheque({
      chequeId: CHALLENGE_ID, expectedVersion: 2, status: 'bounced',
      expectedLedgerVersion: 0, idempotencyKey: 'cheque:key'
    })
    expect(rpc.mock.calls[0][1]).toMatchObject({ p_groom_challenge_id: null, p_bride_challenge_id: null })
    expect(rpc.mock.calls[1][1].p_payload.expectedLedgerVersion).toBe(0)
    expect(rpc.mock.calls[3][1].p_expected_ledger_version).toBe(0)
  })

  it('creates bounded idempotency keys', () => {
    expect(randomKey('x')).toMatch(/^x:/)
    expect(randomKey('x'.repeat(200))).toHaveLength(128)
  })
})
