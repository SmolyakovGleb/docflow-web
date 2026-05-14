import type { UserRead } from '@/features/auth/model/types'

export interface HistoryPublication {
  id: string
  task_id: string
  file_path: string | null
  source_repo: string | null
  target_repo: string
  target_path: string
  commit_sha: string
  commit_url: string
  published_by: UserRead
  published_at: string
  can_open_task: boolean
}

export interface HistoryResponse {
  items: HistoryPublication[]
  publishers: HistoryUserOption[]
  total: number
  limit: number
  offset: number
}

export interface HistoryFilters {
  projectId: string | null
  publishedBy: string | null
  from: string | null
  to: string | null
}

export interface HistoryQueryParams extends Record<string, unknown> {
  project_id?: string
  published_by?: string
  from?: string
  to?: string
  limit?: number
  offset?: number
}

export interface HistoryUserOption {
  id: string
  label: string
}
