import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, MemoryRouter, Route, RouterProvider, Routes } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import NotFoundPage from '@/pages/NotFoundPage'
import { setUser } from '@/features/auth/model/authSlice'
import { createAppStore } from '@/shared/store'
import { renderWithProviders } from '../utils/renderWithProviders'

describe('NotFoundPage', () => {
  it('renders not found page for unknown app url', async () => {
    const router = createMemoryRouter(
      [
        { path: '/tasks', element: <div>tasks page</div> },
        { path: '*', element: <NotFoundPage /> },
      ],
      {
        initialEntries: ['/missing-route'],
      },
    )

    renderWithProviders(<RouterProvider router={router} />)

    expect(await screen.findByText('Страница не найдена')).toBeInTheDocument()
    expect(screen.getByText('404')).toBeInTheDocument()
  })

  it('navigates to tasks route from home action', async () => {
    const user = userEvent.setup()
    const store = createAppStore()
    store.dispatch(
      setUser({
        id: 'user-1',
        email: 'anna@example.com',
        display_name: 'Anna',
        github_linked: true,
        github_login: 'anna',
      }),
    )

    renderWithProviders(
      <MemoryRouter initialEntries={['/404']}>
        <Routes>
          <Route path="/404" element={<NotFoundPage />} />
          <Route path="/tasks" element={<div>tasks page</div>} />
        </Routes>
      </MemoryRouter>,
      { store },
    )

    await user.click(screen.getByRole('button', { name: 'На главную' }))

    expect(await screen.findByText('tasks page')).toBeInTheDocument()
  })
})
