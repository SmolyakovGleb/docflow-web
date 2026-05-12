import type { AxiosBaseQueryError } from '@/shared/api/axiosBaseQuery'
import i18n from '@/shared/lib/i18n'

const BACKEND_TO_KEY: Record<string, string> = {
  'Email already registered': 'auth:errors.email_taken',
  'Invalid credentials': 'auth:errors.invalid_credentials',
  'Not authenticated': 'errors:session_expired',
  'Current password is incorrect': 'auth:errors.current_password_incorrect',
  'GitHub account already linked to another user': 'errors:github_already_linked',
  'GitHub account is not linked': 'errors:github_not_linked',
}

export function translateBackendError(detail: string): string {
  const key = BACKEND_TO_KEY[detail]
  if (!key) {
    return i18n.t('errors:generic')
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
