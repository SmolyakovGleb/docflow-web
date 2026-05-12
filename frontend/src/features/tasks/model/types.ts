export type TaskStatus = 'queued' | 'running' | 'done' | 'failed' | 'published' | 'conflict'

export interface TaskSummary {
  id: string
  project_id: string
  file_path: string
  github_sha: string | null
  commit_message: string | null
  status: TaskStatus
  created_at: string
  updated_at: string
}

export interface TaskDetail extends TaskSummary {
  github_ref: string
  source_file_sha: string | null
  target_file_sha: string | null
  original_content: string
  translated_content: string | null
  log: string | null
  error: string | null
  publications: Publication[]
}

export interface Publication {
  id: string
  target_repo: string
  target_path: string
  commit_sha: string
  commit_url: string
  published_by: { id: string; display_name: string; github_login: string }
  published_at: string
}

export interface TaskListResponse {
  items: TaskSummary[]
  total: number
  limit: number
  offset: number
}

export interface TaskListFilters {
  status: TaskStatus | null
  projectId: string | null
}
