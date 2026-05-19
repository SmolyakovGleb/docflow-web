import type { TaskStatus } from '@/features/tasks/model/types'

export const ANALYTICS_TASK_STATUSES = [
  'queued',
  'running',
  'done',
  'failed',
  'published',
  'conflict',
] as const satisfies readonly TaskStatus[]

export type AnalyticsTaskStatus = (typeof ANALYTICS_TASK_STATUSES)[number]

export interface AnalyticsDailyBucket {
  date: string
  queued: number
  running: number
  done: number
  failed: number
  published: number
  conflict: number
}

export interface AnalyticsTopError {
  error_type: string
  count: number
}

export interface AnalyticsResponse {
  total_tasks: number
  published_count: number
  success_rate: number
  avg_duration_seconds: number
  tasks_by_status: Record<AnalyticsTaskStatus, number>
  tasks_per_day: AnalyticsDailyBucket[]
  top_errors: AnalyticsTopError[]
}

export interface AnalyticsFilters {
  projectId: string | null
  from: string | null
  to: string | null
  teamId: string | null
}

export interface AnalyticsQueryParams extends Record<string, unknown> {
  project_id?: string
  from?: string
  to?: string
  team_id?: string
}

export interface AnalyticsTasksPerDayPoint extends AnalyticsDailyBucket {
  label: string
  total: number
}

export interface AnalyticsSuccessRatePoint {
  date: string
  label: string
  successRate: number | null
  successful: number
  terminal: number
}
