import { expect, test } from '@playwright/test'

test('running task streams logs, switches to diff, saves and publishes', async ({ page }) => {
  let currentStatus: 'running' | 'done' | 'published' = 'running'
  let translatedContent = '# Initial translation'
  let savedPatchContent: string | null = null

  await page.addInitScript(() => {
    class FakeEventSource {
      static instances: FakeEventSource[] = []
      url: string
      listeners = new Map<string, Set<(event: { data: string }) => void>>()

      constructor(url: string) {
        this.url = url
        FakeEventSource.instances.push(this)
      }

      addEventListener(type: string, listener: EventListenerOrEventListenerObject) {
        const callback = listener as (event: { data: string }) => void
        const handlers = this.listeners.get(type) ?? new Set()
        handlers.add(callback)
        this.listeners.set(type, handlers)
      }

      removeEventListener(type: string, listener: EventListenerOrEventListenerObject) {
        const callback = listener as (event: { data: string }) => void
        this.listeners.get(type)?.delete(callback)
      }

      close() {}

      emit(type: string, payload: unknown) {
        const event = { data: JSON.stringify(payload) }
        this.listeners.get(type)?.forEach((listener) => listener(event))
      }
    }

    Object.assign(window, {
      EventSource: FakeEventSource,
      __emitTaskEvent: (type: string, payload: unknown) => {
        FakeEventSource.instances.forEach((instance) => instance.emit(type, payload))
      },
    })
  })

  await page.route('**/api/auth/me', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: '00000000-0000-0000-0000-000000000001',
        email: 'anna@company.ru',
        display_name: 'Anna Kuznetsova',
        github_linked: true,
        github_login: 'anna',
      }),
    })
  })

  await page.route('**/api/projects', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
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
    })
  })

  await page.route(/\/api\/analytics(?:\?.*)?$/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        total_tasks: 1,
        success_rate: 1.0,
        avg_duration_seconds: 42,
        tasks_by_status: {
          queued: 0,
          running: currentStatus === 'running' ? 1 : 0,
          done: currentStatus === 'done' ? 1 : 0,
          failed: 0,
          published: currentStatus === 'published' ? 1 : 0,
          conflict: 0,
        },
        tasks_per_day: [],
        top_errors: [],
      }),
    })
  })

  await page.route('**/api/tasks/task-1/log', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'text/plain',
      body:
        currentStatus === 'running'
          ? '[prepare] workspace ready\n[pipeline] chunk translated'
          : '[prepare] workspace ready\n[pipeline] chunk translated\n[persist] saved output',
    })
  })

  await page.route('**/api/tasks/task-1', async (route) => {
    if (route.request().method() === 'PATCH') {
      const body = route.request().postDataJSON() as { translated_content: string }
      savedPatchContent = body.translated_content
      translatedContent = body.translated_content
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'task-1',
          project_id: 'project-1',
          project_name: 'CRM Docs',
          file_path: 'docs/deals/index.md',
          github_ref: 'refs/heads/main',
          github_sha: 'abcdef123456',
          commit_message: 'Update docs',
          commit_author_name: 'Anna',
          commit_author_login: 'anna',
          status: currentStatus,
          current_stage: null,
          created_at: '2026-05-12T09:50:00Z',
          completed_at: currentStatus === 'running' ? null : '2026-05-12T09:55:00Z',
          updated_at: '2026-05-12T10:00:00Z',
          source_file_sha: 'source-sha',
          target_file_sha: 'target-sha',
          original_content: '# Source',
          translated_content: translatedContent,
          conflict_base: null,
          conflict_ours: null,
          conflict_theirs: null,
          error: null,
          publications:
            currentStatus === 'published'
              ? [
                  {
                    id: 'pub-1',
                    target_repo: 'team/docs-en',
                    target_path: 'docs/deals/index.md',
                    commit_sha: '1234567abcdef',
                    published_at: '2026-05-12T10:10:00Z',
                  },
                ]
              : [],
        }),
      })
      return
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: 'task-1',
        project_id: 'project-1',
        project_name: 'CRM Docs',
        file_path: 'docs/deals/index.md',
        github_ref: 'refs/heads/main',
        github_sha: 'abcdef123456',
        commit_message: 'Update docs',
        commit_author_name: 'Anna',
        commit_author_login: 'anna',
        status: currentStatus,
        current_stage: currentStatus === 'running' ? 'pipeline' : null,
        created_at: '2026-05-12T09:50:00Z',
        completed_at: currentStatus === 'running' ? null : '2026-05-12T09:55:00Z',
        updated_at: '2026-05-12T10:00:00Z',
        source_file_sha: 'source-sha',
        target_file_sha: 'target-sha',
        original_content: '# Source',
        translated_content: currentStatus === 'running' ? null : translatedContent,
        conflict_base: null,
        conflict_ours: null,
        conflict_theirs: null,
        error: null,
        publications:
          currentStatus === 'published'
            ? [
                {
                  id: 'pub-1',
                  target_repo: 'team/docs-en',
                  target_path: 'docs/deals/index.md',
                  commit_sha: '1234567abcdef',
                  published_at: '2026-05-12T10:10:00Z',
                },
              ]
            : [],
      }),
    })
  })

  await page.route('**/api/tasks/task-1/publish', async (route) => {
    currentStatus = 'published'
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        task_id: 'task-1',
        status: 'published',
        commit_sha: '1234567abcdef',
        target_repo: 'team/docs-en',
        target_path: 'docs/deals/index.md',
      }),
    })
  })

  await page.goto('/tasks/task-1')

  await expect(page.getByText('workspace ready')).toBeVisible()
  await expect(page.getByText('chunk translated')).toBeVisible()

  currentStatus = 'done'
  await page.evaluate(() => {
    ;(
      window as Window & { __emitTaskEvent: (type: string, payload: unknown) => void }
    ).__emitTaskEvent('status_change', { status: 'done' })
  })

  const editor = page.getByLabel('EN editor')
  await expect(editor).toBeVisible()
  await editor.fill('# Updated translation')
  await page.getByRole('button', { name: 'Сохранить' }).click()
  await expect.poll(() => savedPatchContent).toBe('# Updated translation')

  await page.getByRole('button', { name: 'Опубликовать' }).click()

  await expect(page.getByText('1234567')).toBeVisible()
  await expect(page.getByRole('link', { name: /team\/docs-en/i })).toBeVisible()
})
