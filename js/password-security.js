/* ══════════════════════════════════════════════
   MAN — امنیت و قدرت رمز عبور
   ══════════════════════════════════════════════ */

const PasswordSecurity = {
  analyze(raw) {
    const original = raw ?? ''
    const pw = typeof Utils !== 'undefined' ? Utils.normalizePassword(original) : String(original).trim()
    const len = pw.length
    const hasLower = /[a-z]/.test(pw)
    const hasUpper = /[A-Z]/.test(pw)
    const hasDigit = /[0-9]/.test(pw)
    const hasSpecial = /[^a-zA-Z0-9]/.test(pw)
    const hasPersian = typeof Utils !== 'undefined' && Utils.hasPersianLetters(original)
    const hasArabicDigits = /[\u0660-\u0669\u06F0-\u06F9۰-۹]/.test(original)

    let score = 0
    if (len >= 8) score++
    if (len >= 12) score++
    if (hasLower && hasUpper) score++
    if (hasDigit) score++
    if (hasSpecial) score++
    if (hasPersian) score = Math.max(0, score - 2)

    let level = 'empty'
    if (len > 0) {
      if (hasPersian) level = 'weak'
      else if (score <= 1) level = 'weak'
      else if (score === 2) level = 'fair'
      else if (score === 3) level = 'good'
      else level = 'strong'
    }

    const labels = { empty: '—', weak: 'ضعیف', fair: 'متوسط', good: 'خوب', strong: 'قوی' }
    const colors = { empty: '#6b7280', weak: '#ef4444', fair: '#f59e0b', good: '#22c55e', strong: '#10b981' }
    const pct = { empty: 0, weak: 25, fair: 50, good: 75, strong: 100 }

    const checks = [
      { ok: len >= AppConfig.MIN_PASSWORD_LENGTH, text: `حداقل ${AppConfig.MIN_PASSWORD_LENGTH} کاراکتر (${Utils.fmtNum(len)} کاراکتر)` },
      { ok: hasLower && hasUpper, text: 'حروف بزرگ و کوچک انگلیسی (a-z, A-Z)' },
      { ok: hasDigit, text: 'حداقل یک عدد انگلیسی (0-9)' },
      { ok: hasSpecial, text: 'علامت خاص (!@#$...)' },
      { ok: !hasPersian, text: 'بدون حروف فارسی (کیبورد EN)' },
      { ok: !hasArabicDigits, text: 'اعداد لاتین (نه ۱۲۳ فارسی)' }
    ]

    return { pw, len, level, label: labels[level], color: colors[level], pct: pct[level], checks, hasPersian, score }
  },

  meterHtml(id) {
    return `
      <div class="pw-strength" id="${id}-strength" aria-live="polite">
        <div class="pw-strength-head">
          <span>قدرت رمز:</span>
          <strong id="${id}-strength-label" style="color:#6b7280">—</strong>
          <span class="pw-strength-len" id="${id}-strength-len">۰ کاراکتر</span>
        </div>
        <div class="pw-strength-bar"><div class="pw-strength-fill" id="${id}-strength-fill" style="width:0%"></div></div>
        <ul class="pw-strength-checks" id="${id}-strength-checks"></ul>
      </div>`
  },

  bind(inputId, meterId = inputId) {
    const input = document.getElementById(inputId)
    if (!input) return
    const update = () => this.updateUI(meterId, input.value)
    input.addEventListener('input', update)
    update()
  },

  updateUI(meterId, raw) {
    const a = this.analyze(raw)
    const label = document.getElementById(`${meterId}-strength-label`)
    const lenEl = document.getElementById(`${meterId}-strength-len`)
    const fill = document.getElementById(`${meterId}-strength-fill`)
    const checks = document.getElementById(`${meterId}-strength-checks`)
    if (label) { label.textContent = a.label; label.style.color = a.color }
    if (lenEl) lenEl.textContent = `${Utils.fmtNum(a.len)} کاراکتر`
    if (fill) { fill.style.width = `${a.pct}%`; fill.style.background = a.color }
    if (checks) {
      checks.innerHTML = a.checks.map(c =>
        `<li class="${c.ok ? 'ok' : 'no'}">${c.ok ? '✓' : '○'} ${c.text}</li>`
      ).join('')
    }
  }
}

window.PasswordSecurity = PasswordSecurity
