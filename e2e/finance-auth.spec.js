import { test, expect } from '@playwright/test'

/**
 * Authenticated finance happy-path.
 * CI stays green without secrets: tests skip unless E2E_LOGIN_PHONE + E2E_LOGIN_PASSWORD are set.
 *
 * Secret contract (local or CI):
 *   E2E_LOGIN_PHONE     — manager phone (digits)
 *   E2E_LOGIN_PASSWORD  — manager password
 * Optional:
 *   E2E_MUTATE_URL      — override mutate endpoint (otherwise app cloud config)
 */
const hasAuth = !!(process.env.E2E_LOGIN_PHONE && process.env.E2E_LOGIN_PASSWORD)
const authRequired = process.env.E2E_REQUIRE_AUTH === '1'

if (authRequired && !hasAuth) {
  throw new Error('Authenticated finance E2E is mandatory for this release run')
}

test.describe('Finance auth e2e', () => {
  test.beforeEach(({ }, testInfo) => {
    test.skip(!hasAuth, 'Set E2E_LOGIN_PHONE and E2E_LOGIN_PASSWORD for authenticated finance e2e')
  })

  test('password login → accounting → deposit persists locally', async ({ page }) => {
    await page.goto('/index.html')
    await page.locator('#login-phone').fill(process.env.E2E_LOGIN_PHONE)
    await page.getByRole('button', { name: /رمز عبور/ }).click()
    await page.locator('#login-password').fill(process.env.E2E_LOGIN_PASSWORD)
    await page.locator('#login-btn').click()
    await page.waitForURL(/studio-m\//, { timeout: 20_000 })

    // Ensure at least one bank exists for deposit (seeded demo / prior state)
    await page.goto('/studio-m/#accounting')
    await expect(page.locator('#sm-root, .sm-app')).toBeVisible({ timeout: 15_000 })
    await page.waitForTimeout(800)

    const flowBtn = page.getByRole('button', { name: /واریز و برداشت/ })
    await expect(flowBtn).toBeVisible({ timeout: 10_000 })
    await flowBtn.click()

    const depositPick = page.getByRole('button', { name: /ثبت واریز/ })
    await expect(depositPick).toBeVisible({ timeout: 5_000 })
    await depositPick.click()

    // Form fields — amount + bank select (selectors tolerate hashed/build variants)
    const amount = page.locator('input[type="number"], input[name="amount"], #tx-amount, #acc-amount').first()
    await expect(amount).toBeVisible({ timeout: 8_000 })
    await amount.fill('125000')

    const bankSelect = page.locator('select').filter({ has: page.locator('option') }).first()
    const optionCount = await bankSelect.locator('option').count()
    expect(optionCount, 'Release test identity must have at least one seeded bank account').toBeGreaterThanOrEqual(2)
    await bankSelect.selectOption({ index: 1 })

    const save = page.getByRole('button', { name: /ثبت|ذخیره|تأیید/ }).last()
    await save.click()

    // Durable local effect: transaction list or toast success
    await page.waitForTimeout(1500)
    const durable = await page.evaluate(async () => {
      try {
        await DB.flush()
        const txs = DB.get('transactions').filter(t => !t._deleted && Number(t.amount) === 125000)
        return { ok: txs.length > 0, count: txs.length }
      } catch (e) {
        return { ok: false, reason: String(e) }
      }
    })
    expect(durable.ok, `expected local deposit row: ${JSON.stringify(durable)}`).toBe(true)
  })
})
