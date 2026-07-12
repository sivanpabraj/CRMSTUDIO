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

  test('login page renders', async ({ page }) => {
    await page.goto('/index.html')
    await expect(page.locator('#login-phone, #portal-app')).toBeVisible({ timeout: 15_000 })
  })

  test('admin.html redirects to studio-m', async ({ page }) => {
    await page.goto('/admin.html')
    await page.waitForURL(/\/studio-m\//, { timeout: 10_000 })
    expect(page.url()).toContain('/studio-m/')
  })

  test('studio-m redirects unauthenticated user to login', async ({ page }) => {
    await page.goto('/studio-m/')
    await page.waitForURL(/index\.html/, { timeout: 15_000 })
    expect(page.url()).toMatch(/index\.html/)
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
  })
})
