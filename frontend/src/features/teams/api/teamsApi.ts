import { baseApi } from '@/shared/api/baseApi'
import type {
  TeamCreatePayload,
  TeamDetail,
  TeamInviteCreatePayload,
  TeamInvitePreview,
  TeamInviteRead,
  TeamJoinPayload,
  TeamRenamePayload,
} from '../model/types'

export const teamsApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    getMyTeam: builder.query<TeamDetail, void>({
      query: () => ({
        url: '/teams/me',
      }),
      providesTags: ['Team'],
    }),
    createTeam: builder.mutation<TeamDetail, TeamCreatePayload>({
      query: (payload) => ({
        url: '/teams',
        method: 'POST',
        data: payload,
      }),
      invalidatesTags: ['Team', 'TeamInvite'],
    }),
    renameTeam: builder.mutation<TeamDetail, TeamRenamePayload>({
      query: (payload) => ({
        url: '/teams/me',
        method: 'PATCH',
        data: payload,
      }),
      invalidatesTags: ['Team'],
    }),
    deleteTeam: builder.mutation<void, void>({
      query: () => ({
        url: '/teams/me',
        method: 'DELETE',
      }),
      invalidatesTags: ['Team', 'TeamInvite'],
    }),
    removeMember: builder.mutation<void, string>({
      query: (userId) => ({
        url: `/teams/me/members/${userId}`,
        method: 'DELETE',
      }),
      invalidatesTags: ['Team'],
    }),
    leaveTeam: builder.mutation<void, void>({
      query: () => ({
        url: '/teams/me/leave',
        method: 'POST',
      }),
      invalidatesTags: ['Team', 'TeamInvite'],
    }),
    getTeamInvites: builder.query<TeamInviteRead[], void>({
      query: () => ({
        url: '/teams/me/invites',
      }),
      providesTags: ['TeamInvite'],
    }),
    getTeamByInviteToken: builder.query<TeamInvitePreview, string>({
      query: (token) => ({
        url: '/teams/invite-preview',
        params: { token },
      }),
    }),
    createTeamInvite: builder.mutation<TeamInviteRead, TeamInviteCreatePayload>({
      query: (payload) => ({
        url: '/teams/me/invites',
        method: 'POST',
        data: payload,
      }),
      invalidatesTags: ['TeamInvite'],
    }),
    revokeTeamInvite: builder.mutation<void, string>({
      query: (inviteId) => ({
        url: `/teams/me/invites/${inviteId}`,
        method: 'DELETE',
      }),
      invalidatesTags: ['TeamInvite'],
    }),
    joinTeam: builder.mutation<TeamDetail, TeamJoinPayload>({
      query: (payload) => ({
        url: '/teams/join',
        method: 'POST',
        data: payload,
      }),
      invalidatesTags: ['Team', 'TeamInvite'],
    }),
  }),
})

export const {
  useGetMyTeamQuery,
  useCreateTeamMutation,
  useRenameTeamMutation,
  useDeleteTeamMutation,
  useRemoveMemberMutation,
  useLeaveTeamMutation,
  useGetTeamInvitesQuery,
  useGetTeamByInviteTokenQuery,
  useCreateTeamInviteMutation,
  useRevokeTeamInviteMutation,
  useJoinTeamMutation,
} = teamsApi
