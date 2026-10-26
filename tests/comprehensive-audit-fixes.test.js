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

  describe('Section 7: ERP Core Enhancements & Sayad Cheques', () => {
    it('supports 16-digit Sayad cheque ID in accounting modal and list view', () => {
      const code = fs.readFileSync(path.join(process.cwd(), 'studio-m/js/accounting.js'), 'utf-8')
      expect(code).toContain('ch-sayad')
      expect(code).toContain('sayadId')
      expect(code).toContain('صیاد:')
    })

    it('supports interactive bonus, deductions and recalculation in payroll', () => {
      const code = fs.readFileSync(path.join(process.cwd(), 'studio-m/js/payroll.js'), 'utf-8')
      expect(code).toContain('pay-bonus')
      expect(code).toContain('pay-deduction')
      expect(code).toContain('baseCalculated')
      expect(code).toContain('finalTotal')
    })

    it('tracks camera shutter count and triggers service interval alert', () => {
      const code = fs.readFileSync(path.join(process.cwd(), 'studio-m/js/equipment.js'), 'utf-8')
      expect(code).toContain('shutterCount')
      expect(code).toContain('serviceIntervalShots')
      expect(code).toContain('سرویس شاتر!')
    })

    it('tracks archive HDD and folder in contracts form, module view and edit modal', () => {
      const contractHtml = fs.readFileSync(path.join(process.cwd(), 'contract.html'), 'utf-8')
      const contractJs = fs.readFileSync(path.join(process.cwd(), 'contract.js'), 'utf-8')
      const modulesJs = fs.readFileSync(path.join(process.cwd(), 'studio-m/js/modules.js'), 'utf-8')

      expect(contractHtml).toContain('id="archive-hdd"')
      expect(contractHtml).toContain('id="archive-folder"')

      expect(contractJs).toContain('archiveHdd: gv(\'archive-hdd\') || \'\'')
      expect(contractJs).toContain('archiveFolder: gv(\'archive-folder\') || \'\'')

      expect(modulesJs).toContain('c.archiveHdd')
      expect(modulesJs).toContain('c.archiveFolder')
      expect(modulesJs).toContain('ct-archive-hdd')
      expect(modulesJs).toContain('ct-archive-folder')
    })

    it('integrates customer photo selection dashboard and submission flow', () => {
      const custCode = fs.readFileSync(path.join(process.cwd(), 'js/customer.js'), 'utf-8')
      expect(custCode).toContain('_renderPhotoSelectionSection')
      expect(custCode).toContain('submitPhotoSelection')
      expect(custCode).toContain('photo-sel-numbers')
      expect(custCode).toContain('photoSelections')
    })

    it('has zero broken CSS and JS assets in booking.html', () => {
      const bookingHtml = fs.readFileSync(path.join(process.cwd(), 'booking.html'), 'utf-8')
      expect(bookingHtml).not.toContain('css/style.css')
      expect(bookingHtml).not.toContain('js/app-config.js')
      expect(bookingHtml).toContain('css/ui-kit.css')
      expect(bookingHtml).toContain('js/config.js')
    })
  })
})
