import { baseApi } from '@/shared/api/baseApi'
import type {
  ChangePasswordPayload,
  LoginPayload,
  OkResponse,
  RegisterPayload,
  UserRead,
} from '../model/types'

export const authApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    getMe: builder.query<UserRead, void>({
      query: () => ({
        url: '/auth/me',
      }),
      providesTags: ['User'],
      extraOptions: {
        skipAuthRedirect: true,
      },
    }),
    login: builder.mutation<UserRead, LoginPayload>({
      query: (data) => ({
        url: '/auth/login',
        method: 'POST',
        data,
      }),
      invalidatesTags: ['User'],
      extraOptions: {
        skipAuthRedirect: true,
      },
    }),
    register: builder.mutation<UserRead, RegisterPayload>({
      query: (data) => ({
        url: '/auth/register',
        method: 'POST',
        data,
      }),
      invalidatesTags: ['User'],
    }),
    logout: builder.mutation<OkResponse, void>({
      query: () => ({
        url: '/auth/logout',
        method: 'POST',
      }),
      invalidatesTags: ['User'],
    }),
    changePassword: builder.mutation<OkResponse, ChangePasswordPayload>({
      query: (data) => ({
        url: '/auth/change-password',
        method: 'POST',
        data,
      }),
    }),
    disconnectGithub: builder.mutation<OkResponse, void>({
      query: () => ({
        url: '/auth/github/connect',
        method: 'DELETE',
      }),
      invalidatesTags: ['User'],
    }),
  }),
})

export const {
  useChangePasswordMutation,
  useDisconnectGithubMutation,
  useGetMeQuery,
  useLazyGetMeQuery,
  useLoginMutation,
  useLogoutMutation,
  useRegisterMutation,
} = authApi
