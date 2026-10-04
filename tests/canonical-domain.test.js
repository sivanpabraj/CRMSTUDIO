import { describe, it, expect } from 'vitest'
import { jalaliToGregorian, gregorianToJalali, daysBetween } from '../js/lib/jalali.js'
import {
  ALL_VALID_COLLECTIONS,
  DB_OBJECT_KEYS,
  REQUIRED_COLLECTIONS,
  SYNC_TAXONOMY,
  allCollections,
  isObjectCollection
} from '../js/lib/db-schema.js'

describe('Domain: Canonical Jalali Math & Round-trip', () => {
  it('converts known historical Jalali dates to exact Gregorian dates', () => {
    expect(jalaliToGregorian(1404, 1, 1)).toEqual([2025, 3, 21])
    expect(jalaliToGregorian(1403, 1, 1)).toEqual([2024, 3, 20])
    expect(jalaliToGregorian(1405, 7, 12)).toEqual([2026, 10, 4])
    expect(jalaliToGregorian(1400, 12, 29)).toEqual([2022, 3, 20])
    expect(jalaliToGregorian(1399, 12, 30)).toEqual([2021, 3, 20])
  })

  it('performs accurate round-trip conversions (Jalali -> Gregorian -> Jalali)', () => {
    const testCases = [
      [1370, 1, 1],
      [1395, 6, 15],
      [1400, 12, 29],
      [1403, 1, 1],
      [1404, 7, 10],
      [1410, 11, 20]
    ]

    for (const [jy, jm, jd] of testCases) {
      const [gy, gm, gd] = jalaliToGregorian(jy, jm, jd)
      const [rJy, rJm, rJd] = gregorianToJalali(gy, gm, gd)
      expect([rJy, rJm, rJd]).toEqual([jy, jm, jd])
    }
  })

  it('calculates days difference accurately without multi-century offset', () => {
    const today = new Date(2026, 9, 4) // Oct 4, 2026 -> 1405/07/12
    expect(daysBetween('1405/07/12', today)).toBe(0)
    expect(daysBetween('1405/07/13', today)).toBe(1)
    expect(daysBetween('1405/07/11', today)).toBe(-1)
  })
})

describe('Domain: Canonical DB Schema Registry', () => {
  it('has all critical collections registered in Single Source of Truth', () => {
    expect(ALL_VALID_COLLECTIONS.has('contracts')).toBe(true)
    expect(ALL_VALID_COLLECTIONS.has('users')).toBe(true)
    expect(ALL_VALID_COLLECTIONS.has('studioInfo')).toBe(true)
    expect(ALL_VALID_COLLECTIONS.has('securityState')).toBe(true)
    expect(ALL_VALID_COLLECTIONS.has('printShops')).toBe(true)
    expect(ALL_VALID_COLLECTIONS.has('salaryPayments')).toBe(true)
  })

  it('identifies object collections properly', () => {
    expect(DB_OBJECT_KEYS.has('studioInfo')).toBe(true)
    expect(DB_OBJECT_KEYS.has('securityState')).toBe(true)
    expect(DB_OBJECT_KEYS.has('contracts')).toBe(false)
  })

  it('exposes full collection list and taxonomy cleanly', () => {
    const list = allCollections()
    expect(list).toContain('contracts')
    expect(list).toContain('printShops')
    expect(list).toContain('salaryPayments')
    expect(isObjectCollection('studioInfo')).toBe(true)
    expect(isObjectCollection('contracts')).toBe(false)
    expect(SYNC_TAXONOMY.synced).toContain('attendance')
    expect(SYNC_TAXONOMY.synced).toContain('payrollRuns')
    expect(SYNC_TAXONOMY.serverOnly).toContain('securityState')
  })
})
