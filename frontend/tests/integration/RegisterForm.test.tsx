import { http, HttpResponse } from 'msw'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { RegisterForm } from '@/features/auth/ui/RegisterForm'
import { server } from '../msw/server'
import { renderWithProviders } from '../utils/renderWithProviders'

describe('RegisterForm', () => {
  it('submits valid data, stores user and navigates to /tasks', async () => {
    server.use(
      http.post('/api/auth/register', async ({ request }) => {
        const body = (await request.json()) as { email: string; display_name?: string | null }

        return HttpResponse.json(
          {
            id: '00000000-0000-0000-0000-000000000002',
            email: body.email,
            display_name: body.display_name ?? null,
            github_linked: false,
            github_login: null,
          },
          { status: 201 },
        )
      }),
    )

    const user = userEvent.setup()
    const { store } = renderWithProviders(
      <MemoryRouter initialEntries={['/register']}>
        <Routes>
          <Route path="/register" element={<RegisterForm />} />
          <Route path="/tasks" element={<div>tasks page</div>} />
        </Routes>
      </MemoryRouter>,
    )

    await user.type(screen.getByLabelText(/email/i, { selector: 'input' }), 'anna@company.ru')
    await user.type(
      screen.getByLabelText(/отображаемое имя/i, { selector: 'input' }),
      'Anna Kuznetsova',
    )
    await user.type(screen.getByLabelText(/пароль/i, { selector: 'input' }), 'password1')
    await user.click(screen.getByRole('button', { name: 'Зарегистрироваться' }))

    expect(await screen.findByText('tasks page')).toBeInTheDocument()
    await waitFor(() => {
      expect(store.getState().auth.isAuthenticated).toBe(true)
      expect(store.getState().auth.user?.email).toBe('anna@company.ru')
    })
  })

  it('shows translated duplicate email error', async () => {
    server.use(
      http.post('/api/auth/register', () =>
        HttpResponse.json({ detail: 'Email already registered' }, { status: 400 }),
      ),
    )

    const user = userEvent.setup()
    renderWithProviders(
      <MemoryRouter initialEntries={['/register']}>
        <Routes>
          <Route path="/register" element={<RegisterForm />} />
        </Routes>
      </MemoryRouter>,
    )

    await user.type(screen.getByLabelText(/email/i, { selector: 'input' }), 'anna@company.ru')
    await user.type(screen.getByLabelText(/пароль/i, { selector: 'input' }), 'password1')
    await user.click(screen.getByRole('button', { name: 'Зарегистрироваться' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Email уже зарегистрирован')
  })
})
