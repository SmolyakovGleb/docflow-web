import { describe, expect, it } from 'vitest'
import { authSlice, clearUser, setUser } from '@/features/auth/model/authSlice'
import type { UserRead } from '@/features/auth/model/types'

const fakeUser: UserRead = {
  id: '00000000-0000-0000-0000-000000000001',
  email: 'user@example.com',
  display_name: 'Test User',
  github_linked: false,
  github_login: null,
}

describe('authSlice', () => {
  it('starts unauthenticated', () => {
    const state = authSlice.reducer(undefined, { type: '@@INIT' })
    expect(state.isAuthenticated).toBe(false)
    expect(state.user).toBeNull()
  })

  it('setUser marks state authenticated', () => {
    const initial = { user: null, isAuthenticated: false }
    const next = authSlice.reducer(initial, setUser(fakeUser))
    expect(next.isAuthenticated).toBe(true)
    expect(next.user?.email).toBe(fakeUser.email)
  })

  it('clearUser resets state', () => {
    const state = { user: fakeUser, isAuthenticated: true }
    const next = authSlice.reducer(state, clearUser())
    expect(next.isAuthenticated).toBe(false)
    expect(next.user).toBeNull()
  })
})
