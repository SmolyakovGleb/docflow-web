import { baseApi } from '@/shared/api/baseApi'
import type {
  AdminTaskListResponse,
  AdminTasksQuery,
  AdminUserRead,
  AdminUserUpdate,
  InviteTokenCreate,
  InviteTokenRead,
} from '../model/types'

export const adminApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    getAdminUsers: builder.query<AdminUserRead[], void>({
      query: () => ({ url: '/admin/users' }),
      providesTags: ['Admin'],
    }),
    updateAdminUser: builder.mutation<AdminUserRead, { userId: string; payload: AdminUserUpdate }>({
      query: ({ userId, payload }) => ({
        url: `/admin/users/${userId}`,
        method: 'PATCH',
        data: payload,
      }),
      invalidatesTags: ['Admin'],
    }),
    deleteAdminUser: builder.mutation<void, string>({
      query: (userId) => ({
        url: `/admin/users/${userId}`,
        method: 'DELETE',
      }),
      invalidatesTags: ['Admin'],
    }),
    getInviteTokens: builder.query<InviteTokenRead[], void>({
      query: () => ({ url: '/admin/invite-tokens' }),
      providesTags: ['Admin'],
    }),
    createInviteToken: builder.mutation<InviteTokenRead, InviteTokenCreate>({
      query: (payload) => ({
        url: '/admin/invite-tokens',
        method: 'POST',
        data: payload,
      }),
      invalidatesTags: ['Admin'],
    }),
    revokeInviteToken: builder.mutation<void, string>({
      query: (tokenId) => ({
        url: `/admin/invite-tokens/${tokenId}`,
        method: 'DELETE',
      }),
      invalidatesTags: ['Admin'],
    }),
    getAdminTasks: builder.query<AdminTaskListResponse, AdminTasksQuery>({
      query: (params) => ({
        url: '/admin/tasks',
        params: Object.fromEntries(
          Object.entries(params).filter(([, v]) => v !== undefined && v !== '' && v !== null),
        ),
      }),
      providesTags: ['Admin'],
    }),
  }),
})

export const {
  useGetAdminUsersQuery,
  useUpdateAdminUserMutation,
  useDeleteAdminUserMutation,
  useGetInviteTokensQuery,
  useCreateInviteTokenMutation,
  useRevokeInviteTokenMutation,
  useGetAdminTasksQuery,
} = adminApi
