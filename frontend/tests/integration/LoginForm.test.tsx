import { http, HttpResponse } from 'msw'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { LoginForm } from '@/features/auth/ui/LoginForm'
import { server } from '../msw/server'
import { renderWithProviders } from '../utils/renderWithProviders'

describe('LoginForm', () => {
  it('submits valid data, stores user and navigates to /tasks', async () => {
    server.use(
      http.post('/api/auth/login', async ({ request }) => {
        const body = (await request.json()) as { email: string }

        return HttpResponse.json({
          id: '00000000-0000-0000-0000-000000000001',
          email: body.email,
          display_name: 'Anna Kuznetsova',
          github_linked: false,
          github_login: null,
        })
      }),
    )

    const user = userEvent.setup()
    const { store } = renderWithProviders(
      <MemoryRouter initialEntries={['/login']}>
        <Routes>
          <Route path="/login" element={<LoginForm />} />
          <Route path="/tasks" element={<div>tasks page</div>} />
        </Routes>
      </MemoryRouter>,
    )

    await user.type(screen.getByLabelText(/email/i, { selector: 'input' }), 'anna@company.ru')
    await user.type(screen.getByLabelText(/пароль/i, { selector: 'input' }), 'password1')
    await user.click(screen.getByRole('button', { name: 'Войти' }))

    expect(await screen.findByText('tasks page')).toBeInTheDocument()
    await waitFor(() => {
      expect(store.getState().auth.isAuthenticated).toBe(true)
      expect(store.getState().auth.user?.email).toBe('anna@company.ru')
    })
  })

  it('redirects back to protected route after login', async () => {
    server.use(
      http.post('/api/auth/login', async ({ request }) => {
        const body = (await request.json()) as { email: string }

        return HttpResponse.json({
          id: '00000000-0000-0000-0000-000000000001',
          email: body.email,
          display_name: 'Anna Kuznetsova',
          github_linked: false,
          github_login: null,
        })
      }),
    )

    const user = userEvent.setup()
    renderWithProviders(
      <MemoryRouter
        initialEntries={[
          {
            pathname: '/login',
            state: {
              from: {
                pathname: '/teams/join',
                search: '?token=11111111-1111-1111-1111-111111111111',
                hash: '',
              },
            },
          },
        ]}
      >
        <Routes>
          <Route path="/login" element={<LoginForm />} />
          <Route path="/teams/join" element={<div>join team page</div>} />
        </Routes>
      </MemoryRouter>,
    )

    await user.type(screen.getByLabelText(/email/i, { selector: 'input' }), 'anna@company.ru')
    await user.type(screen.getByLabelText(/Пароль/i, { selector: 'input' }), 'password1')
    await user.click(screen.getByRole('button', { name: 'Войти' }))

    expect(await screen.findByText('join team page')).toBeInTheDocument()
  })

  it('shows translated invalid credentials error', async () => {
    server.use(
      http.post('/api/auth/login', () =>
        HttpResponse.json({ detail: 'Invalid credentials' }, { status: 401 }),
      ),
    )

    const user = userEvent.setup()
    renderWithProviders(
      <MemoryRouter initialEntries={['/login']}>
        <Routes>
          <Route path="/login" element={<LoginForm />} />
        </Routes>
      </MemoryRouter>,
    )

    await user.type(screen.getByLabelText(/email/i, { selector: 'input' }), 'anna@company.ru')
    await user.type(screen.getByLabelText(/пароль/i, { selector: 'input' }), 'password1')
    await user.click(screen.getByRole('button', { name: 'Войти' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Неверный email или пароль')
  })

  it('shows invalid credentials error for login 401 without backend detail', async () => {
    server.use(http.post('/api/auth/login', () => new HttpResponse(null, { status: 401 })))

    const user = userEvent.setup()
    renderWithProviders(
      <MemoryRouter initialEntries={['/login']}>
        <Routes>
          <Route path="/login" element={<LoginForm />} />
        </Routes>
      </MemoryRouter>,
    )

    await user.type(screen.getByLabelText(/email/i, { selector: 'input' }), 'anna@company.ru')
    await user.type(screen.getByPlaceholderText('**********'), 'password1')
    await user.click(document.querySelector('button[type="submit"]') as HTMLButtonElement)

    expect(await screen.findByRole('alert')).toHaveTextContent('Неверный email или пароль')
  })

  it('shows translated rate limit error', async () => {
    server.use(
      http.post('/api/auth/login', () =>
        HttpResponse.json({ detail: 'Rate limit exceeded' }, { status: 429 }),
      ),
    )

    const user = userEvent.setup()
    renderWithProviders(
      <MemoryRouter initialEntries={['/login']}>
        <Routes>
          <Route path="/login" element={<LoginForm />} />
        </Routes>
      </MemoryRouter>,
    )

    await user.type(screen.getByLabelText(/email/i, { selector: 'input' }), 'anna@company.ru')
    await user.type(screen.getByLabelText(/пароль/i, { selector: 'input' }), 'password1')
    await user.click(screen.getByRole('button', { name: 'Войти' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Слишком много попыток, попробуйте позже',
    )
  })
})
