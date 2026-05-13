import { http, HttpResponse } from 'msw'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { tasksApi } from '@/features/tasks/api/tasksApi'
import { HistoryPage } from '@/features/history/ui'
import { server } from '../msw/server'
import { renderWithProviders } from '../utils/renderWithProviders'

function makeProject(id: string, name: string, sourceRepo: string, targetRepo: string) {
  return {
    id,
    name,
    source_repo: sourceRepo,
    source_branch: 'main',
    target_repo: targetRepo,
    target_branch: 'main',
    exclude_patterns: [],
    webhook_url: `http://localhost:8000/webhook/${id}`,
    version: 1,
    created_at: '2026-05-10T09:00:00Z',
  }
}

function makePublication(index: number, overrides?: Partial<Record<string, unknown>>) {
  const day = String(((index - 1) % 28) + 1).padStart(2, '0')

  return {
    id: `publication-${index}`,
    task_id: `task-${index}`,
    file_path: `docs/page-${index}.md`,
    source_repo: 'team/docs-ru',
    target_repo: 'team/docs-en',
    target_path: `docs/page-${index}.md`,
    commit_sha: `abcdef${index}123456`,
    commit_url: `https://github.com/team/docs-en/commit/abcdef${index}123456`,
    published_by: {
      id: '11111111-1111-4111-8111-111111111111',
      email: 'anna@example.com',
      display_name: 'Anna',
      github_linked: true,
      github_login: 'anna',
    },
    published_at: `2026-05-${day}T10:00:00Z`,
    can_open_task: true,
    ...overrides,
  }
}

function makeHistoryResponse(
  items: Array<Record<string, unknown>>,
  overrides?: Partial<{
    publishers: Array<{ id: string; label: string }>
    total: number
    limit: number
    offset: number
  }>,
) {
  return {
    items,
    publishers: overrides?.publishers ?? [
      { id: '11111111-1111-4111-8111-111111111111', label: 'Anna' },
    ],
    total: overrides?.total ?? items.length,
    limit: overrides?.limit ?? 20,
    offset: overrides?.offset ?? 0,
  }
}

function renderHistoryPage(initialEntry = '/history') {
  return renderWithProviders(
    <MemoryRouter initialEntries={[initialEntry]}>
      <HistoryPage />
    </MemoryRouter>,
  )
}

describe('HistoryPage', () => {
  it('renders history publications from the api response', async () => {
    const publications = Array.from({ length: 5 }, (_, index) => makePublication(index + 1))

    server.use(
      http.get('/api/projects', () =>
        HttpResponse.json([makeProject('project-1', 'CRM Docs', 'team/docs-ru', 'team/docs-en')]),
      ),
      http.get('/api/history', () => HttpResponse.json(makeHistoryResponse(publications))),
    )

    const { container } = renderHistoryPage()

    expect(await screen.findByRole('heading', { name: 'История' })).toBeInTheDocument()
    expect((await screen.findAllByText('docs/page-1.md')).length).toBeGreaterThan(0)
    expect(screen.getAllByText('docs/page-5.md').length).toBeGreaterThan(0)
    expect(container.querySelectorAll('article').length).toBe(5)
  })

  it('filters history by project', async () => {
    const user = userEvent.setup()
    const crmProjectId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
    const portalProjectId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
    const crmPublication = makePublication(1, {
      file_path: 'docs/crm-only.md',
      target_path: 'docs/crm-only.md',
      source_repo: 'team/crm-ru',
      target_repo: 'team/crm-en',
    })
    const portalPublication = makePublication(2, {
      file_path: 'docs/portal-only.md',
      target_path: 'docs/portal-only.md',
      source_repo: 'team/portal-ru',
      target_repo: 'team/portal-en',
    })

    server.use(
      http.get('/api/projects', () =>
        HttpResponse.json([
          makeProject(crmProjectId, 'CRM Docs', 'team/crm-ru', 'team/crm-en'),
          makeProject(portalProjectId, 'Portal Docs', 'team/portal-ru', 'team/portal-en'),
        ]),
      ),
      http.get('/api/history', ({ request }) => {
        const url = new URL(request.url)
        const projectId = url.searchParams.get('project_id')
        const items =
          projectId === crmProjectId
            ? [crmPublication]
            : projectId === portalProjectId
              ? [portalPublication]
              : [crmPublication, portalPublication]

        return HttpResponse.json(
          makeHistoryResponse(items, {
            limit: Number(url.searchParams.get('limit') ?? '20'),
            offset: Number(url.searchParams.get('offset') ?? '0'),
          }),
        )
      }),
    )

    renderHistoryPage()

    expect((await screen.findAllByText('docs/crm-only.md')).length).toBeGreaterThan(0)
    expect(screen.getAllByText('docs/portal-only.md').length).toBeGreaterThan(0)

    await user.selectOptions(screen.getByLabelText('Проект'), crmProjectId)

    await waitFor(() => {
      expect(screen.getAllByText('docs/crm-only.md').length).toBeGreaterThan(0)
      expect(screen.queryAllByText('docs/portal-only.md')).toHaveLength(0)
    })
  })

  it('uses publisher options from the history response instead of the current page items', async () => {
    const user = userEvent.setup()
    const annaPublication = makePublication(1, {
      file_path: 'docs/anna.md',
      target_path: 'docs/anna.md',
    })
    const borisPublication = makePublication(2, {
      file_path: 'docs/boris.md',
      target_path: 'docs/boris.md',
      published_by: {
        id: '22222222-2222-4222-8222-222222222222',
        email: 'boris@example.com',
        display_name: 'Boris',
        github_linked: true,
        github_login: 'boris',
      },
    })

    server.use(
      http.get('/api/projects', () =>
        HttpResponse.json([makeProject('project-1', 'CRM Docs', 'team/docs-ru', 'team/docs-en')]),
      ),
      http.get('/api/history', ({ request }) => {
        const url = new URL(request.url)
        const publishedBy = url.searchParams.get('published_by')
        const items =
          publishedBy === '22222222-2222-4222-8222-222222222222'
            ? [borisPublication]
            : [annaPublication]

        return HttpResponse.json(
          makeHistoryResponse(items, {
            publishers: [
              { id: '11111111-1111-4111-8111-111111111111', label: 'Anna' },
              { id: '22222222-2222-4222-8222-222222222222', label: 'Boris' },
            ],
            limit: Number(url.searchParams.get('limit') ?? '20'),
            offset: Number(url.searchParams.get('offset') ?? '0'),
          }),
        )
      }),
    )

    renderHistoryPage()

    expect((await screen.findAllByText('docs/anna.md')).length).toBeGreaterThan(0)
    expect(screen.getByRole('option', { name: 'Boris' })).toBeInTheDocument()

    await user.selectOptions(screen.getByLabelText('Автор'), '22222222-2222-4222-8222-222222222222')

    await waitFor(() => {
      expect(screen.getAllByText('docs/boris.md').length).toBeGreaterThan(0)
      expect(screen.queryAllByText('docs/anna.md')).toHaveLength(0)
    })
  })

  it('hides the task link when the publication belongs to another user', async () => {
    server.use(
      http.get('/api/projects', () =>
        HttpResponse.json([makeProject('project-1', 'CRM Docs', 'team/docs-ru', 'team/docs-en')]),
      ),
      http.get('/api/history', () =>
        HttpResponse.json(
          makeHistoryResponse([
            makePublication(1, {
              can_open_task: false,
            }),
          ]),
        ),
      ),
    )

    renderHistoryPage()

    expect(await screen.findByText('Задача недоступна')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Открыть задачу' })).not.toBeInTheDocument()
  })

  it('sanitizes invalid filter params in the URL before querying the backend', async () => {
    const seenParams: Record<string, string | null> = {
      project_id: null,
      published_by: null,
      from: null,
      to: null,
      limit: null,
      offset: null,
    }

    server.use(
      http.get('/api/projects', () =>
        HttpResponse.json([makeProject('project-1', 'CRM Docs', 'team/docs-ru', 'team/docs-en')]),
      ),
      http.get('/api/history', ({ request }) => {
        const url = new URL(request.url)

        for (const key of Object.keys(seenParams)) {
          seenParams[key] = url.searchParams.get(key)
        }

        return HttpResponse.json(makeHistoryResponse([makePublication(1)]))
      }),
    )

    renderHistoryPage(
      '/history?project_id=not-a-uuid&published_by=broken&from=nope&to=2026-05-12T23:59:59.999Z',
    )

    expect(await screen.findByRole('heading', { name: 'История' })).toBeInTheDocument()

    await waitFor(() => {
      expect(seenParams.project_id).toBeNull()
      expect(seenParams.published_by).toBeNull()
      expect(seenParams.from).toBeNull()
      expect(seenParams.to).toBe('2026-05-12T23:59:59.999Z')
      expect(seenParams.limit).toBe('20')
      expect(seenParams.offset).toBe('0')
    })
  })

  it('loads additional pages with offset pagination beyond 100 records', async () => {
    const user = userEvent.setup()
    const publications = Array.from({ length: 120 }, (_, index) => makePublication(index + 1))
    const requestedOffsets: number[] = []
    const requestedLimits: number[] = []

    server.use(
      http.get('/api/projects', () =>
        HttpResponse.json([makeProject('project-1', 'CRM Docs', 'team/docs-ru', 'team/docs-en')]),
      ),
      http.get('/api/history', ({ request }) => {
        const url = new URL(request.url)
        const limit = Number(url.searchParams.get('limit') ?? '20')
        const offset = Number(url.searchParams.get('offset') ?? '0')

        requestedLimits.push(limit)
        requestedOffsets.push(offset)

        return HttpResponse.json(
          makeHistoryResponse(publications.slice(offset, offset + limit), {
            total: publications.length,
            limit,
            offset,
          }),
        )
      }),
    )

    renderHistoryPage()

    expect((await screen.findAllByText('docs/page-20.md')).length).toBeGreaterThan(0)

    for (const targetIndex of [40, 60, 80, 100, 120]) {
      await user.click(screen.getByRole('button', { name: 'Загрузить ещё' }))
      expect((await screen.findAllByText(`docs/page-${targetIndex}.md`)).length).toBeGreaterThan(0)
    }

    expect(requestedLimits).toEqual([20, 20, 20, 20, 20, 20])
    expect(requestedOffsets).toEqual([0, 20, 40, 60, 80, 100])
    expect(screen.getAllByRole('article')).toHaveLength(120)
  })

  it('refetches the active history query after publish invalidates the History tag', async () => {
    let historyRequests = 0
    let publications = [makePublication(1)]

    server.use(
      http.get('/api/projects', () =>
        HttpResponse.json([makeProject('project-1', 'CRM Docs', 'team/docs-ru', 'team/docs-en')]),
      ),
      http.get('/api/history', () => {
        historyRequests += 1
        return HttpResponse.json(makeHistoryResponse(publications))
      }),
      http.post('/api/tasks/:taskId/publish', () => {
        publications = [makePublication(2), ...publications]
        return HttpResponse.json({
          task_id: 'task-1',
          status: 'published',
          commit_sha: 'newsha123',
          target_repo: 'team/docs-en',
          target_path: 'docs/page-2.md',
        })
      }),
    )

    const { store } = renderHistoryPage()

    expect((await screen.findAllByText('docs/page-1.md')).length).toBeGreaterThan(0)
    expect(historyRequests).toBe(1)

    await store.dispatch(tasksApi.endpoints.publishTask.initiate('task-1'))

    await waitFor(() => {
      expect(historyRequests).toBe(2)
      expect(screen.getAllByText('docs/page-2.md').length).toBeGreaterThan(0)
    })
  })
})
