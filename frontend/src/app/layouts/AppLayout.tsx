import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Outlet, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { useHotkeys } from 'react-hotkeys-hook'
import { CommandPalette } from '@/features/cmdk'
import { open } from '@/features/cmdk/model/cmdkSlice'
import { OnboardingGate } from '@/features/onboarding'
import { Sidebar } from '@/shared/ui/Sidebar/Sidebar'
import { useAppDispatch } from '@/shared/store/hooks'
import { toast } from '@/shared/ui/Toast/toast'
import styles from './AppLayout.module.css'

export function AppLayout() {
  const { t } = useTranslation('auth')
  const dispatch = useAppDispatch()
  const location = useLocation()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  useHotkeys(
    'mod+k',
    (event) => {
      event.preventDefault()
      dispatch(open())
    },
    {
      preventDefault: true,
    },
    [dispatch],
  )

  useEffect(() => {
    const githubLinked = searchParams.get('github_linked')
    const githubError = searchParams.get('github_error')

    if (!githubLinked && !githubError) {
      return
    }

    if (githubLinked === '1') {
      toast.success(t('github_connect_success'))
    }

    if (githubError) {
      const messageKey =
        githubError === 'access_denied'
          ? 'github_connect_cancelled'
          : githubError === 'already_linked'
            ? 'github_connect_already_linked'
            : githubError === 'invalid_state' || githubError === 'missing_code'
              ? 'github_connect_retry'
              : 'github_connect_failed'
      toast.error(t(messageKey))
    }

    const nextSearchParams = new URLSearchParams(searchParams)
    nextSearchParams.delete('github_linked')
    nextSearchParams.delete('github_error')

    void navigate(
      {
        pathname: location.pathname,
        search: nextSearchParams.size ? `?${nextSearchParams.toString()}` : '',
      },
      { replace: true },
    )
  }, [location.pathname, navigate, searchParams, t])

  return (
    <div className={styles.root}>
      <Sidebar />
      <main className={styles.main}>
        <div className={styles.content}>
          <Outlet />
        </div>
      </main>
      <CommandPalette />
      <OnboardingGate />
    </div>
  )
}
