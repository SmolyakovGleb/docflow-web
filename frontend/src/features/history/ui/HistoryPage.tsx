import { skipToken } from '@reduxjs/toolkit/query'
import { AlertCircle, FileClock } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useGetProjectsQuery } from '@/features/projects/api/projectsApi'
import { Button } from '@/shared/ui/Button/Button'
import { EmptyState } from '@/shared/ui/EmptyState/EmptyState'
import { Skeleton } from '@/shared/ui/Skeleton/Skeleton'
import type { Project } from '@/features/projects/model/types'
import type { HistoryFilters, HistoryUserOption } from '../model/types'
import { useGetHistoryQuery } from '../api/historyApi'
import { useHistoryFilters } from '../hooks/useHistoryFilters'
import { HistoryItem } from './HistoryItem'
import { HistoryToolbar } from './HistoryToolbar'
import styles from './HistoryPage.module.css'

const PAGE_SIZE = 20

function buildUserOptions(
  publishers: HistoryUserOption[],
  selectedPublishedBy: string | null,
  selectedFallbackLabel: string,
): HistoryUserOption[] {
  const map = new Map<string, HistoryUserOption>(
    publishers.map((publisher) => [publisher.id, publisher]),
  )

  if (selectedPublishedBy && !map.has(selectedPublishedBy)) {
    map.set(selectedPublishedBy, {
      id: selectedPublishedBy,
      label: selectedFallbackLabel,
    })
  }

  return [...map.values()].sort((left, right) => left.label.localeCompare(right.label))
}

function HistoryListSkeleton() {
  return (
    <div className={styles.list}>
      {Array.from({ length: 4 }).map((_, index) => (
        <div key={index} className={styles.skeletonCard}>
          <div className={styles.skeletonHeader}>
            <Skeleton variant="circle" width={26} height={26} />
            <div className={styles.skeletonMeta}>
              <Skeleton width={140} height={14} />
              <Skeleton width={100} height={12} />
            </div>
          </div>
          <div className={styles.skeletonPaths}>
            <Skeleton variant="rect" height={62} />
            <Skeleton variant="rect" height={62} />
          </div>
          <Skeleton width={220} height={12} />
        </div>
      ))}
    </div>
  )
}

interface HistoryPageContentProps {
  filters: HistoryFilters
  projects: Project[]
  isProjectsLoading: boolean
  setFilters: (next: {
    projectId?: string | null
    publishedBy?: string | null
    from?: string | null
    to?: string | null
  }) => void
  resetFilters: () => void
}

function HistoryPageContent({
  filters,
  projects,
  isProjectsLoading,
  setFilters,
  resetFilters,
}: HistoryPageContentProps) {
  const { t } = useTranslation('history')
  const [page, setPage] = useState(0)
  const selectedProjectExists =
    !filters.projectId || projects.some((project) => project.id === filters.projectId)
  const queryArgs = useMemo(() => {
    if (filters.projectId && isProjectsLoading) {
      return skipToken
    }

    const params: {
      project_id?: string
      published_by?: string
      from?: string
      to?: string
      limit: number
      offset: number
    } = {
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
    }

    if (filters.projectId && selectedProjectExists) {
      params.project_id = filters.projectId
    }
    if (filters.publishedBy) {
      params.published_by = filters.publishedBy
    }
    if (filters.from) {
      params.from = filters.from
    }
    if (filters.to) {
      params.to = filters.to
    }

    return params
  }, [
    filters.from,
    filters.projectId,
    filters.publishedBy,
    filters.to,
    isProjectsLoading,
    page,
    selectedProjectExists,
  ])

  const { data, isLoading, isFetching, error, refetch } = useGetHistoryQuery(queryArgs, {
    refetchOnMountOrArgChange: true,
  })
  const items = useMemo(() => data?.items ?? [], [data?.items])
  const totalCount = data?.total ?? 0
  const canLoadMore = items.length < totalCount
  const userOptions = useMemo(
    () => buildUserOptions(data?.publishers ?? [], filters.publishedBy, t('toolbar.selected_user')),
    [data?.publishers, filters.publishedBy, t],
  )
  const hasFilters = Boolean(filters.projectId || filters.publishedBy || filters.from || filters.to)
  const hasItems = items.length > 0

  useEffect(() => {
    if (!isProjectsLoading && filters.projectId && !selectedProjectExists) {
      setFilters({ projectId: null })
    }
  }, [filters.projectId, isProjectsLoading, selectedProjectExists, setFilters])

  return (
    <section className={styles.page}>
      <HistoryToolbar
        projects={projects}
        userOptions={userOptions}
        selectedProjectId={selectedProjectExists ? filters.projectId : null}
        selectedPublishedBy={filters.publishedBy}
        from={filters.from}
        to={filters.to}
        totalCount={totalCount}
        onProjectChange={(projectId) => setFilters({ projectId })}
        onPublishedByChange={(publishedBy) => setFilters({ publishedBy })}
        onDateRangeChange={({ from, to }) => setFilters({ from, to })}
        onReset={resetFilters}
      />

      {isLoading ? (
        <HistoryListSkeleton />
      ) : error && !hasItems ? (
        <EmptyState
          icon={AlertCircle}
          title={t('error.title')}
          description={t('error.description')}
          actions={
            <Button variant="secondary" onClick={() => void refetch()}>
              {t('error.retry')}
            </Button>
          }
        />
      ) : !hasItems ? (
        <EmptyState
          icon={FileClock}
          title={t(hasFilters ? 'empty.filtered_title' : 'empty.title')}
          description={t(hasFilters ? 'empty.filtered_description' : 'empty.description')}
          actions={
            hasFilters ? (
              <Button variant="secondary" onClick={resetFilters}>
                {t('empty.reset')}
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          <div className={styles.list}>
            {items.map((item) => (
              <HistoryItem key={item.id} item={item} />
            ))}
          </div>

          {error ? (
            <div className={styles.loadMore}>
              <Button variant="secondary" onClick={() => void refetch()} loading={isFetching}>
                {t('error.retry')}
              </Button>
            </div>
          ) : canLoadMore ? (
            <div className={styles.loadMore}>
              <Button
                variant="secondary"
                onClick={() => setPage((current) => current + 1)}
                loading={isFetching}
              >
                {t('actions.load_more')}
              </Button>
            </div>
          ) : null}
        </>
      )}
    </section>
  )
}

export function HistoryPage() {
  const { filters, setFilters, resetFilters } = useHistoryFilters()
  const { data: projects = [], isLoading: isProjectsLoading } = useGetProjectsQuery()
  const filterKey = `${filters.projectId ?? ''}:${filters.publishedBy ?? ''}:${filters.from ?? ''}:${filters.to ?? ''}`

  return (
    <HistoryPageContent
      key={filterKey}
      filters={filters}
      projects={projects}
      isProjectsLoading={isProjectsLoading}
      setFilters={setFilters}
      resetFilters={resetFilters}
    />
  )
}
