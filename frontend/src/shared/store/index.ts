import { configureStore, createListenerMiddleware } from '@reduxjs/toolkit'
import { setupListeners } from '@reduxjs/toolkit/query'
import { baseApi } from '../api/baseApi'
import { authSlice, clearUser } from '../../features/auth/model/authSlice'
import { cmdkSlice } from '../../features/cmdk/model/cmdkSlice'
import { uiSlice } from '../../features/tasks/model/uiSlice'

const listenerMiddleware = createListenerMiddleware()
listenerMiddleware.startListening({
  actionCreator: clearUser,
  effect: (_action, api) => {
    api.dispatch(baseApi.util.resetApiState())
  },
})

export function createAppStore() {
  return configureStore({
    reducer: {
      [baseApi.reducerPath]: baseApi.reducer,
      [uiSlice.name]: uiSlice.reducer,
      [authSlice.name]: authSlice.reducer,
      [cmdkSlice.name]: cmdkSlice.reducer,
    },
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware().prepend(listenerMiddleware.middleware).concat(baseApi.middleware),
  })
}

export const store = createAppStore()

setupListeners(store.dispatch)

export type AppStore = ReturnType<typeof createAppStore>
export type RootState = ReturnType<AppStore['getState']>
export type AppDispatch = AppStore['dispatch']
