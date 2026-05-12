import { http, HttpResponse } from 'msw'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { RepositoriesPage } from '@/features/projects/ui/RepositoriesPage'
import { server } from '../msw/server'
import { renderWithProviders } from '../utils/renderWithProviders'

describe('RepositoriesPage', () => {
  it('renders projects table from api response', async () => {
    server.use(
      http.get('/api/projects', () =>
        HttpResponse.json([
          {
            id: '00000000-0000-0000-0000-000000000101',
            name: 'Docs EN',
            source_repo: 'team/docs-ru',
            source_branch: 'main',
            target_repo: 'team/docs-en',
            target_branch: 'release',
            exclude_patterns: ['docs/drafts/**'],
            webhook_url: 'http://localhost:8000/webhook/00000000-0000-0000-0000-000000000101',
            version: 1,
            created_at: '2026-05-08T10:00:00Z',
          },
        ]),
      ),
    )

    renderWithProviders(
      <MemoryRouter>
        <RepositoriesPage />
      </MemoryRouter>,
    )

    expect(await screen.findByText('Docs EN')).toBeInTheDocument()
    expect(screen.getAllByText(/team\/docs-/i)).toHaveLength(2)
    expect(screen.getByText('main → release')).toBeInTheDocument()
  })

  it('renders empty state when there are no projects', async () => {
    server.use(http.get('/api/projects', () => HttpResponse.json([])))

    renderWithProviders(
      <MemoryRouter>
        <RepositoriesPage />
      </MemoryRouter>,
    )

    expect(await screen.findByText('Нет проектов')).toBeInTheDocument()
    expect(
      screen.getByText(
        'Создайте первый проект, чтобы начать переводить документацию из source-репозитория в target.',
      ),
    ).toBeInTheDocument()
  })

  it('navigates to new project page from CTA button', async () => {
    server.use(http.get('/api/projects', () => HttpResponse.json([])))
    const user = userEvent.setup()

    renderWithProviders(
      <MemoryRouter initialEntries={['/repositories']}>
        <Routes>
          <Route path="/repositories" element={<RepositoriesPage />} />
          <Route path="/repositories/new" element={<div>new repository page</div>} />
        </Routes>
      </MemoryRouter>,
    )

    await user.click(await screen.findByRole('button', { name: /новый проект/i }))

    expect(await screen.findByText('new repository page')).toBeInTheDocument()
  })

  it('shows retry action on api error', async () => {
    server.use(
      http.get('/api/projects', () => HttpResponse.json({ detail: 'Boom' }, { status: 500 })),
    )

    renderWithProviders(
      <MemoryRouter>
        <RepositoriesPage />
      </MemoryRouter>,
    )

    expect(await screen.findByText('Не удалось загрузить проекты')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Повторить' })).toBeInTheDocument()
  })
})
