// Хранилище JWT-сессии в localStorage.
//
// За гейтвеем VibeCode httpOnly-кука режется (Set-Cookie вырезается из ответа),
// поэтому токен ездит в заголовке Authorization: Bearer. Кука остаётся как
// fallback для сред без гейтвея (локалка), но источник правды здесь.

const ACCESS_TOKEN_KEY = 'docflow_access_token'

export function getAccessToken(): string | null {
  try {
    return localStorage.getItem(ACCESS_TOKEN_KEY)
  } catch {
    return null
  }
}

export function setAccessToken(token: string): void {
  try {
    localStorage.setItem(ACCESS_TOKEN_KEY, token)
  } catch {
    // localStorage может быть недоступен (приватный режим) — молча игнорируем
  }
}

export function clearAccessToken(): void {
  try {
    localStorage.removeItem(ACCESS_TOKEN_KEY)
  } catch {
    // noop
  }
}
