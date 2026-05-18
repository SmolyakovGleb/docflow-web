export type InviteTokenStatus = 'active' | 'used' | 'expired'

export interface AdminUserRead {
  id: string
  email: string
  display_name: string | null
  github_linked: boolean
  is_admin: boolean
  task_count: number
  created_at: string
  invite_token_id: string | null
}

export interface AdminUserUpdate {
  is_admin: boolean
}

export interface InviteTokenRead {
  id: string
  token: string
  created_by_email: string
  used_by_email: string | null
  expires_at: string | null
  created_at: string
  status: InviteTokenStatus
}

export interface InviteTokenCreate {
  expires_in_days?: number | null
}

export interface AdminTaskRead {
  id: string
  file_path: string
  status: string
  created_at: string
  updated_at: string
  user_id: string
  user_email: string
  project_id: string | null
  project_name: string | null
}

export interface AdminTaskListResponse {
  items: AdminTaskRead[]
  total: number
}

export interface AdminTasksQuery {
  user_id?: string
  status?: string
  limit?: number
  offset?: number
}
