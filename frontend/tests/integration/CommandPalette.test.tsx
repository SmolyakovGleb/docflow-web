import { http, HttpResponse } from 'msw'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { CommandPalette } from '@/features/cmdk'
import { open } from '@/features/cmdk/model/cmdkSlice'
import { createAppStore } from '@/shared/store'
import { server } from '../msw/server'
import { renderWithProviders } from '../utils/renderWithProviders'

function LocationProbe() {
  const location = useLocation()

  return <div data-testid="location-probe">{`${location.pathname}${location.search}`}</div>
}

function renderPalette() {
  const store = createAppStore()
  store.dispatch(open())

  return renderWithProviders(
    <MemoryRouter initialEntries={['/tasks']}>
      <CommandPalette />
      <Routes>
        <Route path="/tasks" element={<div>tasks page</div>} />
        <Route path="/tasks/:taskId" element={<div>task detail page</div>} />
        <Route path="/repositories/new" element={<div>new repository page</div>} />
      </Routes>
      <LocationProbe />
    </MemoryRouter>,
    { store },
  )
}

describe('CommandPalette', () => {
  it('renders grouped results and navigates to task detail', async () => {
    server.use(
      http.get('/api/tasks', () =>
        HttpResponse.json({
          items: [
            {
              id: 'task-1',
              project_id: 'project-1',
              project_name: 'Docs EN',
              file_path: 'docs/get-started.md',
              github_sha: 'abc123',
              commit_message: 'Initial setup',
              commit_author_name: 'Anna',
              commit_author_login: 'annak',
              status: 'queued',
              current_stage: 'prepare',
              created_at: '2026-05-15T08:00:00Z',
              completed_at: null,
              updated_at: '2026-05-15T08:05:00Z',
            },
          ],
          total: 1,
          limit: 50,
          offset: 0,
          status_counts: {
            queued: 1,
          },
        }),
      ),
      http.get('/api/projects', () =>
        HttpResponse.json([
          {
            id: 'project-1',
            name: 'Docs EN',
            source_repo: 'team/docs-ru',
            source_branch: 'main',
            target_repo: 'team/docs-en',
            target_branch: 'release',
            exclude_patterns: [],
            webhook_url: 'http://localhost:8080/webhook/project-1',
            version: 1,
            created_at: '2026-05-15T07:00:00Z',
          },
        ]),
      ),
    )

    const user = userEvent.setup()
    renderPalette()

    expect(await screen.findByPlaceholderText('Что нужно открыть?')).toBeInTheDocument()
    expect(await screen.findByText('Задачи')).toBeInTheDocument()
    expect(screen.getByText('Проекты')).toBeInTheDocument()
    expect(screen.getByText('Действия')).toBeInTheDocument()

    await user.type(screen.getByPlaceholderText('Что нужно открыть?'), 'get-started')
    await user.click(await screen.findByText('docs/get-started.md'))

    expect(await screen.findByText('task detail page')).toBeInTheDocument()
    expect(screen.getByTestId('location-probe')).toHaveTextContent('/tasks/task-1')
    await waitFor(() => {
      expect(screen.queryByPlaceholderText('Что нужно открыть?')).not.toBeInTheDocument()
    })
  })

  it('navigates by static action', async () => {
    server.use(
      http.get('/api/tasks', () =>
        HttpResponse.json({
          items: [],
          total: 0,
          limit: 50,
          offset: 0,
          status_counts: {},
        }),
      ),
      http.get('/api/projects', () => HttpResponse.json([])),
    )

    const user = userEvent.setup()
    renderPalette()

    await user.type(await screen.findByPlaceholderText('Что нужно открыть?'), 'создать')
    await user.click(await screen.findByText('Создать проект'))

    expect(await screen.findByText('new repository page')).toBeInTheDocument()
    expect(screen.getByTestId('location-probe')).toHaveTextContent('/repositories/new')
  })

  it('shows empty state when no results match query', async () => {
    server.use(
      http.get('/api/tasks', () =>
        HttpResponse.json({
          items: [],
          total: 0,
          limit: 50,
          offset: 0,
          status_counts: {},
        }),
      ),
      http.get('/api/projects', () => HttpResponse.json([])),
    )

    const user = userEvent.setup()
    renderPalette()

    await user.type(await screen.findByPlaceholderText('Что нужно открыть?'), 'missing-value')

    expect(await screen.findByText('По текущему запросу ничего не найдено.')).toBeInTheDocument()
  })
})
