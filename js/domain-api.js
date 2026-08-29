/** Typed, fail-closed browser boundary for server-authoritative ERP domains. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const randomKey = prefix => `${prefix}:${globalThis.crypto?.randomUUID?.() || Date.now()}`.slice(0, 128)

const DomainApi = {
  async _context() {
    if (typeof window === 'undefined' || !window.Cloud?.isEnabled?.()) {
      throw new Error('اتصال ابری ERP فعال نیست')
    }
    const [client, session] = await Promise.all([window.Cloud.client(), window.Cloud.session()])
    const studioId = String(window.Cloud.studioCloudConfig?.().studioId || await window.Cloud._loadMemberStudioId?.() || '')
    if (!client || !session?.access_token || !UUID.test(studioId)) {
      throw new Error('نشست معتبر ERP یا شناسهٔ استودیو در دسترس نیست')
    }
    return { client, session, studioId, config: window.Cloud.resolvedConfig?.() || {} }
  },

  async _rpc(name, args) {
    const { client } = await this._context()
    const { data, error } = await client.rpc(name, args)
    if (error) {
      const failure = new Error(String(error.message || `${name}_failed`).split('\n')[0])
      failure.code = error.code || ''
      throw failure
    }
    return data
  },

  async requestContractOtp({ role, phone, idempotencyKey = randomKey('contract-otp') }) {
    const { session, studioId, config } = await this._context()
    const normalized = String(phone || '').replace(/\D/g, '')
    if (!['groom', 'bride'].includes(role) || !/^09\d{9}$/.test(normalized)) {
      throw new Error('درخواست OTP قرارداد نامعتبر است')
    }
    const response = await fetch(`${String(config.url).replace(/\/+$/, '')}/functions/v1/send-sms`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        apikey: config.anonKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ action: 'contract_otp', studioId, role, phone: normalized, idempotencyKey })
    })
    const body = await response.json().catch(() => ({}))
    if (!response.ok || !body.ok || !UUID.test(String(body.challengeId || ''))) {
      throw new Error(body.error || 'ارسال OTP قرارداد ناموفق بود')
    }
    return body
  },

  async verifyContractOtp(challengeId, code) {
    if (!UUID.test(String(challengeId || '')) || !/^\d{6}$/.test(String(code || ''))) {
      return Promise.reject(new Error('کد یا شناسهٔ OTP نامعتبر است'))
    }
    const result = await this._rpc('verify_contract_otp', {
      p_challenge_id: challengeId,
      p_code: String(code)
    })
    if (!result?.ok || !result?.verified) throw new Error(result?.error || 'کد تأیید قرارداد نامعتبر است')
    return result
  },

  async createContractWithDeposit({ contract, deposit = {}, challenges = {}, idempotencyKey = randomKey('contract-create') }) {
    const { studioId } = await this._context()
    return this._rpc('create_contract_with_deposit', {
      p_studio_id: studioId,
      p_idempotency_key: idempotencyKey,
      p_contract: contract,
      p_deposit: deposit,
      p_groom_challenge_id: challenges.groom || null,
      p_bride_challenge_id: challenges.bride || null
    })
  },

  async recordPayroll(payload, idempotencyKey = randomKey('payroll')) {
    const { studioId } = await this._context()
    const expectedLedgerVersion = payload.expectedLedgerVersion ?? window.ErpRuntime?.state?.().ledgerVersion
    return this._rpc('record_payroll_payment', {
      p_studio_id: studioId,
      p_idempotency_key: idempotencyKey,
      p_payload: { ...payload, expectedLedgerVersion }
    })
  },

  async registerCheque(payload) {
    const { studioId } = await this._context()
    return this._rpc('register_cheque', { p_studio_id: studioId, p_payload: payload })
  },

  async saveBankAccount(payload, accountId = null, expectedVersion = 0) {
    const { studioId } = await this._context()
    return this._rpc('save_bank_account', {
      p_studio_id: studioId,
      p_account_id: accountId,
      p_expected_version: expectedVersion,
      p_payload: payload
    })
  },

  async transitionCheque({ chequeId, expectedVersion, status, expectedLedgerVersion = null, idempotencyKey = randomKey('cheque') }) {
    const { studioId } = await this._context()
    const ledgerVersion = expectedLedgerVersion ?? window.ErpRuntime?.state?.().ledgerVersion ?? null
    return this._rpc('transition_cheque', {
      p_studio_id: studioId,
      p_cheque_id: chequeId,
      p_expected_version: expectedVersion,
      p_target_status: status,
      p_idempotency_key: idempotencyKey,
      p_expected_ledger_version: ledgerVersion
    })
  },

  async createPersonnelContract(payload) {
    const { studioId } = await this._context()
    return this._rpc('create_personnel_contract', { p_studio_id: studioId, p_payload: payload })
  },

  async requestPersonnelContractOtp(contractId) {
    if (!UUID.test(String(contractId || ''))) throw new Error('شناسهٔ قرارداد همکاری نامعتبر است')
    const { session, config } = await this._context()
    const response = await fetch(`${String(config.url).replace(/\/+$/, '')}/functions/v1/send-sms`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        apikey: config.anonKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ action: 'personnel_contract_otp', contractId })
    })
    const body = await response.json().catch(() => ({}))
    if (!response.ok || !body.ok || !UUID.test(String(body.challengeId || ''))) {
      throw new Error(body.error || 'ارسال OTP قرارداد همکاری ناموفق بود')
    }
    return body
  },

  async acceptPersonnelContract(contractId, expectedVersion, challengeId, code) {
    if (!UUID.test(String(contractId || '')) || !UUID.test(String(challengeId || ''))
      || !/^\d{6}$/.test(String(code || ''))) {
      throw new Error('اطلاعات تأیید قرارداد همکاری نامعتبر است')
    }
    const result = await this._rpc('accept_personnel_contract_with_otp', {
      p_contract_id: contractId,
      p_expected_version: expectedVersion,
      p_challenge_id: challengeId,
      p_code: String(code)
    })
    if (!result?.ok) throw new Error(result?.error || 'کد تأیید قرارداد همکاری نامعتبر است')
    return result
  },

  respondPersonnelContract(contractId, expectedVersion, accept) {
    return this._rpc('respond_personnel_contract', {
      p_contract_id: contractId,
      p_expected_version: expectedVersion,
      p_accept: !!accept
    })
  },

  async assignPersonnel({ workOrderId, userId, role, startsAt, endsAt }) {
    const { studioId } = await this._context()
    return this._rpc('assign_personnel_to_work_order', {
      p_studio_id: studioId, p_work_order_id: workOrderId, p_user_id: userId,
      p_role: role, p_starts_at: startsAt, p_ends_at: endsAt
    })
  },

  respondAssignment(assignmentId, expectedVersion, accept) {
    return this._rpc('respond_work_order_assignment', {
      p_assignment_id: assignmentId,
      p_expected_version: expectedVersion,
      p_accept: !!accept
    })
  },

  completeAssignment(assignmentId, expectedVersion) {
    return this._rpc('complete_own_work_order_assignment', {
      p_assignment_id: assignmentId,
      p_expected_version: expectedVersion
    })
  },

  async recordAttendance(action, expectedVersion = null) {
    const { studioId } = await this._context()
    return this._rpc('record_attendance_action', {
      p_studio_id: studioId,
      p_action: action,
      p_expected_version: expectedVersion
    })
  },

  async saveAttendance({ attendanceId = null, personnelUserId, checkInAt, checkOutAt = null, note = '', expectedVersion = null }) {
    const { studioId } = await this._context()
    return this._rpc('save_attendance_override', {
      p_studio_id: studioId,
      p_attendance_id: attendanceId,
      p_personnel_user_id: personnelUserId,
      p_check_in_at: checkInAt,
      p_check_out_at: checkOutAt,
      p_note: note,
      p_expected_version: expectedVersion
    })
  },

  async transitionWorkOrder(workOrderId, expectedVersion, status, note = '') {
    const { studioId } = await this._context()
    return this._rpc('transition_work_order_status', {
      p_studio_id: studioId, p_work_order_id: workOrderId,
      p_expected_version: expectedVersion, p_target_status: status, p_note: note
    })
  }
  ,

  async cancelContract({ contractId, expectedVersion, refundIrr = 0, penaltyIrr = 0,
    bankId = '', reason, idempotencyKey = randomKey('contract-cancel') }) {
    return this._rpc('cancel_contract_with_refund_v2', {
      p_contract_id: contractId,
      p_expected_version: expectedVersion,
      p_refund_irr: refundIrr,
      p_penalty_irr: penaltyIrr,
      p_bank_id: bankId || null,
      p_reason: reason,
      p_idempotency_key: idempotencyKey
    })
  },

  async transitionContract({ contractId, expectedVersion, status, note = '' }) {
    return this._rpc('transition_contract_status', {
      p_contract_id: contractId,
      p_expected_version: expectedVersion,
      p_target_status: status,
      p_note: note
    })
  },

  async rescheduleContract({ contractId, expectedVersion, eventDate, startsAt, endsAt,
    reason, idempotencyKey = randomKey('contract-reschedule') }) {
    return this._rpc('reschedule_contract_event_v2', {
      p_contract_id: contractId,
      p_expected_version: expectedVersion,
      p_new_event_date: eventDate,
      p_new_start: startsAt,
      p_new_end: endsAt,
      p_reason: reason,
      p_idempotency_key: idempotencyKey
    })
  }
}

if (typeof window !== 'undefined') window.DomainApi = DomainApi

export { DomainApi, randomKey }
export default DomainApi
