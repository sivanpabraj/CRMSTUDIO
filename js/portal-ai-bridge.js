/**
 * Portal AI Bridge — کارت مرحله و مانده برای پرتال مشتری
 * وابسته به StudioAIBrain اگر موجود باشد؛ وگرنه محاسبه محلی سبک
 */
(function () {
  'use strict'

  function fmt(n) {
    try {
      if (typeof Utils !== 'undefined' && Utils.fmtNum) return Utils.fmtNum(n)
    } catch { /* */ }
    return Number(n || 0).toLocaleString('fa-IR')
  }

  function debtOf(contract) {
    if (!contract) return { total: 0, paid: 0, debt: 0 }
    const total = Number(contract.total || contract.totalPrice || contract.finalAmount || contract.price || 0)
    const deposit = Number(contract.deposit || contract.prepayment || 0)
    const paidExtra = Number(contract.paid || contract.paidAmount || 0)
    let linked = 0
    try {
      const tx = (typeof DB !== 'undefined' && DB.get('transactions')) || []
      linked = tx
        .filter((t) => t.type === 'deposit' && t.contractId === contract.id)
        .reduce((s, t) => s + Number(t.amount || 0), 0)
    } catch { /* */ }
    const paid = linked > 0 ? linked : deposit + paidExtra
    return { total, paid, debt: Math.max(0, total - paid) }
  }

  function stageOf(contract) {
    if (typeof StudioAIBrain !== 'undefined' && StudioAIBrain.customerStage) {
      return StudioAIBrain.customerStage(contract)
    }
    const days = typeof Utils !== 'undefined' && Utils.daysUntil
      ? Utils.daysUntil(contract.eventDate || contract.date)
      : null
    const fin = debtOf(contract)
    let label
    let detail
    const nextAction = fin.debt > 0 ? `مانده حساب: ${fmt(fin.debt)} تومان` : 'حساب در وضعیت مناسب است.'
    if (days === null) {
      label = 'ثبت اولیه'
      detail = 'تاریخ مراسم را با استودیو تأیید کنید.'
    } else if (days > 14) {
      label = 'آماده‌سازی پیش از مراسم'
      detail = `${days.toLocaleString('fa-IR')} روز تا مراسم`
    } else if (days >= 1) {
      label = 'هماهنگی نهایی'
      detail = `${days.toLocaleString('fa-IR')} روز مانده`
    } else if (days === 0) {
      label = 'روز مراسم'
      detail = 'تیم استودیو امروز همراه شماست.'
    } else {
      label = 'پس از مراسم — تولید'
      detail = `${Math.abs(days).toLocaleString('fa-IR')} روز از مراسم گذشته`
    }
    return {
      couple: contract.couple || `${contract.bride || ''} و ${contract.groom || ''}`.trim(),
      label,
      detail,
      nextAction,
      debt: fin.debt,
      total: fin.total,
      totalPaid: fin.paid,
      days
    }
  }

  function findContract() {
    try {
      if (typeof CustomerSession !== 'undefined' && CustomerSession.getContract) {
        const c = CustomerSession.getContract()
        if (c) return c
      }
    } catch { /* */ }
    try {
      const session = JSON.parse(localStorage.getItem('talar_customer_session') || 'null')
      const id = session?.contractId
      if (id && typeof DB !== 'undefined') return DB.find('contracts', (x) => x.id === id)
    } catch { /* */ }
    return null
  }

  function inject() {
    const root = document.getElementById('customer-app')
    if (!root || root.querySelector('[data-portal-ai-stage]')) return
    const contract = findContract()
    if (!contract) return
    const st = stageOf(contract)
    const card = document.createElement('div')
    card.setAttribute('data-portal-ai-stage', '1')
    card.style.cssText =
      'margin:12px;padding:14px 16px;border-radius:16px;background:rgba(201,169,110,.12);border:1px solid rgba(201,169,110,.35);font-family:Vazirmatn,sans-serif;'
    card.innerHTML = `
      <div style="font-weight:800;font-size:1rem;color:#C9A96E;margin-bottom:6px">
        <i class="fas fa-route"></i> وضعیت پرونده شما
      </div>
      <div style="font-size:.95rem;font-weight:700;margin-bottom:4px">${st.label}</div>
      <div style="opacity:.85;font-size:.85rem;margin-bottom:8px">${st.detail || ''}</div>
      <div style="opacity:.9;font-size:.85rem;margin-bottom:10px">${st.nextAction || ''}</div>
      <div style="display:flex;gap:12px;flex-wrap:wrap;font-size:.8rem">
        <span>کل: <b>${fmt(st.total)}</b></span>
        <span>پرداخت: <b>${fmt(st.totalPaid)}</b></span>
        <span>مانده: <b style="color:#fbbf24">${fmt(st.debt)}</b></span>
      </div>`
    // try top of app
    if (root.firstChild) root.insertBefore(card, root.firstChild)
    else root.appendChild(card)
  }

  function boot() {
    setTimeout(inject, 800)
    setTimeout(inject, 2000)
    setTimeout(inject, 4000)
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot)
  else boot()
})()
