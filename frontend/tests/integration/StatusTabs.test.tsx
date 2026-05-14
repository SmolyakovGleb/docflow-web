import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import type { TaskSummary } from '@/features/tasks/model/types'
import { StatusTabs } from '@/features/tasks/ui/StatusTabs'
import { renderWithProviders } from '../utils/renderWithProviders'

const baseTask: TaskSummary = {
  id: 'task-1',
  project_id: 'proj-1',
  project_name: 'Docs',
  file_path: 'docs/a.md',
  github_sha: 'abc123',
  commit_message: 'Update',
  commit_author_name: 'Anna',
  commit_author_login: 'anna',
  status: 'done',
  current_stage: null,
  created_at: '2026-05-12T10:00:00Z',
  completed_at: '2026-05-12T10:05:00Z',
  updated_at: '2026-05-12T10:05:00Z',
}

describe('StatusTabs', () => {
  it('renders all status tab labels', () => {
    renderWithProviders(
      <MemoryRouter>
        <StatusTabs activeTab="all" tasks={[]} onTabChange={() => {}} />
      </MemoryRouter>,
    )

    expect(screen.getByRole('button', { name: /все/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /в очереди/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /в работе/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /к публикации/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /ошибки/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /конфликты/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /опубликовано/i })).toBeInTheDocument()
  })

  it('marks the active tab with tabActive class', () => {
    renderWithProviders(
      <MemoryRouter>
        <StatusTabs activeTab="done" tasks={[]} onTabChange={() => {}} />
      </MemoryRouter>,
    )

    const doneBtn = screen.getByRole('button', { name: /к публикации/i })
    expect(doneBtn.className).toContain('tabActive')

    const allBtn = screen.getByRole('button', { name: /все/i })
    expect(allBtn.className).not.toContain('tabActive')
  })

  it('calls onTabChange with correct status when tab is clicked', async () => {
    const user = userEvent.setup()
    const onTabChange = vi.fn()

    renderWithProviders(
      <MemoryRouter>
        <StatusTabs activeTab="all" tasks={[]} onTabChange={onTabChange} />
      </MemoryRouter>,
    )

    await user.click(screen.getByRole('button', { name: /ошибки/i }))
    expect(onTabChange).toHaveBeenCalledWith('failed')
  })

  it('calls onTabChange with null when "all" tab is clicked', async () => {
    const user = userEvent.setup()
    const onTabChange = vi.fn()

    renderWithProviders(
      <MemoryRouter>
        <StatusTabs activeTab="done" tasks={[]} onTabChange={onTabChange} />
      </MemoryRouter>,
    )

    await user.click(screen.getByRole('button', { name: /все/i }))
    expect(onTabChange).toHaveBeenCalledWith(null)
  })

  it('shows per-status counts derived from tasks list', () => {
    const tasks: TaskSummary[] = [
      { ...baseTask, id: '1', status: 'done' },
      { ...baseTask, id: '2', status: 'done' },
      { ...baseTask, id: '3', status: 'failed' },
      { ...baseTask, id: '4', status: 'conflict' },
    ]

    renderWithProviders(
      <MemoryRouter>
        <StatusTabs activeTab="all" tasks={tasks} onTabChange={() => {}} />
      </MemoryRouter>,
    )

    const doneBtn = screen.getByRole('button', { name: /к публикации/i })
    expect(doneBtn.textContent).toContain('2')

    const failedBtn = screen.getByRole('button', { name: /ошибки/i })
    expect(failedBtn.textContent).toContain('1')

    const conflictBtn = screen.getByRole('button', { name: /конфликты/i })
    expect(conflictBtn.textContent).toContain('1')
  })

  it('prefers aggregate counts over filtered task list when status filter is active', () => {
    const filteredTasks: TaskSummary[] = [{ ...baseTask, id: '3', status: 'failed' }]

    renderWithProviders(
      <MemoryRouter>
        <StatusTabs
          activeTab="failed"
          tasks={filteredTasks}
          counts={{
            queued: 0,
            running: 0,
            done: 2,
            failed: 1,
            conflict: 0,
            published: 0,
          }}
          onTabChange={() => {}}
        />
      </MemoryRouter>,
    )

    const allBtn = screen.getByRole('button', { name: /все/i })
    expect(allBtn.textContent).toContain('3')

    const failedBtn = screen.getByRole('button', { name: /ошибки/i })
    expect(failedBtn.textContent).toContain('1')
  })
})
