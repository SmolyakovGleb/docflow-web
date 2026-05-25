import { lazy, Suspense, useEffect } from 'react'
import { createBrowserRouter, Navigate, RouterProvider } from 'react-router-dom'
import i18n from '@/shared/lib/i18n'
import { AppLayout } from '../layouts/AppLayout'
import { AdminRoute } from '../auth/AdminRoute'
import { ProtectedRoute } from '../auth/ProtectedRoute'
import { PublicRoute } from '../auth/PublicRoute'
import { Splash } from '../Splash'

const LoginPage = lazy(() => import('@/pages/LoginPage'))
const RegisterPage = lazy(() => import('@/pages/RegisterPage'))
const RepositoriesPage = lazy(() => import('@/pages/RepositoriesPage'))
const NewRepositoryPage = lazy(() => import('@/pages/NewRepositoryPage'))
const RepositoryDetailPage = lazy(() => import('@/pages/RepositoryDetailPage'))
const TaskDetailPage = lazy(() => import('@/pages/TaskDetailPage'))
const TaskListPage = lazy(() => import('@/pages/TaskListPage'))
const AnalyticsPage = lazy(() => import('@/pages/AnalyticsPage'))
const DictionariesPage = lazy(() => import('@/pages/DictionariesPage'))
const HistoryPage = lazy(() => import('@/pages/HistoryPage'))
const SettingsPage = lazy(() => import('@/pages/SettingsPage'))
const NotFoundPage = lazy(() => import('@/pages/NotFoundPage'))
const PageInDevelopmentPage = lazy(() => import('@/pages/PageInDevelopmentPage'))
const AdminPage = lazy(() => import('@/pages/AdminPage'))
const DevShowcasePage = lazy(() =>
  import('@/pages/DevShowcasePage').then((m) => ({ default: m.DevShowcasePage })),
)
const ProfilePage = lazy(() =>
  import('@/features/settings/ui/ProfilePage/ProfilePage').then((m) => ({
    default: m.ProfilePage,
  })),
)
const GithubPage = lazy(() =>
  import('@/features/settings/ui/GithubPage/GithubPage').then((m) => ({ default: m.GithubPage })),
)
const NotificationsPage = lazy(() =>
  import('@/features/settings/ui/NotificationsPage/NotificationsPage').then((m) => ({
    default: m.NotificationsPage,
  })),
)
const JoinTeamPage = lazy(() =>
  import('@/features/teams/ui/JoinTeamPage/JoinTeamPage').then((m) => ({
    default: m.JoinTeamPage,
  })),
)
const TeamSettingsPage = lazy(() =>
  import('@/features/teams/ui/TeamSettingsPage/TeamSettingsPage').then((m) => ({
    default: m.TeamSettingsPage,
  })),
)

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
        path: '/teams/join',
        element: <JoinTeamPage />,
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
          { path: 'team', element: <TeamSettingsPage /> },
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

function preloadPages() {
  const chunks = [
    () => import('@/pages/TaskListPage'),
    () => import('@/pages/TaskDetailPage'),
    () => import('@/pages/RepositoriesPage'),
    () => import('@/pages/NewRepositoryPage'),
    () => import('@/pages/RepositoryDetailPage'),
    () => import('@/pages/AnalyticsPage'),
    () => import('@/pages/DictionariesPage'),
    () => import('@/pages/HistoryPage'),
    () => import('@/pages/SettingsPage'),
    () => import('@/features/settings/ui/ProfilePage/ProfilePage'),
    () => import('@/features/settings/ui/GithubPage/GithubPage'),
    () => import('@/features/settings/ui/NotificationsPage/NotificationsPage'),
    () => import('@/features/teams/ui/TeamSettingsPage/TeamSettingsPage'),
    () => import('@/pages/AdminPage'),
  ]
  const schedule = typeof requestIdleCallback !== 'undefined' ? requestIdleCallback : setTimeout
  schedule(() => chunks.forEach((load) => void load()))
}

export function AppRouter() {
  useEffect(() => {
    preloadPages()
  }, [])

  return (
    <Suspense fallback={<Splash />}>
      <RouterProvider router={router} />
    </Suspense>
  )
}
