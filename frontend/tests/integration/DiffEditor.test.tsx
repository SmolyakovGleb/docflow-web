import { http, HttpResponse } from 'msw'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RouterProvider, createMemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import TaskDetailPage from '@/pages/TaskDetailPage'
import type { TaskDetail } from '@/features/tasks/model/types'
import { DiffEditor } from '@/features/tasks/ui/DiffEditor/DiffEditor'
import { renderWithProviders } from '../utils/renderWithProviders'
import { server } from '../msw/server'

class FakeEventSource {
  close = vi.fn()

  addEventListener() {}

  removeEventListener() {}
}

const task: TaskDetail = {
  id: 'task-1',
  project_id: 'project-1',
  project_name: 'CRM Docs',
  file_path: 'docs/deals/index.md',
  github_ref: 'refs/heads/main',
  github_sha: 'abcdef123456',
  commit_message: 'Update docs',
  commit_author_name: 'Anna',
  commit_author_login: 'anna',
  status: 'done',
  current_stage: null,
  created_at: '2026-05-12T09:50:00Z',
  completed_at: '2026-05-12T09:55:00Z',
  updated_at: '2026-05-12T09:55:00Z',
  source_file_sha: 'source-sha',
  target_file_sha: 'target-sha',
  original_content: '# Source',
  translated_content: '# Target',
  conflict_base: null,
  conflict_ours: null,
  conflict_theirs: null,
  error: null,
  publications: [],
}

describe('DiffEditor save flow', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('edits content and saves through PATCH /tasks/:id', async () => {
    vi.stubGlobal('EventSource', FakeEventSource)
    const user = userEvent.setup()
    let translatedContent = task.translated_content ?? ''
    let patchPayload: string | null = null

    server.use(
      http.get('/api/tasks/:taskId', () =>
        HttpResponse.json({
          ...task,
          translated_content: translatedContent,
        }),
      ),
      http.get('/api/tasks/:taskId/log', () => new HttpResponse(null, { status: 204 })),
      http.get('/api/projects', () =>
        HttpResponse.json([
          {
            id: 'project-1',
            name: 'CRM Docs',
            source_repo: 'team/docs-ru',
            source_branch: 'main',
            target_repo: 'team/docs-en',
            target_branch: 'main',
            exclude_patterns: [],
            webhook_url: 'http://localhost:8000/webhook/project-1',
            version: 1,
            created_at: '2026-05-10T09:00:00Z',
          },
        ]),
      ),
      http.get('/api/analytics', () =>
        HttpResponse.json({
          total_tasks: 1,
          success_rate: 1.0,
          avg_duration_seconds: 42,
          tasks_by_status: { queued: 0, running: 0, done: 1, failed: 0, published: 0, conflict: 0 },
          tasks_per_day: [],
          top_errors: [],
        }),
      ),
      http.patch('/api/tasks/:taskId', async ({ request }) => {
        const body = (await request.json()) as { translated_content: string }
        patchPayload = body.translated_content
        translatedContent = body.translated_content

        return HttpResponse.json({
          ...task,
          translated_content: translatedContent,
          updated_at: '2026-05-12T10:00:00Z',
        })
      }),
    )

    const router = createMemoryRouter([{ path: '/tasks/:taskId', element: <TaskDetailPage /> }], {
      initialEntries: ['/tasks/task-1'],
    })

    renderWithProviders(<RouterProvider router={router} />)

    const editor = await screen.findByLabelText('EN editor')
    await user.clear(editor)
    await user.type(editor, '# Updated translation')

    await user.click(screen.getByRole('button', { name: 'Сохранить' }))

    await waitFor(() => {
      expect(patchPayload).toBe('# Updated translation')
    })
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Сохранить' })).not.toBeInTheDocument()
    })
  })
  it('shows read-only EN pane when readOnly is true', () => {
    renderWithProviders(
      <DiffEditor
        filePath="docs/deals/index.md"
        originalContent="# Source"
        translatedContent="# Target"
        readOnly
      />,
    )

    expect(screen.queryByLabelText('EN editor')).not.toBeInTheDocument()
    expect(screen.getByText('# Target')).toBeInTheDocument()
  })
})
