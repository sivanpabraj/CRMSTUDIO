import { test, expect } from '@playwright/test'

test.describe('Auth portal UI', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html?nosw=1')
    await page.locator('#portal-app').waitFor({ state: 'visible', timeout: 15_000 })
  })

  test('shows login form with identifier and password', async ({ page }) => {
    await expect(page.locator('#login-identifier')).toBeVisible()
    await expect(page.locator('#login-password')).toBeVisible()
    await expect(page.locator('#login-btn')).toBeVisible()
  })

  test('password visibility toggle works', async ({ page }) => {
    const pwd = page.locator('#login-password')
    await expect(pwd).toHaveAttribute('type', 'password')
    await page.locator('button.auth-pw-toggle').first().click()
    await expect(pwd).toHaveAttribute('type', 'text')
  })

  test('switches to register tab and shows studio fields', async ({ page }) => {
    await page.locator('#tab-btn-register').click()
    await expect(page.locator('#auth-register-view')).toBeVisible()
    await expect(page.locator('#reg-studio-name')).toBeVisible()
    await expect(page.locator('#reg-manager-name')).toBeVisible()
    await expect(page.locator('#reg-phone')).toBeVisible()
    await expect(page.locator('#reg-password')).toBeVisible()
    await expect(page.locator('#reg-password-confirm')).toBeVisible()
  })

  test('register validation requires studio name', async ({ page }) => {
    await page.locator('#tab-btn-register').click()
    await page.locator('#reg-btn').click()
    const err = page.locator('#reg-error')
    await expect(err).toBeVisible({ timeout: 5_000 })
  })

  test('login validation requires identifier and password', async ({ page }) => {
    await page.locator('#login-btn').click()
    const err = page.locator('#login-error')
    await expect(err).toBeVisible({ timeout: 5_000 })
  })

  test('SMS login chip is present', async ({ page }) => {
    const sms = page.locator('.auth-sms-chip')
    await expect(sms).toBeVisible()
    await expect(sms).toContainText(/پیامک/)
  })

  test('accepts phone or email in identifier field', async ({ page }) => {
    const input = page.locator('#login-identifier')
    await input.fill('09121234567')
    await expect(input).toHaveValue('09121234567')
    await input.fill('manager@example.com')
    await expect(input).toHaveValue('manager@example.com')
  })
})
