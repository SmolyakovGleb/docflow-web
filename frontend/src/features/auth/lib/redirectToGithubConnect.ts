export function redirectToGithubConnect(
  returnTo = `${window.location.pathname}${window.location.search}${window.location.hash}`,
) {
  const params = new URLSearchParams()
  if (returnTo) {
    params.set('return_to', returnTo)
  }

  const nextUrl = params.size
    ? `/api/auth/github/connect?${params.toString()}`
    : '/api/auth/github/connect'

  window.location.assign(nextUrl)
}
