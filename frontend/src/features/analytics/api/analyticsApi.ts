import { baseApi } from '@/shared/api/baseApi'
import type { AnalyticsQueryParams, AnalyticsResponse } from '../model/types'

function cleanParams(params: AnalyticsQueryParams | void) {
  return Object.fromEntries(
    Object.entries(params ?? {}).filter(
      ([, value]) => value !== null && value !== undefined && value !== '',
    ),
  )
}

export const analyticsApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    getAnalytics: builder.query<AnalyticsResponse, AnalyticsQueryParams | undefined>({
      query: (params) => ({
        url: '/analytics',
        params: cleanParams(params),
      }),
      serializeQueryArgs: ({ endpointName, queryArgs }) => ({
        endpointName,
        project_id: queryArgs?.project_id ?? null,
        from: queryArgs?.from ?? null,
        to: queryArgs?.to ?? null,
        team_id: queryArgs?.team_id ?? null,
      }),
      providesTags: ['Analytics'],
    }),
    getAnalyticsStats: builder.query<AnalyticsResponse, void>({
      query: () => ({
        url: '/analytics',
      }),
      providesTags: ['Analytics'],
    }),
  }),
})

export const { useGetAnalyticsQuery, useGetAnalyticsStatsQuery } = analyticsApi
