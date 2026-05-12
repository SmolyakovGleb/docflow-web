import type { BaseQueryFn, QueryReturnValue } from '@reduxjs/toolkit/query'
import type { AxiosError, AxiosRequestConfig, Method } from 'axios'
import { clearUser } from '@/features/auth/model/authSlice'
import { axiosInstance } from '@/shared/lib/axios'

export interface AxiosBaseQueryArgs {
  url: string
  method?: Method
  data?: unknown
  params?: Record<string, unknown>
  headers?: AxiosRequestConfig['headers']
}

export interface AxiosBaseQueryError {
  status?: number
  data?: unknown
}

interface AxiosBaseQueryExtraOptions {
  skipAuthRedirect?: boolean
}

function redirectToLogin() {
  if (window.location.pathname === '/login') {
    return
  }

  window.location.assign('/login')
}

export const axiosBaseQuery =
  (): BaseQueryFn<
    AxiosBaseQueryArgs,
    unknown,
    AxiosBaseQueryError,
    AxiosBaseQueryExtraOptions,
    Record<string, never>
  > =>
  async (
    args,
    api,
    extraOptions,
  ): Promise<QueryReturnValue<unknown, AxiosBaseQueryError, Record<string, never>>> => {
    try {
      const config: AxiosRequestConfig = {
        url: args.url,
        method: args.method ?? 'GET',
      }

      if (typeof args.data !== 'undefined') {
        config.data = args.data
      }

      if (typeof args.params !== 'undefined') {
        config.params = args.params
      }

      if (typeof args.headers !== 'undefined') {
        config.headers = args.headers
      }

      const result = await axiosInstance<unknown>(config)

      return { data: result.data }
    } catch (error) {
      const axiosError = error as AxiosError<unknown>
      const status = axiosError.response?.status
      const data = axiosError.response?.data

      if (status === 401 && !extraOptions?.skipAuthRedirect) {
        api.dispatch(clearUser())
        redirectToLogin()
      }

      const queryError: AxiosBaseQueryError = {}

      if (typeof status !== 'undefined') {
        queryError.status = status
      }

      if (typeof data !== 'undefined') {
        queryError.data = data
      }

      return {
        error: queryError,
      }
    }
  }
