import { describe, expect, it } from 'vitest'
import { groupByCommit } from '@/features/tasks/lib/groupByCommit'
import type { TaskSummary } from '@/features/tasks/model/types'

const baseTask: TaskSummary = {
  id: 'task-1',
  project_id: 'project-1',
  project_name: 'Docs',
  file_path: 'docs/a.md',
  github_sha: 'abcdef123456',
  commit_message: 'Update docs',
  commit_author_name: 'Anna',
  commit_author_login: 'anna',
  status: 'done',
  current_stage: null,
  created_at: '2026-05-12T10:00:00Z',
  completed_at: '2026-05-12T10:10:00Z',
  updated_at: '2026-05-12T10:10:00Z',
  is_team_task: false,
  previous_task_id: null,
  incremental_paragraphs_count: null,
  incremental_total_paragraphs: null,
}

describe('groupByCommit', () => {
  it('groups tasks with the same github sha together', () => {
    const groups = groupByCommit([
      baseTask,
      {
        ...baseTask,
        id: 'task-2',
        file_path: 'docs/b.md',
      },
      {
        ...baseTask,
        id: 'task-3',
        github_sha: null,
        commit_message: 'manual',
      },
    ])

    expect(groups).toHaveLength(2)
    expect(groups[0]?.tasks).toHaveLength(2)
    expect(groups[0]?.sha).toBe('abcdef123456')
    expect(groups[1]?.isManual).toBe(true)
  })
})
