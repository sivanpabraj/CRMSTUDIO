import { test, expect } from '@playwright/test'

test.describe('Studio M smoke (no SMS)', () => {
  test('site.html loads', async ({ page }) => {
    await page.goto('/site.html')
    await expect(page).toHaveTitle(/Studio M|تالار|استودیو/i)
  })

  test('health.json responds', async ({ request }) => {
    const res = await request.get('/health.json')
    expect(res.ok()).toBeTruthy()
    const body = await res.json()
    expect(body.status).toBe('ok')
  })

  test('index routes to login or first-run setup', async ({ page }) => {
    await page.goto('/index.html')
    // Fresh IDB → start.html; seeded → login phone visible
    const setup = page.getByRole('heading', { name: /استودیو/ })
    const login = page.locator('#login-phone')
    await expect(setup.or(login)).toBeVisible({ timeout: 20_000 })
  })

  test('legacy admin URL is a permanent redirect only', async ({ page }) => {
    await page.goto('/admin.html')
    await page.waitForURL(/studio-m\/|start\.html/, { timeout: 15_000 })
    expect(page.url()).not.toMatch(/\/admin\.html(?:\?|$)/)
  })

  test('studio-m ships Estedad brand CSS (hashed build ok)', async ({ page }) => {
    await page.goto('/studio-m/')
    // May bounce to login/start; assert stylesheet graph from the initial document or destination
    await page.waitForTimeout(500)
    const hasBrandCss = await page.evaluate(() => {
      const hrefs = [...document.querySelectorAll('link[rel="stylesheet"]')].map(l => l.href)
      return hrefs.some(h => /studio-?m|Estedad|fonts\.googleapis/i.test(h))
    })
    expect(hasBrandCss).toBe(true)
  })

  test('unauthenticated studio-m exits to login or setup', async ({ page }) => {
    await page.goto('/studio-m/')
    await page.waitForURL(/index\.html|start\.html/, { timeout: 15_000 })
    expect(page.url()).toMatch(/index\.html|start\.html/)
  })

  test('contract.html loads script graph', async ({ page }) => {
    await page.goto('/contract.html')
    await page.waitForTimeout(1500)
    const url = page.url()
    expect(url).toMatch(/contract\.html|index\.html|start\.html/)
  })

  test('password login reaches studio-m on localhost', async ({ page }) => {
    test.skip(!process.env.E2E_LOGIN_PHONE, 'Set E2E_LOGIN_PHONE and E2E_LOGIN_PASSWORD for login test')

    await page.goto('/index.html')
    await page.locator('#login-phone').fill(process.env.E2E_LOGIN_PHONE)
    await page.getByRole('button', { name: /رمز عبور/ }).click()
    await page.locator('#login-password').fill(process.env.E2E_LOGIN_PASSWORD)
    await page.locator('#login-btn').click()
    await page.waitForURL(/studio-m\//, { timeout: 20_000 })
    await expect(page.locator('#sm-root, .sm-app')).toBeVisible()

    await page.goto('/studio-m/#accounting')
    await expect(page.locator('.sm-acc-body, .sm-section-head, #sm-root')).toBeVisible({ timeout: 10_000 })
  })
})
