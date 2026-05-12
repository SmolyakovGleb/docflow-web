export interface UserRead {
  id: string
  email: string
  display_name: string | null
  github_linked: boolean
  github_login: string | null
}

export interface LoginPayload {
  email: string
  password: string
}

export interface RegisterPayload extends LoginPayload {
  display_name?: string | null
}

export interface ChangePasswordPayload {
  current_password: string
  new_password: string
}

export interface OkResponse {
  ok: true
}
