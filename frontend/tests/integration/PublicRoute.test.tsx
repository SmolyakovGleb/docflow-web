import { screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { PublicRoute } from '@/app/auth/PublicRoute'
import { setUser } from '@/features/auth/model/authSlice'
import { createAppStore } from '@/shared/store'
import { renderWithProviders } from '../utils/renderWithProviders'

describe('PublicRoute', () => {
  it('redirects authenticated user to /tasks', async () => {
    const store = createAppStore()
    store.dispatch(
      setUser({
        id: '00000000-0000-0000-0000-000000000001',
        email: 'user@example.com',
        display_name: 'Test User',
        github_linked: false,
        github_login: null,
      }),
    )

    renderWithProviders(
      <MemoryRouter initialEntries={['/login']}>
        <Routes>
          <Route
            path="/login"
            element={
              <PublicRoute>
                <div>login</div>
              </PublicRoute>
            }
          />
          <Route path="/tasks" element={<div>tasks</div>} />
        </Routes>
      </MemoryRouter>,
      { store },
    )

    expect(await screen.findByText('tasks')).toBeInTheDocument()
    expect(screen.queryByText('login')).not.toBeInTheDocument()
  })

  it('renders public content for guest user', () => {
    renderWithProviders(
      <MemoryRouter initialEntries={['/login']}>
        <Routes>
          <Route
            path="/login"
            element={
              <PublicRoute>
                <div>login</div>
              </PublicRoute>
            }
          />
        </Routes>
      </MemoryRouter>,
    )

    expect(screen.getByText('login')).toBeInTheDocument()
  })
})
