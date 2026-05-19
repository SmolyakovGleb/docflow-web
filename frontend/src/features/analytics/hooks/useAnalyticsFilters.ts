import { useCallback, useEffect, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { AnalyticsFilters } from '../model/types'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function getValidUuid(value: string | null) {
  if (!value) {
    return null
  }

  return UUID_PATTERN.test(value) ? value : null
}

function getValidDate(value: string | null) {
  if (!value) {
    return null
  }

  return Number.isNaN(Date.parse(value)) ? null : value
}

function buildNormalizedParams(filters: AnalyticsFilters) {
  const params = new URLSearchParams()

  if (filters.projectId) {
    params.set('project_id', filters.projectId)
  }
  if (filters.from) {
    params.set('from', filters.from)
  }
  if (filters.to) {
    params.set('to', filters.to)
  }
  if (filters.teamId) {
    params.set('team_id', filters.teamId)
  }

  return params
}

export function useAnalyticsFilters() {
  const [searchParams, setSearchParams] = useSearchParams()

  const filters = useMemo<AnalyticsFilters>(
    () => ({
      projectId: getValidUuid(searchParams.get('project_id')),
      from: getValidDate(searchParams.get('from')),
      to: getValidDate(searchParams.get('to')),
      teamId: getValidUuid(searchParams.get('team_id')),
    }),
    [searchParams],
  )

  useEffect(() => {
    const normalizedParams = buildNormalizedParams(filters)
    if (searchParams.toString() !== normalizedParams.toString()) {
      setSearchParams(normalizedParams, { replace: true })
    }
  }, [filters, searchParams, setSearchParams])

  const setFilters = useCallback(
    (next: Partial<AnalyticsFilters>) => {
      const params = new URLSearchParams(searchParams)

      if ('projectId' in next) {
        if (next.projectId) {
          params.set('project_id', next.projectId)
        } else {
          params.delete('project_id')
        }
      }

      if ('from' in next) {
        if (next.from) {
          params.set('from', next.from)
        } else {
          params.delete('from')
        }
      }

      if ('to' in next) {
        if (next.to) {
          params.set('to', next.to)
        } else {
          params.delete('to')
        }
      }

      if ('teamId' in next) {
        if (next.teamId) {
          params.set('team_id', next.teamId)
        } else {
          params.delete('team_id')
        }
      }

      setSearchParams(params, { replace: true })
    },
    [searchParams, setSearchParams],
  )

  const resetFilters = useCallback(() => {
    setSearchParams({}, { replace: true })
  }, [setSearchParams])

  return { filters, setFilters, resetFilters }
}
