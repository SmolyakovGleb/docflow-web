import { useCallback, useEffect, useEffectEvent, useMemo, useState } from 'react'
import { getTaskListEventsUrl } from '../api/tasksApi'
import type { TaskStatus } from '../model/types'

const STORAGE_KEY = 'docflow.tasks.list-notifications.v2'
const EMPTY_TASK_IDS: string[] = []
const DISMISSED_TASK_IDS_BY_SCOPE = new Map<string, Set<string>>()

interface TaskListScope {
  status: TaskStatus | null
  projectId: string | null
  search: string
}

interface TaskEnteredEvent {
  task_id?: string
}

type StoredTaskIds = Record<string, string[]>

function normalizeTaskIds(value: unknown) {
  if (!Array.isArray(value)) {
    return []
  }

  return Array.from(new Set(value.filter((item): item is string => typeof item === 'string')))
}

function readStoredTaskIds(): StoredTaskIds {
  if (typeof window === 'undefined') {
    return {}
  }

  const raw = window.sessionStorage.getItem(STORAGE_KEY)
  if (!raw) {
    return {}
  }

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>
    return Object.entries(parsed).reduce<StoredTaskIds>((accumulator, [scopeKey, value]) => {
      const taskIds = normalizeTaskIds(value)
      if (taskIds.length > 0) {
        accumulator[scopeKey] = taskIds
      }
      return accumulator
    }, {})
  } catch {
    return {}
  }
}

function writeStoredTaskIds(taskIdsByScope: StoredTaskIds) {
  if (typeof window === 'undefined') {
    return
  }

  window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(taskIdsByScope))
}

function getScopeTaskIds(
  taskIdsByScope: StoredTaskIds,
  scopeKey: string,
  excludedTaskIds?: Set<string>,
) {
  const taskIds = taskIdsByScope[scopeKey] ?? EMPTY_TASK_IDS
  if (!excludedTaskIds || excludedTaskIds.size === 0) {
    return taskIds
  }

  return taskIds.filter((taskId) => !excludedTaskIds.has(taskId))
}

function replaceScopeTaskIds(taskIdsByScope: StoredTaskIds, scopeKey: string, taskIds: string[]) {
  const currentTaskIds = taskIdsByScope[scopeKey] ?? EMPTY_TASK_IDS

  if (
    currentTaskIds.length === taskIds.length &&
    currentTaskIds.every((taskId, index) => taskId === taskIds[index])
  ) {
    return taskIdsByScope
  }

  const nextTaskIdsByScope = { ...taskIdsByScope }
  if (taskIds.length === 0) {
    delete nextTaskIdsByScope[scopeKey]
  } else {
    nextTaskIdsByScope[scopeKey] = taskIds
  }

  return nextTaskIdsByScope
}

function getDismissedTaskIds(scopeKey: string, visibleTaskIds: string[]) {
  const dismissedTaskIds = new Set(DISMISSED_TASK_IDS_BY_SCOPE.get(scopeKey) ?? [])
  visibleTaskIds.forEach((taskId) => {
    dismissedTaskIds.add(taskId)
  })
  return dismissedTaskIds
}

export function useTaskListNotifications(
  scopeKey: string,
  scope: TaskListScope,
  visibleTaskIds: string[] = EMPTY_TASK_IDS,
  enabled = true,
) {
  const [taskIdsByScope, setTaskIdsByScope] = useState<StoredTaskIds>(() => readStoredTaskIds())

  const dismissedTaskIds = useMemo(
    () => getDismissedTaskIds(scopeKey, visibleTaskIds),
    [scopeKey, visibleTaskIds],
  )

  const newTaskIds = useMemo(
    () => getScopeTaskIds(taskIdsByScope, scopeKey, dismissedTaskIds),
    [dismissedTaskIds, scopeKey, taskIdsByScope],
  )

  useEffect(() => {
    if (dismissedTaskIds.size > 0) {
      DISMISSED_TASK_IDS_BY_SCOPE.set(scopeKey, dismissedTaskIds)
    }

    const nextTaskIdsByScope = replaceScopeTaskIds(taskIdsByScope, scopeKey, newTaskIds)
    if (nextTaskIdsByScope !== taskIdsByScope) {
      writeStoredTaskIds(nextTaskIdsByScope)
    }
  }, [dismissedTaskIds, newTaskIds, scopeKey, taskIdsByScope])

  const handleTaskEntered = useEffectEvent((event: MessageEvent<string>) => {
    const payload = JSON.parse(event.data) as TaskEnteredEvent
    const taskId = payload.task_id

    if (!taskId || visibleTaskIds.includes(taskId)) {
      return
    }

    setTaskIdsByScope((current) => {
      const currentTaskIds = getScopeTaskIds(
        current,
        scopeKey,
        getDismissedTaskIds(scopeKey, visibleTaskIds),
      )
      if (currentTaskIds.includes(taskId)) {
        return current
      }

      const nextTaskIdsByScope = replaceScopeTaskIds(current, scopeKey, [...currentTaskIds, taskId])
      writeStoredTaskIds(nextTaskIdsByScope)
      return nextTaskIdsByScope
    })
  })

  useEffect(() => {
    if (!enabled || typeof EventSource === 'undefined') {
      return undefined
    }

    const source = new EventSource(
      getTaskListEventsUrl({
        status: scope.status,
        project_id: scope.projectId,
        search: scope.search,
      }),
    )

    source.addEventListener('task_entered', handleTaskEntered as EventListener)

    return () => {
      source.removeEventListener('task_entered', handleTaskEntered as EventListener)
      source.close()
    }
  }, [enabled, scope.projectId, scope.search, scope.status])

  const clearNewTasks = useCallback(() => {
    setTaskIdsByScope((current) => {
      const nextTaskIdsByScope = replaceScopeTaskIds(current, scopeKey, [])
      writeStoredTaskIds(nextTaskIdsByScope)
      return nextTaskIdsByScope
    })
  }, [scopeKey])

  return {
    newTasksCount: newTaskIds.length,
    clearNewTasks,
  }
}
