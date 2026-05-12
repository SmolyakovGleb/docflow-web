import { createBrowserRouter, Navigate, RouterProvider } from 'react-router-dom'
import LoginPage from '@/pages/LoginPage'
import RegisterPage from '@/pages/RegisterPage'
import RepositoriesPage from '@/pages/RepositoriesPage'
import NewRepositoryPage from '@/pages/NewRepositoryPage'
import RepositoryDetailPage from '@/pages/RepositoryDetailPage'
import TaskDetailPage from '@/pages/TaskDetailPage'
import TaskListPage from '@/pages/TaskListPage'
import AnalyticsPage from '@/pages/AnalyticsPage'
import DictionariesPage from '@/pages/DictionariesPage'
import HistoryPage from '@/pages/HistoryPage'
import SettingsPage from '@/pages/SettingsPage'
import PageInDevelopmentPage from '@/pages/PageInDevelopmentPage'
import { DevShowcasePage } from '@/pages/DevShowcasePage'
import i18n from '@/shared/lib/i18n'
import { AppLayout } from '../layouts/AppLayout'
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
    path: '/terms',
    element: <PageInDevelopmentPage title={i18n.t('common:terms_title')} />,
  },
  {
    path: '/privacy',
    element: <PageInDevelopmentPage title={i18n.t('common:privacy_title')} />,
  },
  {
    element: (
      <ProtectedRoute>
        <AppLayout />
      </ProtectedRoute>
    ),
    children: [
      {
        path: '/tasks',
        element: <TaskListPage />,
      },
      {
        path: '/tasks/:taskId',
        element: <TaskDetailPage />,
      },
      {
        path: '/repositories',
        element: <RepositoriesPage />,
      },
      {
        path: '/repositories/new',
        element: <NewRepositoryPage />,
      },
      {
        path: '/repositories/:projectId',
        element: <RepositoryDetailPage />,
      },
      {
        path: '/analytics',
        element: <AnalyticsPage />,
      },
      {
        path: '/history',
        element: <HistoryPage />,
      },
      {
        path: '/dictionaries',
        element: <DictionariesPage />,
      },
      {
        path: '/settings',
        element: <SettingsPage />,
      },
    ],
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
