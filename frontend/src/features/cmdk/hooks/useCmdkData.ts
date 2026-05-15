import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useGetProjectsQuery } from '@/features/projects/api/projectsApi'
import type { Project } from '@/features/projects/model/types'
import { useGetTasksQuery } from '@/features/tasks/api/tasksApi'
import type { TaskSummary } from '@/features/tasks/model/types'
import type { CmdkGroup, CmdkItem } from '../model/types'

interface UseCmdkDataOptions {
  query: string
  enabled: boolean
}

interface BuildCmdkGroupsParams {
  actions: CmdkItem[]
  projects: CmdkItem[]
  query: string
  tasks: CmdkItem[]
}

const TASK_LIMIT = 5

function normalizeQuery(query: string) {
  return query.trim().toLocaleLowerCase()
}

function matchesItem(item: CmdkItem, normalizedQuery: string) {
  if (!normalizedQuery) {
    return true
  }

  const haystack = [item.title, item.subtitle ?? '', ...item.keywords].join(' ').toLocaleLowerCase()

  return haystack.includes(normalizedQuery)
}

export function buildCmdkGroups({
  tasks,
  projects,
  actions,
  query,
}: BuildCmdkGroupsParams): CmdkGroup[] {
  const normalizedQuery = normalizeQuery(query)

  const filteredTasks = tasks
    .filter((item) => matchesItem(item, normalizedQuery))
    .slice(0, TASK_LIMIT)
  const filteredProjects = projects.filter((item) => matchesItem(item, normalizedQuery))
  const filteredActions = actions.filter((item) => matchesItem(item, normalizedQuery))

  return [
    { key: 'tasks', items: filteredTasks },
    { key: 'projects', items: filteredProjects },
    { key: 'actions', items: filteredActions },
  ]
}

function buildTaskItems(tasks: TaskSummary[]): CmdkItem[] {
  return tasks.map((task) => ({
    id: task.id,
    type: 'task',
    group: 'tasks',
    icon: 'task',
    title: task.file_path,
    ...((task.project_name ?? task.commit_message)
      ? { subtitle: task.project_name ?? task.commit_message ?? '' }
      : {}),
    keywords: [
      task.project_name ?? '',
      task.commit_message ?? '',
      task.commit_author_name ?? '',
      task.commit_author_login ?? '',
      task.status,
    ].filter(Boolean),
    to: `/tasks/${task.id}`,
  }))
}

function buildProjectItems(projects: Project[]): CmdkItem[] {
  return projects.map((project) => ({
    id: project.id,
    type: 'project',
    group: 'projects',
    icon: 'project',
    title: project.name,
    subtitle: `${project.source_repo} -> ${project.target_repo}`,
    keywords: [
      project.name,
      project.source_repo,
      project.target_repo,
      project.source_branch,
      project.target_branch,
    ],
    to: `/repositories/${project.id}`,
  }))
}

function buildActionItems(t: (key: string) => string): CmdkItem[] {
  return [
    {
      id: 'open-tasks',
      type: 'action',
      group: 'actions',
      icon: 'tasks',
      title: t('actions.open_tasks.title'),
      subtitle: t('actions.open_tasks.subtitle'),
      keywords: ['tasks', 'задачи', 'list'],
      to: '/tasks',
    },
    {
      id: 'create-project',
      type: 'action',
      group: 'actions',
      icon: 'newProject',
      title: t('actions.create_project.title'),
      subtitle: t('actions.create_project.subtitle'),
      keywords: ['project', 'repository', 'создать', 'new'],
      to: '/repositories/new',
    },
    {
      id: 'open-repositories',
      type: 'action',
      group: 'actions',
      icon: 'repositories',
      title: t('actions.open_repositories.title'),
      subtitle: t('actions.open_repositories.subtitle'),
      keywords: ['repositories', 'projects', 'репозитории', 'проекты'],
      to: '/repositories',
    },
    {
      id: 'open-history',
      type: 'action',
      group: 'actions',
      icon: 'history',
      title: t('actions.open_history.title'),
      subtitle: t('actions.open_history.subtitle'),
      keywords: ['history', 'история'],
      to: '/history',
    },
    {
      id: 'open-analytics',
      type: 'action',
      group: 'actions',
      icon: 'analytics',
      title: t('actions.open_analytics.title'),
      subtitle: t('actions.open_analytics.subtitle'),
      keywords: ['analytics', 'аналитика'],
      to: '/analytics',
    },
    {
      id: 'open-dictionaries',
      type: 'action',
      group: 'actions',
      icon: 'dictionaries',
      title: t('actions.open_dictionaries.title'),
      subtitle: t('actions.open_dictionaries.subtitle'),
      keywords: ['dictionaries', 'dictionary', 'словари'],
      to: '/dictionaries',
    },
    {
      id: 'open-settings',
      type: 'action',
      group: 'actions',
      icon: 'settings',
      title: t('actions.open_settings.title'),
      subtitle: t('actions.open_settings.subtitle'),
      keywords: ['settings', 'настройки'],
      to: '/settings',
    },
  ]
}

export function useCmdkData({ query, enabled }: UseCmdkDataOptions) {
  const { t } = useTranslation('cmdk')
  const {
    data: taskResponse,
    isLoading: isTasksLoading,
    isFetching: isTasksFetching,
  } = useGetTasksQuery(
    {
      limit: 50,
      offset: 0,
    },
    {
      skip: !enabled,
    },
  )
  const {
    data: projects = [],
    isLoading: isProjectsLoading,
    isFetching: isProjectsFetching,
  } = useGetProjectsQuery(undefined, {
    skip: !enabled,
  })

  const groups = useMemo(() => {
    const taskItems = buildTaskItems(taskResponse?.items ?? [])
    const projectItems = buildProjectItems(projects)
    const actionItems = buildActionItems(t)

    return buildCmdkGroups({
      tasks: taskItems,
      projects: projectItems,
      actions: actionItems,
      query,
    })
  }, [projects, query, t, taskResponse?.items])

  const hasQuery = Boolean(query.trim())
  const isLoading = enabled && (isTasksLoading || isProjectsLoading)
  const isFetching = enabled && (isTasksFetching || isProjectsFetching)
  const isEmpty = groups.every((group) => group.items.length === 0)

  return {
    groups,
    hasQuery,
    isEmpty,
    isFetching,
    isLoading,
  }
}
