import { createSlice, type PayloadAction } from '@reduxjs/toolkit'
import type { UserRead } from './types'

interface AuthState {
  user: UserRead | null
  isAuthenticated: boolean
}

const initialState: AuthState = {
  user: null,
  isAuthenticated: false,
}

export const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    setUser(state, action: PayloadAction<UserRead>) {
      state.user = action.payload
      state.isAuthenticated = true
    },
    clearUser(state) {
      state.user = null
      state.isAuthenticated = false
    },
  },
  selectors: {
    selectUser: (state) => state.user,
    selectIsAuthenticated: (state) => state.isAuthenticated,
  },
})

export const { setUser, clearUser } = authSlice.actions
export const { selectUser, selectIsAuthenticated } = authSlice.selectors
