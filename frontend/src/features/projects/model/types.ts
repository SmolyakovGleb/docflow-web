export interface Project {
  id: string
  name: string
  source_repo: string
  source_branch: string
  target_repo: string
  target_branch: string
  exclude_patterns: string[]
  webhook_url: string
  version: number
  created_at: string
  team_id: string | null
  is_team_project: boolean
}

export interface ProjectCreatePayload {
  name: string
  source_repo: string
  source_branch: string
  target_repo: string
  target_branch: string
  exclude_patterns: string[]
  team_id?: string | null
}

export interface ProjectCreateResponse extends Project {
  webhook_secret: string
}

export interface ProjectUpdatePayload {
  name?: string
  source_branch?: string
  target_branch?: string
  exclude_patterns?: string[]
}

export interface ProjectWebhookSecretResponse {
  webhook_secret: string
}

export interface ProjectFilesResponse {
  items: string[]
}

export type GithubRepo = string

export interface ProjectTaskPreview {
  id: string
  project_id: string | null
  file_path: string
  status: 'queued' | 'running' | 'done' | 'failed' | 'published'
  created_at: string
  updated_at: string
}

export interface ProjectTaskListResponse {
  items: ProjectTaskPreview[]
  total: number
  limit: number
  offset: number
}
