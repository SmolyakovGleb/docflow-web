import { baseApi } from '@/shared/api/baseApi'
import type { CommitGroupListResponse } from '../model/types'

export const commitGroupsApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    getCommitGroups: build.query<CommitGroupListResponse, { projectId?: string; status?: string }>({
      query: ({ projectId, status }) => ({
        url: '/commit-groups',
        params: { project_id: projectId, status },
      }),
      providesTags: ['CommitGroup'],
    }),
    confirmCommitGroup: build.mutation<{ created: number; task_ids: string[] }, string>({
      query: (groupId) => ({ url: `/commit-groups/${groupId}/confirm`, method: 'POST' }),
      invalidatesTags: ['CommitGroup', 'Task'],
    }),
    cancelCommitGroup: build.mutation<void, string>({
      query: (groupId) => ({ url: `/commit-groups/${groupId}`, method: 'DELETE' }),
      invalidatesTags: ['CommitGroup'],
    }),
  }),
})

export const {
  useGetCommitGroupsQuery,
  useConfirmCommitGroupMutation,
  useCancelCommitGroupMutation,
} = commitGroupsApi
