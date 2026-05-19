import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { getApiErrorDetail, getApiErrorStatus, translateApiError } from '@/shared/lib/errorMessages'
import { Button } from '@/shared/ui/Button/Button'
import { EmptyState } from '@/shared/ui/EmptyState/EmptyState'
import { InlineAlert } from '@/shared/ui/InlineAlert/InlineAlert'
import { SectionCard } from '@/shared/ui/SectionCard/SectionCard'
import { Skeleton } from '@/shared/ui/Skeleton/Skeleton'
import { toast } from '@/shared/ui/Toast/toast'
import {
  useGetMyTeamQuery,
  useGetTeamByInviteTokenQuery,
  useJoinTeamMutation,
} from '../../api/teamsApi'
import styles from './JoinTeamPage.module.css'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function JoinTeamPage() {
  const { t } = useTranslation(['teams', 'common'])
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token')?.trim() ?? ''
  const tokenIsValidUuid = token !== '' && UUID_RE.test(token)
  const hasInvalidTokenFormat = token !== '' && !tokenIsValidUuid
  const [joinTeam, { isLoading: isJoining }] = useJoinTeamMutation()
  const [submitError, setSubmitError] = useState<string | null>(null)

  const {
    data: currentTeam,
    error: currentTeamError,
    isLoading: isCurrentTeamLoading,
    isFetching: isCurrentTeamFetching,
    refetch: refetchCurrentTeam,
  } = useGetMyTeamQuery()

  const currentTeamErrorStatus = getApiErrorStatus(currentTeamError)
  const currentTeamErrorDetail = getApiErrorDetail(currentTeamError)
  const hasNoTeam = currentTeamErrorStatus === 404 && currentTeamErrorDetail === 'Not in a team'
  const hasCurrentTeamError = Boolean(currentTeamError) && !hasNoTeam
  const shouldLoadPreview = tokenIsValidUuid && hasNoTeam

  const {
    data: invitePreview,
    error: invitePreviewError,
    isLoading: isInvitePreviewLoading,
    isFetching: isInvitePreviewFetching,
    refetch: refetchInvitePreview,
  } = useGetTeamByInviteTokenQuery(token, {
    skip: !shouldLoadPreview,
  })

  const invitePreviewErrorStatus = getApiErrorStatus(invitePreviewError)
  const hasInvalidInvite = shouldLoadPreview && invitePreviewErrorStatus === 404
  const hasInvitePreviewError = Boolean(invitePreviewError) && invitePreviewErrorStatus !== 404
  const isInitialLoading =
    isCurrentTeamLoading ||
    (isCurrentTeamFetching && !currentTeam && !hasNoTeam && !hasCurrentTeamError)
  const isPreviewLoading =
    shouldLoadPreview &&
    (isInvitePreviewLoading ||
      (isInvitePreviewFetching && !invitePreview && !hasInvalidInvite && !hasInvitePreviewError))

  const handleJoinTeam = async () => {
    setSubmitError(null)

    try {
      await joinTeam({ token }).unwrap()
      toast.success(t('join_success'))
      void navigate('/settings/team', { replace: true })
    } catch (error) {
      setSubmitError(translateApiError(error))
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>{t('join_title')}</h1>
        <div className={styles.pageDescription}>{t('join_description')}</div>
      </div>

      <SectionCard label={t('join_section')}>
        {isInitialLoading ? (
          <div className={styles.loadingState}>
            <Skeleton width="45%" height={12} />
            <Skeleton width="100%" height={54} />
            <Skeleton width="100%" height={54} />
            <div className={styles.actions}>
              <Skeleton width={164} height={40} />
            </div>
          </div>
        ) : null}

        {!isInitialLoading && hasCurrentTeamError ? (
          <>
            <InlineAlert>{translateApiError(currentTeamError)}</InlineAlert>
            <div className={styles.actions}>
              <Button variant="secondary" onClick={() => void refetchCurrentTeam()}>
                {t('common:retry')}
              </Button>
            </div>
          </>
        ) : null}

        {!isInitialLoading && !hasCurrentTeamError && currentTeam ? (
          <EmptyState
            title={t('join_already_member_title')}
            description={t('join_already_member_description', { name: currentTeam.name })}
            actions={
              <Button onClick={() => void navigate('/settings/team')}>
                {t('join_go_to_team')}
              </Button>
            }
          />
        ) : null}

        {!isInitialLoading && !hasCurrentTeamError && !currentTeam && !token ? (
          <EmptyState
            title={t('join_missing_token_title')}
            description={t('join_missing_token')}
            actions={
              <Button variant="secondary" onClick={() => void navigate('/')}>
                {t('join_go_home')}
              </Button>
            }
          />
        ) : null}

        {!isInitialLoading && !hasCurrentTeamError && !currentTeam && hasInvalidTokenFormat ? (
          <EmptyState
            title={t('join_invalid_token_title')}
            description={t('join_invalid_token_description')}
            actions={
              <Button variant="secondary" onClick={() => void navigate('/')}>
                {t('join_go_home')}
              </Button>
            }
          />
        ) : null}

        {!isInitialLoading && !hasCurrentTeamError && !currentTeam && token && isPreviewLoading ? (
          <div className={styles.loadingState}>
            <Skeleton width="38%" height={12} />
            <Skeleton width="100%" height={54} />
            <Skeleton width="100%" height={54} />
            <div className={styles.actions}>
              <Skeleton width={164} height={40} />
            </div>
          </div>
        ) : null}

        {!isInitialLoading &&
        !hasCurrentTeamError &&
        !currentTeam &&
        token &&
        hasInvitePreviewError ? (
          <>
            <InlineAlert>{translateApiError(invitePreviewError)}</InlineAlert>
            <div className={styles.actions}>
              <Button
                variant="secondary"
                loading={isInvitePreviewFetching}
                onClick={() => void refetchInvitePreview()}
              >
                {t('common:retry')}
              </Button>
            </div>
          </>
        ) : null}

        {!isInitialLoading &&
        !hasCurrentTeamError &&
        !currentTeam &&
        token &&
        !isPreviewLoading &&
        !hasInvitePreviewError &&
        hasInvalidInvite ? (
          <EmptyState
            title={t('join_invalid_token_title')}
            description={t('join_invalid_token_description')}
            actions={
              <Button variant="secondary" onClick={() => void navigate('/')}>
                {t('join_go_home')}
              </Button>
            }
          />
        ) : null}

        {!isInitialLoading &&
        !hasCurrentTeamError &&
        !currentTeam &&
        token &&
        invitePreview &&
        !isPreviewLoading &&
        !hasInvitePreviewError ? (
          <>
            {submitError ? <InlineAlert>{submitError}</InlineAlert> : null}
            <div className={styles.previewCard}>
              <div className={styles.previewItem}>
                <div className={styles.previewLabel}>{t('team_name_label')}</div>
                <div className={styles.previewValue}>{invitePreview.team_name}</div>
              </div>
              <div className={styles.previewItem}>
                <div className={styles.previewLabel}>{t('team_members_count')}</div>
                <div className={styles.previewValue}>{invitePreview.member_count}</div>
              </div>
            </div>
            <div className={styles.actions}>
              <Button loading={isJoining} onClick={() => void handleJoinTeam()}>
                {t('join_cta')}
              </Button>
            </div>
          </>
        ) : null}
      </SectionCard>
    </div>
  )
}
