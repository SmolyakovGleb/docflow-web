import { useEffect, useState, type ReactNode } from 'react'
import { authApi } from '@/features/auth/api/authApi'
import { clearUser, setUser } from '@/features/auth/model/authSlice'
import { useAppDispatch } from '@/shared/store/hooks'
import { Splash } from '../Splash'

interface AuthBootstrapProps {
  children: ReactNode
}

export function AuthBootstrap({ children }: AuthBootstrapProps) {
  const dispatch = useAppDispatch()
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let active = true
    const request = dispatch(authApi.endpoints.getMe.initiate())

    void request
      .unwrap()
      .then((user) => {
        if (!active) {
          return
        }

        dispatch(setUser(user))
      })
      .catch(() => {
        if (!active) {
          return
        }

        dispatch(clearUser())
      })
      .finally(() => {
        if (active) {
          setReady(true)
        }
      })

    return () => {
      active = false
      request.unsubscribe()
    }
  }, [dispatch])

  if (!ready) {
    return <Splash />
  }

  return <>{children}</>
}
