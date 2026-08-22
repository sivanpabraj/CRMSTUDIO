import { test, expect } from '@playwright/test'

const RUN_ID = String(Date.now())
const PHONE = `09${RUN_ID.slice(-9)}`
const PASSWORD = `Visual-${RUN_ID}-A1`

async function createStudio(page) {
  await page.goto('/start.html')
  await page.locator('#st-studio-name').fill('استودیو ماندنی')
  await page.locator('#st-manager-name').fill('مدیر کنترل کیفیت')
  await page.locator('#st-phone').fill(PHONE)
  await page.locator('#st-pw').fill(PASSWORD)
  await page.getByRole('button', { name: /ساخت استودیو/ }).click()
  await page.getByRole('button', { name: /ورود به پنل مدیر/ }).click()
  await page.waitForURL(/studio-m\//, { timeout: 20_000 })
  await expect(page.locator('#sm-content')).toBeVisible()

  const onboarding = page.locator('#sm-onboarding-overlay')
  if (await onboarding.isVisible()) {
    await page.locator('#onb-address').fill('سنندج، بلوار نمونه')
    await page.locator('#onb-keep-pw').uncheck()
    await page.locator('.sm-onboarding-pw-details summary').click()
    await page.locator('#onb-pw-old').fill(PASSWORD)
    await page.locator('#onb-pw-new').fill(`${PASSWORD}x`)
    await page.locator('#onb-pw2').fill(`${PASSWORD}x`)
    await page.getByRole('button', { name: /ذخیره و ورود به پنل/ }).click()
    await expect(onboarding).toBeHidden()
  }

  await page.evaluate(async () => {
    PackageCatalog.ensureDefaults()
    const today = Utils.todayJalali()
    const contract = DB.insert('contracts', {
      contractNum: 'M-1405-001',
      bride: 'روژین', groom: 'سیوان', couple: 'روژین و سیوان',
      type: 'عروسی', types: ['عروسی', 'کلیپ', 'آلبوم'],
      eventDate: today, time: '16:00', endTime: '22:00',
      venue: 'تالار نمونه', total: 185000000, deposit: 65000000,
      status: 'active', staffAssignments: { photographer: { id: 'p-1', name: 'عکاس نمونه' } }
    })
    DB.insert('customerRequests', {
      contractId: contract.id, contractNum: contract.contractNum,
      customerName: contract.couple, type: 'clip', status: 'pending',
      text: 'درخواست بررسی نسخه اولیه کلیپ', createdAt: today, createdTime: '۱۰:۳۰',
      thread: [{ id: 'm-1', author: 'customer', authorName: contract.couple, text: 'سلام، نسخه اولیه کلیپ آماده شده؟', date: today, time: '۱۰:۳۰', readBy: ['customer'] }]
    })
    DB.insert('calendarReminders', { title: 'جلسه انتخاب عکس', date: today, time: '11:00', notes: 'هماهنگی آلبوم', smsNotify: true })
    await DB.flush()
  })
}

async function capture(page, route, name) {
  await page.evaluate(value => SM.navigate(value), route)
  await expect(page.locator('#sm-content')).toBeVisible()
  await page.waitForTimeout(250)
  await page.screenshot({ path: `test-results/visual/${name}.png`, fullPage: true })
}

test('captures all release-critical Persian sections', async ({ page }) => {
  test.setTimeout(90_000)
  await page.setViewportSize({ width: 1440, height: 1000 })
  await createStudio(page)

  await page.evaluate(() => SM.toggleTheme())
  const themeDialog = page.getByRole('dialog', { name: /انتخاب ظاهر/ })
  await expect(themeDialog).toBeVisible()
  const themeRadios = themeDialog.getByRole('radio')
  await expect(themeRadios).toHaveCount(3)
  await themeRadios.nth(2).click()
  await expect(page.locator('body')).toHaveAttribute('data-theme', 'dark-glass')
  await page.keyboard.press('Escape')
  await expect(themeDialog).toBeHidden()

  await page.evaluate(() => SM.navigate('dashboard'))
  await expect.poll(() => page.evaluate(() => ({
    available: typeof window.ErpRuntime?.state === 'function',
    financeSeries: Array.isArray(window.ErpRuntime?.state?.().financeSeries),
    workOrders: Array.isArray(window.ErpRuntime?.state?.().workOrders)
  }))).toEqual({ available: true, financeSeries: true, workOrders: true })
  await expect(page.getByText('وصول واقعی و برآورد قراردادی')).toBeVisible()
  await expect(page.getByText('مراسم‌های پیش‌رو')).toBeVisible()
  await expect(page.getByText('گردش تولید')).toBeVisible()

  for (const [route, name] of [
    ['dashboard', '01-dashboard-desktop'],
    ['contracts', '02-contracts-desktop'],
    ['packages', '03-packages-desktop'],
    ['calendar', '04-calendar-desktop'],
    ['inbox', '05-inbox-desktop'],
    ['accounting', '06-accounting-desktop'],
    ['settings', '07-settings-desktop']
  ]) await capture(page, route, name)

  await page.setViewportSize({ width: 390, height: 844 })
  await capture(page, 'dashboard', '08-dashboard-mobile')
  await capture(page, 'calendar', '09-calendar-mobile')
  await capture(page, 'packages', '10-packages-mobile')
})
