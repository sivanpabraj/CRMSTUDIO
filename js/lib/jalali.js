/**
 * Jalaali.js Canonical Pure Domain Math Library
 * توابع خالص و قطعی تبدیل تقویم شمسی به میلادی و محاسبات فاصله روز
 */

const BREAKS = [-61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181, 1210, 1635, 2060, 2097, 2192, 2262, 2324, 2394, 2456, 3178]

const div = (a, b) => ~~(a / b)
const mod = (a, b) => a - ~~(a / b) * b

export function jalaliToGregorian(jy, jm, jd) {
  const bl = BREAKS.length
  const gy = jy + 621
  let leapJ = -14
  let jp = BREAKS[0]
  let jump = 0
  let jmBreak

  for (let i = 1; i < bl; i++) {
    jmBreak = BREAKS[i]
    jump = jmBreak - jp
    if (jy < jmBreak) break
    leapJ = leapJ + div(jump, 33) * 8 + div(mod(jump, 33), 4)
    jp = jmBreak
  }
  let n = jy - jp
  leapJ = leapJ + div(n, 33) * 8 + div(mod(n, 33) + 3, 4)
  if (mod(jump, 33) === 4 && jump - n === 4) leapJ += 1

  const leapG = div(gy, 4) - div((div(gy, 100) + 1) * 3, 4) - 150
  const march = 20 + leapJ - leapG

  const g2d = (gYear, gMonth, gDay) => {
    let d = div((gYear + div(gMonth - 8, 6) + 100100) * 1461, 4) +
      div(153 * mod(gMonth + 9, 12) + 2, 5) +
      gDay - 34840408
    d = d - div(div(gYear + 100100 + div(gMonth - 8, 6), 100) * 3, 4) + 752
    return d
  }

  const jdn = g2d(gy, 3, march) + (jm - 1) * 31 - div(jm, 7) * (jm - 7) + jd - 1

  let j = 4 * jdn + 139361631
  j = j + div(div(4 * jdn + 183187720, 146097) * 3, 4) * 4 - 3908
  const iVal = div(mod(j, 1461), 4) * 5 + 308
  const gd = div(mod(iVal, 153), 5) + 1
  const gm = mod(div(iVal, 153), 12) + 1
  const gyCalc = div(j, 1461) - 100100 + div(8 - gm, 6)

  return [gyCalc, gm, gd]
}

export function gregorianToJalali(gy, gm, gd) {
  const g_d_m = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334, 365]
  let gy2 = (gm > 2) ? (gy + 1) : gy
  let days = 355666 + (365 * gy) + ~~((gy2 + 3) / 4) - ~~((gy2 + 99) / 100) + ~~((gy2 + 399) / 400) + gd + g_d_m[gm - 1]
  let jy = -1595 + (33 * ~~(days / 12053))
  days %= 12053
  jy += 4 * ~~(days / 1461)
  days %= 1461
  if (days > 365) {
    jy += ~~((days - 1) / 365)
    days = (days - 1) % 365
  }
  let jm, jd
  if (days < 186) {
    jm = 1 + ~~(days / 31)
    jd = 1 + (days % 31)
  } else {
    jm = 7 + ~~((days - 186) / 30)
    jd = 1 + ((days - 186) % 30)
  }
  return [jy, jm, jd]
}

export function daysBetween(jalaliDateStr, baseDate = new Date()) {
  if (!jalaliDateStr) return null
  const parts = String(jalaliDateStr).split(/[/-]/)
  if (parts.length < 3) return null
  const jy = +parts[0], jm = +parts[1], jd = +parts[2]
  const [gy, gm, gd] = jalaliToGregorian(jy, jm, jd)
  const target = new Date(gy, gm - 1, gd)
  const base = new Date(baseDate)
  base.setHours(0, 0, 0, 0)
  target.setHours(0, 0, 0, 0)
  return Math.round((target - base) / 86400000)
}

if (typeof window !== 'undefined') {
  window.JalaliDomain = {
    jalaliToGregorian,
    gregorianToJalali,
    daysBetween
  }
}
