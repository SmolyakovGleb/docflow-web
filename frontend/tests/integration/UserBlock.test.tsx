import { http, HttpResponse } from 'msw'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { setUser } from '@/features/auth/model/authSlice'
import { ProfilePage } from '@/features/settings/ui/ProfilePage/ProfilePage'
import { UserBlock } from '@/shared/ui/Sidebar/UserBlock'
import { createAppStore } from '@/shared/store'
import { server } from '../msw/server'
import { renderWithProviders } from '../utils/renderWithProviders'

describe('UserBlock', () => {
  it('logs user out, clears auth state and redirects to /login', async () => {
    const store = createAppStore()
    let logoutCalls = 0

    store.dispatch(
      setUser({
        id: '00000000-0000-0000-0000-000000000001',
        email: 'anna@company.ru',
        display_name: 'Anna Kuznetsova',
        github_linked: true,
        github_login: 'annak',
      }),
    )

    server.use(
      http.get('/api/health', () =>
        HttpResponse.json({
          status: 'ok',
          pipeline_version: 'test-build',
          last_webhook_at: null,
        }),
      ),
      http.post('/api/auth/logout', () => {
        logoutCalls += 1
        return HttpResponse.json({ ok: true })
      }),
    )

    const user = userEvent.setup()

    renderWithProviders(
      <MemoryRouter initialEntries={['/tasks']}>
        <UserBlock />
        <Routes>
          <Route path="/tasks" element={<div>tasks page</div>} />
          <Route path="/settings/profile" element={<ProfilePage />} />
          <Route path="/login" element={<div>login page</div>} />
        </Routes>
      </MemoryRouter>,
      { store },
    )

    await user.click(screen.getByRole('button', { name: /anna kuznetsova/i }))
    await user.click(await screen.findByRole('button', { name: 'Выйти' }))

    expect(await screen.findByText('login page')).toBeInTheDocument()

    await waitFor(() => {
      expect(logoutCalls).toBe(1)
      expect(store.getState().auth.isAuthenticated).toBe(false)
      expect(store.getState().auth.user).toBeNull()
    })
  })
})
