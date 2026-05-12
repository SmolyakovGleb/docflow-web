import { createBrowserRouter, Navigate, RouterProvider } from 'react-router-dom'
import LoginPage from '@/pages/LoginPage'
import RegisterPage from '@/pages/RegisterPage'
import RepositoriesPage from '@/pages/RepositoriesPage'
import TaskDetailPage from '@/pages/TaskDetailPage'
import TaskListPage from '@/pages/TaskListPage'
import AnalyticsPage from '@/pages/AnalyticsPage'
import DictionariesPage from '@/pages/DictionariesPage'
import HistoryPage from '@/pages/HistoryPage'
import SettingsPage from '@/pages/SettingsPage'
import { DevShowcasePage } from '@/pages/DevShowcasePage'
import { ProtectedRoute } from '../auth/ProtectedRoute'
import { PublicRoute } from '../auth/PublicRoute'

const router = createBrowserRouter([
  {
    path: '/',
    element: <Navigate to="/tasks" replace />,
  },
  {
    path: '/login',
    element: (
      <PublicRoute>
        <LoginPage />
      </PublicRoute>
    ),
  },
  {
    path: '/register',
    element: (
      <PublicRoute>
        <RegisterPage />
      </PublicRoute>
    ),
  },
  {
    path: '/tasks',
    element: (
      <ProtectedRoute>
        <TaskListPage />
      </ProtectedRoute>
    ),
  },
  {
    path: '/tasks/:taskId',
    element: (
      <ProtectedRoute>
        <TaskDetailPage />
      </ProtectedRoute>
    ),
  },
  {
    path: '/repositories',
    element: (
      <ProtectedRoute>
        <RepositoriesPage />
      </ProtectedRoute>
    ),
  },
  {
    path: '/analytics',
    element: (
      <ProtectedRoute>
        <AnalyticsPage />
      </ProtectedRoute>
    ),
  },
  {
    path: '/history',
    element: (
      <ProtectedRoute>
        <HistoryPage />
      </ProtectedRoute>
    ),
  },
  {
    path: '/dictionaries',
    element: (
      <ProtectedRoute>
        <DictionariesPage />
      </ProtectedRoute>
    ),
  },
  {
    path: '/settings',
    element: (
      <ProtectedRoute>
        <SettingsPage />
      </ProtectedRoute>
    ),
  },
  {
    path: '/dev',
    element: <DevShowcasePage />,
  },
  {
    path: '*',
    element: <Navigate to="/tasks" replace />,
  },
])

export function AppRouter() {
  return <RouterProvider router={router} />
}
