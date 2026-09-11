import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import vm from 'node:vm'

const source = fs.readFileSync('studio-m/js/dashboard.js', 'utf8')
const css = fs.readFileSync('studio-m/css/studio-m.css', 'utf8')
const glassCss = fs.readFileSync('studio-m/css/dark-glass-theme.css', 'utf8')
const settingsSource = fs.readFileSync('studio-m/js/settings.js', 'utf8')

function dashboardWith(data = {}, roles = ['studio_manager']) {
  const collections = {
    contracts: [], transactions: [], personnel: [], bookings: [], cheques: [],
    persProjects: [], expenses: [], customerRequests: [], banks: [], workflows: [],
    appointments: [], albums: [], ...data
  }
  const context = {
    localStorage: { getItem: () => null, setItem: () => {} },
    DB: {
      get: name => collections[name] || [],
      set: () => {},
      find: (name, predicate) => (collections[name] || []).find(predicate) || null,
      filter: () => []
    },
    Utils: {
      parseJalaliToday: () => ({ jy: 1405, jm: 5 }),
      jalaliMonthName: month => `ماه ${month}`,
      daysUntil: date => date === '1405/04/01' ? -30 : 5,
      todayJalali: () => '1405/05/25'
    },
    SM: {
      fmt: String, esc: String, studio: () => ({}), user: () => ({ roles, name: 'مدیر استودیو' }),
      navigate: () => {}, isModuleDisabled: () => false, getModuleSearch: () => ''
    },
    Access: { isSystemAdmin: () => false, isStudioManager: user => user.roles.includes('studio_manager') },
    SMUI: {
      badge: text => text, empty: () => '', moduleSearch: () => '',
      formField: () => '',
      modal: title => { context.lastModal = title }
    },
    window: {}
  }
  vm.runInNewContext(source, context)
  return context.window.SMDashboard
}

describe('STE100 executive dashboard', () => {
  it('calculates current and previous Jalali month totals without mixing years', () => {
    const dashboard = dashboardWith()
    const ctx = {
      tx: [
        { type: 'deposit', date: '1405/05/02', amount: 500 },
        { type: 'deposit', date: '1404/05/02', amount: 900 },
        { type: 'deposit', date: '1405/04/20', amount: 400 },
        { type: 'withdrawal', date: '1405/05/03', amount: 100 }
      ],
      contracts: [{ total: 1000, deposit: 300, paid: 200, eventDate: '1405/04/01' }]
    }
    const model = dashboard._financialModel(ctx)
    expect(model.monthIncome).toBe(500)
    expect(model.previousIncome).toBe(400)
    expect(model.monthExpense).toBe(100)
    expect(model.net).toBe(400)
    expect(model.overdue).toHaveLength(1)
    expect(model.health).toBeGreaterThanOrEqual(0)
    expect(model.health).toBeLessThanOrEqual(100)
  })

  it('keeps forecast explainable as actual collection plus contract remainder', () => {
    const dashboard = dashboardWith()
    const ctx = {
      tx: [{ type: 'deposit', date: '1405/05/02', amount: 200 }],
      contracts: [{ total: 1000, deposit: 200, paid: 100, eventDate: '1405/05/10' }]
    }
    const current = dashboard._forecastSeries(ctx).at(-1)
    expect(current.actual).toBe(200)
    expect(current.expected).toBe(900)
  })

  it('deduplicates expense records and reports an explicit other category', () => {
    const dashboard = dashboardWith()
    const record = { id: 'e1', date: '1405/05/02', title: 'چاپ آلبوم', amount: 300 }
    const result = dashboard._expenseCategories({ expenses: [record], monthWithdrawals: [record] })
    expect(result.total).toBe(300)
    expect(result.items.find(item => item.id === 'print').value).toBe(300)
    expect(result.items.some(item => item.id === 'other')).toBe(true)
  })

  it('contains operational, financial, empty-state and accessibility surfaces', () => {
    expect(source).toContain('وصول واقعی و برآورد قراردادی')
    expect(source).toContain('فرمول: وصول ۳۵٪')
    expect(source).toContain('مراسم‌های پیش‌رو')
    expect(source).toContain('گردش تولید')
    expect(source).toContain('_canViewFinance')
    expect(source).toContain('اطلاعات مالی فقط برای مدیر استودیو')
    expect(source).toContain('_opsModel')
    expect(source).toContain('افزودن نوبت')
    expect(source).toContain('ظرفیت آزاد')
    expect(source).toContain('confirmBooking')
    expect(source).toContain('assignTeam')
    expect(source).toContain('امروز هنوز برنامه‌ای نیست')
    expect(source).toContain('aria-label=')
    expect(css).toContain('@media (max-width: 440px)')
    expect(css).toContain('@media (prefers-reduced-motion: reduce)')
    expect(css).toContain('@media (forced-colors: active)')
    expect(glassCss).toContain('Executive dashboard integration')
    expect(settingsSource).toContain('چیدمان پیشخوان بر اساس اولویت تصمیم‌گیری')
    expect(settingsSource).not.toContain('SMSettings.saveWidgets()')
  })

  it('restricts financial dashboard to system and studio managers', () => {
    expect(dashboardWith({}, ['studio_manager'])._canViewFinance()).toBe(true)
    expect(dashboardWith({}, ['office_secretary'])._canViewFinance()).toBe(false)
    expect(dashboardWith({}, ['editor_clip'])._canViewFinance()).toBe(false)
  })

  it('builds today ops from ceremonies, bookings, free staff and follow-ups', () => {
    const dashboard = dashboardWith()
    const model = dashboard._opsModel({
      contracts: [
        { id: 'c1', groom: 'علی', bride: 'بیتا', eventDate: '1405/05/25', venue: 'تالار رویال', status: 'active', eventTime: '18:00' },
        { id: 'c2', groom: 'حسن', bride: 'مینا', eventDate: '1405/05/25', status: 'completed', eventTime: '12:00', deliveryDate: '1405/04/01' }
      ],
      bookings: [
        { id: 'b1', title: 'مشاوره آلبوم', client: 'سارا', date: '1405/05/25', time: '10:00', status: 'scheduled' },
        { id: 'b2', title: 'لغو شده', date: '1405/05/25', status: 'cancelled' }
      ],
      personnel: [
        { id: 'p1', name: 'امیر', role: 'عکاس', status: 'active' },
        { id: 'p2', name: 'رضا', role: 'تدوین', status: 'active' }
      ],
      persProjects: [
        { personnelId: 'p1', personnelName: 'امیر', eventDate: '1405/05/25', contractId: 'c1' }
      ],
      cheques: [{ number: '۱۲۳', dueDate: '1405/04/01', status: 'pending', amount: 100 }],
      albums: [{ status: 'selection', couple: 'آوا و نیما', title: 'آلبوم چرم' }],
      openInbox: 2,
      events: [],
      upcomingBookings: []
    })
    expect(model.todayEvents).toHaveLength(3)
    expect(model.completedCount).toBe(1)
    expect(model.unconfirmedCount).toBe(1)
    expect(model.freeStaff.map(person => person.id)).toEqual(['p2'])
    expect(model.busyStaff.map(person => person.id)).toEqual(['p1'])
    expect(model.followupCount).toBeGreaterThanOrEqual(3)
    expect(model.performance.find(person => person.id === 'p1').sessions).toBeGreaterThan(0)
  })

  it('renders the today ops shell for staff and keeps finance below for managers', () => {
    const staffEl = { innerHTML: '' }
    dashboardWith({
      contracts: [{ id: 'c1', groom: 'علی', bride: 'بیتا', eventDate: '1405/05/25', venue: 'تالار', status: 'active' }],
      personnel: [{ id: 'p1', name: 'امیر', role: 'عکاس', status: 'active' }]
    }, ['office_secretary']).render(staffEl)
    expect(staffEl.innerHTML).toContain('افزودن نوبت')
    expect(staffEl.innerHTML).toContain('امروز در استودیو')
    expect(staffEl.innerHTML).toContain('اطلاعات مالی فقط برای مدیر استودیو')
    expect(staffEl.innerHTML).not.toContain('وصول این ماه')

    const managerEl = { innerHTML: '' }
    dashboardWith({}, ['studio_manager']).render(managerEl)
    expect(managerEl.innerHTML).toContain('افزودن نوبت')
    expect(managerEl.innerHTML).toContain('وصول این ماه')
    expect(managerEl.innerHTML).toContain('وصول واقعی و برآورد قراردادی')
    expect(managerEl.innerHTML).toContain('نمودار، هزینه و گردش تولید')
    expect(managerEl.innerHTML).toContain('امروز هنوز برنامه‌ای نیست')
  })

  it('counts done contracts and staffAssignments as busy team', () => {
    const dashboard = dashboardWith()
    const model = dashboard._opsModel({
      contracts: [{
        id: 'c1', groom: 'علی', bride: 'بیتا', eventDate: '1405/05/25', status: 'done',
        staffAssignments: { photographer: { id: 'p1', name: 'امیر' } }
      }],
      bookings: [],
      personnel: [
        { id: 'p1', name: 'امیر', role: 'عکاس', status: 'active' },
        { id: 'p2', name: 'رضا', role: 'تدوین', status: 'active' }
      ],
      persProjects: [],
      cheques: [],
      albums: [],
      openInbox: 0,
      events: [],
      upcomingBookings: []
    })
    expect(model.completedCount).toBe(1)
    expect(model.busyStaff.map(person => person.id)).toEqual(['p1'])
    expect(model.todayEvents[0].team).toContain('امیر')
    expect(model.followups.some(item => item.actions?.some(action => action.key === 'confirm'))).toBe(false)
  })

  it('gives unconfirmed bookings a confirm action and honors dashboard search', () => {
    const dashboard = dashboardWith()
    const ctx = {
      contracts: [],
      bookings: [{ id: 'b1', title: 'مشاوره آلبوم', client: 'سارا', date: '1405/05/25', time: '10:00', status: 'scheduled' }],
      personnel: [],
      persProjects: [],
      cheques: [],
      albums: [],
      openInbox: 0,
      events: [],
      upcomingBookings: []
    }
    const open = dashboard._opsModel(ctx)
    expect(open.followups[0].actions.some(action => action.key === 'confirm')).toBe(true)
    dashboard._opsQuery = () => 'نیما'
    const hidden = dashboard._opsModel(ctx)
    expect(hidden.todayEvents).toHaveLength(0)
    expect(hidden.followups).toHaveLength(0)
    expect(hidden.allTodayCount).toBe(1)
  })

  it('opens the team assignment modal from a contract id without SMH', () => {
    const dashboard = dashboardWith({
      contracts: [{ id: 'c9', groom: 'علی', bride: 'بیتا', eventDate: '1405/05/25', status: 'active' }],
      personnel: [{ id: 'p1', name: 'امیر', role: 'عکاس', status: 'active' }]
    })
    dashboard.assignTeam('c9')
    expect(dashboard).toBeTruthy()
  })
})
