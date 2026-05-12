import { screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { ProtectedRoute } from '@/app/auth/ProtectedRoute'
import { setUser } from '@/features/auth/model/authSlice'
import { createAppStore } from '@/shared/store'
import { renderWithProviders } from '../utils/renderWithProviders'

describe('ProtectedRoute', () => {
  it('redirects guest user to /login', async () => {
    renderWithProviders(
      <MemoryRouter initialEntries={['/tasks']}>
        <Routes>
          <Route
            path="/tasks"
            element={
              <ProtectedRoute>
                <div>tasks</div>
              </ProtectedRoute>
            }
          />
          <Route path="/login" element={<div>login</div>} />
        </Routes>
      </MemoryRouter>,
    )

    expect(await screen.findByText('login')).toBeInTheDocument()
    expect(screen.queryByText('tasks')).not.toBeInTheDocument()
  })

  it('renders protected content for authenticated user', () => {
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
      <MemoryRouter initialEntries={['/tasks']}>
        <Routes>
          <Route
            path="/tasks"
            element={
              <ProtectedRoute>
                <div>tasks</div>
              </ProtectedRoute>
            }
          />
        </Routes>
      </MemoryRouter>,
      { store },
    )

    expect(screen.getByText('tasks')).toBeInTheDocument()
  })
})
