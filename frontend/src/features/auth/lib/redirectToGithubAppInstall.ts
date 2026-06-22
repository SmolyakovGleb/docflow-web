import { axiosInstance } from '@/shared/lib/axios'

interface GithubInstallResponse {
  install_url: string
}

// Аналогично redirectToGithubConnect: install — JSON-эндпоинт, запрашиваем
// install_url с Bearer-заголовком (браузерная навигация его не несёт за гейтвеем,
// режущим куки), затем переходим на страницу установки GitHub App.
export async function redirectToGithubAppInstall(
  returnTo = `${window.location.pathname}${window.location.search}${window.location.hash}`,
) {
  const params: Record<string, unknown> = {}
  if (returnTo) {
    params.return_to = returnTo
  }

  const { data } = await axiosInstance.get<GithubInstallResponse>('/auth/github/install', {
    params,
  })
  window.location.assign(data.install_url)
}
