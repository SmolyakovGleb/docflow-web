import { test, expect } from '@playwright/test'

test('login page renders', async ({ page }) => {
  await page.route('**/api/auth/me', async (route) => {
    await route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({ detail: 'Not authenticated' }),
    })
  })

  await page.goto('/login')
  await expect(page.getByRole('heading', { name: 'Вход' })).toBeVisible()
})
