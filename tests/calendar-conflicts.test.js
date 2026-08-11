import { beforeEach, describe, expect, it, vi } from 'vitest'

describe('calendar personnel conflicts', () => {
  beforeEach(async () => {
    vi.resetModules()
    vi.stubGlobal('window', {})
    vi.stubGlobal('SMModules', {})
    await import('../studio-m/js/calendar.js')
  })

  it('does not flag separated sessions on the same day', () => {
    const calendar = window.SMCalendar
    expect(calendar._contractsOverlap(
      { time: '08:00', endTime: '10:00' },
      { time: '11:00', endTime: '13:00' }
    )).toBe(false)
  })

  it('flags overlapping or unscheduled assignments conservatively', () => {
    const calendar = window.SMCalendar
    expect(calendar._contractsOverlap(
      { time: '09:00', durationMinutes: 180 },
      { time: '11:30', durationMinutes: 60 }
    )).toBe(true)
    expect(calendar._contractsOverlap({}, { time: '11:30' })).toBe(true)
  })

  it('moves supported resources to a normalized Jalali date', async () => {
    const update = vi.fn().mockResolvedValue(true)
    vi.stubGlobal('Utils', {
      normJalali: value => value === '۱۴۰۵/۰۵/۲۲' ? '1405/05/22' : '',
      parseJalali: () => ({ jy: 1405, jm: 5, jd: 22 })
    })
    vi.stubGlobal('DB', { find: () => ({ id: 'c-1' }) })
    vi.stubGlobal('SecureDB', { update })
    vi.stubGlobal('SM', { toast: vi.fn() })
    const calendar = window.SMCalendar
    calendar.refresh = vi.fn()

    await expect(calendar.rescheduleEvent('contract', 'c-1', '۱۴۰۵/۰۵/۲۲')).resolves.toBe(true)
    expect(update).toHaveBeenCalledWith('contracts', 'c-1', expect.objectContaining({ eventDate: '1405/05/22' }))
    expect(calendar._viewYear).toBe(1405)
    expect(calendar._viewMonth).toBe(5)
  })
})
