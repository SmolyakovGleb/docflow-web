import { createApi } from '@reduxjs/toolkit/query/react'
import { axiosBaseQuery } from './axiosBaseQuery'

export const baseApi = createApi({
  reducerPath: 'api',
  baseQuery: axiosBaseQuery(),
  tagTypes: [
    'Admin',
    'Task',
    'TaskLog',
    'Project',
    'History',
    'Dictionary',
    'NotificationChannel',
    'User',
    'Health',
    'Analytics',
  ],
  endpoints: () => ({}),
})
