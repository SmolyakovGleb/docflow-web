import { http, HttpResponse } from 'msw'
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { setUser } from '@/features/auth/model/authSlice'
import { TaskListPage } from '@/features/tasks/ui/TaskListPage'
import { createAppStore } from '@/shared/store'
import { server } from '../msw/server'
import { renderWithProviders } from '../utils/renderWithProviders'

describe('TaskListPage', () => {
  it('renders grouped tasks from the api response', async () => {
    server.use(
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
      http.get('/api/health', () =>
        HttpResponse.json({
          status: 'ok',
          pipeline_version: 'abc1234',
          last_webhook_at: '2026-05-12T10:00:00Z',
        }),
      ),
      http.get('/api/analytics', () =>
        HttpResponse.json({
          done: 1,
          failed: 0,
          published: 0,
          running: 1,
        }),
      ),
      http.get('/api/tasks', () =>
        HttpResponse.json({
          items: [
            {
              id: 'task-1',
              project_id: 'project-1',
              project_name: 'CRM Docs',
              file_path: 'docs/deals/index.md',
              github_sha: 'abcdef123456',
              commit_message: 'Update deals docs',
              commit_author_name: 'Anna',
              commit_author_login: 'anna',
              status: 'done',
              current_stage: null,
              created_at: '2026-05-12T09:50:00Z',
              completed_at: '2026-05-12T09:55:00Z',
              updated_at: '2026-05-12T09:55:00Z',
            },
            {
              id: 'task-2',
              project_id: 'project-1',
              project_name: 'CRM Docs',
              file_path: 'docs/deals/list.md',
              github_sha: 'abcdef123456',
              commit_message: 'Update deals docs',
              commit_author_name: 'Anna',
              commit_author_login: 'anna',
              status: 'running',
              current_stage: 'pipeline',
              created_at: '2026-05-12T09:57:00Z',
              completed_at: null,
              updated_at: '2026-05-12T09:57:00Z',
            },
          ],
          total: 2,
          limit: 50,
          offset: 0,
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
      <MemoryRouter>
        <TaskListPage />
      </MemoryRouter>,
      { store },
    )

    expect(await screen.findByRole('heading', { name: 'Задачи' })).toBeInTheDocument()
    expect(await screen.findByText('Update deals docs')).toBeInTheDocument()
    expect(
      screen.getAllByText(
        (_, element) => element?.textContent?.includes('docs/deals/index.md') ?? false,
      ).length,
    ).toBeGreaterThan(0)
    expect(screen.getAllByText('CRM Docs').length).toBeGreaterThan(0)
    expect(screen.getByText(/Опубликовать все/i)).toBeInTheDocument()
  })

  it('renders filtered empty state when there are no tasks for the current filter', async () => {
    server.use(
      http.get('/api/projects', () => HttpResponse.json([])),
      http.get('/api/health', () =>
        HttpResponse.json({
          status: 'ok',
          pipeline_version: 'abc1234',
          last_webhook_at: null,
        }),
      ),
      http.get('/api/analytics', () =>
        HttpResponse.json({
          done: 0,
          failed: 0,
          published: 0,
          running: 0,
        }),
      ),
      http.get('/api/tasks', () =>
        HttpResponse.json({
          items: [],
          total: 0,
          limit: 50,
          offset: 0,
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
      <MemoryRouter initialEntries={['/tasks?status=failed']}>
        <TaskListPage />
      </MemoryRouter>,
      { store },
    )

    expect(await screen.findByText('Нет задач по этому фильтру')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Сбросить фильтры' })).toBeInTheDocument()
  })

  it('renders no tasks empty state without extra repositories action', async () => {
    server.use(
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
      http.get('/api/health', () =>
        HttpResponse.json({
          status: 'ok',
          pipeline_version: 'abc1234',
          last_webhook_at: null,
        }),
      ),
      http.get('/api/analytics', () =>
        HttpResponse.json({
          done: 0,
          failed: 0,
          published: 0,
          running: 0,
        }),
      ),
      http.get('/api/tasks', () =>
        HttpResponse.json({
          items: [],
          total: 0,
          limit: 50,
          offset: 0,
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
      <MemoryRouter>
        <TaskListPage />
      </MemoryRouter>,
      { store },
    )

    const emptyStateTitle = await screen.findByText('Нет задач')
    const emptyState = emptyStateTitle.closest('section')

    expect(emptyState).not.toBeNull()
    expect(
      within(emptyState as HTMLElement).getByRole('button', { name: 'Запустить перевод' }),
    ).toBeInTheDocument()
    expect(
      within(emptyState as HTMLElement).queryByRole('button', { name: 'Открыть репозитории' }),
    ).not.toBeInTheDocument()
  })

  it('renders dashboard error state with retry action', async () => {
    server.use(
      http.get('/api/projects', () => HttpResponse.json([])),
      http.get('/api/health', () =>
        HttpResponse.json({
          status: 'ok',
          pipeline_version: 'abc1234',
          last_webhook_at: null,
        }),
      ),
      http.get('/api/analytics', () =>
        HttpResponse.json({
          done: 0,
          failed: 0,
          published: 0,
          running: 0,
        }),
      ),
      http.get('/api/tasks', () =>
        HttpResponse.json(
          {
            detail: 'boom',
          },
          { status: 500 },
        ),
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
      <MemoryRouter>
        <TaskListPage />
      </MemoryRouter>,
      { store },
    )

    expect(await screen.findByText('Не удалось загрузить задачи')).toBeInTheDocument()
    expect(screen.getByText('Проверьте соединение и повторите попытку.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Повторить' })).toBeInTheDocument()
  })

  it('hides toolbar when github is not linked even if a status filter is selected', async () => {
    server.use(
      http.get('/api/projects', () => HttpResponse.json([])),
      http.get('/api/health', () =>
        HttpResponse.json({
          status: 'ok',
          pipeline_version: 'abc1234',
          last_webhook_at: null,
        }),
      ),
      http.get('/api/analytics', () =>
        HttpResponse.json({
          done: 0,
          failed: 0,
          published: 0,
          running: 0,
        }),
      ),
      http.get('/api/tasks', () =>
        HttpResponse.json({
          items: [],
          total: 0,
          limit: 50,
          offset: 0,
        }),
      ),
    )

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
      <MemoryRouter initialEntries={['/tasks?status=queued']}>
        <TaskListPage />
      </MemoryRouter>,
      { store },
    )

    expect(await screen.findByText('Подключите GitHub чтобы начать')).toBeInTheDocument()
    expect(screen.queryByText('webhook активен')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Все проекты' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Выбрать' })).not.toBeInTheDocument()
  })

  it('shows github prompt inside trigger dialog when repository launch is unavailable', async () => {
    server.use(
      http.get('/api/projects', () => HttpResponse.json([])),
      http.get('/api/health', () =>
        HttpResponse.json({
          status: 'ok',
          pipeline_version: 'abc1234',
          last_webhook_at: null,
        }),
      ),
      http.get('/api/analytics', () =>
        HttpResponse.json({
          done: 0,
          failed: 0,
          published: 0,
          running: 0,
        }),
      ),
      http.get('/api/tasks', () =>
        HttpResponse.json({
          items: [],
          total: 0,
          limit: 50,
          offset: 0,
        }),
      ),
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
      <MemoryRouter>
        <TaskListPage />
      </MemoryRouter>,
      { store },
    )

    await screen.findByText('Подключите GitHub чтобы начать')
    const [headerTriggerButton] = screen.getAllByRole('button', { name: 'Запустить перевод' })
    expect(headerTriggerButton).toBeDefined()
    await user.click(headerTriggerButton!)

    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Из репозитория' }))
    expect(within(dialog).getByText('Подключите GitHub чтобы начать')).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Привязать GitHub' })).toBeInTheDocument()
    expect(within(dialog).queryByText('Проект')).not.toBeInTheDocument()
  })

  it('shows manual upload form without projects', async () => {
    server.use(
      http.get('/api/projects', () => HttpResponse.json([])),
      http.get('/api/health', () =>
        HttpResponse.json({
          status: 'ok',
          pipeline_version: 'abc1234',
          last_webhook_at: null,
        }),
      ),
      http.get('/api/analytics', () =>
        HttpResponse.json({
          done: 0,
          failed: 0,
          published: 0,
          running: 0,
        }),
      ),
      http.get('/api/tasks', () =>
        HttpResponse.json({
          items: [],
          total: 0,
          limit: 50,
          offset: 0,
        }),
      ),
    )

    const user = userEvent.setup()
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
      <MemoryRouter>
        <TaskListPage />
      </MemoryRouter>,
      { store },
    )

    const emptyStateTitle = await screen.findByText('Нет задач')
    const emptyState = emptyStateTitle.closest('section')

    expect(emptyState).not.toBeNull()
    await user.click(
      within(emptyState as HTMLElement).getByRole('button', { name: 'Запустить перевод' }),
    )

    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('Markdown-файл')).toBeInTheDocument()
    // No project is available so the "no project" option is pre-selected;
    // target-path input only appears when a project is selected
    expect(within(dialog).queryByText('Проект')).not.toBeInTheDocument()
    expect(within(dialog).queryByPlaceholderText('docs/manual/new-page.md')).not.toBeInTheDocument()

    const fileInput = dialog.querySelector('input[type="file"]')
    expect(fileInput).not.toBeNull()
    await user.upload(
      fileInput as HTMLInputElement,
      new File(['# Source'], 'uploaded.md', { type: 'text/markdown' }),
    )
    expect(within(dialog).getByRole('button', { name: 'Запустить' })).toBeEnabled()
  })
  it('removes a queued task from the list after confirmation', async () => {
    const user = userEvent.setup()
    const tasks = [
      {
        id: 'task-1',
        project_id: 'project-1',
        project_name: 'CRM Docs',
        file_path: 'docs/queued.md',
        github_sha: 'abcdef123456',
        commit_message: 'Queue test',
        commit_author_name: 'Anna',
        commit_author_login: 'anna',
        status: 'queued',
        current_stage: null,
        created_at: '2026-05-12T09:50:00Z',
        completed_at: null,
        updated_at: '2026-05-12T09:55:00Z',
      },
    ]

    server.use(
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
      http.get('/api/health', () =>
        HttpResponse.json({
          status: 'ok',
          pipeline_version: 'abc1234',
          last_webhook_at: '2026-05-12T10:00:00Z',
        }),
      ),
      http.get('/api/analytics', () =>
        HttpResponse.json({
          done: 0,
          failed: 0,
          published: 0,
          running: 0,
        }),
      ),
      http.get('/api/tasks', () =>
        HttpResponse.json({
          items: tasks,
          total: tasks.length,
          limit: 50,
          offset: 0,
          status_counts: {
            queued: tasks.length,
            running: 0,
            done: 0,
            failed: 0,
            published: 0,
            conflict: 0,
          },
        }),
      ),
      http.delete('/api/tasks/:taskId', ({ params }) => {
        const taskIndex = tasks.findIndex((task) => task.id === params.taskId)
        if (taskIndex >= 0) {
          tasks.splice(taskIndex, 1)
        }
        return new HttpResponse(null, { status: 204 })
      }),
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
      <MemoryRouter>
        <TaskListPage />
      </MemoryRouter>,
      { store },
    )

    expect(await screen.findByText('Queue test')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Убрать из очереди' }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Убрать из очереди' }))

    expect(await screen.findByText('Нет задач')).toBeInTheDocument()
  })
})
