import type { GithubConnectResponse } from '@/features/auth/model/types'
import { axiosInstance } from '@/shared/lib/axios'

// Раньше тут был прямой переход на /api/auth/github/connect (302 → GitHub).
// Теперь connect — JSON-эндпоинт: запрашиваем authorize_url с Bearer-заголовком
// (его браузерная навигация не несёт, поэтому именно XHR), затем переходим на
// GitHub. Так привязка работает за гейтвеем, который режет куки.
export async function redirectToGithubConnect(
  returnTo = `${window.location.pathname}${window.location.search}${window.location.hash}`,
  reconnect = false,
) {
  const params: Record<string, unknown> = {}
  if (returnTo) {
    params.return_to = returnTo
  }
  if (reconnect) {
    params.reconnect = true
  }

  try {
    const { data } = await axiosInstance.get<GithubConnectResponse>('/auth/github/connect', {
      params,
    })
    if (data.authorize_url) {
      window.location.assign(data.authorize_url)
    } else {
      // уже привязан — обновляем страницу, чтобы отразить статус
      window.location.reload()
    }
  } catch {
    // нет сессии или ошибка — на логин
    window.location.assign('/login')
  }
}
