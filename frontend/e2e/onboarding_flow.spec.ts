import { expect, test } from '@playwright/test'

test('skip onboarding keeps dialog hidden after reload', async ({ page }) => {
  await page.route('**/api/auth/me', async (route) => {
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

  await page.route('**/api/projects', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([]),
    })
  })

  await page.goto('/repositories')

  await expect(page.getByText('Быстрый старт')).toBeVisible()
  await page.getByRole('button', { name: 'Пропустить онбординг' }).click()
  await expect(page.getByText('Быстрый старт')).toHaveCount(0)

  await page.reload()

  await expect(page.getByText('Быстрый старт')).toHaveCount(0)
})
