import { baseApi } from '@/shared/api/baseApi'
import { getAccessToken } from '@/shared/lib/authToken'
import type {
  BatchPublishResponse,
  RetryTaskResponse,
  TaskCreateResponse,
  TaskDetail,
  TaskListResponse,
  TaskPublishResponse,
  TaskStatus,
} from '../model/types'

export interface GetTasksParams {
  status?: TaskStatus | null
  project_id?: string | null
  search?: string
  limit?: number
  offset?: number
}

// EventSource не умеет слать заголовок Authorization, а за гейтвеем VibeCode
// нет и куки — поэтому SSE-токен передаём query-параметром.
function withAccessToken(url: string): string {
  const token = getAccessToken()
  if (!token) {
    return url
  }
  const sep = url.includes('?') ? '&' : '?'
  return `${url}${sep}access_token=${encodeURIComponent(token)}`
}

export function getTaskEventsUrl(taskId: string) {
  return withAccessToken(`/api/tasks/${taskId}/events`)
}

export function getTaskListEventsUrl(params: GetTasksParams = {}) {
  const searchParams = new URLSearchParams()

  if (params.status) {
    searchParams.set('status', params.status)
  }
  if (params.project_id) {
    searchParams.set('project_id', params.project_id)
  }
  if (params.search?.trim()) {
    searchParams.set('search', params.search.trim())
  }

  const query = searchParams.toString()
  return withAccessToken(query ? `/api/tasks/events?${query}` : '/api/tasks/events')
}

export const tasksApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    getTasks: builder.query<TaskListResponse, GetTasksParams | void>({
      query: (params) => {
        const resolvedParams = Object.fromEntries(
          Object.entries(params ?? {}).filter(
            ([, value]) => value !== null && value !== undefined && value !== '',
          ),
        )

        return {
          url: '/tasks',
          params: resolvedParams,
        }
      },
      // Бесконечный скролл: страницы (разный offset) с одинаковыми фильтрами
      // живут в одной cache-записи. offset намеренно исключён из ключа, поэтому
      // SSE-апдейты (updateQueryData без offset) попадают в ту же запись.
      serializeQueryArgs: ({ endpointName, queryArgs }) => {
        const { status, project_id, search, limit } = queryArgs ?? {}
        return `${endpointName}(${JSON.stringify({
          status: status ?? null,
          project_id: project_id ?? null,
          search: search?.trim() || null,
          limit: limit ?? null,
        })})`
      },
      merge: (currentCache, newData, { arg }) => {
        // offset=0 — это первая страница / обновление сверху: заменяем целиком.
        if (!arg || (arg.offset ?? 0) === 0) {
          return newData
        }
        const seen = new Set(currentCache.items.map((task) => task.id))
        for (const item of newData.items) {
          if (!seen.has(item.id)) {
            currentCache.items.push(item)
          }
        }
        currentCache.total = newData.total
        currentCache.status_counts = newData.status_counts
        currentCache.limit = newData.limit
        currentCache.offset = newData.offset
      },
      forceRefetch: ({ currentArg, previousArg }) =>
        (currentArg?.offset ?? 0) !== (previousArg?.offset ?? 0),
      providesTags: (result) => [
        'Task',
        ...(result?.items?.map((task) => ({ type: 'Task' as const, id: task.id })) ?? []),
      ],
    }),
    getTask: builder.query<TaskDetail, string>({
      query: (taskId) => ({
        url: `/tasks/${taskId}`,
      }),
      providesTags: (_result, _error, taskId) => [{ type: 'Task', id: taskId }],
    }),
    getTaskLog: builder.query<string, string>({
      query: (taskId) => ({
        url: `/tasks/${taskId}/log`,
      }),
      transformResponse: (response) => (typeof response === 'string' ? response : ''),
      providesTags: (_result, _error, taskId) => [{ type: 'TaskLog', id: taskId }],
    }),
    updateTask: builder.mutation<TaskDetail, { taskId: string; translated_content: string }>({
      query: ({ taskId, translated_content }) => ({
        url: `/tasks/${taskId}`,
        method: 'PATCH',
        data: {
          translated_content,
        },
      }),
      invalidatesTags: (_result, _error, { taskId }) => ['Task', { type: 'Task', id: taskId }],
    }),
    createManualRepoTasks: builder.mutation<
      TaskCreateResponse,
      { project_id: string; file_paths: string[] }
    >({
      query: (data) => ({
        url: '/tasks/manual',
        method: 'POST',
        data,
      }),
      invalidatesTags: ['Task'],
    }),
    uploadManualTask: builder.mutation<TaskCreateResponse, FormData>({
      query: (data) => ({
        url: '/tasks/manual',
        method: 'POST',
        data,
      }),
      invalidatesTags: ['Task'],
    }),
    retryTask: builder.mutation<RetryTaskResponse, { taskId: string; force?: boolean }>({
      query: ({ taskId, force = false }) => ({
        url: `/tasks/${taskId}/retry`,
        method: 'POST',
        data: force ? { force } : undefined,
      }),
      invalidatesTags: (_result, _error, { taskId }) => [
        'Task',
        { type: 'Task', id: taskId },
        { type: 'TaskLog', id: taskId },
      ],
    }),
    deleteTask: builder.mutation<void, string>({
      query: (taskId) => ({
        url: `/tasks/${taskId}`,
        method: 'DELETE',
      }),
      invalidatesTags: (_result, _error, taskId) => [
        'Task',
        { type: 'Task', id: taskId },
        { type: 'TaskLog', id: taskId },
      ],
    }),
    publishTask: builder.mutation<
      TaskPublishResponse,
      { taskId: string; commitMessage?: string; targetPath?: string }
    >({
      query: ({ taskId, commitMessage, targetPath }) => ({
        url: `/tasks/${taskId}/publish`,
        method: 'POST',
        data: {
          ...(commitMessage ? { commit_message: commitMessage } : {}),
          ...(targetPath ? { target_path: targetPath } : {}),
        },
      }),
      invalidatesTags: (_result, _error, { taskId }) => [
        'History',
        'Task',
        { type: 'Task', id: taskId },
      ],
    }),
    publishTasksBatch: builder.mutation<
      BatchPublishResponse,
      { taskIds: string[]; commitMessage?: string; pathOverrides?: Record<string, string> }
    >({
      query: ({ taskIds, commitMessage, pathOverrides }) => ({
        url: '/tasks/publish-batch',
        method: 'POST',
        data: {
          task_ids: taskIds,
          ...(commitMessage ? { commit_message: commitMessage } : {}),
          ...(pathOverrides && Object.keys(pathOverrides).length > 0
            ? { per_task_paths: pathOverrides }
            : {}),
        },
      }),
      invalidatesTags: ['History', 'Task'],
    }),
    cancelTask: builder.mutation<{ id: string; status: string }, string>({
      query: (taskId) => ({ url: `/tasks/${taskId}/cancel`, method: 'POST' }),
      invalidatesTags: (_result, _error, taskId) => [{ type: 'Task', id: taskId }],
    }),
  }),
})

export const {
  useCancelTaskMutation,
  useCreateManualRepoTasksMutation,
  useDeleteTaskMutation,
  useGetTaskLogQuery,
  useGetTaskQuery,
  useGetTasksQuery,
  useLazyGetTaskLogQuery,
  useLazyGetTaskQuery,
  usePublishTaskMutation,
  usePublishTasksBatchMutation,
  useRetryTaskMutation,
  useUpdateTaskMutation,
  useUploadManualTaskMutation,
} = tasksApi
