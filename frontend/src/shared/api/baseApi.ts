import { createApi } from '@reduxjs/toolkit/query/react'
import { axiosBaseQuery } from '../lib/axios'

export const baseApi = createApi({
  reducerPath: 'api',
  baseQuery: axiosBaseQuery(),
  tagTypes: ['Task', 'Project', 'History', 'Dictionary', 'NotificationChannel', 'User', 'Health'],
  endpoints: () => ({}),
})
