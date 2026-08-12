/* ============================================================
   CONTRACT.JS — سیستم تخصصی استودیو فیلمبرداری
   ============================================================ */

function generateContractNum(eventDate) {
  if (typeof Utils === 'undefined' || !Utils.parseJalali) return ''
  const p = Utils.parseJalali(eventDate)
  if (!p) return ''
  const yy = String(p.jy).slice(-2)
  const mm = String(p.jm).padStart(2, '0')
  const dd = String(p.jd).padStart(2, '0')
  const prefix = `${yy}${mm}${dd}`
  const normDate = Utils.formatJalali(p.jy, p.jm, p.jd)
  const sameDay = (typeof DB !== 'undefined' && DB.get ? DB.get('contracts') : []).filter(c => {
    const d = Utils.normJalali(c.eventDate || c.date)
    return d === normDate && c.status !== 'cancelled'
  })
  const seq = String(sameDay.length + 1).padStart(2, '0')
  return `${prefix}-${seq}`
}

function applyContractNumFromEventDate() {
  const date = gv('event-date')
  const num = generateContractNum(date)
  const numInput = document.getElementById('contract-num')
  const display = document.getElementById('contract-id-display')
  if (numInput && num) {
    numInput.value = num
    if (display) display.textContent = num
  } else if (display && !num) display.textContent = 'جدید'
}

function onEventDatePicked(date) {
  applyContractNumFromEventDate()
  syncPreview?.()
}

const state = {
  step: 1,
  total: 0,
  deposit: 0,
  balance: 0,
  lineItems: [],
  selectedPackageId: null,
  selectedPackageName: '',
  selectedPackageSnapshot: null,
  packageExtras: [],
  verify: {
    groom: { code: '', sentAt: null, verified: false, verifiedAt: null, phone: '' },
    bride: { code: '', sentAt: null, verified: false, verifiedAt: null, phone: '' }
  }
}

const VERIFY_TTL_MS = 10 * 60 * 1000
const VERIFY_PROOF_PREFIX = 'talar_contract_verify_'
const VERIFY_ROLES = {
  groom: { phoneId: 'groom-phone', label: 'داماد' },
  bride: { phoneId: 'bride-phone', label: 'عروس' }
}

/** مبلغ فقط وقتی که کاربر در فیلد چیزی نوشته */
function moneyEntered(id) {
  if (!gv(id)) return null
  const n = parseMoney(gv(id))
  return n > 0 ? n : null
}

function cameraCount() {
  return parseInt(digitsOnly(gv('pkg-cameras')), 10) || 1
}

function gotoStep(n) {
  if (n > state.step && !validateStep(state.step)) return
  for (let i = 1; i <= 3; i++) {
    document.getElementById(`sp-${i}`)?.classList.toggle('active', i === n)
    const si = document.getElementById(`si-${i}`)
    if (!si) continue
    si.classList.remove('active', 'done')
    if (i < n) si.classList.add('done')
    if (i === n) si.classList.add('active')
  }
  state.step = n
  if (n === 3) calcTotals()
  document.querySelector('.form-col')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

function selectedContractTypes() {
  return [...document.querySelectorAll('input[name="contract-type"]:checked')].map(el => el.value)
}

function onContractTypesChange() {
  const types = selectedContractTypes()
  const industrialFields = document.getElementById('industrial-client-fields')
  if (industrialFields) industrialFields.hidden = !types.includes('صنعتی')
}

function validateStep(s) {
  if (s === 1) {
    const types = selectedContractTypes()
    if (!types.length) { toast('حداقل یک نوع پروژه را انتخاب کنید', 'error'); return false }
    const industrialOnly = types.length === 1 && types[0] === 'صنعتی'
    if (industrialOnly && !gv('client-name')) { toast('نام مشتری یا مجموعه الزامی است', 'error'); return false }
    if (!industrialOnly && !gv('groom-name')) { toast('نام داماد الزامی است', 'error'); return false }
    if (!industrialOnly && !gv('bride-name')) { toast('نام عروس الزامی است', 'error'); return false }
    if (!gv('event-date')) { toast('تاریخ مراسم را وارد کنید', 'error'); return false }
    const primaryPhone = industrialOnly ? gv('client-phone') : gv('groom-phone')
    if (!primaryPhone) { toast('شماره تماس اصلی الزامی است', 'error'); return false }
    if (!industrialOnly && !isVerifyValid('groom')) {
      toast('شماره داماد باید با پیامک تأیید شود', 'error')
      return false
    }
    if (gv('bride-phone') && !isVerifyValid('bride')) {
      toast('شماره عروس باید با پیامک تأیید شود', 'error')
      return false
    }
  }
  return true
}

function initVerifyUi() {
  ['groom', 'bride'].forEach(role => updateVerifyUi(role))
  try {
    const draft = localStorage.getItem('talar_contract_draft')
    if (draft) {
      const obj = JSON.parse(draft)
      if (obj.verification) applyVerificationState(obj.verification)
    }
  } catch (_) { /* ignore */ }
}

function applyVerificationState(v) {
  if (!v) return
  ;['groom', 'bride'].forEach(role => {
    const src = v[role]
    if (!src) return
    // هرگز verified را از localStorage اعتماد نکن — فقط شماره بازیابی می‌شود
    state.verify[role] = {
      ...state.verify[role],
      phone: src.phone || '',
      code: '',
      sentAt: null,
      verified: false,
      verifiedAt: null
    }
    updateVerifyUi(role)
  })
}

function onVerifyPhoneChange(role) {
  const phone = getVerifyPhone(role)
  const v = state.verify[role]
  if (v.verified && v.phone && v.phone !== phone) {
    v.verified = false
    v.verifiedAt = null
    v.code = ''
    v.sentAt = null
    clearVerifyProof(role)
    updateVerifyUi(role)
  }
}

function getVerifyPhone(role) {
  const id = VERIFY_ROLES[role]?.phoneId
  return digitsOnly(gv(id))
}

function generateVerifyCode() {
  return Utils.generateOtp6()
}

function clearVerifyProof(role) {
  const v = state.verify[role]
  if (v) {
    delete v.proofToken
    delete v.proofSigned
  }
  try { sessionStorage.removeItem(VERIFY_PROOF_PREFIX + role) } catch { /* */ }
  if (typeof SignedProof !== 'undefined') SignedProof.clear(VERIFY_PROOF_PREFIX + role)
}

async function setVerifyProof(role, phone) {
  const token = Array.from(crypto.getRandomValues(new Uint8Array(16)))
    .map(b => b.toString(16).padStart(2, '0')).join('')
  state.verify[role].proofToken = token
  if (typeof SignedProof !== 'undefined' && SignedProof.issue) {
    await SignedProof.issue(VERIFY_PROOF_PREFIX + role, { phone, token, role }, VERIFY_TTL_MS * 3)
    state.verify[role].proofSigned = true
    return
  }
  try {
    sessionStorage.setItem(VERIFY_PROOF_PREFIX + role, JSON.stringify({
      phone,
      token,
      verifiedAt: Date.now(),
      expires: Date.now() + VERIFY_TTL_MS * 3
    }))
    state.verify[role].proofSigned = true
  } catch { /* */ }
}

function hasVerifyProof(role, phone) {
  const v = state.verify[role]
  if (!v?.proofToken || !phone || !v.proofSigned) return false
  try {
    const raw = sessionStorage.getItem(VERIFY_PROOF_PREFIX + role)
    if (!raw) return false
    const proof = JSON.parse(raw)
    if (proof.phone !== phone || proof.token !== v.proofToken) return false
    if (proof.expires && Date.now() > proof.expires) return false
    return !!(proof.sig || proof.token)
  } catch {
    return false
  }
}

async function verifyContractProof(role, phone) {
  if (typeof SignedProof === 'undefined' || !SignedProof.verify) {
    return hasVerifyProof(role, phone)
  }
  const v = state.verify[role]
  if (!v?.proofToken || !phone) return false
  return SignedProof.verify(VERIFY_PROOF_PREFIX + role, { phone, token: v.proofToken, role })
}

function isVerifyValid(role) {
  const v = state.verify[role]
  if (!v?.verified) return false
  const phone = getVerifyPhone(role)
  if (v.phone !== phone) return false
  return hasVerifyProof(role, phone)
}

function updateVerifyUi(role) {
  const v = state.verify[role]
  const statusEl = document.getElementById(`status-${role}`)
  const box = document.getElementById(`verify-${role}`)
  if (statusEl) {
    statusEl.className = 'verify-status ' + (v.verified ? 'ok' : v.sentAt ? 'sent' : 'pending')
    if (v.verified) statusEl.textContent = `✓ تأیید شد — ${v.verifiedAt || ''}`
    else if (v.sentAt) statusEl.textContent = 'کد پیامک شد — کد را وارد و تأیید کنید'
    else statusEl.textContent = 'در انتظار استعلام — ابتدا کد پیامکی را ارسال کنید'
  }
  if (box) box.classList.toggle('verified', !!v.verified)
}

async function sendVerifySms(role) {
  const meta = VERIFY_ROLES[role]
  const phone = getVerifyPhone(role)
  if (!/^09\d{9}$/.test(phone)) {
    toast(`شماره ${meta.label} معتبر نیست`, 'error')
    return
  }
  const rateKey = `contract:${role}:${phone}`
  if (typeof Auth !== 'undefined') {
    const rate = Auth.canSendOtp(rateKey)
    if (!rate.ok) {
      toast(rate.error, 'error')
      return
    }
  }
  const code = generateVerifyCode()
  clearVerifyProof(role)
  const studio = gv('studio-name') || (DB.get('studioInfo') || {}).name || 'استودیو'
  const couple = `${gv('bride-name') || 'عروس'} و ${gv('groom-name') || 'داماد'}`
  const text = `${studio}\nکد تأیید قرارداد: ${code}\nاین کد منزله تأیید مالکیت شماره شما و بستن قرارداد «${couple}» است.\nاعتبار: ۱۰ دقیقه`
  state.verify[role] = {
    ...state.verify[role],
    code,
    sentAt: Date.now(),
    verified: false,
    verifiedAt: null,
    phone
  }
  updateVerifyUi(role)
  if (typeof SmsProvider === 'undefined') {
    toast('ماژول پیامک بارگذاری نشده', 'error')
    return
  }
  if (!SmsProvider.isConfigured()) {
    if (typeof Auth !== 'undefined') Auth.recordOtpSend(rateKey)
    if (isDemoOtpMode()) {
      toast(`پیامک تنظیم نشده — کد تست ${meta.label}: ${code}`, 'info')
    } else {
      toast('پیامک تنظیم نشده — ابتدا SMS را در تنظیمات فعال کنید', 'error')
    }
    return
  }
  const btn = document.querySelector(`#verify-${role} .btn-verify-send`)
  if (btn) btn.disabled = true
  try {
    const res = await SmsProvider.sendStudio(phone, text)
    if (res.ok) {
      if (typeof Auth !== 'undefined') Auth.recordOtpSend(rateKey)
      toast(`کد برای ${meta.label} ارسال شد`, 'success')
    }
    else toast(res.error || 'خطا در ارسال پیامک', 'error')
  } finally {
    if (btn) btn.disabled = false
  }
}

async function confirmVerify(role) {
  const meta = VERIFY_ROLES[role]
  const v = state.verify[role]
  const phone = getVerifyPhone(role)
  const verifyKey = `contract:${role}:${phone}`
  if (typeof Auth !== 'undefined') {
    const locked = Auth.isOtpVerifyLocked(verifyKey)
    if (locked) {
      toast(`تعداد تلاش بیش از حد. ${locked} دقیقه دیگر تلاش کنید.`, 'error')
      return
    }
  }
  const input = digitsOnly(gv(`verify-input-${role}`))
  if (!v.code || !v.sentAt) {
    toast('ابتدا کد پیامکی را ارسال کنید', 'error')
    return
  }
  if (Date.now() - v.sentAt > VERIFY_TTL_MS) {
    toast('کد منقضی شده — دوباره ارسال کنید', 'error')
    v.code = ''
    v.sentAt = null
    updateVerifyUi(role)
    return
  }
  if (getVerifyPhone(role) !== v.phone) {
    toast('شماره تغییر کرده — دوباره استعلام بگیرید', 'error')
    return
  }
  if (input !== v.code) {
    if (typeof Auth !== 'undefined') {
      const locked = Auth.recordOtpVerifyFail(verifyKey)
      if (locked) {
        toast(`تعداد تلاش بیش از حد. ${locked} دقیقه دیگر تلاش کنید.`, 'error')
        return
      }
    }
    toast('کد وارد‌شده نادرست است', 'error')
    return
  }
  if (typeof Auth !== 'undefined') Auth.clearOtpVerify(verifyKey)
  v.verified = true
  v.verifiedAt = todayFa()
  v.phone = phone
  await setVerifyProof(role, phone)
  updateVerifyUi(role)
  toast(`شماره ${meta.label} تأیید شد`, 'success')
}

function getVerificationSnapshot(forDraft = false) {
  const out = {}
  ;['groom', 'bride'].forEach(role => {
    const v = state.verify[role]
    const phone = getVerifyPhone(role) || v.phone || ''
    const ok = !forDraft && isVerifyValid(role)
    out[role] = {
      phone,
      verified: ok,
      verifiedAt: ok ? (v.verifiedAt || '') : '',
      sentAt: forDraft ? null : (v.sentAt || null)
    }
  })
  return out
}

function chk(id) { return document.getElementById(id)?.checked || false }

function getLineItems() {
  const items = []
  const cameras = cameraCount()

  const camTotal = moneyEntered('price-cameras')
  if (camTotal !== null) {
    items.push({ label: `پکیج فیلمبرداری — ${cameras} دوربین`, amount: camTotal })
  }

  if (gv('pkg-quality') === '4k') {
    const q = moneyEntered('price-quality-4k')
    if (q !== null) items.push({ label: 'مکمل کیفیت 4K', amount: q })
  }

  const addChecked = (checkId, priceId, label) => {
    if (!chk(checkId)) return
    const p = moneyEntered(priceId)
    if (p !== null) items.push({ label, amount: p })
  }

  addChecked('pkg-photo-venue', 'price-photo-venue', 'عکاسی مراسم (تالار)')
  addChecked('pkg-photo-garden', 'price-photo-garden', 'عکاسی باغ')
  addChecked('pkg-helishot', 'price-helishot', 'هلی‌شات')
  addChecked('pkg-fpv', 'price-fpv', 'FPV')
  addChecked('pkg-crane', 'price-crane', 'جرثقیل (کرین)')
  addChecked('pkg-tv', 'price-tv', 'پروژکشن / TV')

  if (chk('ord-album')) {
    const p = moneyEntered('price-album')
    if (p !== null) items.push({ label: `سفارش آلبوم ${gv('album-size') || ''}`.trim(), amount: p })
  }
  if (chk('ord-prints')) {
    const p = moneyEntered('price-prints')
    if (p !== null) {
      const qty = digitsOnly(gv('print-qty'))
      items.push({ label: `چاپ مراسم${qty ? ` (${qty} عدد)` : ''}`, amount: p })
    }
  }
  if (chk('ord-photo-pack')) {
    const p = moneyEntered('price-photo-pack')
    if (p !== null) {
      const qty = digitsOnly(gv('photo-pack-qty'))
      items.push({ label: `بسته عکس${qty ? ` (${qty} عدد)` : ''}`, amount: p })
    }
  }
  ;(state.packageExtras || []).forEach(x => {
    if (x.label && x.price > 0) {
      const note = x.desc || x.note
      items.push({ label: note ? `${x.label} (${note})` : x.label, amount: x.price })
    }
  })
  return items
}

function calcTotals() {
  state.lineItems = getLineItems()
  state.total = state.lineItems.reduce((s, i) => s + i.amount, 0)
  state.deposit = parseMoney(gv('deposit'))
  state.balance = Math.max(0, state.total - state.deposit)

  const camHint = document.getElementById('hint-cameras')
  if (camHint) {
    const camTotal = moneyEntered('price-cameras')
    camHint.textContent = camTotal !== null ? `مبلغ کل ${cameraCount()} دوربین: ${fmtNum(camTotal)} تومان` : ''
  }
  syncPreview()
}

function renderPackagePicker() {
  const wrap = document.getElementById('contract-pkg-picker')
  if (!wrap || typeof DB === 'undefined' || typeof PackageCatalog === 'undefined') return
  PackageCatalog.ensureDefaults()
  const pkgs = DB.get('packages') || []
  if (!pkgs.length) {
    wrap.innerHTML = '<p class="block-desc">پکیجی در Studio M تعریف نشده — از منوی «پکیج قیمت» اضافه کنید.</p>'
    return
  }
  wrap.innerHTML = pkgs.map(p => {
    const tier = PackageCatalog.tierMeta(p.tier)
    const color = p.color || tier.color
    const total = PackageCatalog.packageTotal(p)
    const active = state.selectedPackageId === p.id ? ' active' : ''
    const feats = PackageCatalog.featureLines(p).slice(0, 4)
    return `<button type="button" class="pkg-pick-card${active}" style="--pkg-color:${color}" onclick="applyContractPackage('${p.id}')">
      <div class="pkg-pick-tier">${tier.icon} ${tier.label}</div>
      <div class="pkg-pick-name">${escapeHtml(p.name)}</div>
      <ul class="pkg-pick-feats">${feats.map(f => `<li>${escapeHtml(f)}</li>`).join('')}</ul>
      <div class="pkg-pick-price">${fmtNum(total)} <small>تومان</small></div>
    </button>`
  }).join('') + `<button type="button" class="pkg-pick-card pkg-pick-custom${!state.selectedPackageId ? ' active' : ''}" onclick="clearContractPackage()">
    <div class="pkg-pick-tier">✏️</div>
    <div class="pkg-pick-name">سفارشی</div>
    <div class="pkg-pick-feats"><li>بدون پکیج — دستی</li></div>
  </button>`
  updatePackageSelectedBanner()
}

function updatePackageSelectedBanner() {
  const el = document.getElementById('contract-pkg-selected')
  if (!el) return
  if (!state.selectedPackageId) { el.hidden = true; return }
  el.hidden = false
  el.innerHTML = `<span>پکیج انتخاب‌شده: <strong>${escapeHtml(state.selectedPackageName || '')}</strong></span>
    <button type="button" class="btn-link" onclick="clearContractPackage()">حذف پکیج</button>`
}

function camOrdinalLabel(i) {
  const labels = ['اول', 'دوم', 'سوم', 'چهارم', 'پنجم', 'ششم', 'هفتم', 'هشتم', 'نهم', 'دهم']
  return labels[i - 1] || String(i)
}

function applyContractPackage(id) {
  const pkg = DB.find('packages', p => p.id === id)
  if (!pkg || typeof PackageCatalog === 'undefined') return
  PackageCatalog.applyToContractForm(pkg, state)
  state.selectedPackageSnapshot = PackageCatalog.snapshot(pkg)
  renderPackagePicker()
  calcTotals()
  toast(`پکیج «${pkg.name}» اعمال شد`, 'success')
}

function clearContractPackage() {
  if (typeof PackageCatalog !== 'undefined' && PackageCatalog.clearContractForm) {
    PackageCatalog.clearContractForm(state)
  } else {
    state.selectedPackageId = null
    state.selectedPackageName = ''
    state.packageExtras = []
  }
  state.selectedPackageSnapshot = null
  renderPackagePicker()
  calcTotals()
}

function toggleQualityPrice() {
  const is4k = gv('pkg-quality') === '4k'
  const el = document.getElementById('price-quality-4k')
  if (el) {
    el.disabled = !is4k
    el.closest('.fg')?.classList.toggle('price-disabled', !is4k)
    if (!is4k) el.value = ''
  }
  calcTotals()
}

function quickDeposit(pct) {
  document.getElementById('deposit').value = fmtNum(Math.round(state.total * pct))
  calcTotals()
}

function toggleAlbumFields() {
  const on = chk('ord-album')
  const el = document.getElementById('album-fields')
  if (el) el.hidden = !on
}

function togglePrintFields() {
  const el = document.getElementById('print-fields')
  if (el) el.hidden = !chk('ord-prints')
}

function togglePhotoPackFields() {
  const el = document.getElementById('photo-pack-fields')
  if (el) el.hidden = !chk('ord-photo-pack')
}

function updateCamOperators() {
  const wrap = document.getElementById('vid-cam-slots')
  if (!wrap) return
  const n = parseInt(digitsOnly(gv('pkg-cameras')), 10) || 1
  const saved = {}
  wrap.querySelectorAll('.vid-cam-select').forEach(sel => { saved[sel.id] = sel.value })
  let html = ''
  for (let i = 1; i <= n; i++) {
    const id = `staff-vid-cam-${i}`
    html += `<div class="fg"><label>🎬 فیلمبردار ${camOrdinalLabel(i)}</label>
      <select id="${id}" class="fi vid-cam-select"><option value="">— آزاد —</option></select></div>`
  }
  wrap.innerHTML = html
  for (let i = 1; i <= n; i++) {
    const id = `staff-vid-cam-${i}`
    fillStaffSelect(id, ['فیلم', 'vid_venue', 'فیلمبردار'])
    const sel = document.getElementById(id)
    if (sel && saved[id]) sel.value = saved[id]
  }
}

function syncPreview() {
  const gName = gv('groom-name') || 'داماد'
  const bName = gv('bride-name') || 'عروس'
  document.getElementById('ss-couple').textContent = `${bName} و ${gName}`

  const pkgWrap = document.getElementById('ss-pkg')
  if (pkgWrap) {
    pkgWrap.innerHTML = state.lineItems.map(i =>
      `<div class="ss-line-item"><span>${escapeHtml(i.label)}</span><span>${fmtNum(i.amount)}</span></div>`
    ).join('') || '<div class="ss-line-item muted">هنوز آیتمی انتخاب نشده</div>'
  }

  const finWrap = document.getElementById('fin-breakdown')
  if (finWrap) {
    finWrap.innerHTML = `<div class="fin-table">${state.lineItems.map(i =>
      `<div class="fin-row"><span>${escapeHtml(i.label)}</span><span>${fmtNum(i.amount)} تومان</span></div>`
    ).join('')}<div class="fin-row fin-total"><span>جمع کل</span><span>${fmtNum(state.total)} تومان</span></div></div>`
  }

  document.getElementById('ss-amount').textContent = `${fmtNum(state.total)} تومان`
  document.getElementById('ss-balance').textContent = `مانده: ${fmtNum(state.balance)} تومان`

  const tBox = document.getElementById('totals-box')
  if (tBox) {
    tBox.innerHTML = `
      <div><div class="totals-lbl">جمع قرارداد</div><div class="totals-val">${fmtNum(state.total)}</div></div>
      <div style="text-align:left"><div class="totals-lbl">مانده پرداخت</div><div class="totals-val">${fmtNum(state.balance)}</div></div>`
  }
}

// ════════════════════════════════════════════
//  INVOICE (PDF)
// ════════════════════════════════════════════
const PDF_FORMATS = {
  a4:     { id: 'a4',     label: 'A4',     icon: '📄', size: '۲۱ × ۲۹.۷ cm', folder: 'A4',     jsFormat: 'a4',     margin: [12, 10, 12, 10], pageSize: 'A4 portrait' },
  a5:     { id: 'a5',     label: 'A5',     icon: '📋', size: '۱۴.۸ × ۲۱ cm', folder: 'A5',     jsFormat: 'a5',     margin: [10, 8, 10, 8],  pageSize: 'A5 portrait' },
  '16x21': { id: '16x21', label: '۱۶×۲۱', icon: '📑', size: '۱۶ × ۲۱ cm',   folder: '16x21', jsFormat: [160, 210], margin: [10, 8, 10, 8], pageSize: '160mm 210mm' },
  letter: { id: 'letter', label: 'Letter', icon: '🗂️', size: '۲۱.۶ × ۲۷.۹ cm', folder: 'Letter', jsFormat: 'letter', margin: [12, 10, 12, 10], pageSize: 'letter portrait' }
}
let pdfFormatId = localStorage.getItem('talar_pdf_format') || 'a4'

function getPdfFormat(id) {
  return PDF_FORMATS[id || pdfFormatId] || PDF_FORMATS.a4
}

function renderPdfFormatGrid() {
  const grid = document.getElementById('pdf-format-grid')
  if (!grid) return
  grid.innerHTML = Object.values(PDF_FORMATS).map(f => `
    <div class="pdf-format-card${f.id === pdfFormatId ? ' active' : ''}" data-format="${f.id}" onclick="setPdfFormat('${f.id}')">
      <div class="pdf-format-icon">${f.icon}</div>
      <div class="pdf-format-name">${f.label}</div>
      <div class="pdf-format-size">${f.size}</div>
      <div class="pdf-format-folder">قراردادها/${f.folder}/</div>
    </div>`).join('')
  updatePdfFormatHint()
}

function setPdfFormat(id) {
  if (!PDF_FORMATS[id]) return
  pdfFormatId = id
  localStorage.setItem('talar_pdf_format', id)
  const doc = document.getElementById('inv-doc')
  if (doc) doc.dataset.pdfFormat = id
  const badge = document.getElementById('inv-format-badge')
  if (badge) badge.textContent = PDF_FORMATS[id].label
  document.querySelectorAll('.pdf-format-card').forEach(el => {
    el.classList.toggle('active', el.dataset.format === id)
  })
  updatePdfFormatHint()
}

function updatePdfFormatHint() {
  const hint = document.getElementById('pdf-selected-hint')
  if (!hint) return
  hint.textContent = buildPdfFilename(getPdfFormat())
}

function buildPdfFilename(fmt) {
  const num = (gv('contract-num') || 'new').replace(/[^\w\u0600-\u06FF-]/g, '-')
  const couple = ((gv('groom-name') || '') + '_' + (gv('bride-name') || '')).replace(/\s+/g, '-').replace(/[^\w\u0600-\u06FF-]/g, '')
  const name = couple.replace(/^_|_$/g, '') || 'contract'
  return `قراردادها/${fmt.folder}/${num}_${name}.pdf`
}

function buildInvTable(rows, cols) {
  const head = cols.map(c => `<th>${c}</th>`).join('')
  const body = rows.map(r => `<tr class="${r.cls || ''}">${r.cells.map(c => `<td class="${c.cls || ''}">${c.html}</td>`).join('')}</tr>`).join('')
  return `<table class="inv-table"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`
}

function formatTermsHtml(text) {
  if (!text) return '—'
  const lines = text.split(/\n/).map(l => l.trim()).filter(Boolean)
  if (lines.every(l => l.startsWith('-') || l.startsWith('•'))) {
    return '<ul>' + lines.map(l => `<li>${escapeHtml(l.replace(/^[-•]\s*/, ''))}</li>`).join('') + '</ul>'
  }
  return escapeHtml(text).replace(/\n/g, '<br>')
}

function openInvoice() {
  if (!validateStep(1)) return gotoStep(1)
  calcTotals()

  const studio = gv('studio-name') || 'مدیریت استودیو'
  const contractNum = gv('contract-num') || '—'
  const contractDate = gv('contract-date') || todayFa()
  const eventDate = gv('event-date') || '—'
  const groom = gv('groom-name') || '—'
  const bride = gv('bride-name') || '—'

  document.getElementById('inv-studio-title').textContent = studio
  document.getElementById('ip-studio').textContent = studio
  document.getElementById('im-num').textContent = 'شماره: ' + contractNum
  document.getElementById('im-date').textContent = 'تاریخ قرارداد: ' + contractDate
  document.getElementById('im-event-date').textContent = 'تاریخ مراسم: ' + eventDate
  document.getElementById('ip-groom').textContent = groom
  document.getElementById('ip-bride').textContent = bride
  document.getElementById('ip-nid').textContent = gv('groom-nid') || gv('bride-nid') || '—'
  document.getElementById('ip-phone').textContent = gv('groom-phone') || gv('bride-phone') || '—'

  const verifyGrid = document.getElementById('inv-verify-grid')
  if (verifyGrid) {
    verifyGrid.innerHTML = ['groom', 'bride'].map(role => {
      const meta = VERIFY_ROLES[role]
      const v = state.verify[role]
      const phone = getVerifyPhone(role) || '—'
      if (!phone || phone === '—') return ''
      const ok = isVerifyValid(role)
      return `<div class="inv-verify-item ${ok ? 'ok' : 'pending'}">
        <div class="inv-verify-role">${meta.label}</div>
        <div class="inv-verify-phone" dir="ltr">${escapeHtml(phone)}</div>
        <div class="inv-verify-state">${ok ? '✓ تأیید پیامکی' : '— تأیید نشده'}</div>
        ${ok && v.verifiedAt ? `<div class="inv-verify-date">${escapeHtml(v.verifiedAt)}</div>` : ''}
      </div>`
    }).join('') || '<div class="inv-verify-empty">استعلام پیامکی ثبت نشده</div>'
  }

  const venue = gv('event-venue') || '—'
  const guests = digitsOnly(gv('pkg-guests')) || '—'
  const quality = gv('pkg-quality') === '4k' ? '4K UHD' : 'Full HD'
  document.getElementById('inv-event-banner').innerHTML = `
    <div class="inv-ev-cell"><div class="inv-ev-cell-label">تالار / محل</div><div class="inv-ev-cell-val">${escapeHtml(venue)}</div></div>
    <div class="inv-ev-cell"><div class="inv-ev-cell-label">تاریخ مراسم</div><div class="inv-ev-cell-val">${escapeHtml(eventDate)}</div></div>
    <div class="inv-ev-cell"><div class="inv-ev-cell-label">تعداد مهمان</div><div class="inv-ev-cell-val">${guests}</div></div>`

  const serviceRows = state.lineItems.map((item, i) => ({
    cells: [
      { html: i + 1, cls: 'col-num' },
      { html: escapeHtml(item.label) },
      { html: fmtNum(item.amount) + ' تومان', cls: 'col-amt' }
    ]
  }))
  if (!serviceRows.length) {
    serviceRows.push({ cells: [{ html: '—', cls: 'col-num' }, { html: 'موردی با قیمت ثبت نشده' }, { html: '—', cls: 'col-amt' }] })
  }

  const finRows = [...serviceRows]
  if (state.deposit > 0) {
    finRows.push({
      cls: 'row-deposit',
      cells: [{ html: '', cls: 'col-num' }, { html: 'بیعانه دریافت‌شده' }, { html: '− ' + fmtNum(state.deposit) + ' تومان', cls: 'col-amt' }]
    })
  }
  finRows.push({
    cls: 'row-total',
    cells: [{ html: '', cls: 'col-num' }, { html: '<b>جمع کل قرارداد</b>' }, { html: '<b>' + fmtNum(state.total) + ' تومان</b>', cls: 'col-amt' }]
  })
  if (state.balance > 0) {
    finRows.push({
      cls: 'row-balance',
      cells: [{ html: '', cls: 'col-num' }, { html: 'مانده پرداخت' }, { html: fmtNum(state.balance) + ' تومان', cls: 'col-amt' }]
    })
  }
  document.getElementById('inv-fin-table').innerHTML = buildInvTable(finRows, ['ردیف', 'شرح', 'مبلغ (تومان)'])

  document.getElementById('inv-grand-total').innerHTML = `
    <div class="inv-grand-label">جمع کل قرارداد</div>
    <div class="inv-grand-amount">${fmtNum(state.total)} تومان</div>`
  document.getElementById('inv-balance-row').innerHTML = state.balance > 0
    ? `<span>💳 مانده پرداخت:</span> <strong>${fmtNum(state.balance)} تومان</strong>`
    : `<span>✓ تسویه کامل</span>`

  document.getElementById('inv-terms-body').innerHTML = formatTermsHtml(gv('contract-terms'))

  renderPdfFormatGrid()
  setPdfFormat(pdfFormatId)
  document.getElementById('inv-backdrop').classList.add('open')
}

function exportPDF(forcedFormat) {
  const fmt = getPdfFormat(forcedFormat)
  const element = document.getElementById('inv-doc')
  if (!element || typeof html2pdf === 'undefined') {
    toast('کتابخانه PDF در دسترس نیست', 'error')
    return
  }
  const opt = {
    margin: fmt.margin,
    filename: buildPdfFilename(fmt),
    image: { type: 'jpeg', quality: 0.96 },
    html2canvas: { scale: 2, useCORS: true, logging: false, backgroundColor: '#ffffff', scrollY: 0 },
    jsPDF: { unit: 'mm', format: fmt.jsFormat, orientation: 'portrait' },
    pagebreak: { mode: ['css', 'legacy'], avoid: ['.inv-no-break', 'tr'] }
  }
  toast(`در حال ساخت PDF (${fmt.label})...`, 'info')
  html2pdf().set(opt).from(element).save().then(() => {
    toast(`PDF ذخیره شد — پوشه ${fmt.folder}`, 'success')
  }).catch(err => {
    toast('خطا در تولید PDF', 'error')
    console.error(err)
  })
}

function printContract() {
  const fmt = getPdfFormat()
  let style = document.getElementById('print-page-size')
  if (!style) {
    style = document.createElement('style')
    style.id = 'print-page-size'
    document.head.appendChild(style)
  }
  style.textContent = `@page { size: ${fmt.pageSize}; margin: 10mm; }`
  window.print()
}

// ════════════════════════════════════════════
//  HELPERS
// ════════════════════════════════════════════
function gv(id) { return document.getElementById(id)?.value?.trim() || '' }
function fmtNum(n) {
  if (typeof Utils !== 'undefined' && Utils.fmtNum) return Utils.fmtNum(n)
  return Number(n || 0).toLocaleString('fa-IR')
}

function digitsOnly(s) {
  if (typeof Utils !== 'undefined' && Utils.faToEn) return Utils.faToEn(String(s || '')).replace(/[^0-9]/g, '')
  return faToEnDigits(s).replace(/[^0-9]/g, '')
}

function parseMoney(s) {
  if (!s) return 0
  return parseInt(digitsOnly(s), 10) || 0
}

function todayFa() {
  if (typeof Utils !== 'undefined' && Utils.todayJalali) return Utils.todayJalali()
  throw new Error('Utils.todayJalali is required — ensure utils.js loads before contract.js')
}

function isDemoOtpMode() {
  return typeof Utils !== 'undefined' && Utils.isDemoOtpMode?.()
}

function faToEnDigits(s) {
  if (!s) return ''
  const map = { '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4', '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9' }
  return String(s).replace(/[۰-۹]/g, c => map[c] ?? c)
}

function bindDigitFields() {
  document.querySelectorAll('.digit-field').forEach(el => {
    el.addEventListener('input', () => {
      const max = el.maxLength > 0 ? el.maxLength : 0
      let raw = digitsOnly(el.value)
      if (max) raw = raw.slice(0, max)
      el.dataset.raw = raw
    })
  })
}

function escapeHtml(str) {
  if (typeof Utils !== 'undefined' && Utils.escapeHtml) return Utils.escapeHtml(str)
  if (str == null) return ''
  return String(str).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]))
}

function toast(msg, type = 'info') {
  if (typeof Utils !== 'undefined' && Utils.toast) return Utils.toast(msg, type)
  let wrap = document.getElementById('toast-wrap')
  if (!wrap) {
    wrap = document.createElement('div')
    wrap.id = 'toast-wrap'
    wrap.style.position = 'fixed'
    wrap.style.bottom = '20px'
    wrap.style.left = '20px'
    wrap.style.zIndex = '999999'
    wrap.style.display = 'flex'
    wrap.style.flexDirection = 'column'
    wrap.style.gap = '10px'
    document.body.appendChild(wrap)
  }
  const el = document.createElement('div')
  el.className = `toast-it ${type}`
  el.textContent = msg
  wrap.appendChild(el)
  setTimeout(() => {
    el.style.opacity = '0'
    el.style.transform = 'translateX(20px)'
    el.style.transition = 'all .3s ease'
    setTimeout(() => el.remove(), 320)
  }, 3000)
}

function onDepositBankChange() {
  const id = document.getElementById('deposit-bank')?.value
  if (typeof FinanceSync !== 'undefined') FinanceSync.renderBankPreview(id, 'deposit-bank-preview')
}

function populateDepositBanks() {
  if (typeof FinanceSync === 'undefined') return
  FinanceSync.populateBankSelect('deposit-bank')
}

document.addEventListener('DOMContentLoaded', () => {
  const display = document.getElementById('contract-id-display')
  if (display && !gv('contract-num')) display.textContent = 'جدید'
  const di = document.getElementById('contract-date')
  if (di) di.value = todayFa()
  document.getElementById('event-date')?.addEventListener('change', applyContractNumFromEventDate)
  bindDigitFields()
  toggleQualityPrice()
  updateCamOperators()
  document.getElementById('deposit')?.addEventListener('input', calcTotals)
  populatePersonnelDropdowns()
  populateDepositBanks()
  calcTotals()
  renderPackagePicker()
})

function personMatchesStaffRole(p, keywords) {
  if (!keywords?.length) return true
  const hay = [
    ...(p.roles || []),
    p.role || '',
    p.primaryRole || '',
    p.title || ''
  ].join(' ').toLowerCase()
  return keywords.some(k => hay.includes(String(k).toLowerCase()))
}

const STAFF_SELECT_ROLES = {
  'staff-photographer': ['photographer', 'عکاس'],
  'staff-photographer-garden': ['photographer', 'عکاس', 'باغ', 'garden'],
  'staff-vid-clip': ['vid_clip', 'فیلم', 'clip', 'کلیپ'],
  'staff-helishot': ['helishot', 'هلی', 'fpv'],
  'staff-edit-clip': ['editor_clip', 'تدوین', 'clip', 'کلیپ'],
  'staff-edit-photo': ['editor_venue', 'editor_photo', 'تدوین', 'عکس']
}

function fillStaffSelect(selectId, matchTitles) {
  const select = document.getElementById(selectId)
  if (!select || typeof DB === 'undefined' || !DB.get) return
  const keywords = matchTitles?.length
    ? matchTitles
    : (selectId.startsWith('staff-vid-cam-')
      ? ['vid_venue', 'فیلم', 'venue', 'فیلمبردار']
      : (STAFF_SELECT_ROLES[selectId] || []))
  const personnel = (DB.get('personnel') || []).filter(p => personMatchesStaffRole(p, keywords))
  const prev = select.value
  let html = '<option value="">— آزاد —</option>'
  html += personnel.map(p => {
    const val = escapeHtml(p.id || p.name)
    const label = escapeHtml(p.name || p.phone || 'پرسنل')
    const dataName = escapeHtml(p.name || '')
    return `<option value="${val}" data-name="${dataName}">${label}</option>`
  }).join('')
  select.innerHTML = html
  if (prev) {
    // اگر قبلاً نام ذخیره شده بود، ابتدا بر اساس id سپس بر اساس نام تطبیق بده
    if (!select.value) select.value = prev
    if (!select.value) {
      const opt = Array.from(select.options).find(o => o.dataset.name === prev)
      if (opt) select.value = opt.value
    }
  }
}

function populatePersonnelDropdowns() {
  if (typeof DB === 'undefined' || !DB.get) return
  const ids = [
    'staff-photographer', 'staff-photographer-garden', 'staff-vid-clip',
    'staff-helishot', 'staff-edit-clip', 'staff-edit-photo'
  ]
  const n = parseInt(digitsOnly(gv('pkg-cameras')), 10) || 1
  for (let i = 1; i <= n; i++) ids.push(`staff-vid-cam-${i}`)
  ids.forEach(id => fillStaffSelect(id, STAFF_SELECT_ROLES[id] || []))
}

function saveContractDraft() {
  // ذخیره پیش‌نویس قرارداد بدون نهایی‌سازی
  const contractObj = buildContractObject(false);
  if (!contractObj) return;

  // ذخیره موقت در localStorage
  try {
    localStorage.setItem('talar_contract_draft', JSON.stringify(contractObj));
    toast('پیش‌نویس ذخیره شد ✓', 'success');
  } catch(e) {
    toast('خطا در ذخیره پیش‌نویس', 'error');
  }
}

async function finalizeContract() {
  if (!validateStep(1)) return

  for (const role of ['groom', 'bride']) {
    const phone = getVerifyPhone(role)
    if (!phone) continue
    if (!isVerifyValid(role)) {
      toast(`شماره ${VERIFY_ROLES[role].label} باید با پیامک تأیید شود`, 'error')
      return gotoStep(1)
    }
    if (!(await verifyContractProof(role, phone))) {
      toast('اعتبارسنجی پیامکی نامعتبر است — دوباره تأیید کنید', 'error')
      return gotoStep(1)
    }
  }

  const contractObj = buildContractObject(true)
  if (!contractObj) return

  if (typeof DB === 'undefined' || !DB.insert) {
    toast('دیتابیس بارگذاری نشده. صفحه را رفرش کنید.', 'error')
    return
  }

  const record = {
    ...contractObj,
    contractNum: contractObj.id,
    eventDate: contractObj.date,
    groomPhone: contractObj.phoneGroom,
    bridePhone: contractObj.phoneBride,
    paid: contractObj.paid || 0
  }

  const depositBankId = document.getElementById('deposit-bank')?.value || ''
  const depositVal = record.deposit || 0
  if (depositVal > 0 && !depositBankId) {
    toast('بیعانه ثبت شده — لطفاً حساب بانکی واریز را انتخاب کنید', 'error')
    return
  }

  await SecureDB.insert('contracts', record)

  if (depositVal > 0 && typeof FinanceSync !== 'undefined') {
    const fin = await FinanceSync.recordContractInitialDeposit(record, depositBankId, {
      paymentMethod: document.getElementById('deposit-method')?.value || 'transfer',
      transactionRef: document.getElementById('deposit-ref')?.value?.trim() || '',
      date: record.contractDate || record.createdAt
    })
    if (fin && !fin.ok && !fin.skipped) {
      toast(fin.error || 'خطا در ثبت حسابداری بیعانه', 'warning')
    }
  }

  const assignedStaff = getAssignedStaff()
  for (const s of assignedStaff) {
    const person = (DB.get('personnel') || []).find(p => p.id === s.personnelId) ||
      (DB.get('personnel') || []).find(p => p.name === s.name)
    const amount = getStaffRate(s.personnelId || s.name, s.roleTitle)
    const proj = await SecureDB.insert('persProjects', {
      couple: contractObj.couple,
      personnelId: person?.id || s.personnelId || '',
      personnelName: s.name,
      role: s.roleTitle,
      roleId: s.roleKey.replace(/-/g, '_'),
      contractId: record.id,
      eventDate: contractObj.date,
      venue: contractObj.venue,
      amount,
      paid: 0,
      accepted: null,
      status: 'pending',
      deadline: contractObj.date
    })
    SecureDB.insert('notifications', {
      title: `دعوت به آفیش: ${s.roleTitle}`,
      text: `همکار ${s.name} — مراسم ${contractObj.couple} — ${contractObj.date}`,
      read: false,
      createdAt: typeof Utils !== 'undefined' ? Utils.todayJalali() : ''
    })
  }

  if (typeof DB.log === 'function') DB.log('contract_final', contractObj.couple)
  DB.flush?.()
  localStorage.removeItem('talar_contract_draft')
  toast('قرارداد ثبت شد' + (assignedStaff.length ? ` — ${assignedStaff.length} همکار ابلاغ شد` : ''), 'success')
  setTimeout(() => { window.location.href = 'studio-m/#contracts' }, 1200)
}

// ساخت آبجکت قرارداد از مقادیر فرم
function buildContractObject(isFinalized) {
  const gv = (id) => {
    const el = document.getElementById(id);
    return el ? el.value.trim() : '';
  };

  const bride = gv('bride-name') || gv('c-bride');
  const groom = gv('groom-name') || gv('c-groom');
  const phoneBride = gv('bride-phone') || gv('c-phone-b');
  const phoneGroom = gv('groom-phone') || gv('c-phone-g');

  const contractTypes = selectedContractTypes()
  const industrialOnly = contractTypes.length === 1 && contractTypes[0] === 'صنعتی'
  const clientName = gv('client-name')
  const clientPhone = normalizePhoneField('client-phone')

  if ((!industrialOnly && (!bride || !groom)) || (industrialOnly && !clientName)) {
    toast('نام عروس و داماد الزامی است', 'error');
    return null;
  }

  const total = state.total || 0
  const depositVal = parseMoney(gv('deposit'))
  if (depositVal < 0 || depositVal > total) {
    toast('بیعانه نمی‌تواند منفی یا بیشتر از مبلغ کل قرارداد باشد', 'error')
    return null
  }
  const contractId = gv('contract-num') || generateContractNum(gv('event-date')) || ('TMP-' + Date.now())
  const venue = gv('event-venue') || '—'
  const eventDate = gv('event-date') || todayFa()
  const contractDate = gv('contract-date') || todayFa()

  // جمع دستمزد پرسنل
  const staffCost = getAssignedStaff().reduce((sum, s) => sum + getStaffRate(s.name, s.roleTitle), 0);

  const assignedStaff = getAssignedStaff()
  return {
    id: contractId,
    couple: industrialOnly ? clientName : bride + ' و ' + groom,
    clientName: clientName || '',
    phone: clientPhone || '',
    bride: bride,
    groom: groom,
    phoneBride: normalizePhoneField('bride-phone'),
    phoneGroom: normalizePhoneField('groom-phone'),
    groomNid: digitsOnly(gv('groom-nid')),
    brideNid: digitsOnly(gv('bride-nid')),
    date: eventDate,
    contractDate,
    venue,
    type: contractTypes[0] || 'عروسی',
    types: contractTypes,
    makeup: gv('event-makeup') || '',
    music: gv('event-music') || '',
    tailor: gv('event-tailor') || '',
    guests: digitsOnly(gv('pkg-guests')) || '',
    cameras: gv('pkg-cameras') || '3',
    quality: gv('pkg-quality') || '4k',
    lineItems: state.lineItems,
    options: {
      photoVenue: chk('pkg-photo-venue'),
      photoGarden: chk('pkg-photo-garden'),
      helishot: chk('pkg-helishot'),
      fpv: chk('pkg-fpv'),
      crane: chk('pkg-crane'),
      tv: chk('pkg-tv'),
      album: chk('ord-album'),
      prints: chk('ord-prints'),
      photoPack: chk('ord-photo-pack')
    },
    albumSize: gv('album-size'),
    printQty: digitsOnly(gv('print-qty')),
    photoPackQty: digitsOnly(gv('photo-pack-qty')),
    total,
    deposit: depositVal,
    balance: total - depositVal,
    payPlan: gv('pay-plan') || '',
    terms: gv('contract-terms') || '',
    progress: 0,
    status: isFinalized ? 'active' : 'draft',
    staffCost: staffCost,
    staff: assignedStaff.reduce((obj, s) => { obj[s.roleKey] = s.name; return obj; }, {}),
    staffAssignments: assignedStaff.reduce((obj, s) => {
      obj[s.roleKey] = { id: s.personnelId || '', name: s.name }
      return obj
    }, {}),
    packageId: state.selectedPackageId || '',
    packageName: state.selectedPackageName || '',
    packageSnapshot: state.selectedPackageSnapshot || null,
    verification: getVerificationSnapshot(!isFinalized),
    createdAt: todayFa()
  };
}

function normalizePhoneField(id) {
  const raw = gv(id)
  if (typeof Utils !== 'undefined' && Utils.normalizePhone) {
    return Utils.normalizePhone(raw)
  }
  return digitsOnly(raw)
}

function getAssignedStaff() {
  const map = [
    { selectId: 'staff-photographer', roleKey: 'photographer', roleTitle: '📸 عکاس تالار' },
    { selectId: 'staff-photographer-garden', roleKey: 'photographer_garden', roleTitle: '🌳 عکاس باغ' },
    { selectId: 'staff-vid-clip', roleKey: 'vid-clip', roleTitle: '🎥 فیلمبردار کلیپ' },
    { selectId: 'staff-helishot', roleKey: 'helishot', roleTitle: '🚁 هلی‌شات' },
    { selectId: 'staff-edit-clip', roleKey: 'edit-clip', roleTitle: '✂️ ادیتور کلیپ' },
    { selectId: 'staff-edit-photo', roleKey: 'edit-photo', roleTitle: '💻 ادیتور عکس/آلبوم' }
  ]
  const n = parseInt(digitsOnly(gv('pkg-cameras')), 10) || 1
  for (let i = 1; i <= n; i++) {
    map.push({ selectId: `staff-vid-cam-${i}`, roleKey: `vid-cam-${i}`, roleTitle: `🎬 فیلمبردار ${camOrdinalLabel(i)}` })
  }
  return map.filter(m => document.getElementById(m.selectId)?.value)
    .map(m => {
      const el = document.getElementById(m.selectId)
      const val = el.value
      const personnel = (typeof DB !== 'undefined' ? DB.get('personnel') : []) || []
      const person = personnel.find(p => p.id === val) ||
        personnel.find(p => p.name === val) ||
        personnel.find(p => p.name === el.options[el.selectedIndex]?.dataset.name)
      return { ...m, name: person?.name || el.options[el.selectedIndex]?.dataset.name || val, personnelId: person?.id || '' }
    })
}

// گرفتن دستمزد پرسنل از پروفایل
function getStaffRate(name, roleTitle) {
  const personnel = (typeof DB !== 'undefined' ? DB.get('personnel') : []) || []
  const pers = personnel.find(p => p.id === name) || personnel.find(p => p.name === name)
  if (!pers) return 0
  if (pers.rate) return pers.rate
  if (pers.roleRates) {
    for (const [key, val] of Object.entries(pers.roleRates)) {
      if (roleTitle.includes(key)) return val
    }
  }
  if (pers.roleAmounts) {
    for (const [key, val] of Object.entries(pers.roleAmounts)) {
      if (roleTitle.includes(key)) return val
    }
  }
  return 0
}
