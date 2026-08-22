import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { describe, expect, it } from 'vitest'

const context = { window: {}, Intl, Date, console }
vm.runInNewContext(readFileSync('js/utils.js', 'utf8'), context)
const utils = context.window.Utils

describe('Jalali and Asia/Tehran boundaries', () => {
  it('round-trips the leap-day 30 Esfand without loss', () => {
    expect(utils.jalaliMonthDays(1403, 12)).toBe(30)
    const gregorian = utils._jalaliToGregorian(1403, 12, 30)
    expect(utils._gregorianToJalali(...gregorian)).toEqual([1403, 12, 30])
  })

  it('round-trips the first day of year 1405', () => {
    const gregorian = utils._jalaliToGregorian(1405, 1, 1)
    expect(utils._gregorianToJalali(...gregorian)).toEqual([1405, 1, 1])
  })

  it('uses Tehran midnight instead of the browser timezone', () => {
    expect(utils.formatJalaliDateTime('2026-03-20T20:31:00.000Z'))
      .toBe('1405/01/01 — ساعت 00:01')
  })
})
