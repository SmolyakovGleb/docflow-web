import { skipToken } from '@reduxjs/toolkit/query'
import { AlertCircle, AlertTriangle, BarChart3, TrendingUp } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { useGetProjectsQuery } from '@/features/projects/api/projectsApi'
import type { Project } from '@/features/projects/model/types'
import { formatDate } from '@/shared/lib/date'
import { Button } from '@/shared/ui/Button/Button'
import { EmptyState } from '@/shared/ui/EmptyState/EmptyState'
import { Skeleton } from '@/shared/ui/Skeleton/Skeleton'
import { StatusPill } from '@/shared/ui/StatusPill/StatusPill'
import { toast } from '@/shared/ui/Toast/toast'
import { useGetAnalyticsQuery } from '../../api/analyticsApi'
import { useAnalyticsFilters } from '../../hooks/useAnalyticsFilters'
import { buildSuccessRateSeries } from '../../lib/buildSuccessRateSeries'
import { buildTasksPerDaySeries } from '../../lib/buildTasksPerDaySeries'
import { exportAnalyticsWorkbook } from '../../lib/exportAnalyticsWorkbook'
import { type AnalyticsTaskStatus } from '../../model/types'
import { AnalyticsToolbar } from '../AnalyticsToolbar'
import styles from './AnalyticsPage.module.css'

// Pipeline statuses only — "published" is excluded from the bar chart
// to avoid it dominating the stacked visualization.
const PIPELINE_STATUSES = ['queued', 'running', 'done', 'failed', 'conflict'] as const

const STATUS_COLORS: Record<AnalyticsTaskStatus, string> = {
  queued: 'var(--status-queued)',
  running: 'var(--status-running)',
  done: 'var(--status-done)',
  failed: 'var(--status-failed)',
  published: 'var(--status-published)',
  conflict: 'var(--status-conflict)',
}

function formatPercent(value: number) {
  return `${Math.round(value * 1000) / 10}%`
}

function formatCount(value: number) {
  return new Intl.NumberFormat('ru-RU').format(value)
}

function formatDuration(value: number) {
  const totalSeconds = Math.max(0, Math.round(value))
  if (totalSeconds < 60) return `${totalSeconds}с`
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return seconds > 0 ? `${minutes}м ${seconds}с` : `${minutes}м`
}

function getProjectById(projects: Project[], projectId: string | null) {
  if (!projectId) return undefined
  return projects.find((p) => p.id === projectId)
}

function formatScopeLabel(from: string | null, to: string | null, fallback: string) {
  if (from && to) return `${formatDate(from)} – ${formatDate(to)}`
  if (from) return `${formatDate(from)} – …`
  if (to) return `… – ${formatDate(to)}`
  return fallback
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function AnalyticsPageSkeleton() {
  return (
    <section className={styles.page}>
      <div className={styles.headerSkeleton}>
        <Skeleton width={260} height={34} />
        <div className={styles.statsStripSkeleton}>
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} width={120} height={14} />
          ))}
        </div>
        <Skeleton width="100%" height={54} />
      </div>
      <div className={styles.charts}>
        <Skeleton variant="rect" height={300} />
        <div className={styles.skeletonRow}>
          <Skeleton variant="rect" height={240} />
          <Skeleton variant="rect" height={240} />
        </div>
      </div>
    </section>
  )
}

// ── Bar chart tooltip ─────────────────────────────────────────────────────────

function CustomBarTooltip({
  active,
  payload,
  label,
  t,
  taskStatusT,
}: {
  active?: boolean
  payload?: Array<{ dataKey?: string; value?: number; color?: string }>
  label?: string
  t: (key: string, options?: Record<string, unknown>) => string
  taskStatusT: (key: string) => string
}) {
  if (!active || !payload?.length) return null

  const rows = payload.filter(
    (item): item is { dataKey: string; value: number; color?: string } =>
      typeof item.dataKey === 'string' && typeof item.value === 'number' && item.value > 0,
  )
  const total = rows.reduce((sum, item) => sum + item.value, 0)

  return (
    <div className={styles.tooltip}>
      <div className={styles.tooltipTitle}>{label}</div>
      <div className={styles.tooltipMeta}>{t('charts.tasks_per_day.total', { count: total })}</div>
      <div className={styles.tooltipList}>
        {rows.map((item) => (
          <div key={item.dataKey} className={styles.tooltipRow}>
            <span className={styles.tooltipLabel}>
              <span className={styles.tooltipDot} style={{ background: item.color }} />
              {taskStatusT(`status.${item.dataKey}`)}
            </span>
            <span className={styles.tooltipValue}>{item.value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Success rate tooltip ──────────────────────────────────────────────────────

function CustomLineTooltip({
  active,
  payload,
  label,
  t,
}: {
  active?: boolean
  payload?: Array<{ value?: number | null; payload?: { successful: number; terminal: number } }>
  label?: string
  t: (key: string, options?: Record<string, unknown>) => string
}) {
  if (!active || !payload?.length) return null

  const point = payload[0]?.payload
  const rawValue = payload[0]?.value

  return (
    <div className={styles.tooltip}>
      <div className={styles.tooltipTitle}>{label}</div>
      <div className={styles.tooltipRow}>
        <span className={styles.tooltipLabel}>{t('charts.success_rate.value')}</span>
        <span className={styles.tooltipValue}>
          {typeof rawValue === 'number' ? `${rawValue}%` : t('charts.success_rate.no_terminal')}
        </span>
      </div>
      {point ? (
        <div className={styles.tooltipMeta}>
          {t('charts.success_rate.completed', {
            successful: point.successful,
            terminal: point.terminal,
          })}
        </div>
      ) : null}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function AnalyticsPage() {
  const { t } = useTranslation(['analytics', 'tasks'])
  const { filters, setFilters, resetFilters } = useAnalyticsFilters()
  const [isExporting, setExporting] = useState(false)
  const { data: projects = [], isLoading: isProjectsLoading } = useGetProjectsQuery()
  const selectedProjectExists =
    !filters.projectId || projects.some((p) => p.id === filters.projectId)

  const queryArgs = useMemo(() => {
    if (filters.projectId && isProjectsLoading) return skipToken
    const params: { project_id?: string; from?: string; to?: string } = {}
    if (selectedProjectExists && filters.projectId) params.project_id = filters.projectId
    if (filters.from) params.from = filters.from
    if (filters.to) params.to = filters.to
    return params
  }, [filters.from, filters.projectId, filters.to, isProjectsLoading, selectedProjectExists])

  const { data, isLoading, error, refetch } = useGetAnalyticsQuery(queryArgs, {
    refetchOnMountOrArgChange: true,
  })

  useEffect(() => {
    if (!isProjectsLoading && filters.projectId && !selectedProjectExists) {
      setFilters({ projectId: null })
    }
  }, [filters.projectId, isProjectsLoading, selectedProjectExists, setFilters])

  const selectedProject = useMemo(
    () => getProjectById(projects, selectedProjectExists ? filters.projectId : null),
    [filters.projectId, projects, selectedProjectExists],
  )

  const tasksSeries = useMemo(
    () => buildTasksPerDaySeries(data?.tasks_per_day ?? []),
    [data?.tasks_per_day],
  )
  const successSeries = useMemo(
    () => buildSuccessRateSeries(data?.tasks_per_day ?? []),
    [data?.tasks_per_day],
  )
  const topErrors = useMemo(() => (data?.top_errors ?? []).slice(0, 5), [data?.top_errors])
  const maxErrorCount = topErrors.reduce((max, item) => Math.max(max, item.count), 0)
  const totalErrorCount = topErrors.reduce((sum, item) => sum + item.count, 0)
  const hasFilters = Boolean(filters.projectId || filters.from || filters.to)
  const hasData = Boolean(data && data.total_tasks > 0)
  const exportDisabled = !data || data.tasks_per_day.length === 0

  const pipelineTotal = useMemo(
    () =>
      (data?.tasks_per_day ?? []).reduce(
        (sum, d) => sum + PIPELINE_STATUSES.reduce((s, k) => s + (d[k] ?? 0), 0),
        0,
      ),
    [data?.tasks_per_day],
  )

  const avgSuccessRate = useMemo(() => {
    const pts = successSeries.filter((p) => p.successRate !== null)
    if (!pts.length) return null
    return Math.round((pts.reduce((s, p) => s + (p.successRate ?? 0), 0) / pts.length) * 10) / 10
  }, [successSeries])

  const scopeLabel = useMemo(
    () => formatScopeLabel(filters.from, filters.to, t('analytics:toolbar.all_dates')),
    [filters.from, filters.to, t],
  )
  const selectedScope = selectedProject?.name ?? t('analytics:toolbar.all_projects')

  const handleExport = async () => {
    if (!data || data.tasks_per_day.length === 0) return
    const fileName = selectedProject
      ? `analytics-${selectedProject.name.toLowerCase().replace(/\s+/g, '-')}.xlsx`
      : 'analytics.xlsx'
    setExporting(true)
    try {
      await exportAnalyticsWorkbook({
        analytics: data,
        fileName,
        projectName: selectedProject?.name ?? t('analytics:toolbar.all_projects'),
        periodLabel: scopeLabel,
        labels: {
          workbookTitle: t('analytics:title'),
          generatedAt: t('analytics:charts.export.generated_at', { defaultValue: 'Сформировано' }),
          project: t('analytics:toolbar.project'),
          period: t('analytics:toolbar.date_range'),
          summarySheet: t('analytics:charts.export.summary_sheet', { defaultValue: 'Сводка' }),
          dailySheet: t('analytics:charts.export.daily_sheet', { defaultValue: 'По дням' }),
          errorsSheet: t('analytics:charts.export.errors_sheet', { defaultValue: 'Ошибки' }),
          metricsSection: t('analytics:charts.export.metrics_section', {
            defaultValue: 'Ключевые метрики',
          }),
          statusesSection: t('analytics:charts.export.statuses_section', {
            defaultValue: 'Статусы',
          }),
          totalTasks: t('analytics:stats.total.label'),
          successRate: t('analytics:stats.success.label'),
          avgDuration: t('analytics:stats.duration.label'),
          publishedCount: t('analytics:stats.published.label'),
          totalErrors: t('analytics:charts.errors.total', { defaultValue: 'Всего сбоев' }),
          count: t('analytics:charts.export.count', { defaultValue: 'Количество' }),
          share: t('analytics:charts.export.share', { defaultValue: 'Доля' }),
          noErrors: t('analytics:charts.errors.empty'),
          dailyDate: t('analytics:charts.export.date', { defaultValue: 'Дата' }),
          dailyTotal: t('analytics:charts.export.total', { defaultValue: 'Всего' }),
          dailySuccessful: t('analytics:charts.export.successful', { defaultValue: 'Успешно' }),
          dailySuccessRate: t('analytics:charts.export.success_rate', {
            defaultValue: 'Успешность',
          }),
          errorType: t('analytics:charts.export.error_type', { defaultValue: 'Тип ошибки' }),
          statusLabels: {
            queued: t('tasks:status.queued'),
            running: t('tasks:status.running'),
            done: t('tasks:status.done'),
            failed: t('tasks:status.failed'),
            published: t('tasks:status.published'),
            conflict: t('tasks:status.conflict'),
          },
        },
      })
      toast.success(
        t('analytics:toolbar.export_done_excel', { defaultValue: 'Excel экспортирован.' }),
      )
    } finally {
      setExporting(false)
    }
  }

  const tAnalytics = (key: string, options?: Record<string, unknown>) =>
    options ? t(`analytics:${key}`, options) : t(`analytics:${key}`)

  const summaryStats = useMemo(
    () => [
      {
        key: 'total',
        value: formatCount(data?.total_tasks ?? 0),
        label: t('analytics:stats.total.label'),
      },
      {
        key: 'published',
        value: formatCount(data?.published_count ?? 0),
        label: t('analytics:stats.published.label'),
      },
      {
        key: 'success',
        value: formatPercent(data?.success_rate ?? 0),
        label: t('analytics:stats.success.label'),
        highlight: true,
      },
      {
        key: 'duration',
        value: formatDuration(data?.avg_duration_seconds ?? 0),
        label: t('analytics:stats.duration.label'),
      },
    ],
    [data?.avg_duration_seconds, data?.published_count, data?.success_rate, data?.total_tasks, t],
  )

  // Show skeleton only on initial load (no stale data to show yet)
  if (isLoading && !data) return <AnalyticsPageSkeleton />

  if (error && !data) {
    return (
      <section className={styles.page}>
        <EmptyState
          icon={AlertCircle}
          title={t('analytics:error.title')}
          description={t('analytics:error.description')}
          actions={
            <Button variant="secondary" onClick={() => void refetch()}>
              {t('analytics:error.retry')}
            </Button>
          }
        />
      </section>
    )
  }

  if (!data) return null

  return (
    <section className={styles.page}>
      <AnalyticsToolbar
        projects={projects}
        stats={summaryStats}
        selectedProjectId={selectedProjectExists ? filters.projectId : null}
        from={filters.from}
        to={filters.to}
        totalTasks={data?.total_tasks ?? 0}
        exportDisabled={exportDisabled}
        exportLoading={isExporting}
        onProjectChange={(projectId) => setFilters({ projectId })}
        onDateRangeChange={({ from, to }) => setFilters({ from, to })}
        onReset={resetFilters}
        onExport={() => {
          void handleExport()
        }}
      />

      {!hasData ? (
        <EmptyState
          icon={BarChart3}
          title={t(hasFilters ? 'analytics:empty.filtered_title' : 'analytics:empty.title')}
          description={t(
            hasFilters ? 'analytics:empty.filtered_description' : 'analytics:empty.description',
          )}
          actions={
            hasFilters ? (
              <Button variant="secondary" onClick={resetFilters}>
                {t('analytics:empty.reset')}
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className={styles.charts}>
          {/* ── Stacked bar chart (full width) ─────────────────────────────── */}
          <div className={styles.panel}>
            <div className={styles.panelHeader}>
              <BarChart3 className={styles.panelIcon} size={14} />
              <span className={styles.panelTitle}>{t('analytics:charts.tasks_per_day.label')}</span>
              <div className={styles.panelMeta}>
                <span>{selectedScope}</span>
                <span className={styles.metaSep}>·</span>
                <span>{scopeLabel}</span>
                <span className={styles.metaSep}>·</span>
                <span>{formatCount(pipelineTotal)} задач</span>
              </div>
            </div>

            <div className={styles.legend}>
              {PIPELINE_STATUSES.map((status) => (
                <StatusPill key={status} status={status} className={styles.legendPill} />
              ))}
            </div>

            <div className={styles.chartBody}>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={tasksSeries} barCategoryGap={16} maxBarSize={28}>
                  <CartesianGrid stroke="var(--surface-tint)" vertical={false} />
                  <XAxis
                    dataKey="label"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: 'var(--text-dim)', fontSize: 11 }}
                  />
                  <YAxis
                    allowDecimals={false}
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: 'var(--text-dim)', fontSize: 11 }}
                  />
                  <Tooltip
                    cursor={{ fill: 'var(--surface-tint-soft)' }}
                    wrapperStyle={{ pointerEvents: 'none', zIndex: 5 }}
                    content={
                      <CustomBarTooltip t={tAnalytics} taskStatusT={(key) => t(`tasks:${key}`)} />
                    }
                  />
                  {PIPELINE_STATUSES.map((status) => (
                    <Bar
                      key={status}
                      dataKey={status}
                      stackId="tasks"
                      fill={STATUS_COLORS[status]}
                      fillOpacity={0.78}
                      {...(status === 'conflict' ? { radius: [4, 4, 0, 0] as const } : {})}
                    />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* ── Bottom 2-column row ─────────────────────────────────────────── */}
          <div className={styles.panelRow}>
            {/* Success rate chart */}
            <div className={styles.panelRowItem}>
              <div className={styles.panelHeader}>
                <TrendingUp className={styles.panelIcon} size={14} />
                <span className={styles.panelTitle}>
                  {t('analytics:charts.success_rate.label')}
                </span>
                <div className={styles.panelMeta}>
                  <span>среднее</span>
                  <strong className={styles.metaAccent}>{formatPercent(data.success_rate)}</strong>
                </div>
              </div>

              <div className={styles.chartBody}>
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={successSeries} margin={{ right: 28 }}>
                    <CartesianGrid stroke="var(--surface-tint)" vertical={false} />
                    <XAxis
                      dataKey="label"
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: 'var(--text-dim)', fontSize: 11 }}
                    />
                    <YAxis
                      domain={[0, 100]}
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: 'var(--text-dim)', fontSize: 11 }}
                      tickFormatter={(v: number) => `${v}%`}
                    />
                    <Tooltip
                      wrapperStyle={{ pointerEvents: 'none', zIndex: 5 }}
                      content={<CustomLineTooltip t={tAnalytics} />}
                    />
                    {avgSuccessRate !== null && (
                      <ReferenceLine
                        y={avgSuccessRate}
                        stroke="var(--border)"
                        strokeDasharray="4 3"
                        label={{
                          value: `${avgSuccessRate.toFixed(0)}%`,
                          position: 'insideTopRight',
                          fill: 'var(--text-dim)',
                          fontSize: 10,
                          dx: 4,
                        }}
                      />
                    )}
                    <Line
                      type="monotone"
                      dataKey="successRate"
                      stroke="var(--status-done)"
                      strokeWidth={1.5}
                      dot={false}
                      activeDot={{ r: 3, fill: 'var(--status-done)' }}
                      connectNulls={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Top errors list */}
            <div className={styles.panelRowItem}>
              <div className={styles.panelHeader}>
                <AlertTriangle className={styles.panelIcon} size={14} />
                <span className={styles.panelTitle}>{t('analytics:charts.errors.label')}</span>
                {totalErrorCount > 0 && (
                  <div className={styles.panelMeta}>
                    <span className={styles.metaError}>{totalErrorCount}</span>
                    <span>всего</span>
                  </div>
                )}
              </div>

              {topErrors.length === 0 ? (
                <div className={styles.errorsEmpty}>{t('analytics:charts.errors.empty')}</div>
              ) : (
                topErrors.map((item) => (
                  <div key={item.error_type} className={styles.errorRow}>
                    <div className={styles.errorPath}>
                      <span className={styles.errorDir}>error/</span>
                      {item.error_type}
                    </div>
                    <div className={styles.errorBarCell}>
                      <div className={styles.errorBarBg}>
                        <div
                          className={styles.errorBarFill}
                          style={{
                            width:
                              maxErrorCount > 0 ? `${(item.count / maxErrorCount) * 100}%` : '0%',
                          }}
                        />
                      </div>
                    </div>
                    <div className={styles.errorCount}>{item.count}</div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
