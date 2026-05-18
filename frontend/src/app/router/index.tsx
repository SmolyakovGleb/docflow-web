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
import NotFoundPage from '@/pages/NotFoundPage'
import PageInDevelopmentPage from '@/pages/PageInDevelopmentPage'
import { ProfilePage } from '@/features/settings/ui/ProfilePage/ProfilePage'
import { GithubPage } from '@/features/settings/ui/GithubPage/GithubPage'
import { NotificationsPage } from '@/features/settings/ui/NotificationsPage/NotificationsPage'
import { DevShowcasePage } from '@/pages/DevShowcasePage'
import AdminPage from '@/pages/AdminPage'
import i18n from '@/shared/lib/i18n'
import { AppLayout } from '../layouts/AppLayout'
import { AdminRoute } from '../auth/AdminRoute'
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
    element: (
      <PageInDevelopmentPage
        title={i18n.t('common:terms_title')}
        description={i18n.t('common:terms_page_in_development_description')}
      />
    ),
  },
  {
    path: '/privacy',
    element: (
      <PageInDevelopmentPage
        title={i18n.t('common:privacy_title')}
        description={i18n.t('common:privacy_page_in_development_description')}
      />
    ),
  },
  {
    path: '/404',
    element: <NotFoundPage />,
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
        element: <Navigate to="/dictionaries/dictionary" replace />,
      },
      {
        path: '/dictionaries/:type',
        element: <DictionariesPage />,
      },
      {
        path: '/settings',
        element: <SettingsPage />,
        children: [
          { index: true, element: <Navigate to="/settings/profile" replace /> },
          { path: 'profile', element: <ProfilePage /> },
          { path: 'github', element: <GithubPage /> },
          { path: 'notifications', element: <NotificationsPage /> },
        ],
      },
      {
        path: '/admin',
        element: (
          <AdminRoute>
            <AdminPage />
          </AdminRoute>
        ),
      },
    ],
  },
  {
    path: '/dev',
    element: <DevShowcasePage />,
  },
  {
    path: '*',
    element: <NotFoundPage />,
  },
])

export function AppRouter() {
  return <RouterProvider router={router} />
}
