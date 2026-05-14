import { baseApi } from '@/shared/api/baseApi'
import type { HistoryQueryParams, HistoryResponse } from '../model/types'

export const historyApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    getHistory: builder.query<HistoryResponse, HistoryQueryParams>({
      query: (params) => ({
        url: '/history',
        params: Object.fromEntries(
          Object.entries(params).filter(
            ([, value]) => value !== null && value !== undefined && value !== '',
          ),
        ),
      }),
      serializeQueryArgs: ({ endpointName, queryArgs }) => ({
        endpointName,
        project_id: queryArgs.project_id ?? null,
        published_by: queryArgs.published_by ?? null,
        from: queryArgs.from ?? null,
        to: queryArgs.to ?? null,
      }),
      merge: (currentCache, newData, { arg }) => {
        currentCache.publishers = newData.publishers
        currentCache.total = newData.total
        currentCache.limit = newData.limit
        currentCache.offset = newData.offset

        if ((arg.offset ?? 0) === 0) {
          currentCache.items = newData.items
          return
        }

        const seenIds = new Set(currentCache.items.map((item) => item.id))
        for (const item of newData.items) {
          if (!seenIds.has(item.id)) {
            currentCache.items.push(item)
            seenIds.add(item.id)
          }
        }
      },
      forceRefetch: ({ currentArg, previousArg }) =>
        currentArg?.project_id !== previousArg?.project_id ||
        currentArg?.published_by !== previousArg?.published_by ||
        currentArg?.from !== previousArg?.from ||
        currentArg?.to !== previousArg?.to ||
        currentArg?.offset !== previousArg?.offset ||
        currentArg?.limit !== previousArg?.limit,
      providesTags: ['History'],
    }),
  }),
})

export const { useGetHistoryQuery } = historyApi
