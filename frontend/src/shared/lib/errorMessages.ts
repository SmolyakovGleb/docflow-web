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
