import { baseApi } from '@/shared/api/baseApi'
import { clearAccessToken, setAccessToken } from '@/shared/lib/authToken'
import type {
  AuthResult,
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
    login: builder.mutation<AuthResult, LoginPayload>({
      query: (data) => ({
        url: '/auth/login',
        method: 'POST',
        data,
      }),
      // Кладём токен синхронно, до инвалидации User → рефетча /auth/me с Bearer.
      transformResponse: (response: AuthResult) => {
        if (response?.access_token) {
          setAccessToken(response.access_token)
        }
        return response
      },
      invalidatesTags: ['User'],
      extraOptions: {
        skipAuthRedirect: true,
      },
    }),
    register: builder.mutation<AuthResult, RegisterPayload>({
      query: (data) => ({
        url: '/auth/register',
        method: 'POST',
        data,
      }),
      transformResponse: (response: AuthResult) => {
        if (response?.access_token) {
          setAccessToken(response.access_token)
        }
        return response
      },
      invalidatesTags: ['User'],
    }),
    logout: builder.mutation<OkResponse, void>({
      query: () => ({
        url: '/auth/logout',
        method: 'POST',
      }),
      invalidatesTags: ['User'],
      async onQueryStarted(_arg, { queryFulfilled }) {
        try {
          await queryFulfilled
        } finally {
          clearAccessToken()
        }
      },
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
