import { describe, it, expect, beforeEach } from 'vitest'
import fs from 'fs'
import path from 'path'

describe('Studio AI Copilot Engine (js/ai-copilot.js)', () => {
  let AICopilot

  beforeEach(() => {
    global.Utils = {
      daysUntil: (dateStr) => {
        if (!dateStr) return null
        if (dateStr === '1405/07/15') return 3
        if (dateStr === '1405/07/18') return 6
        if (dateStr === '1405/07/12') return 0
        if (dateStr === '1405/07/01') return -11
        if (dateStr === '1405/06/15') return -27
        if (dateStr === '1405/08/25') return 44
        if (dateStr === '1405/10/01') return 80
        return null
      },
      fmtNum: (n) => String(n),
      escapeHtml: (s) => String(s || '')
    }

    global.SM = {
      fmt: (n) => Number(n).toLocaleString('fa-IR'),
      esc: (s) => String(s || ''),
      navigate: () => {}
    }

    const code = fs.readFileSync(path.resolve(__dirname, '../js/ai-copilot.js'), 'utf8')
    const fn = new Function('global', 'Utils', 'SM', `${code}; return global.AICopilot;`)
    AICopilot = fn(global, global.Utils, global.SM)
  })

  it('detects urgent cheques due in <= 3 days and generates manager danger alert', () => {
    const ctx = {
      cheques: [
        { id: 'ch-1', payee: 'چاپخانه ژورنال ایتالیا', amount: 8500000, dueDate: '1405/07/15', status: 'pending' },
        { id: 'ch-2', payee: 'اجاره آتلیه', amount: 15000000, dueDate: '1405/07/18', status: 'pending' }
      ]
    }

    const insights = AICopilot.getManagerInsights(ctx)
    expect(insights.length).toBeGreaterThan(0)

    const chequeAlert = insights.find(i => i.id === 'manager-cheques')
    expect(chequeAlert).toBeDefined()
    expect(chequeAlert.severity).toBe('danger')
    expect(chequeAlert.count).toBe(2)
    expect(chequeAlert.items.length).toBe(2)
  })

  it('detects overdue contract balances after ceremony and flags recovery action', () => {
    const ctx = {
      contracts: [
        {
          id: 'c-101',
          couple: 'سارا و علی',
          eventDate: '1405/07/01', // -11 days past
          total: 35000000,
          deposit: 15000000,
          paid: 5000000, // remaining: 15,000,000
          status: 'active'
        }
      ]
    }

    const insights = AICopilot.getManagerInsights(ctx)
    const overdueAlert = insights.find(i => i.id === 'manager-overdue')
    expect(overdueAlert).toBeDefined()
    expect(overdueAlert.severity).toBe('danger')
    expect(overdueAlert.count).toBe(1)
  })

  it('alerts coordinator about pending consultation leads and imminent weddings', () => {
    const ctx = {
      bookings: [
        { id: 'b-1', name: 'مهسا نادری', status: 'pending', date: '1405/07/15' }
      ],
      customerRequests: [
        { id: 'req-1', text: 'تغییر لوکیشن کلیپ فرمالیته', status: 'open' }
      ],
      contracts: [
        { id: 'c-202', couple: 'نیلوفر و بهزاد', eventDate: '1405/07/15', status: 'active' }
      ]
    }

    const coordInsights = AICopilot.getCoordinatorInsights(ctx)
    expect(coordInsights.length).toBe(3)

    const leads = coordInsights.find(i => i.id === 'coord-leads')
    expect(leads).toBeDefined()
    expect(leads.severity).toBe('warning')

    const reqs = coordInsights.find(i => i.id === 'coord-requests')
    expect(reqs).toBeDefined()
    expect(reqs.severity).toBe('danger')

    const imminent = coordInsights.find(i => i.id === 'coord-imminent')
    expect(imminent).toBeDefined()
    expect(imminent.items.length).toBe(1)
  })

  it('alerts staff and editors about SLA delays on editing', () => {
    const ctx = {
      contracts: [
        {
          id: 'c-303',
          couple: 'مریم و کاوه',
          eventDate: '1405/06/15', // -27 days past
          stage: 'editing',
          status: 'active'
        }
      ],
      custody: [
        { id: 'gear-1', itemName: 'Sony FX3 + 24-70 GM', status: 'lent', returnDate: null }
      ]
    }

    const staffInsights = AICopilot.getStaffInsights('staff-1', ctx)
    expect(staffInsights.length).toBe(2)

    const sla = staffInsights.find(i => i.id === 'staff-sla-delay')
    expect(sla).toBeDefined()
    expect(sla.severity).toBe('warning')

    const custody = staffInsights.find(i => i.id === 'staff-gear-custody')
    expect(custody).toBeDefined()
  })

  it('provides personalized milestones and tips for wedding clients', () => {
    // 80 days before wedding
    const earlyContract = { couple: 'زهرا و پویا', eventDate: '1405/10/01' }
    const earlyTip = AICopilot.getCustomerInsights(earlyContract)
    expect(earlyTip.stageKey).toBe('pre-planning')
    expect(earlyTip.tip).toContain('پوست')

    // 44 days before wedding
    const midContract = { couple: 'زهرا و پویا', eventDate: '1405/08/25' }
    const midTip = AICopilot.getCustomerInsights(midContract)
    expect(midTip.stageKey).toBe('music-selection')
    expect(midTip.tip).toContain('موزیک')

    // 0 days (today)
    const todayContract = { couple: 'زهرا و پویا', eventDate: '1405/07/12' }
    const todayTip = AICopilot.getCustomerInsights(todayContract)
    expect(todayTip.stageKey).toBe('event-day')

    // 27 days after ceremony (grading & editing stage)
    const postContract = { couple: 'زهرا و پویا', eventDate: '1405/06/15' }
    const postTip = AICopilot.getCustomerInsights(postContract)
    expect(postTip.stageKey).toBe('post-event')
    expect(postTip.message).toContain('DaVinci Resolve')
  })

  it('renders executive HTML card with status badges and action routes', () => {
    const ctx = {
      cheques: [
        { id: 'ch-1', payee: 'لنز کالا', amount: 5000000, dueDate: '1405/07/15', status: 'pending' }
      ]
    }
    const html = AICopilot.renderDashboardCard('manager', ctx)
    expect(html).toContain('sm-copilot-card')
    expect(html).toContain('AI Copilot')
    expect(html).toContain('سررسید فوری چک‌ها')
    expect(html).toContain('SM.navigate(\'accounting\')')
  })
})
