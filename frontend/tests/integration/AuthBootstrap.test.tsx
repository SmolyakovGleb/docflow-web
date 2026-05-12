import { http, HttpResponse } from 'msw'
import { screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { AuthBootstrap } from '@/app/auth/AuthBootstrap'
import { server } from '../msw/server'
import { renderWithProviders } from '../utils/renderWithProviders'

describe('AuthBootstrap', () => {
  it('on 200 from /auth/me sets authenticated user', async () => {
    server.use(
      http.get('/api/auth/me', () =>
        HttpResponse.json({
          id: '00000000-0000-0000-0000-000000000001',
          email: 'user@example.com',
          display_name: 'Test User',
          github_linked: false,
          github_login: null,
        }),
      ),
    )

    const { store } = renderWithProviders(
      <AuthBootstrap>
        <div>ready</div>
      </AuthBootstrap>,
    )

    await screen.findByText('ready')

    expect(store.getState().auth.isAuthenticated).toBe(true)
    expect(store.getState().auth.user?.email).toBe('user@example.com')
  })

  it('on 401 from /auth/me keeps guest state without redirect', async () => {
    server.use(
      http.get('/api/auth/me', () =>
        HttpResponse.json(
          {
            detail: 'Not authenticated',
          },
          { status: 401 },
        ),
      ),
    )

    const { store } = renderWithProviders(
      <AuthBootstrap>
        <div>ready</div>
      </AuthBootstrap>,
    )

    await screen.findByText('ready')

    await waitFor(() => {
      expect(store.getState().auth.isAuthenticated).toBe(false)
      expect(store.getState().auth.user).toBeNull()
    })
  })
})
