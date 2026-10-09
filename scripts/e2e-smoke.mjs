#!/usr/bin/env node
/**
 * تست دود محلی — منطق نرمال‌سازی، مالی، مسیرها
 * اجرا: node scripts/e2e-smoke.mjs
 */
import assert from 'node:assert/strict'

function normalizePhone(p) {
  if (!p) return ''
  let en = String(p)
    .replace(/[۰-۹]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d))
    .replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d))
    .replace(/\D/g, '')
  if (en.startsWith('98') && en.length === 12) en = '0' + en.slice(2)
  if (en.length === 10 && en.startsWith('9')) en = '0' + en
  return en
}

function debt(c) {
  const total = Number(c.totalPrice || c.price || 0)
  const paid = Number(c.paidAmount ?? c.paid ?? c.prepayment ?? 0)
  return Math.max(0, total - paid)
}

function landing(user) {
  if (!user) return 'index.html'
  if (user.portalType === 'staff') return 'index.html?view=portal'
  const roles = user.roles || []
  if (roles.includes('studio_manager') || roles.includes('system_admin')) return 'studio-m/'
  return 'index.html?view=portal'
}

let pass = 0
function ok(name, cond) {
  assert.ok(cond, name)
  pass++
  console.log('✓', name)
}

ok('phone 912…', normalizePhone('9123456789') === '09123456789')
ok('phone +98', normalizePhone('+989123456789') === '09123456789')
ok('phone fa digits', normalizePhone('۰۹۱۲۳۴۵۶۷۸۹') === '09123456789')
ok('debt basic', debt({ totalPrice: 100, paid: 40 }) === 60)
ok('debt zero', debt({ price: 50, prepayment: 50 }) === 0)
ok('land manager', landing({ roles: ['studio_manager'] }) === 'studio-m/')
ok('land staff', landing({ portalType: 'staff', roles: ['photographer'] }) === 'index.html?view=portal')
ok('land null', landing(null) === 'index.html')

console.log('\nE2E smoke passed:', pass, 'checks')
