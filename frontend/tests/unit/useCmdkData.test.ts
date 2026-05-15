import { describe, expect, it } from 'vitest'
import { buildCmdkGroups } from '@/features/cmdk/hooks/useCmdkData'
import type { CmdkItem } from '@/features/cmdk/model/types'

const tasks: CmdkItem[] = [
  {
    id: 'task-1',
    type: 'task',
    group: 'tasks',
    icon: 'task',
    title: 'docs/get-started.md',
    subtitle: 'Docs EN',
    keywords: ['initial setup', 'anna'],
    to: '/tasks/task-1',
  },
]

const projects: CmdkItem[] = [
  {
    id: 'project-1',
    type: 'project',
    group: 'projects',
    icon: 'project',
    title: 'Docs EN',
    subtitle: 'team/docs-ru -> team/docs-en',
    keywords: ['main', 'release'],
    to: '/repositories/project-1',
  },
]

const actions: CmdkItem[] = [
  {
    id: 'action-1',
    type: 'action',
    group: 'actions',
    icon: 'newProject',
    title: 'Создать проект',
    subtitle: 'Открыть форму нового проекта',
    keywords: ['repository', 'new', 'создать'],
    to: '/repositories/new',
  },
]

describe('buildCmdkGroups', () => {
  it('returns grouped results without query', () => {
    const groups = buildCmdkGroups({
      tasks,
      projects,
      actions,
      query: '',
    })
    const [taskGroup, projectGroup, actionGroup] = groups

    expect(taskGroup?.items).toHaveLength(1)
    expect(projectGroup?.items).toHaveLength(1)
    expect(actionGroup?.items).toHaveLength(1)
  })

  it('filters tasks by title and subtitle', () => {
    const groups = buildCmdkGroups({
      tasks,
      projects,
      actions,
      query: 'get-started',
    })
    const [taskGroup, projectGroup, actionGroup] = groups

    expect(taskGroup?.items.map((item) => item.id)).toEqual(['task-1'])
    expect(projectGroup?.items).toHaveLength(0)
    expect(actionGroup?.items).toHaveLength(0)
  })

  it('filters projects by repository subtitle', () => {
    const groups = buildCmdkGroups({
      tasks,
      projects,
      actions,
      query: 'docs-en',
    })
    const [, projectGroup] = groups

    expect(groups[0]?.items).toHaveLength(0)
    expect(projectGroup?.items.map((item) => item.id)).toEqual(['project-1'])
  })

  it('filters actions by keywords', () => {
    const groups = buildCmdkGroups({
      tasks,
      projects,
      actions,
      query: 'создать',
    })
    const [, , actionGroup] = groups

    expect(actionGroup?.items.map((item) => item.id)).toEqual(['action-1'])
  })
})
