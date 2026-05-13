import { http, HttpResponse } from 'msw'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { setUser } from '@/features/auth/model/authSlice'
import { NewRepositoryPage } from '@/features/projects/ui/NewRepositoryPage'
import { createAppStore } from '@/shared/store'
import { server } from '../msw/server'
import { renderWithProviders } from '../utils/renderWithProviders'

describe('NewRepositoryPage', () => {
  it('submits valid form and opens webhook secret modal after server confirms github link', async () => {
    server.use(
      http.get('/api/auth/me', () =>
        HttpResponse.json({
          id: 'user-1',
          email: 'anna@example.com',
          display_name: 'Anna',
          github_linked: true,
          github_login: 'anna',
        }),
      ),
      http.get('/api/me/github-repos', () =>
        HttpResponse.json(['team/docs-ru', 'team/docs-en', 'team/portal']),
      ),
      http.post('/api/projects', async ({ request }) => {
        const body = (await request.json()) as {
          name: string
          source_repo: string
          source_branch: string
          target_repo: string
          target_branch: string
          exclude_patterns: string[]
        }

        return HttpResponse.json(
          {
            id: '00000000-0000-0000-0000-000000000201',
            name: body.name,
            source_repo: body.source_repo,
            source_branch: body.source_branch,
            target_repo: body.target_repo,
            target_branch: body.target_branch,
            exclude_patterns: body.exclude_patterns,
            webhook_url: 'http://localhost:8000/webhook/00000000-0000-0000-0000-000000000201',
            webhook_secret: 'secret-123',
            version: 1,
            created_at: '2026-05-08T10:00:00Z',
          },
          { status: 201 },
        )
      }),
    )

    const user = userEvent.setup()
    const store = createAppStore()
    store.dispatch(
      setUser({
        id: 'user-1',
        email: 'anna@example.com',
        display_name: 'Anna',
        github_linked: false,
        github_login: null,
      }),
    )

    renderWithProviders(
      <MemoryRouter initialEntries={['/repositories/new']}>
        <NewRepositoryPage />
      </MemoryRouter>,
      { store },
    )

    await user.type(await screen.findByLabelText(/^Название проекта/), 'Docs EN')
    await user.type(screen.getByLabelText(/^Source repository/), 'team/docs-ru')
    await user.type(screen.getByLabelText(/^Target repository/), 'team/docs-en')
    await user.clear(screen.getByLabelText(/^Source branch/))
    await user.type(screen.getByLabelText(/^Source branch/), 'main')
    await user.clear(screen.getByLabelText(/^Target branch/))
    await user.type(screen.getByLabelText(/^Target branch/), 'release')
    await user.click(screen.getByRole('button', { name: 'Создать проект' }))

    expect(await screen.findByText('Сохраните webhook secret')).toBeInTheDocument()
    expect(screen.getByDisplayValue('secret-123')).toBeInTheDocument()
    expect(
      screen.getByDisplayValue(
        'http://localhost:8000/webhook/00000000-0000-0000-0000-000000000201',
      ),
    ).toBeInTheDocument()
  })

  it('keeps repository form blocked while server has not confirmed github link', async () => {
    server.use(
      http.get('/api/auth/me', () =>
        HttpResponse.json({
          id: 'user-1',
          email: 'anna@example.com',
          display_name: 'Anna',
          github_linked: false,
          github_login: null,
        }),
      ),
    )

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
      <MemoryRouter initialEntries={['/repositories/new']}>
        <NewRepositoryPage />
      </MemoryRouter>,
      { store },
    )

    expect(await screen.findByText('Сначала привяжите GitHub')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Привязать GitHub' })).toBeInTheDocument()
    expect(screen.queryByLabelText(/^Source repository/)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/^Target repository/)).not.toBeInTheDocument()
  })
})
