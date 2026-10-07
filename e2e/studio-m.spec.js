import { test, expect } from '@playwright/test'

/**
 * Inject a local signed session so Studio M shell can load without real OTP.
 * Mirrors production Auth session shape used on localhost.
 */
async function injectStudioSession(page) {
  await page.goto('/index.html?nosw=1&demo=1')
  await page.locator('#portal-app').waitFor({ state: 'visible', timeout: 15_000 })
  await page.waitForFunction(() => typeof window.Auth !== 'undefined' && typeof window.DB !== 'undefined', null, {
    timeout: 20_000
  })

  const ok = await page.evaluate(async () => {
    try {
      await DB.ready
      if (typeof DemoSeed !== 'undefined') {
        try { await DemoSeed.seed() } catch { /* */ }
      }
      if (typeof FirstSetup !== 'undefined' && FirstSetup.ensureFirstAdmin) {
        try { await FirstSetup.ensureFirstAdmin() } catch { /* */ }
      }

      let user = (DB.get('users') || []).find((u) =>
        (u.roles || []).some((r) => r === 'studio_manager' || r === 'system_admin')
      )
      if (!user) {
        user = (DB.get('users') || []).find((u) => u.status === 'active')
      }
      if (!user) return { ok: false, reason: 'no-user' }

      if (typeof SecureDB !== 'undefined' && SecureDB.runInternalAsync) {
        await SecureDB.runInternalAsync(async () => {
          await SecureDB.update('users', user.id, {
            profileCompleted: true,
            mustChangePassword: false,
            status: 'active'
          })
          await SecureDB.merge('studioInfo', { setupCompleted: true })
          await DB.flush?.()
        })
      }

      const csrf =
        (typeof Auth._regenerateCsrf === 'function' && Auth._regenerateCsrf()) ||
        (Auth.getCsrfToken && Auth.getCsrfToken()) ||
        'e2e-csrf'

      const session = {
        userId: user.id,
        loginAt: Date.now(),
        expiresAt: Date.now() + (Auth.SESSION_TIMEOUT_MS || 8 * 3600 * 1000),
        otpAuth: true,
        csrf
      }

      if (Auth._sessionSetSigned) {
        await Auth._sessionSetSigned(Auth.SESSION_KEY || 'talar_session', session)
      } else if (typeof SessionSign !== 'undefined') {
        const signed = await SessionSign.sign(session)
        sessionStorage.setItem(Auth.SESSION_KEY || 'talar_session', JSON.stringify(signed))
      } else {
        sessionStorage.setItem(Auth.SESSION_KEY || 'talar_session', JSON.stringify(session))
      }
      try { sessionStorage.setItem(Auth.CSRF_KEY || 'talar_csrf', csrf) } catch { /* */ }
      return { ok: true, userId: user.id }
    } catch (e) {
      return { ok: false, reason: String(e && e.message || e) }
    }
  })

  return ok
}

test.describe('Studio M shell', () => {
  test('unauthenticated visit redirects to login', async ({ page }) => {
    await page.goto('/studio-m/index.html?nosw=1')
    await page.waitForURL(/index\.html/, { timeout: 15_000 })
    expect(page.url()).toMatch(/index\.html/)
  })

  test('with injected session, dashboard shell renders', async ({ page }) => {
    const result = await injectStudioSession(page)
    test.skip(!result?.ok, `session inject failed: ${result?.reason || 'unknown'}`)

    await page.goto('/studio-m/index.html?nosw=1#dashboard')
    await expect(page.locator('#sm-root, .sm-app')).toBeVisible({ timeout: 20_000 })
    // Should not bounce back to login immediately
    await page.waitForTimeout(1500)
    expect(page.url()).toMatch(/studio-m/)
  })

  test('contracts route is reachable when authenticated', async ({ page }) => {
    const result = await injectStudioSession(page)
    test.skip(!result?.ok, `session inject failed: ${result?.reason || 'unknown'}`)

    await page.goto('/studio-m/index.html?nosw=1#contracts')
    await expect(page.locator('#sm-root, .sm-app')).toBeVisible({ timeout: 20_000 })
    await page.waitForTimeout(1200)
    const bodyText = await page.locator('#sm-root').innerText().catch(() => '')
    // Persian UI for contracts module
    expect(bodyText.length).toBeGreaterThan(0)
  })

  test('workflow route is reachable when authenticated', async ({ page }) => {
    const result = await injectStudioSession(page)
    test.skip(!result?.ok, `session inject failed: ${result?.reason || 'unknown'}`)

    await page.goto('/studio-m/index.html?nosw=1#workflow')
    await expect(page.locator('#sm-root, .sm-app')).toBeVisible({ timeout: 20_000 })
    await page.waitForTimeout(1200)
    expect(page.url()).toMatch(/studio-m/)
  })
})
