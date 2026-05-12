import { createApi } from '@reduxjs/toolkit/query/react'
import { axiosBaseQuery } from './axiosBaseQuery'

export const baseApi = createApi({
  reducerPath: 'api',
  baseQuery: axiosBaseQuery(),
  tagTypes: ['Task', 'Project', 'History', 'Dictionary', 'NotificationChannel', 'User', 'Health'],
  endpoints: () => ({}),
})
