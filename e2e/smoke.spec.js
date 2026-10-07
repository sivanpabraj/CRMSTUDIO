import { test, expect } from '@playwright/test'

test.describe('Studio M smoke', () => {
  test('site.html loads', async ({ page }) => {
    await page.goto('/site.html?nosw=1')
    await expect(page).toHaveTitle(/Studio M|تالار|استودیو/i)
  })

  test('health.json responds', async ({ request }) => {
    const res = await request.get('/health.json')
    expect(res.ok()).toBeTruthy()
    const body = await res.json()
    expect(body.status).toBe('ok')
  })

  test('login page renders', async ({ page }) => {
    await page.goto('/index.html?nosw=1')
    await expect(page.locator('#login-identifier, #portal-app')).toBeVisible({ timeout: 15_000 })
  })

  test('admin.html redirects to studio-m', async ({ page }) => {
    await page.goto('/admin.html?nosw=1')
    await page.waitForURL(/\/studio-m\//, { timeout: 10_000 })
    expect(page.url()).toContain('/studio-m/')
  })

  test('studio-m redirects unauthenticated user to login', async ({ page }) => {
    await page.goto('/studio-m/?nosw=1')
    await page.waitForURL(/index\.html/, { timeout: 15_000 })
    expect(page.url()).toMatch(/index\.html/)
  })

  test('password login reaches studio-m when credentials provided', async ({ page }) => {
    test.skip(!process.env.E2E_LOGIN_PHONE, 'Set E2E_LOGIN_PHONE and E2E_LOGIN_PASSWORD')

    await page.goto('/index.html?nosw=1')
    await page.locator('#login-identifier').fill(process.env.E2E_LOGIN_PHONE)
    await page.locator('#login-password').fill(process.env.E2E_LOGIN_PASSWORD || '')
    await page.locator('#login-btn').click()
    await page.waitForURL(/studio-m\//, { timeout: 20_000 })
    await expect(page.locator('#sm-root, .sm-app')).toBeVisible()
  })
})
