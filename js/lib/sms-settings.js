/**
 * SMS settings sanitization — never keep client API secrets when proxy is configured.
 */

export function sanitizeSmsSettings(input = {}, { isLocalDev = false } = {}) {
  const proxyUrl = String(input.smsProxyUrl || '').trim()
  const out = {
    smsProxyUrl: proxyUrl,
    smsProvider: String(input.smsProvider || '').trim(),
    smsUsername: String(input.smsUsername || '').trim(),
    smsApiKey: String(input.smsApiKey || '').trim(),
    smsLineNumber: String(input.smsLineNumber || '').trim(),
    smsMorningReminders: input.smsMorningReminders !== false
  }

  if (proxyUrl) {
    // Proxy owns credentials — strip client secrets always
    out.smsApiKey = ''
    out.smsUsername = ''
    if (!isLocalDev) out.smsProvider = out.smsProvider || ''
  } else if (!isLocalDev) {
    // Production without proxy: refuse storing API key (force proxy)
    out.smsApiKey = ''
    out.smsUsername = ''
  }

  return out
}

if (typeof window !== 'undefined') {
  window.SmsSettingsSanitize = { sanitizeSmsSettings }
}
