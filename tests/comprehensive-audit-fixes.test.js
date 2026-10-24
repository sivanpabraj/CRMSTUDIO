import { describe, it, expect, beforeEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

describe('Comprehensive Engineering Audit Fixes — CRMSTUDIO v6.5.0', () => {

  describe('Section 1: Crew Pocket Hub Security & Countdown', () => {
    it('does not assign first personnel record when user is unauthenticated', () => {
      const code = fs.readFileSync(path.join(process.cwd(), 'js/crew-pwa.js'), 'utf-8')
      expect(code).not.toContain('this.state.currentUser = {\n            id: first.id')
      expect(code).not.toContain('first = pers[0]')
      expect(code).toContain('this.state.currentUser = null')
    })

    it('parses actual shoot call time or time instead of hardcoded 15:30', () => {
      const code = fs.readFileSync(path.join(process.cwd(), 'js/crew-pwa.js'), 'utf-8')
      expect(code).toContain('shoot?.time || shoot?.callTime')
      expect(code).toContain('target.setHours(targetH, targetM, 0, 0)')
    })
  })

  describe('Section 2: Server Security & Database Reset Master Key Hardening', () => {
    it('does not have fallback mandani_root_2026 in sync-server.mjs', () => {
      const serverCode = fs.readFileSync(path.join(process.cwd(), 'server/sync-server.mjs'), 'utf-8')
      expect(serverCode).not.toContain("process.env.SYSTEM_UPDATE_KEY || 'mandani_root_2026'")
    })

    it('enforces SYSTEM_UPDATE_KEY minimum length check in sync-server.mjs', () => {
      const serverCode = fs.readFileSync(path.join(process.cwd(), 'server/sync-server.mjs'), 'utf-8')
      expect(serverCode).toContain('!expectedAdminKey || expectedAdminKey.length < 12')
    })
  })

  describe('Section 3: Smart Lifecycle SMS & PaymentGateway URL Compatibility', () => {
    it('has both createInvoiceUrl and generateInvoiceUrl alias in PaymentGateway', () => {
      const code = fs.readFileSync(path.join(process.cwd(), 'js/payment-gateway.js'), 'utf-8')
      expect(code).toContain('createInvoiceUrl(contractId')
      expect(code).toContain('generateInvoiceUrl(contractId')
    })

    it('does not call undefined generateInvoiceUrl exclusively in smart-lifecycle-sms.js', () => {
      const code = fs.readFileSync(path.join(process.cwd(), 'js/smart-lifecycle-sms.js'), 'utf-8')
      expect(code).toContain('PaymentGateway.createInvoiceUrl')
    })
  })

  describe('Section 4: Card-to-Card Receipt Verification Pipeline', () => {
    it('includes recordPendingReceipt in PaymentGateway for fraud prevention', () => {
      const code = fs.readFileSync(path.join(process.cwd(), 'js/payment-gateway.js'), 'utf-8')
      expect(code).toContain('recordPendingReceipt(data')
      expect(code).toContain("status: 'pending_approval'")
    })

    it('invoice.html uses recordPendingReceipt instead of immediately recording successful payment', () => {
      const code = fs.readFileSync(path.join(process.cwd(), 'invoice.html'), 'utf-8')
      expect(code).toContain('recordPendingReceipt')
      expect(code).not.toContain('submitC2CTrace = async function() {\n        const inp = document.getElementById(\'c2c-ref-input\');\n        const ref = inp ? inp.value.trim() : \'\';\n        if (!ref) {\n          alert(\'لطفاً شماره پیگیری یا ارجاع واریز را وارد نمایید.\');\n          return;\n        }\n\n        await PaymentGateway.recordSuccessfulPayment(')
    })
  })

  describe('Section 5: Studio M Bookings Module Data Loss Prevention', () => {
    it('displays client phone, branch title and deposit in bookings table & view', () => {
      const code = fs.readFileSync(path.join(process.cwd(), 'studio-m/js/modules/bookings.js'), 'utf-8')
      expect(code).toContain('b.phone')
      expect(code).toContain('b.branchTitle')
      expect(code).toContain('b.deposit')
      expect(code).toContain('tel:${SM.esc(b.phone)}')
    })

    it('preserves existing online booking properties on save without overwrite loss', () => {
      const code = fs.readFileSync(path.join(process.cwd(), 'studio-m/js/modules/bookings.js'), 'utf-8')
      expect(code).toContain('...(item || {})')
    })
  })

  describe('Section 6: Booking Flow, Push Notifications and Dynamic Contact Info', () => {
    it('PaymentGateway.requestPayment returns a Promise resolving status', () => {
      const code = fs.readFileSync(path.join(process.cwd(), 'js/payment-gateway.js'), 'utf-8')
      expect(code).toContain('return new Promise((resolve) => {')
      expect(code).toContain('resolve({ ok: true, ...result })')
      expect(code).toContain('resolve({ ok: false, cancelled: true })')
    })

    it('booking.html awaits payment and sets pending_deposit on cancellation', () => {
      const code = fs.readFileSync(path.join(process.cwd(), 'booking.html'), 'utf-8')
      expect(code).toContain('const payRes = await PaymentGateway.requestPayment')
      expect(code).toContain("paymentStatus = 'pending_deposit'")
    })

    it('customer.js and customer-pro.js use dynamic studio whatsapp instead of hardcoded 989187766554', () => {
      const custCode = fs.readFileSync(path.join(process.cwd(), 'js/customer.js'), 'utf-8')
      const proCode = fs.readFileSync(path.join(process.cwd(), 'js/customer-pro.js'), 'utf-8')
      expect(custCode).not.toContain('https://wa.me/989187766554')
      expect(proCode).not.toContain('https://wa.me/989187766554')
      expect(proCode).toContain('https://wa.me/${waNumber}')
    })

    it('sw.js registers push and notificationclick event listeners', () => {
      const swCode = fs.readFileSync(path.join(process.cwd(), 'sw.js'), 'utf-8')
      expect(swCode).toContain("self.addEventListener('push'")
      expect(swCode).toContain("self.addEventListener('notificationclick'")
    })
  })
})
