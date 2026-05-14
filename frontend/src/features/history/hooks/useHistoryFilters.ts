import { useCallback, useEffect, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'

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

function buildNormalizedParams(filters: {
  projectId: string | null
  publishedBy: string | null
  from: string | null
  to: string | null
}) {
  const params = new URLSearchParams()

  if (filters.projectId) {
    params.set('project_id', filters.projectId)
  }
  if (filters.publishedBy) {
    params.set('published_by', filters.publishedBy)
  }
  if (filters.from) {
    params.set('from', filters.from)
  }
  if (filters.to) {
    params.set('to', filters.to)
  }

  return params
}

export function useHistoryFilters() {
  const [searchParams, setSearchParams] = useSearchParams()

  const filters = useMemo(
    () => ({
      projectId: getValidUuid(searchParams.get('project_id')),
      publishedBy: getValidUuid(searchParams.get('published_by')),
      from: getValidDate(searchParams.get('from')),
      to: getValidDate(searchParams.get('to')),
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
    (next: {
      projectId?: string | null
      publishedBy?: string | null
      from?: string | null
      to?: string | null
    }) => {
      const params = new URLSearchParams(searchParams)

      if ('projectId' in next) {
        if (next.projectId) {
          params.set('project_id', next.projectId)
        } else {
          params.delete('project_id')
        }
      }

      if ('publishedBy' in next) {
        if (next.publishedBy) {
          params.set('published_by', next.publishedBy)
        } else {
          params.delete('published_by')
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

      setSearchParams(params, { replace: true })
    },
    [searchParams, setSearchParams],
  )

  const resetFilters = useCallback(() => {
    setSearchParams({}, { replace: true })
  }, [setSearchParams])

  return { filters, setFilters, resetFilters }
}
