import { baseApi } from '@/shared/api/baseApi'
import type {
  RetryTaskResponse,
  TaskCreateResponse,
  TaskDetail,
  TaskListResponse,
  TaskPublishResponse,
  TaskStatus,
} from '../model/types'

interface GetTasksParams {
  status?: TaskStatus | null
  project_id?: string | null
  search?: string
  limit?: number
  offset?: number
}

export function getTaskEventsUrl(taskId: string) {
  return `/api/tasks/${taskId}/events`
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
      providesTags: (result) => [
        'Task',
        ...(result?.items.map((task) => ({ type: 'Task' as const, id: task.id })) ?? []),
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
      invalidatesTags: (_result, _error, { taskId }) => ['Task', { type: 'Task', id: taskId }],
    }),
    publishTask: builder.mutation<TaskPublishResponse, string>({
      query: (taskId) => ({
        url: `/tasks/${taskId}/publish`,
        method: 'POST',
      }),
      invalidatesTags: (_result, _error, taskId) => [
        'History',
        'Task',
        { type: 'Task', id: taskId },
      ],
    }),
  }),
})

export const {
  useCreateManualRepoTasksMutation,
  useGetTaskLogQuery,
  useGetTaskQuery,
  useGetTasksQuery,
  useLazyGetTaskLogQuery,
  useLazyGetTaskQuery,
  usePublishTaskMutation,
  useRetryTaskMutation,
  useUpdateTaskMutation,
  useUploadManualTaskMutation,
} = tasksApi
