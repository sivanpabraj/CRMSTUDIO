function escapeContractHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[character])
}

function safePackageColor(value) {
  const candidate = String(value ?? '')
  return /^(?:#[0-9a-f]{3,8}|[a-z]{3,20})$/i.test(candidate)
    ? candidate
    : '#64748b'
}

function renderSafePackageCard({ packageItem, tier, totalLabel, active = false, features = [] }) {
  const color = safePackageColor(packageItem?.color || tier?.color)
  return `<button type="button" class="pkg-pick-card${active ? ' active' : ''}" style="--pkg-color:${color}" data-contract-action="apply-package" data-package-id="${escapeContractHtml(packageItem?.id)}">
    <div class="pkg-pick-tier">${escapeContractHtml(tier?.icon)} ${escapeContractHtml(tier?.label)}</div>
    <div class="pkg-pick-name">${escapeContractHtml(packageItem?.name)}</div>
    <ul class="pkg-pick-feats">${features.slice(0, 4).map(feature => `<li>${escapeContractHtml(feature)}</li>`).join('')}</ul>
    <div class="pkg-pick-price">${escapeContractHtml(totalLabel)} <small>تومان</small></div>
  </button>`
}

const ContractRenderSecurity = Object.freeze({
  escapeHtml: escapeContractHtml,
  safePackageColor,
  renderPackageCard: renderSafePackageCard
})

if (typeof globalThis !== 'undefined') globalThis.ContractRenderSecurity = ContractRenderSecurity

export { escapeContractHtml, safePackageColor, renderSafePackageCard }
