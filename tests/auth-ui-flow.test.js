import { beforeEach, describe, expect, it, vi } from 'vitest'
import { safeStudioReturn } from '../js/safe-oauth-return.js'

const fields = {}

function field(value = '') {
  return { value, style: {}, disabled: false, innerHTML: '', addEventListener: vi.fn() }
}

describe('single-page registration, login and recovery UI', () => {
  beforeEach(async () => {
    vi.resetModules()
    for (const key of Object.keys(fields)) delete fields[key]
    vi.stubGlobal('window', { location: { href: '', search: '', pathname: '/index.html' } })
    vi.stubGlobal('location', window.location)
    vi.stubGlobal('document', {
      body: { classList: { add: vi.fn() } },
      addEventListener: vi.fn(),
      getElementById: vi.fn(id => fields[id] || null)
    })
    vi.stubGlobal('Utils', {
      escapeHtml: value => String(value || ''),
      normalizePhone: value => String(value || '').replace(/\D/g, ''),
      normalizePassword: value => String(value || ''),
      isValidPhone: value => /^09\d{9}$/.test(String(value || '')),
      faToEn: value => String(value || ''),
      safeAppRedirect: value => value
    })
    vi.stubGlobal('Auth', { validatePassword: value => value.length >= 12 ? '' : 'weak' })
    vi.stubGlobal('AppConfig', { allowsLocalIdentity: () => false })
    vi.stubGlobal('UnifiedLogin', {
      clearPending: vi.fn(),
      resolvePhone: vi.fn(() => { throw new Error('local preflight must not run') }),
      loginWithPassword: vi.fn(async () => ({ ok: true, user: {}, url: 'studio-m/' }))
    })
    vi.stubGlobal('ConsultationBooking', { reset: vi.fn() })
    vi.stubGlobal('PortalInvite', { needsOtpVerification: () => false })
    vi.stubGlobal('Cloud', {
      isConfigured: () => true,
      signUp: vi.fn(),
      signOut: vi.fn(async () => {}),
      verifyPhoneOtp: vi.fn(),
      registerCurrentStudio: vi.fn()
    })
    vi.stubGlobal('PasswordReset', { sendOtp: vi.fn(), verifyAndReset: vi.fn() })
    await import('../js/app.js')
  })

  it('renders registration and forgot-password entry points on login', () => {
    const html = window.Portal._loginStep()
    expect(html).toContain('ثبت‌نام')
    expect(html).toContain('رمز عبور را فراموش کرده‌اید؟')
  })

  it('registers with a user-chosen initial password then signs out to login', async () => {
    Object.assign(fields, {
      'signup-name': field('مدیر'), 'signup-studio': field('ماندنی'),
      'signup-phone': field('09121234567'), 'signup-email': field('owner@example.com'),
      'signup-password': field('Strong!Pass12'), 'signup-password-confirm': field('Strong!Pass12'),
      'login-btn': field(), 'login-error': field()
    })
    Cloud.signUp.mockResolvedValue({ ok: true, session: { user: {} } })
    window.Portal.renderAuth = vi.fn()
    await window.Portal.registerAccount()
    expect(Cloud.signUp).toHaveBeenCalledWith(expect.objectContaining({ phone: '09121234567', password: 'Strong!Pass12' }))
    expect(Cloud.signOut).toHaveBeenCalledOnce()
    expect(window.Portal.state.step).toBe('login')
    expect(window.Portal.state._phone).toBe('09121234567')
  })

  it('completes phone confirmation, creates membership, signs out and returns to login', async () => {
    fields['signup-otp'] = field('123456')
    fields['login-btn'] = field()
    fields['login-error'] = field()
    window.Portal.state.signupPending = { phone: '09121234567', name: 'مدیر', studioName: 'ماندنی' }
    window.Portal.renderAuth = vi.fn()
    Cloud.verifyPhoneOtp.mockResolvedValue({ ok: true })
    Cloud.registerCurrentStudio.mockResolvedValue({ ok: true })
    await window.Portal.verifySignup()
    expect(Cloud.registerCurrentStudio).toHaveBeenCalledWith(expect.objectContaining({ phone: '09121234567' }))
    expect(Cloud.signOut).toHaveBeenCalledOnce()
    expect(window.Portal.state.step).toBe('login')
  })

  it('does not consult local DB before production password authentication', async () => {
    fields['login-phone'] = field('09121234567')
    fields['login-password'] = field('Strong!Pass12')
    fields['login-btn'] = field()
    fields['login-error'] = field()
    await window.Portal.loginPassword()
    expect(UnifiedLogin.resolvePhone).not.toHaveBeenCalled()
    expect(UnifiedLogin.loginWithPassword).toHaveBeenCalledWith('09121234567', 'Strong!Pass12')
  })

  it('runs forgot-password OTP and returns to login after setting a new password', async () => {
    fields['reset-phone'] = field('09121234567')
    fields['login-btn'] = field()
    fields['login-error'] = field()
    PasswordReset.sendOtp.mockResolvedValue({ ok: true })
    window.Portal.renderAuth = vi.fn()
    await window.Portal.requestPasswordReset()
    expect(window.Portal.state.step).toBe('reset')

    fields['reset-otp'] = field('123456')
    fields['reset-password'] = field('NewStrong!Pass12')
    fields['reset-password-confirm'] = field('NewStrong!Pass12')
    PasswordReset.verifyAndReset.mockResolvedValue({ ok: true })
    await window.Portal.completePasswordReset()
    expect(window.Portal.state.step).toBe('login')
    expect(window.Portal.state.notice).toContain('رمز جدید')
  })
})

describe('OAuth return allow-list', () => {
  it('allows only same-origin Studio M paths', () => {
    expect(safeStudioReturn('/studio-m/index.html#dashboard', 'https://erp.example')).toBe('/studio-m/index.html#dashboard')
    expect(safeStudioReturn('https://evil.example/steal', 'https://erp.example')).toBe('/studio-m/index.html#settings')
    expect(safeStudioReturn('//evil.example/steal', 'https://erp.example')).toBe('/studio-m/index.html#settings')
    expect(safeStudioReturn('/customer.html', 'https://erp.example')).toBe('/studio-m/index.html#settings')
  })
})
