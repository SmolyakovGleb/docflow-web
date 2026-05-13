import { useEffect, useEffectEvent, useRef } from 'react'
import { getTaskEventsUrl } from '@/features/tasks/api/tasksApi'
import { baseApi } from '@/shared/api/baseApi'
import { useAppDispatch } from '@/shared/store/hooks'
import type { TaskStageUpdateEvent, TaskStatus, TaskStatusChangeEvent } from '../model/types'

interface UseSSEOptions {
  taskId: string | null
  status: TaskStatus
  onLogLine?: (line: string) => void
  onStageUpdate?: (event: TaskStageUpdateEvent) => void
  onStatusChange?: (event: TaskStatusChangeEvent) => void
}

export function useSSE({
  taskId,
  status,
  onLogLine,
  onStageUpdate,
  onStatusChange,
}: UseSSEOptions) {
  const dispatch = useAppDispatch()
  const sourceRef = useRef<EventSource | null>(null)

  const closeSource = useEffectEvent(() => {
    sourceRef.current?.close()
    sourceRef.current = null
  })

  const handleLogLine = useEffectEvent((event: MessageEvent<string>) => {
    const payload = JSON.parse(event.data) as { line?: string }
    if (payload.line) {
      onLogLine?.(payload.line)
    }
  })

  const handleStageUpdate = useEffectEvent((event: MessageEvent<string>) => {
    const payload = JSON.parse(event.data) as TaskStageUpdateEvent
    onStageUpdate?.(payload)
  })

  const handleStatusChange = useEffectEvent((event: MessageEvent<string>) => {
    const payload = JSON.parse(event.data) as TaskStatusChangeEvent
    onStatusChange?.(payload)
    closeSource()

    if (taskId) {
      dispatch(baseApi.util.invalidateTags(['Task', { type: 'Task', id: taskId }]))
    }
  })

  useEffect(() => {
    if (status !== 'running' || !taskId) {
      closeSource()
      return undefined
    }

    const source = new EventSource(getTaskEventsUrl(taskId))
    sourceRef.current = source
    source.addEventListener('log_line', handleLogLine as EventListener)
    source.addEventListener('stage_update', handleStageUpdate as EventListener)
    source.addEventListener('status_change', handleStatusChange as EventListener)
    source.onerror = () => {
      closeSource()
    }

    return () => {
      source.removeEventListener('log_line', handleLogLine as EventListener)
      source.removeEventListener('stage_update', handleStageUpdate as EventListener)
      source.removeEventListener('status_change', handleStatusChange as EventListener)
      closeSource()
    }
  }, [closeSource, handleLogLine, handleStageUpdate, handleStatusChange, status, taskId])
}
