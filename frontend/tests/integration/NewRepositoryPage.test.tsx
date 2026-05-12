import { http, HttpResponse } from 'msw'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { NewRepositoryPage } from '@/features/projects/ui/NewRepositoryPage'
import { server } from '../msw/server'
import { renderWithProviders } from '../utils/renderWithProviders'

describe('NewRepositoryPage', () => {
  it('submits valid form and opens webhook secret modal', async () => {
    server.use(
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

    renderWithProviders(
      <MemoryRouter initialEntries={['/repositories/new']}>
        <NewRepositoryPage />
      </MemoryRouter>,
    )

    await user.type(screen.getByLabelText(/^Название проекта/), 'Docs EN')
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
})
