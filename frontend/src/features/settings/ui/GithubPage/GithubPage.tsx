import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router-dom'
import { useDisconnectGithubMutation } from '@/features/auth/api/authApi'
import { redirectToGithubAppInstall } from '@/features/auth/lib/redirectToGithubAppInstall'
import { redirectToGithubConnect } from '@/features/auth/lib/redirectToGithubConnect'
import { selectUser } from '@/features/auth/model/authSlice'
import { translateApiError } from '@/shared/lib/errorMessages'
import { useAppSelector } from '@/shared/store/hooks'
import { ActionBanner } from '@/shared/ui/ActionBanner/ActionBanner'
import { Button } from '@/shared/ui/Button/Button'
import { ConfirmDialog } from '@/shared/ui/ConfirmDialog/ConfirmDialog'
import { GitHubMark } from '@/shared/ui/GitHubMark/GitHubMark'
import { InlineAlert } from '@/shared/ui/InlineAlert/InlineAlert'
import { SectionCard } from '@/shared/ui/SectionCard/SectionCard'
import { toast } from '@/shared/ui/Toast/toast'
import styles from './GithubPage.module.css'

export function GithubPage() {
  const { t } = useTranslation('settings')
  const user = useAppSelector(selectUser)
  const [disconnectGithub, { isLoading }] = useDisconnectGithubMutation()
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [searchParams, setSearchParams] = useSearchParams()
  const githubError = searchParams.get('github_error')
  const appInstalled = searchParams.get('github_app_installed')

  useEffect(() => {
    if (appInstalled) {
      toast.success(t('github.app_installed_success'))
      const next = new URLSearchParams(searchParams)
      next.delete('github_app_installed')
      setSearchParams(next, { replace: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appInstalled])

  const handleInstallApp = async () => {
    try {
      await redirectToGithubAppInstall()
    } catch (err) {
      toast.error(translateApiError(err))
    }
  }

  const handleDisconnect = async () => {
    try {
      await disconnectGithub().unwrap()
      toast.success(t('github.disconnect_success'))
      setConfirmOpen(false)
    } catch (err) {
      toast.error(translateApiError(err))
    }
  }

  const clearError = () => {
    const next = new URLSearchParams(searchParams)
    next.delete('github_error')
    setSearchParams(next, { replace: true })
  }

  return (
    <>
      {githubError ? (
        <InlineAlert className={styles.errorAlert}>
          <span>
            {t('github.error_title')}: {decodeURIComponent(githubError)}
          </span>
          <button
            type="button"
            className={styles.clearError}
            onClick={clearError}
            aria-label="Закрыть"
          >
            ×
          </button>
        </InlineAlert>
      ) : null}

      <SectionCard label={t('github.connection_section')}>
        {user?.github_linked ? (
          <div className={styles.connected}>
            <div className={styles.connectedInfo}>
              <GitHubMark size={20} className={styles.githubIcon} />
              <div>
                <div className={styles.connectedLabel}>{t('github.connected_as')}</div>
                <div className={styles.connectedLogin}>{user.github_login ?? 'GitHub'}</div>
              </div>
            </div>
            <Button variant="danger" size="sm" onClick={() => setConfirmOpen(true)}>
              {t('github.disconnect')}
            </Button>
          </div>
        ) : (
          <ActionBanner
            icon={<GitHubMark size={16} />}
            action={
              <Button variant="secondary" size="sm" onClick={() => void redirectToGithubConnect()}>
                {t('github.connect')}
              </Button>
            }
          >
            {t('github.not_connected_description')}
          </ActionBanner>
        )}
      </SectionCard>

      <SectionCard label={t('github.app_section')}>
        <ActionBanner
          icon={<GitHubMark size={16} />}
          action={
            <Button variant="secondary" size="sm" onClick={() => void handleInstallApp()}>
              {t('github.app_install')}
            </Button>
          }
        >
          {t('github.app_description')}
        </ActionBanner>
      </SectionCard>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={t('github.disconnect_confirm_title')}
        description={t('github.disconnect_confirm_description')}
        confirmText={t('github.disconnect_confirm_action')}
        confirmVariant="danger"
        loading={isLoading}
        onConfirm={() => void handleDisconnect()}
      />
    </>
  )
}
