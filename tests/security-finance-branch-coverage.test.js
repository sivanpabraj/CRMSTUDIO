import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  bankDelta,
  chequeNumber,
  chequeParty,
  chequeType,
  nextContractPaid,
  normalizeBank,
  normalizeCheque,
  previewPassCheque,
} from '../js/lib/finance-ledger.js'
import { csrfForUser, generateCsrfToken, validateCsrfBound } from '../js/lib/csrf.js'
import {
  isAllowedOrigin,
  normalizeIranPhone,
  readBoundedJson,
  validateSmsPayload,
} from '../supabase/functions/_shared/request-policy.js'
import { assertBackupPayloadSafe } from '../supabase/functions/_shared/backup-policy.js'

describe('finance ledger branch behavior', () => {
  it('normalizes absent, canonical and legacy cheque fields', () => {
    expect(chequeType(null)).toBe('incoming')
    expect(chequeType({})).toBe('incoming')
    expect(chequeType({ direction: 'outgoing' })).toBe('outgoing')
    expect(chequeNumber(null)).toBe('')
    expect(chequeNumber({})).toBe('')
    expect(chequeNumber({ chequeNumber: 'L-1' })).toBe('L-1')
    expect(chequeParty(null)).toBe('')
    expect(chequeParty({ drawer: 'صادرکننده' })).toBe('صادرکننده')
    expect(chequeParty({ party: 'قدیمی' })).toBe('قدیمی')
    expect(normalizeCheque(null)).toBeNull()
    expect(normalizeCheque('invalid')).toBe('invalid')
    expect(normalizeCheque({ drawer: 'الف' })).toMatchObject({
      type: 'incoming', number: '', client: 'الف', drawer: 'الف', status: 'pending'
    })
  })

  it('normalizes every optional bank field without NaN balances', () => {
    expect(normalizeBank(undefined)).toBeUndefined()
    expect(normalizeBank('invalid')).toBe('invalid')
    expect(normalizeBank({ account: 'A', iban: 'IR', card: 'C', holder: 'H', balance: 'bad' }))
      .toMatchObject({ account: 'A', accountNumber: 'A', iban: 'IR', shaba: 'IR', card: 'C', holder: 'H', balance: 0 })
    expect(normalizeBank({})).toEqual(expect.objectContaining({
      account: '', accountNumber: '', iban: '', shaba: '', card: '', holder: '', balance: 0
    }))
  })

  it('handles zero/invalid bank deltas and both transaction directions', () => {
    expect(bankDelta('bad', 'deposit', 0)).toBe(0)
    expect(bankDelta(100, 'deposit', '25')).toBe(125)
    expect(bankDelta(100, 'withdrawal', '25')).toBe(75)
  })

  it('rejects non-installments and clamps reversals and balances to zero', () => {
    expect(nextContractPaid(null, 'contract_payment', 1)).toBeNull()
    expect(nextContractPaid({}, 'contract_payment', 0)).toBeNull()
    expect(nextContractPaid({}, 'other', 1)).toBeNull()
    expect(nextContractPaid({ total: 100, deposit: 70, paid: 50 }, 'contract_payment', 100))
      .toEqual({ paid: 150, balance: 0 })
    expect(nextContractPaid({ total: 'bad', deposit: 'bad', paid: 'bad' }, 'contract_payment', 10, { reverse: true }))
      .toEqual({ paid: 0, balance: 0 })
  })

  it('fails each cheque precondition and passes both valid directions', () => {
    expect(previewPassCheque(null, {})).toMatchObject({ ok: false, msg: 'چک یافت نشد' })
    expect(previewPassCheque({ status: 'passed', amount: 1 }, {})).toMatchObject({ ok: false })
    expect(previewPassCheque({ status: 'pending', amount: 1 }, null)).toMatchObject({ ok: false, msg: 'حساب بانکی مرتبط یافت نشد' })
    expect(previewPassCheque({ status: 'pending', amount: 0 }, {})).toMatchObject({ ok: false, msg: 'مبلغ چک نامعتبر است' })
    expect(previewPassCheque({ type: 'outgoing', status: 'pending', amount: 2 }, { balance: 1 })).toMatchObject({ ok: false })
    expect(previewPassCheque({ type: 'outgoing', status: 'pending', amount: 2 }, { balance: 3 }))
      .toMatchObject({ ok: true, txType: 'withdrawal', newBalance: 1 })
    expect(previewPassCheque({ type: 'incoming', status: 'pending', amount: 2 }, { balance: 'bad' }))
      .toMatchObject({ ok: true, txType: 'deposit', newBalance: 2 })
  })
})

describe('CSRF helper branch behavior', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('generates a fixed-length cryptographic token', () => {
    expect(generateCsrfToken()).toMatch(/^[0-9a-f]{32}$/)
  })

  it('uses the explicit fallback only when Web Crypto is unavailable', () => {
    vi.stubGlobal('crypto', undefined)
    vi.spyOn(Date, 'now').mockReturnValue(123)
    vi.spyOn(Math, 'random').mockReturnValue(0.5)
    expect(generateCsrfToken()).toMatch(/^123_[a-z0-9]+$/)
    vi.restoreAllMocks()
  })

  it('rejects every missing/mismatched binding and accepts exact binding', () => {
    expect(validateCsrfBound('', { userId: 'u', csrf: 't' }, 'u')).toBe(false)
    expect(validateCsrfBound('t', null, 'u')).toBe(false)
    expect(validateCsrfBound('t', { userId: 'u' }, 'u')).toBe(false)
    expect(validateCsrfBound('t', { userId: 'u', csrf: 't' }, '')).toBe(false)
    expect(validateCsrfBound('x', { userId: 'u', csrf: 't' }, 'u')).toBe(false)
    expect(validateCsrfBound('t', { userId: 'other', csrf: 't' }, 'u')).toBe(false)
    expect(validateCsrfBound('t', { userId: 'u', csrf: 't' }, 'u')).toBe(true)
  })

  it('preserves an existing user token and generates a missing one', () => {
    expect(csrfForUser('u1', 'existing')).toEqual({ userId: 'u1', token: 'existing' })
    expect(csrfForUser('u2').token).toMatch(/^[0-9a-f]{32}$/)
  })
})

describe('Edge request policy branch behavior', () => {
  const base = {
    studioId: '20000000-0000-4000-8000-000000000001',
    purpose: 'generic',
    idempotencyKey: 'command-123',
    phone: '09123456789',
    text: 'پیام معتبر',
  }

  it('normalizes all accepted phone shapes and rejects invalid input', () => {
    expect(normalizeIranPhone('09123456789')).toBe('09123456789')
    expect(normalizeIranPhone('989123456789')).toBe('09123456789')
    expect(normalizeIranPhone('9123456789')).toBe('09123456789')
    expect(normalizeIranPhone(null)).toBeNull()
  })

  it('allows server/no-origin requests and parses configured origin lists', () => {
    expect(isAllowedOrigin('', '')).toBe(true)
    expect(isAllowedOrigin('https://b.test', ' https://a.test, https://b.test, ')).toBe(true)
    expect(isAllowedOrigin('https://c.test', 'https://a.test,https://b.test')).toBe(false)
  })

  it('enforces declared and actual byte sizes and JSON syntax', async () => {
    const declared = new globalThis.Request('https://edge.test', {
      method: 'POST', headers: { 'content-length': '100' }, body: '{}'
    })
    await expect(readBoundedJson(declared, 10)).rejects.toThrow('request_too_large')
    const valid = new globalThis.Request('https://edge.test', { method: 'POST', body: '{"ok":true}' })
    await expect(readBoundedJson(valid, 32)).resolves.toEqual({ ok: true })
    const invalid = new globalThis.Request('https://edge.test', { method: 'POST', body: '{bad' })
    await expect(readBoundedJson(invalid, 32)).rejects.toThrow('invalid_json')
  })

  it('rejects each malformed SMS boundary', () => {
    expect(validateSmsPayload({ ...base, studioId: 'bad' })).toMatchObject({ error: 'invalid_studio_id' })
    expect(validateSmsPayload({ ...base, purpose: 'OTP_LOGIN' })).toMatchObject({ error: 'purpose_not_allowed' })
    expect(validateSmsPayload({ ...base, idempotencyKey: 'short' })).toMatchObject({ error: 'invalid_idempotency_key' })
    expect(validateSmsPayload({ ...base, idempotencyKey: 'x'.repeat(129) })).toMatchObject({ error: 'invalid_idempotency_key' })
    expect(validateSmsPayload({ ...base, phone: '02100000000' })).toMatchObject({ error: 'invalid_recipients' })
    expect(validateSmsPayload({ ...base, phones: ['09123456789', '09123456789'], phone: undefined })).toMatchObject({ error: 'invalid_recipients' })
    expect(validateSmsPayload({ ...base, phones: Array.from({ length: 11 }, (_, i) => `091234567${String(i).padStart(2, '0')}`), phone: undefined }))
      .toMatchObject({ error: 'invalid_recipients' })
    expect(validateSmsPayload({ ...base, text: ' ' })).toMatchObject({ error: 'invalid_text' })
    expect(validateSmsPayload({ ...base, text: 'x'.repeat(501) })).toMatchObject({ error: 'invalid_text' })
  })

  it('deduplicates normalized recipients only when input cardinality remains valid', () => {
    expect(validateSmsPayload({ ...base, phones: ['09123456789', '09123456780'], phone: undefined }))
      .toMatchObject({ ok: true, purpose: 'generic', phones: ['09123456789', '09123456780'] })
  })
})

describe('backup payload policy branch behavior', () => {
  it('accepts primitives, arrays and ordinary nested records', () => {
    expect(assertBackupPayloadSafe(null)).toBe(true)
    expect(assertBackupPayloadSafe([1, { contracts: [{ id: 'c1' }] }])).toBe(true)
  })

  it('rejects exact and pattern-based secret keys after normalization', () => {
    expect(() => assertBackupPayloadSafe({ 'OTP-Code': '123456' })).toThrow(/backup_secret_field/)
    expect(() => assertBackupPayloadSafe({ providerAccessToken: 'secret' })).toThrow(/backup_secret_field/)
    expect(() => assertBackupPayloadSafe({ sms_provider_password: 'secret' })).toThrow(/backup_secret_field/)
  })

  it('rejects cyclic, too-deep and too-large payload graphs', () => {
    const cyclic = {}
    cyclic.self = cyclic
    expect(() => assertBackupPayloadSafe(cyclic)).toThrow('backup_payload_cyclic')
    expect(() => assertBackupPayloadSafe({ a: { b: 1 } }, { maxDepth: 1 })).toThrow('backup_payload_too_complex')
    expect(() => assertBackupPayloadSafe([1, 2], { maxNodes: 2 })).toThrow('backup_payload_too_complex')
  })

  it('uses safe defaults when custom limits are not integers', () => {
    expect(assertBackupPayloadSafe({ ok: true }, { maxDepth: 1.5, maxNodes: '2' })).toBe(true)
  })
})
