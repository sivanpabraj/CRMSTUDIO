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
})
