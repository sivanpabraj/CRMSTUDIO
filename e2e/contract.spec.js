import { test, expect } from '@playwright/test'

test.describe('Contract page', () => {
  test('contract.html shell loads', async ({ page }) => {
    await page.goto('/contract.html?nosw=1')
    await page.waitForLoadState('domcontentloaded')
    // Page may require auth or show form — assert document is interactive
    const title = await page.title()
    expect(title.length).toBeGreaterThan(0)
    const hasRoot = await page.locator('body').count()
    expect(hasRoot).toBe(1)
  })

  test('customer.html shell loads', async ({ page }) => {
    await page.goto('/customer.html?nosw=1')
    await page.waitForLoadState('domcontentloaded')
    await expect(page.locator('body')).toBeVisible()
  })

  test('join.html shell loads', async ({ page }) => {
    await page.goto('/join.html?nosw=1')
    await page.waitForLoadState('domcontentloaded')
    await expect(page.locator('body')).toBeVisible()
  })
})
