export interface CommitGroup {
  id: string
  project_id: string
  github_sha: string
  github_ref: string
  commit_message: string | null
  commit_author_name: string | null
  commit_author_login: string | null
  file_paths: string[]
  status: 'pending_confirmation' | 'processing' | 'done' | 'cancelled'
  created_at: string
  confirmed_at: string | null
}

export interface CommitGroupListResponse {
  items: CommitGroup[]
  total: number
}
