export interface TeamCreatePayload {
  name: string
}

export interface TeamRenamePayload {
  name: string
}

export interface TeamInviteCreatePayload {
  expires_in_days: number | null
}

export interface TeamJoinPayload {
  token: string
}

export type TeamInviteStatus = 'active' | 'used' | 'expired'
export type TeamMemberRole = 'owner' | 'member'

export interface TeamInvitePreview {
  team_name: string
  member_count: number
}

export interface TeamMemberRead {
  user_id: string
  email: string
  display_name: string | null
  github_linked: boolean
  joined_at: string
  role: TeamMemberRole
}

export interface TeamDetail {
  id: string
  name: string
  owner_id: string
  created_at: string
  member_count: number
  members: TeamMemberRead[]
}

export interface TeamInviteRead {
  id: string
  token: string
  created_by_email: string
  used_by_email: string | null
  expires_at: string | null
  created_at: string
  status: TeamInviteStatus
}
