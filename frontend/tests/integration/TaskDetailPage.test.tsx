import { http, HttpResponse } from 'msw'
import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RouterProvider, createMemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import TaskDetailPage from '@/pages/TaskDetailPage'
import type { TaskDetail } from '@/features/tasks/model/types'
import { renderWithProviders } from '../utils/renderWithProviders'
import { server } from '../msw/server'

type Listener = (event: MessageEvent<string>) => void

class FakeEventSource {
  static instances: FakeEventSource[] = []

  listeners = new Map<string, Set<Listener>>()
  close = vi.fn()

  constructor() {
    FakeEventSource.instances.push(this)
  }

  addEventListener(type: string, listener: EventListenerOrEventListenerObject) {
    const callback = listener as Listener
    const handlers = this.listeners.get(type) ?? new Set<Listener>()
    handlers.add(callback)
    this.listeners.set(type, handlers)
  }

  removeEventListener(type: string, listener: EventListenerOrEventListenerObject) {
    const callback = listener as Listener
    this.listeners.get(type)?.delete(callback)
  }

  emit(type: string, payload: unknown) {
    const event = { data: JSON.stringify(payload) } as MessageEvent<string>
    this.listeners.get(type)?.forEach((listener) => listener(event))
  }
}

const baseTask: TaskDetail = {
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
  is_team_task: false,
}

function getFileName(filePath: string) {
  return filePath.split('/').at(-1) ?? filePath
}

function renderTaskDetail(initialTask: TaskDetail, log = '[prepare] started') {
  FakeEventSource.instances = []
  vi.stubGlobal('EventSource', FakeEventSource)

  server.use(
    http.get('/api/tasks/:taskId', () => HttpResponse.json(initialTask)),
    http.get('/api/tasks/:taskId/log', () =>
      log ? HttpResponse.text(log) : new HttpResponse(null, { status: 204 }),
    ),
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
          webhook_url: 'http://localhost:8080/webhook/project-1',
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
  )

  const router = createMemoryRouter([{ path: '/tasks/:taskId', element: <TaskDetailPage /> }], {
    initialEntries: ['/tasks/task-1'],
  })

  return renderWithProviders(<RouterProvider router={router} />)
}

describe('TaskDetailPage', () => {
  afterEach(() => {
    FakeEventSource.instances = []
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it.each([['queued'], ['running'], ['done'], ['failed'], ['conflict'], ['published']] as const)(
    'renders %s task state',
    async (status) => {
      const task: TaskDetail = {
        ...baseTask,
        status,
        translated_content:
          status === 'queued' || status === 'running' ? null : baseTask.translated_content,
        completed_at: status === 'queued' || status === 'running' ? null : baseTask.completed_at,
        conflict_base: status === 'conflict' ? '# Base' : null,
        conflict_ours: status === 'conflict' ? '# Ours' : null,
        conflict_theirs: status === 'conflict' ? '# Theirs' : null,
        publications:
          status === 'published'
            ? [
                {
                  id: 'pub-1',
                  target_repo: 'team/docs-en',
                  target_path: 'docs/deals/index.md',
                  commit_sha: '1234567abcdef',
                  published_at: '2026-05-12T10:00:00Z',
                },
              ]
            : [],
      }

      renderTaskDetail(task, status === 'running' ? '[prepare] started' : '')

      expect(
        await screen.findByRole('heading', { name: getFileName(task.file_path) }),
      ).toBeInTheDocument()

      if (status === 'done') {
        expect(await screen.findByLabelText('EN editor')).toBeInTheDocument()
        return
      }

      if (status === 'conflict') {
        expect(await screen.findByLabelText('Conflict editor')).toBeInTheDocument()
        return
      }

      if (status === 'published') {
        expect(await screen.findByText(/1234567/i)).toBeInTheDocument()
        expect(screen.getByRole('link', { name: /team\/docs-en/i })).toBeInTheDocument()
        return
      }

      if (status === 'queued') {
        expect(await screen.findByText(/Перевод в очереди/i)).toBeInTheDocument()
        return
      }

      if (status === 'running') {
        expect(await screen.findByText(/Время выполнения/i)).toBeInTheDocument()
        return
      }

      expect(await screen.findByText(/Повторить/i)).toBeInTheDocument()
    },
  )

  it('polls queued task after retry until it becomes running and opens SSE', async () => {
    vi.stubGlobal('EventSource', FakeEventSource)
    const user = userEvent.setup()
    let currentStatus: 'failed' | 'queued' | 'running' = 'failed'
    let queuedReads = 0

    server.use(
      http.get('/api/tasks/:taskId', () => {
        if (currentStatus === 'queued') {
          queuedReads += 1
          if (queuedReads >= 2) {
            currentStatus = 'running'
          }
        }

        return HttpResponse.json({
          ...baseTask,
          status: currentStatus,
          translated_content: currentStatus === 'failed' ? '# Broken translation' : null,
          completed_at: currentStatus === 'failed' ? baseTask.completed_at : null,
          current_stage: currentStatus === 'running' ? 'pipeline' : null,
        })
      }),
      http.get('/api/tasks/:taskId/log', () =>
        currentStatus === 'running'
          ? HttpResponse.text('[prepare] started')
          : new HttpResponse(null, { status: 204 }),
      ),
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
            webhook_url: 'http://localhost:8080/webhook/project-1',
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
          tasks_by_status: {
            queued: 0,
            running: currentStatus === 'running' ? 1 : 0,
            done: 0,
            failed: currentStatus === 'failed' ? 1 : 0,
            published: 0,
            conflict: 0,
          },
          tasks_per_day: [],
          top_errors: [],
        }),
      ),
      http.post('/api/tasks/:taskId/retry', () => {
        currentStatus = 'queued'
        queuedReads = 0
        return HttpResponse.json({ id: 'task-1', status: 'queued' }, { status: 202 })
      }),
    )

    const router = createMemoryRouter([{ path: '/tasks/:taskId', element: <TaskDetailPage /> }], {
      initialEntries: ['/tasks/task-1'],
    })

    renderWithProviders(<RouterProvider router={router} />)

    await user.click(await screen.findByRole('button', { name: /Повторить/i }))
    expect(await screen.findByText(/в очереди/i)).toBeInTheDocument()

    await waitFor(
      () => {
        expect(FakeEventSource.instances).toHaveLength(1)
      },
      { timeout: 5000 },
    )
  }, 10000)

  it('shows streamed logs immediately while the task is running', async () => {
    FakeEventSource.instances = []
    vi.stubGlobal('EventSource', FakeEventSource)
    const user = userEvent.setup()
    const currentTask: TaskDetail = {
      ...baseTask,
      status: 'running',
      translated_content: null,
      completed_at: null,
      current_stage: 'pipeline',
    }

    server.use(
      http.get('/api/tasks/:taskId', () => HttpResponse.json(currentTask)),
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
            webhook_url: 'http://localhost:8080/webhook/project-1',
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
          tasks_by_status: { queued: 0, running: 1, done: 0, failed: 0, published: 0, conflict: 0 },
          tasks_per_day: [],
          top_errors: [],
        }),
      ),
    )

    const router = createMemoryRouter([{ path: '/tasks/:taskId', element: <TaskDetailPage /> }], {
      initialEntries: ['/tasks/task-1'],
    })

    renderWithProviders(<RouterProvider router={router} />)

    await user.click(await screen.findByRole('tab', { name: /Логи/i }))

    await waitFor(() => {
      expect(
        FakeEventSource.instances.some(
          (instance) =>
            (instance.listeners.get('log_line')?.size ?? 0) > 0 &&
            (instance.listeners.get('status_change')?.size ?? 0) > 0,
        ),
      ).toBe(true)
    })

    const source = FakeEventSource.instances.find(
      (instance) =>
        (instance.listeners.get('log_line')?.size ?? 0) > 0 &&
        (instance.listeners.get('status_change')?.size ?? 0) > 0,
    )
    if (!source) {
      throw new Error('Expected EventSource instance to be created')
    }

    act(() => {
      source.emit('log_line', { line: '[pipeline] translating file' })
    })

    const streamedEntries = await screen.findAllByText('translating file')
    expect(streamedEntries).toHaveLength(1)
  })

  it('keeps the logs tab open after completion and shows legacy persisted logs after refetch', async () => {
    FakeEventSource.instances = []
    vi.stubGlobal('EventSource', FakeEventSource)
    const currentTask: TaskDetail = {
      ...baseTask,
      status: 'running',
      translated_content: null,
      completed_at: null,
      current_stage: 'pipeline',
    }

    server.use(
      http.get('/api/tasks/:taskId', () => HttpResponse.json(currentTask)),
      http.get('/api/tasks/:taskId/log', () =>
        currentTask.status === 'done'
          ? HttpResponse.text('legacy translated line\nsaved output')
          : new HttpResponse(null, { status: 204 }),
      ),
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
            webhook_url: 'http://localhost:8080/webhook/project-1',
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
          tasks_by_status: {
            queued: 0,
            running: currentTask.status === 'running' ? 1 : 0,
            done: currentTask.status === 'done' ? 1 : 0,
            failed: 0,
            published: 0,
            conflict: 0,
          },
          tasks_per_day: [],
          top_errors: [],
        }),
      ),
    )

    const router = createMemoryRouter([{ path: '/tasks/:taskId', element: <TaskDetailPage /> }], {
      initialEntries: ['/tasks/task-1'],
    })

    renderWithProviders(<RouterProvider router={router} />)

    await waitFor(() => {
      expect(
        FakeEventSource.instances.some(
          (instance) =>
            (instance.listeners.get('log_line')?.size ?? 0) > 0 &&
            (instance.listeners.get('status_change')?.size ?? 0) > 0,
        ),
      ).toBe(true)
    })

    const source = FakeEventSource.instances.find(
      (instance) =>
        (instance.listeners.get('log_line')?.size ?? 0) > 0 &&
        (instance.listeners.get('status_change')?.size ?? 0) > 0,
    )
    if (!source) {
      throw new Error('Expected EventSource instance to be created')
    }

    act(() => {
      currentTask.status = 'done'
      currentTask.current_stage = null
      currentTask.translated_content = '# Target'
      currentTask.completed_at = '2026-05-12T09:55:00Z'
      source.emit('status_change', { status: 'done' })
    })

    expect(await screen.findByText('legacy translated line')).toBeInTheDocument()
    expect(screen.getByText('saved output')).toBeInTheDocument()
    expect(screen.queryByLabelText('EN editor')).not.toBeInTheDocument()
  })

  it('blocks in-app navigation when there are unsaved diff changes', async () => {
    vi.stubGlobal('EventSource', FakeEventSource)
    const user = userEvent.setup()
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)

    server.use(
      http.get('/api/tasks/:taskId', () => HttpResponse.json(baseTask)),
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
            webhook_url: 'http://localhost:8080/webhook/project-1',
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
    )

    const router = createMemoryRouter(
      [
        { path: '/tasks', element: <div>Tasks list</div> },
        { path: '/tasks/:taskId', element: <TaskDetailPage /> },
      ],
      {
        initialEntries: ['/tasks/task-1'],
      },
    )

    renderWithProviders(<RouterProvider router={router} />)

    const editor = await screen.findByLabelText('EN editor')
    await user.clear(editor)
    await user.type(editor, '# Draft')
    await user.click(screen.getByRole('link', { name: /Задачи/i }))

    expect(confirmSpy).toHaveBeenCalledOnce()
    expect(
      await screen.findByRole('heading', { name: getFileName(baseTask.file_path) }),
    ).toBeInTheDocument()
    expect(screen.queryByText('Tasks list')).not.toBeInTheDocument()
  })

  it('opens an existing active task when create-new is deduplicated by backend', async () => {
    vi.stubGlobal('EventSource', FakeEventSource)
    const user = userEvent.setup()

    server.use(
      http.get('/api/tasks/:taskId', ({ params }) => {
        if (params.taskId === 'task-2') {
          return HttpResponse.json({
            ...baseTask,
            id: 'task-2',
            file_path: 'docs/deals/second.md',
            status: 'queued',
            translated_content: null,
            completed_at: null,
          })
        }

        return HttpResponse.json({
          ...baseTask,
          status: 'failed',
          error: 'Traceback...',
        })
      }),
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
            webhook_url: 'http://localhost:8080/webhook/project-1',
            version: 1,
            created_at: '2026-05-10T09:00:00Z',
          },
        ]),
      ),
      http.get('/api/analytics', () =>
        HttpResponse.json({
          total_tasks: 1,
          success_rate: 0.0,
          avg_duration_seconds: 42,
          tasks_by_status: { queued: 0, running: 0, done: 0, failed: 1, published: 0, conflict: 0 },
          tasks_per_day: [],
          top_errors: [],
        }),
      ),
      http.post('/api/tasks/:taskId/retry', () =>
        HttpResponse.json(
          {
            detail: 'Source file has changed since task was created',
            source_diff: {
              old_sha: 'old-sha',
              new_sha: 'new-sha',
            },
          },
          { status: 409 },
        ),
      ),
      http.post('/api/tasks/manual', () =>
        HttpResponse.json({
          created: 0,
          task_ids: [],
          skipped: [
            {
              file_path: 'docs/deals/index.md',
              reason: 'already_queued',
              existing_task_id: 'task-2',
            },
          ],
        }),
      ),
    )

    const router = createMemoryRouter([{ path: '/tasks/:taskId', element: <TaskDetailPage /> }], {
      initialEntries: ['/tasks/task-1'],
    })

    renderWithProviders(<RouterProvider router={router} />)

    await user.click(await screen.findByRole('button', { name: /Повторить/i }))
    await user.click(await screen.findByRole('button', { name: /Создать новую задачу/i }))

    expect(await screen.findByRole('heading', { name: 'second.md' })).toBeInTheDocument()
  })

  it('removes a queued task from the detail page without starting the pipeline', async () => {
    vi.stubGlobal('EventSource', FakeEventSource)
    const user = userEvent.setup()
    let deleteCalls = 0

    server.use(
      http.get('/api/tasks/:taskId', () =>
        HttpResponse.json({
          ...baseTask,
          status: 'queued',
          translated_content: null,
          completed_at: null,
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
            webhook_url: 'http://localhost:8080/webhook/project-1',
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
          tasks_by_status: { queued: 1, running: 0, done: 0, failed: 0, published: 0, conflict: 0 },
          tasks_per_day: [],
          top_errors: [],
        }),
      ),
      http.delete('/api/tasks/:taskId', () => {
        deleteCalls += 1
        return new HttpResponse(null, { status: 204 })
      }),
    )

    const router = createMemoryRouter(
      [
        { path: '/tasks', element: <div>Tasks list</div> },
        { path: '/tasks/:taskId', element: <TaskDetailPage /> },
      ],
      {
        initialEntries: ['/tasks/task-1'],
      },
    )

    renderWithProviders(<RouterProvider router={router} />)

    await user.click(await screen.findByRole('button', { name: /Убрать из очереди/i }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: /Убрать из очереди/i }))

    expect(await screen.findByText('Tasks list')).toBeInTheDocument()
    expect(deleteCalls).toBe(1)
  })

  it('publish button opens dialog instead of publishing immediately', async () => {
    vi.stubGlobal('EventSource', FakeEventSource)
    const user = userEvent.setup()
    let publishCalls = 0

    server.use(
      http.get('/api/tasks/:taskId', () => HttpResponse.json(baseTask)),
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
            webhook_url: 'http://localhost:8080/webhook/project-1',
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
      http.post('/api/tasks/:taskId/publish', () => {
        publishCalls += 1
        return HttpResponse.json({
          task_id: 'task-1',
          status: 'published',
          commit_sha: 'abc',
          target_repo: 'team/docs-en',
          target_path: 'docs/deals/index.md',
        })
      }),
      http.get('/api/projects/:projectId/files', () => HttpResponse.json({ items: [] })),
    )

    renderTaskDetail(baseTask)

    await user.click(await screen.findByRole('button', { name: /Опубликовать/i }))

    expect(publishCalls).toBe(0)
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
  })

  it('publish dialog prefills default commit message and submits with it', async () => {
    vi.stubGlobal('EventSource', FakeEventSource)
    const user = userEvent.setup()
    let capturedBody: { commit_message?: string; target_path?: string } | null = null

    server.use(
      http.get('/api/tasks/:taskId', () => HttpResponse.json(baseTask)),
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
            webhook_url: 'http://localhost:8080/webhook/project-1',
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
      http.post('/api/tasks/:taskId/publish', async ({ request }) => {
        capturedBody = (await request.json()) as { commit_message?: string; target_path?: string }
        return HttpResponse.json({
          task_id: 'task-1',
          status: 'published',
          commit_sha: 'abc',
          target_repo: 'team/docs-en',
          target_path: 'docs/deals/index.md',
        })
      }),
      http.get('/api/projects/:projectId/files', () => HttpResponse.json({ items: [] })),
    )

    renderTaskDetail(baseTask)

    await user.click(await screen.findByRole('button', { name: /Опубликовать/i }))
    const dialog = await screen.findByRole('dialog')

    const commitInput = within(dialog).getByDisplayValue(
      `Publish translation: ${baseTask.file_path}`,
    )
    expect(commitInput).toBeInTheDocument()

    await user.click(within(dialog).getByRole('button', { name: /Опубликовать/i }))

    await waitFor(() => {
      expect(capturedBody).not.toBeNull()
    })
    expect(capturedBody!.commit_message).toBe(`Publish translation: ${baseTask.file_path}`)
    expect(capturedBody!.target_path).toBe(baseTask.file_path)
  })

  it('publish dialog sends custom commit message when user edits it', async () => {
    vi.stubGlobal('EventSource', FakeEventSource)
    const user = userEvent.setup()
    let capturedBody: { commit_message?: string; target_path?: string } | null = null

    server.use(
      http.get('/api/tasks/:taskId', () => HttpResponse.json(baseTask)),
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
            webhook_url: 'http://localhost:8080/webhook/project-1',
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
      http.post('/api/tasks/:taskId/publish', async ({ request }) => {
        capturedBody = (await request.json()) as { commit_message?: string; target_path?: string }
        return HttpResponse.json({
          task_id: 'task-1',
          status: 'published',
          commit_sha: 'abc',
          target_repo: 'team/docs-en',
          target_path: 'docs/deals/index.md',
        })
      }),
      http.get('/api/projects/:projectId/files', () => HttpResponse.json({ items: [] })),
    )

    renderTaskDetail(baseTask)

    await user.click(await screen.findByRole('button', { name: /Опубликовать/i }))
    const dialog = await screen.findByRole('dialog')

    const commitInput = within(dialog).getByDisplayValue(
      `Publish translation: ${baseTask.file_path}`,
    )
    await user.clear(commitInput)
    await user.type(commitInput, 'chore: translate deals page')

    await user.click(within(dialog).getByRole('button', { name: /Опубликовать/i }))

    await waitFor(() => {
      expect(capturedBody).not.toBeNull()
    })
    expect(capturedBody!.commit_message).toBe('chore: translate deals page')
  })

  it('closing publish dialog does not trigger publish', async () => {
    vi.stubGlobal('EventSource', FakeEventSource)
    const user = userEvent.setup()
    let publishCalls = 0

    server.use(
      http.get('/api/tasks/:taskId', () => HttpResponse.json(baseTask)),
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
            webhook_url: 'http://localhost:8080/webhook/project-1',
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
      http.post('/api/tasks/:taskId/publish', () => {
        publishCalls += 1
        return HttpResponse.json({
          task_id: 'task-1',
          status: 'published',
          commit_sha: 'abc',
          target_repo: 'team/docs-en',
          target_path: 'docs/deals/index.md',
        })
      }),
      http.get('/api/projects/:projectId/files', () => HttpResponse.json({ items: [] })),
    )

    renderTaskDetail(baseTask)

    await user.click(await screen.findByRole('button', { name: /Опубликовать/i }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: /Отмена/i }))

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
    expect(publishCalls).toBe(0)
  })
})
