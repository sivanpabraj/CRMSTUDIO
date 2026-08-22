'use strict'
/* global Element, saveContractDraft, gotoStep, sendVerifySms, confirmVerify,
   quickDeposit, openInvoice, exportPDF, printContract, finalizeContract,
   applyContractPackage, clearContractPackage, setPdfFormat, syncPreview,
   onVerifyPhoneChange, onContractTypesChange, onDepositBankChange,
   populatePersonnelDropdowns,
   populateDepositBanks, initVerifyUi, renderPackagePicker, onEventDatePicked */

const CONTRACT_ACTIONS = Object.freeze({
  'save-draft': () => saveContractDraft(),
  'goto-step': element => gotoStep(Number(element.dataset.step)),
  'send-verify': element => sendVerifySms(element.dataset.role),
  'confirm-verify': element => confirmVerify(element.dataset.role),
  'quick-deposit': element => quickDeposit(Number(element.dataset.ratio)),
  'open-invoice': () => openInvoice(),
  'close-invoice': () => document.getElementById('inv-backdrop')?.classList.remove('open'),
  'export-pdf': () => exportPDF(),
  'print-contract': () => printContract(),
  finalize: () => finalizeContract(),
  'apply-package': element => applyContractPackage(element.dataset.packageId),
  'clear-package': () => clearContractPackage(),
  'set-pdf-format': element => setPdfFormat(element.dataset.format)
})

const CONTRACT_INPUTS = Object.freeze({
  'sync-preview': () => syncPreview(),
  'verify-phone': element => onVerifyPhoneChange(element.dataset.role),
  'calc-totals': () => calcTotals()
})

const CONTRACT_CHANGES = Object.freeze({
  'contract-types': () => onContractTypesChange(),
  cameras: () => { updateCamOperators(); calcTotals() },
  quality: () => toggleQualityPrice(),
  'calc-totals': () => calcTotals(),
  album: () => { toggleAlbumFields(); calcTotals() },
  prints: () => { togglePrintFields(); calcTotals() },
  'photo-pack': () => { togglePhotoPackFields(); calcTotals() },
  'deposit-bank': () => onDepositBankChange()
})

function dispatchContractEvent(event, attribute, handlers) {
  const target = event.target instanceof Element ? event.target.closest(`[${attribute}]`) : null
  if (!target) return
  const handler = handlers[target.getAttribute(attribute)]
  if (typeof handler !== 'function') return
  if (event.type === 'click') event.preventDefault()
  handler(target, event)
}

document.addEventListener('click', event => {
  dispatchContractEvent(event, 'data-contract-action', CONTRACT_ACTIONS)
})
document.addEventListener('input', event => {
  dispatchContractEvent(event, 'data-contract-input', CONTRACT_INPUTS)
})
document.addEventListener('change', event => {
  dispatchContractEvent(event, 'data-contract-change', CONTRACT_CHANGES)
})

document.addEventListener('DOMContentLoaded', () => {
  Bootstrap.start(async () => {
    if (typeof PageNav !== 'undefined') PageNav.render('contractNew')
    if (typeof Auth !== 'undefined' && !Auth.isLoggedIn()) {
      window.location.href = 'index.html?next=' + encodeURIComponent('contract.html')
      return
    }
    if (typeof Auth !== 'undefined' && Auth.getHomePage() === 'portal') {
      window.location.href = 'index.html?view=portal'
      return
    }
    const info = DB.get('studioInfo') || {}
    const studioName = document.getElementById('studio-name')
    if (studioName && !studioName.value) studioName.value = info.name || ''
    if (typeof populatePersonnelDropdowns === 'function') populatePersonnelDropdowns()
    if (typeof populateDepositBanks === 'function') populateDepositBanks()
    if (typeof toggleQualityPrice === 'function') toggleQualityPrice()
    if (typeof updateCamOperators === 'function') updateCamOperators()
    if (typeof calcTotals === 'function') calcTotals()
    if (typeof initVerifyUi === 'function') initVerifyUi()
    if (typeof renderPackagePicker === 'function') renderPackagePicker()
    if (typeof JalaliPicker !== 'undefined') {
      JalaliPicker.attach('event-date', date => {
        if (typeof onEventDatePicked === 'function') onEventDatePicked(date)
      })
    }
  })
})
