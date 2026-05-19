import type { AxiosBaseQueryError } from '@/shared/api/axiosBaseQuery'
import i18n from '@/shared/lib/i18n'

export function getApiErrorStatus(error: unknown): number | null {
  if (!error || typeof error !== 'object' || !('status' in error)) {
    return null
  }
  return typeof error.status === 'number' ? error.status : null
}

export function getApiErrorDetail(error: unknown): string | null {
  if (!error || typeof error !== 'object' || !('data' in error)) {
    return null
  }
  const data = error.data
  if (!data || typeof data !== 'object' || !('detail' in data)) {
    return null
  }
  return typeof data.detail === 'string' ? data.detail : null
}

const BACKEND_TO_KEY: Record<string, string> = {
  'Email already registered': 'auth:errors.email_taken',
  'Invalid credentials': 'auth:errors.invalid_credentials',
  'Not authenticated': 'errors:session_expired',
  'Current password is incorrect': 'auth:errors.current_password_incorrect',
  'GitHub account already linked to another user': 'errors:github_already_linked',
  'GitHub account is not linked': 'errors:github_not_linked',
  'Already in a team': 'teams:errors.already_in_team',
  'Not in a team': 'teams:errors.not_in_team',
  'Owner access required': 'teams:errors.owner_access_required',
  'Owner cannot leave the team; delete it instead': 'teams:errors.owner_cannot_leave',
  'Owner cannot remove themselves; delete the team instead':
    'teams:errors.owner_cannot_remove_self',
  'Cannot remove the team owner': 'teams:errors.cannot_remove_owner',
  'Member not found': 'teams:errors.member_not_found',
  'Team not found': 'teams:errors.team_not_found',
  'Invite not found': 'teams:errors.invite_not_found',
  'Cannot revoke an already used invite': 'teams:errors.invite_already_used',
  'Invalid or expired invite token': 'teams:errors.invalid_invite_token',
}

export function translateBackendError(detail: string): string {
  const key = BACKEND_TO_KEY[detail]
  if (!key) {
    // Unknown backend message — show it as-is so the user sees a meaningful error
    // instead of the generic fallback
    return detail
  }

  return i18n.t(key)
}

function extractErrorDetail(data: unknown): string | null {
  if (!data || typeof data !== 'object' || !('detail' in data)) {
    return null
  }

  return typeof data.detail === 'string' ? data.detail : null
}

export function translateApiError(error: unknown): string {
  if (!error || typeof error !== 'object') {
    return i18n.t('errors:generic')
  }

  const apiError = error as AxiosBaseQueryError

  if (apiError.status === 429) {
    return i18n.t('auth:errors.rate_limited')
  }

  if (typeof apiError.status === 'undefined') {
    return i18n.t('errors:network')
  }

  const detail = extractErrorDetail(apiError.data)
  if (detail) {
    return translateBackendError(detail)
  }

  return i18n.t('errors:generic')
}
