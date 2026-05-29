import { useEffect } from 'react'
import { useDispatch } from 'react-redux'
import type { AppDispatch } from '@/shared/store'
import { tasksApi } from '../api/tasksApi'
import { getTaskListEventsUrl } from '../api/tasksApi'
import type { GetTasksParams } from '../api/tasksApi'
import type { TaskStatus } from '../model/types'
import { commitGroupsApi } from '@/features/commit-groups/api/commitGroupsApi'

export function useTaskListSSE(args: GetTasksParams | void) {
  const dispatch = useDispatch<AppDispatch>()

  useEffect(() => {
    if (typeof EventSource === 'undefined') {
      return undefined
    }

    const es = new EventSource(getTaskListEventsUrl(args ?? {}))
    const handleTaskEntered = () => {
      dispatch(tasksApi.util.invalidateTags(['Task']))
    }
    const handleTaskUpdated = (event: Event) => {
      const data = JSON.parse((event as MessageEvent<string>).data) as {
        task_id: string
        status: string
        current_stage: string | null
      }

      dispatch(
        tasksApi.util.updateQueryData('getTasks', args, (draft) => {
          const index = draft.items.findIndex((t) => t.id === data.task_id)
          if (index === -1) return
          const statusFilter = args?.status
          if (statusFilter && data.status !== statusFilter) {
            // task moved outside the current status filter — remove it from the list
            draft.items.splice(index, 1)
            draft.total = Math.max(0, draft.total - 1)
          } else {
            const item = draft.items[index]
            if (!item) return
            item.status = data.status as TaskStatus
            item.current_stage = data.current_stage
          }
        }),
      )
    }
    const handleCommitGroupChanged = () => {
      dispatch(commitGroupsApi.util.invalidateTags(['CommitGroup']))
    }

    es.addEventListener('task_entered', handleTaskEntered)
    es.addEventListener('task_updated', handleTaskUpdated)
    es.addEventListener('commit_group_created', handleCommitGroupChanged)
    es.addEventListener('commit_group_updated', handleCommitGroupChanged)

    es.onerror = () => es.close()

    return () => {
      es.removeEventListener('task_entered', handleTaskEntered)
      es.removeEventListener('task_updated', handleTaskUpdated)
      es.removeEventListener('commit_group_created', handleCommitGroupChanged)
      es.removeEventListener('commit_group_updated', handleCommitGroupChanged)
      es.close()
    }
  }, [args, dispatch])
}
