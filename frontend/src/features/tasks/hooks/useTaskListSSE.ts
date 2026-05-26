import { useEffect } from 'react'
import { useDispatch } from 'react-redux'
import type { AppDispatch } from '@/shared/store'
import { tasksApi } from '../api/tasksApi'
import type { GetTasksParams } from '../api/tasksApi'
import type { TaskStatus } from '../model/types'
import { commitGroupsApi } from '@/features/commit-groups/api/commitGroupsApi'

export function useTaskListSSE(args: GetTasksParams | void) {
  const dispatch = useDispatch<AppDispatch>()

  useEffect(() => {
    const params = new URLSearchParams()
    if (args?.project_id) params.set('project_id', String(args.project_id))
    if (args?.status) params.set('status', args.status)
    if (args?.search?.trim()) params.set('search', args.search.trim())

    const es = new EventSource(`/api/tasks/events?${params}`)

    es.addEventListener('task_entered', () => {
      dispatch(tasksApi.util.invalidateTags(['Task']))
    })

    es.addEventListener('task_updated', (e) => {
      const data = JSON.parse((e).data as string) as {
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
    })

    es.addEventListener('commit_group_created', () => {
      dispatch(commitGroupsApi.util.invalidateTags(['CommitGroup']))
    })

    es.addEventListener('commit_group_updated', () => {
      dispatch(commitGroupsApi.util.invalidateTags(['CommitGroup']))
    })

    es.onerror = () => es.close()
    return () => es.close()
  }, [args, dispatch])
}
