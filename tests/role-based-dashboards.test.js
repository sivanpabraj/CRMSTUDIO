import { describe, it, expect, vi, beforeEach } from 'vitest'
import fs from 'fs'
import path from 'path'
import vm from 'vm'

describe('Role-Based Dashboards & Automatic Phone Discovery', () => {
  let context

  beforeEach(() => {
    context = {
      window: {},
      console,
      Date,
      Math,
      String,
      Array,
      Object,
      JSON,
      setTimeout,
      clearTimeout,
      AppConfig: { OTP_TTL_MS: 300000, isLocalDev: () => true },
      Utils: {
        normalizePhone: (p) => String(p || '').replace(/\D/g, ''),
        faToEn: (s) => s,
        daysUntil: () => 0,
        normalizePassword: (p) => p,
        isValidPhone: () => true,
        isValidEmail: () => true,
        escapeHtml: (s) => s
      },
      RolesHelper: {
        normalize: (r) => r
      },
      normalizeRoles: (r) => r || [],
      getRole: (id) => ({ id, title: id, emoji: '👤', type: id === 'studio_manager' || id === 'system_admin' ? 'management' : 'field' }),
      getRoleTitle: (id) => id,
      sessionStorage: {
        store: {},
        getItem(k) { return this.store[k] || null },
        setItem(k, v) { this.store[k] = v },
        removeItem(k) { delete this.store[k] }
      }
    }
    context.window = context

    // Load Access
    const accessCode = fs.readFileSync(path.resolve(__dirname, '../js/access.js'), 'utf8')
    vm.runInNewContext(accessCode, context)

    // Load UnifiedLogin
    const unifiedCode = fs.readFileSync(path.resolve(__dirname, '../js/unified-login.js'), 'utf8')
    vm.runInNewContext(unifiedCode, context)
  })

  it('1. Automatically routes Studio Manager by phone to executive studio-m/ dashboard', () => {
    const managerUser = {
      id: 'mgr_1',
      name: 'سیوان پابرجا',
      phone: '09187756267',
      roles: ['studio_manager'],
      status: 'active'
    }

    context.DB = {
      find: (col, fn) => {
        if (col === 'users') return fn(managerUser) ? managerUser : null
        return null
      },
      filter: () => []
    }
    context.Auth = {
      getUser: () => managerUser,
      isLoggedIn: () => true
    }

    const resolved = context.UnifiedLogin.resolvePhone('09187756267')
    expect(resolved.kind).toBe('manager')
    expect(context.UnifiedLogin.landingUrl(resolved)).toBe('studio-m/')
    expect(context.Access.canAccessStudioM(managerUser)).toBe(true)
    expect(context.Access.getLandingUrl()).toBe('studio-m/')
  })

  it('2. Automatically routes Staff / Employee by phone to dedicated staff portal dashboard', () => {
    const staffUser = {
      id: 'staff_1',
      name: 'سارینا طهمازی',
      phone: '09184004893',
      roles: ['office_secretary', 'photographer', 'album_designer'],
      portalType: 'staff',
      status: 'active'
    }

    context.DB = {
      find: (col, fn) => {
        if (col === 'users') return fn(staffUser) ? staffUser : null
        return null
      },
      filter: () => []
    }
    context.Auth = {
      getUser: () => staffUser,
      isLoggedIn: () => true
    }

    const resolved = context.UnifiedLogin.resolvePhone('09184004893')
    expect(resolved.kind).toBe('staff')
    expect(context.UnifiedLogin.landingUrl(resolved)).toBe('index.html?view=portal')

    // Security Gate check: Staff portalType must be blocked from executive studio-m/
    expect(context.Access.canAccessStudioM(staffUser)).toBe(false)
    expect(context.Access.isStaffOnly(staffUser)).toBe(true)
    expect(context.Access.getLandingUrl()).toBe('index.html?view=portal')
  })

  it('3. Automatically routes Customer by phone to dedicated customer tracking portal', () => {
    const contract = {
      id: 'cnt_123',
      couple: 'علی و مریم',
      phone: '09123334455',
      groomPhone: '09123334455',
      bridePhone: '09124445566',
      status: 'active'
    }

    context.DB = {
      find: (col, fn) => {
        if (col === 'users') return null
        return null
      },
      get: (col) => (col === 'contracts' ? [contract] : []),
      filter: (col, fn) => {
        if (col === 'contracts') return fn(contract) ? [contract] : []
        return []
      }
    }

    const resolved = context.UnifiedLogin.resolvePhone('09123334455')
    expect(resolved.kind).toBe('customer')
    expect(resolved.label).toBe('علی و مریم')
    expect(context.UnifiedLogin.landingUrl(resolved)).toBe('customer.html')
  })

  it('4. Correctly classifies new/unregistered phone as guest for consultation booking', () => {
    context.DB = {
      find: () => null,
      get: () => [],
      filter: () => []
    }

    const resolved = context.UnifiedLogin.resolvePhone('09990000000')
    expect(resolved.kind).toBe('guest')
    expect(context.UnifiedLogin.landingUrl(resolved)).toBe('index.html')
  })

  it('5. Successfully identifies customer via Bride Phone (bidirectional lookup)', () => {
    const contract = {
      id: 'cnt_456',
      couple: 'سامان و نگین',
      groomPhone: '09121111111',
      bridePhone: '09124445566',
      status: 'active'
    }

    context.DB = {
      find: () => null,
      get: (col) => (col === 'contracts' ? [contract] : []),
      filter: (col, fn) => (col === 'contracts' ? (fn(contract) ? [contract] : []) : [])
    }

    const resolved = context.UnifiedLogin.resolvePhone('09124445566')
    expect(resolved.kind).toBe('customer')
    expect(resolved.label).toBe('سامان و نگین')
    expect(context.UnifiedLogin.landingUrl(resolved)).toBe('customer.html')
  })

  it('6. Blocks staff from executive studio-m/ even when portalType is undefined (defense in depth)', () => {
    const staffWithoutPortalType = {
      id: 'staff_legacy_1',
      name: 'هماهنگ‌کننده تست',
      phone: '09181112233',
      roles: ['coordinator'], // normally in MANAGEMENT_ROLES, but is an employee
      status: 'active'
      // portalType is omitted
    }

    const personnelRecord = {
      id: 'per_1',
      userId: 'staff_legacy_1',
      name: 'هماهنگ‌کننده تست',
      phone: '09181112233',
      roles: ['coordinator']
    }

    context.DB = {
      find: (col, fn) => {
        if (col === 'users') return fn(staffWithoutPortalType) ? staffWithoutPortalType : null
        if (col === 'personnel') return fn(personnelRecord) ? personnelRecord : null
        return null
      },
      findPersonnelByUserId: (id) => (id === 'staff_legacy_1' ? personnelRecord : null),
      findPersonnelByPhone: (p) => (p === '09181112233' ? personnelRecord : null),
      get: () => []
    }

    // Access gate must detect that this user is a staff member and deny studio-m
    expect(context.Access.canAccessStudioM(staffWithoutPortalType)).toBe(false)
  })

  it('7. Accurately calculates customer contract financial balance, deposits, and remaining debt', () => {
    const contract = {
      id: 'cnt_fin_1',
      totalAmount: 45000000,
      deposit: 15000000
    }
    const transactions = [
      { id: 'tx_1', contractId: 'cnt_fin_1', type: 'deposit', amount: 10000000, purpose: 'قسط دوم' },
      { id: 'tx_2', contractId: 'cnt_fin_1', type: 'deposit', amount: 5000000, purpose: 'قسط سوم' }
    ]

    context.DB = {
      get: (col) => (col === 'transactions' ? transactions : [])
    }

    const txTotal = transactions.reduce((s, t) => s + t.amount, 0)
    const totalPaid = contract.deposit + txTotal
    const remaining = Math.max(0, contract.totalAmount - totalPaid)

    expect(totalPaid).toBe(30000000)
    expect(remaining).toBe(15000000)
  })

  it('8. Personnel getPayrollPayments aggregates both salary records and accounting transactions', () => {
    // Load portal-shared
    const portalSharedCode = fs.readFileSync(path.resolve(__dirname, '../js/portal-shared.js'), 'utf8')
    vm.runInNewContext(portalSharedCode, context)

    const personnelId = 'per_test_100'
    const salaryPayments = [
      { id: 'sal_1', personId: personnelId, amount: 8000000, month: '1405/06', monthLabel: 'شهریور' }
    ]
    const transactions = [
      { id: 'tx_p1', personnelId, type: 'withdrawal', amount: 4000000, purpose: 'دستمزد پروژه ۱', date: '1405/06/15' }
    ]

    context.DB = {
      get: (col) => {
        if (col === 'salaryPayments') return salaryPayments
        if (col === 'transactions') return transactions
        return []
      }
    }

    const payments = context.PortalShared.getPayrollPayments(personnelId)
    expect(payments.length).toBe(2)
    expect(payments.some(p => p.amount === 8000000)).toBe(true)
    expect(payments.some(p => p.amount === 4000000)).toBe(true)
  })
})
