import { expect, test } from '@playwright/test'

test('login redirects to /tasks after successful submit', async ({ page }) => {
  await page.route('**/api/auth/me', async (route) => {
    await route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({ detail: 'Not authenticated' }),
    })
  })

  await page.route('**/api/auth/login', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: '00000000-0000-0000-0000-000000000001',
        email: 'anna@company.ru',
        display_name: 'Anna Kuznetsova',
        github_linked: false,
        github_login: null,
      }),
    })
  })

  await page.goto('/login')
  await page.getByLabel('Email').fill('anna@company.ru')
  await page.locator('input[name="password"]').fill('password1')
  await page.getByRole('button', { name: 'Войти' }).click()

  await expect(page).toHaveURL(/\/tasks$/)
})
