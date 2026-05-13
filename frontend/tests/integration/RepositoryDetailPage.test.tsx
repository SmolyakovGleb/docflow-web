import { http, HttpResponse } from 'msw'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { RepositoryDetailPage } from '@/features/projects/ui/RepositoryDetailPage'
import i18n from '@/shared/lib/i18n'
import { server } from '../msw/server'
import { renderWithProviders } from '../utils/renderWithProviders'

const projectId = '00000000-0000-0000-0000-000000000301'

function createProjectState() {
  return {
    id: projectId,
    name: 'Docs EN',
    source_repo: 'team/docs-ru',
    source_branch: 'main',
    target_repo: 'team/docs-en',
    target_branch: 'release',
    exclude_patterns: ['docs/drafts/**'],
    webhook_url: `http://localhost:8000/webhook/${projectId}`,
    version: 1,
    created_at: '2026-05-08T10:00:00Z',
  }
}

function renderPage() {
  renderWithProviders(
    <MemoryRouter initialEntries={[`/repositories/${projectId}`]}>
      <Routes>
        <Route path="/repositories" element={<div>repositories list</div>} />
        <Route path="/repositories/:projectId" element={<RepositoryDetailPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('RepositoryDetailPage', () => {
  it('renders repository details and related tasks', async () => {
    const project = createProjectState()

    server.use(
      http.get('/api/projects/:currentProjectId', ({ params }) => {
        expect(params.currentProjectId).toBe(projectId)
        return HttpResponse.json(project)
      }),
      http.get('/api/tasks', ({ request }) => {
        const url = new URL(request.url)
        expect(url.searchParams.get('project_id')).toBe(projectId)
        expect(url.searchParams.get('limit')).toBe('5')
        return HttpResponse.json({
          items: [
            {
              id: 'task-1',
              project_id: projectId,
              file_path: 'docs/install.md',
              status: 'queued',
              created_at: '2026-05-08T10:00:00Z',
              updated_at: '2026-05-08T10:00:00Z',
            },
          ],
          total: 1,
          limit: 5,
          offset: 0,
        })
      }),
    )

    renderPage()

    expect(await screen.findByRole('heading', { name: 'Docs EN' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /team\/docs-ru/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /team\/docs-en/i })).toBeInTheDocument()
    expect(screen.getByText('docs/install.md')).toBeInTheDocument()
  })

  it('updates branches from edit dialog', async () => {
    let project = createProjectState()

    server.use(
      http.get('/api/projects/:currentProjectId', () => HttpResponse.json(project)),
      http.get('/api/tasks', () =>
        HttpResponse.json({
          items: [],
          total: 0,
          limit: 5,
          offset: 0,
        }),
      ),
      http.patch('/api/projects/:currentProjectId', async ({ request }) => {
        const body = (await request.json()) as {
          source_branch?: string
          target_branch?: string
        }

        project = {
          ...project,
          source_branch: body.source_branch ?? project.source_branch,
          target_branch: body.target_branch ?? project.target_branch,
        }

        return HttpResponse.json(project)
      }),
    )

    const user = userEvent.setup()

    renderPage()

    await screen.findByRole('heading', { name: 'Docs EN' })
    await user.click(screen.getByRole('button', { name: i18n.t('repositories:edit_branches') }))
    await user.clear(screen.getByLabelText(/^Source branch/i))
    await user.type(screen.getByLabelText(/^Source branch/i), 'develop')
    await user.clear(screen.getByLabelText(/^Target branch/i))
    await user.type(screen.getByLabelText(/^Target branch/i), 'production')
    await user.click(screen.getByRole('button', { name: i18n.t('repositories:save_branches') }))

    await waitFor(() => {
      expect(screen.getByText('develop')).toBeInTheDocument()
      expect(screen.getByText('production')).toBeInTheDocument()
    })
  })

  it('opens webhook secret modal after regeneration', async () => {
    const project = createProjectState()

    server.use(
      http.get('/api/projects/:currentProjectId', () => HttpResponse.json(project)),
      http.get('/api/tasks', () =>
        HttpResponse.json({
          items: [],
          total: 0,
          limit: 5,
          offset: 0,
        }),
      ),
      http.post('/api/projects/:currentProjectId/regenerate-webhook-secret', () =>
        HttpResponse.json({
          webhook_secret: 'new-secret-456',
        }),
      ),
    )

    const user = userEvent.setup()

    renderPage()

    await screen.findByRole('heading', { name: 'Docs EN' })
    await user.click(screen.getByRole('button', { name: i18n.t('repositories:regenerate_secret') }))
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: i18n.t('repositories:regenerate_secret'),
      }),
    )

    expect(await screen.findByText(i18n.t('repositories:secret_modal_title'))).toBeInTheDocument()
    expect(screen.getByDisplayValue('new-secret-456')).toBeInTheDocument()
  })
})
