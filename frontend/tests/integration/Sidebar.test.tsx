import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { setUser } from '@/features/auth/model/authSlice'
import { Sidebar } from '@/shared/ui/Sidebar/Sidebar'
import { createAppStore } from '@/shared/store'
import { renderWithProviders } from '../utils/renderWithProviders'

describe('Sidebar', () => {
  it('renders navigation sections and keeps tasks active for task detail route', () => {
    const store = createAppStore()
    store.dispatch(
      setUser({
        id: '00000000-0000-0000-0000-000000000001',
        email: 'anna@company.ru',
        display_name: 'Anna Kuznetsova',
        github_linked: true,
        github_login: 'annak',
      }),
    )

    renderWithProviders(
      <MemoryRouter initialEntries={['/tasks/123']}>
        <Sidebar />
        <Routes>
          <Route path="/tasks/:taskId" element={<div>task detail</div>} />
        </Routes>
      </MemoryRouter>,
      { store },
    )

    expect(screen.getByText('РАБОТА')).toBeInTheDocument()
    expect(screen.getByText('КОНФИГУРАЦИЯ')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Anna Kuznetsova' })).toBeInTheDocument()
    expect(screen.getByText('GitHub подключён')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Задачи' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByText('task detail')).toBeInTheDocument()
  })

  it('navigates between sections and updates active link', async () => {
    const store = createAppStore()
    store.dispatch(
      setUser({
        id: '00000000-0000-0000-0000-000000000001',
        email: 'anna@company.ru',
        display_name: 'Anna Kuznetsova',
        github_linked: false,
        github_login: null,
      }),
    )

    const user = userEvent.setup()

    renderWithProviders(
      <MemoryRouter initialEntries={['/tasks']}>
        <Sidebar />
        <Routes>
          <Route path="/tasks" element={<div>tasks page</div>} />
          <Route path="/history" element={<div>history page</div>} />
        </Routes>
      </MemoryRouter>,
      { store },
    )

    await user.click(screen.getByRole('link', { name: 'История' }))

    expect(await screen.findByText('history page')).toBeInTheDocument()

    await waitFor(() => {
      expect(screen.getByRole('link', { name: 'История' })).toHaveAttribute('aria-current', 'page')
    })
  })
})
