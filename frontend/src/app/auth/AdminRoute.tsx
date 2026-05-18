import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { selectUser } from '@/features/auth/model/authSlice'
import { useAppSelector } from '@/shared/store/hooks'

interface AdminRouteProps {
  children: ReactNode
}

export function AdminRoute({ children }: AdminRouteProps) {
  const user = useAppSelector(selectUser)

  if (!user?.is_admin) {
    return <Navigate to="/tasks" replace />
  }

  return <>{children}</>
}
