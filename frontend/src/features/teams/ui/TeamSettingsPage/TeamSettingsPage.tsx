import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { selectUser } from '@/features/auth/model/authSlice'
import { getApiErrorDetail, getApiErrorStatus, translateApiError } from '@/shared/lib/errorMessages'
import { useAppSelector } from '@/shared/store/hooks'
import { Button } from '@/shared/ui/Button/Button'
import { EmptyState } from '@/shared/ui/EmptyState/EmptyState'
import { Field } from '@/shared/ui/Field/Field'
import { FormDialog } from '@/shared/ui/FormDialog/FormDialog'
import { InlineAlert } from '@/shared/ui/InlineAlert/InlineAlert'
import { Input } from '@/shared/ui/Input/Input'
import { SectionCard } from '@/shared/ui/SectionCard/SectionCard'
import { Skeleton } from '@/shared/ui/Skeleton/Skeleton'
import { toast } from '@/shared/ui/Toast/toast'
import {
  useCreateTeamMutation,
  useDeleteTeamMutation,
  useGetMyTeamQuery,
  useLeaveTeamMutation,
  useRenameTeamMutation,
} from '../../api/teamsApi'
import { CreateTeamForm } from '../CreateTeamForm/CreateTeamForm'
import { MembersTable } from '../MembersTable/MembersTable'
import { TeamInvitesSection } from '../TeamInvitesSection/TeamInvitesSection'
import styles from './TeamSettingsPage.module.css'

function formatDate(value: string) {
  return new Date(value).toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  })
}

export function TeamSettingsPage() {
  const { t } = useTranslation(['teams', 'common'])
  const user = useAppSelector(selectUser)
  const { data: team, error, isLoading, isFetching, refetch } = useGetMyTeamQuery()
  const [createTeam, { isLoading: isCreating }] = useCreateTeamMutation()
  const [renameTeam, { isLoading: isRenaming }] = useRenameTeamMutation()
  const [deleteTeam, { isLoading: isDeleting }] = useDeleteTeamMutation()
  const [leaveTeam, { isLoading: isLeaving }] = useLeaveTeamMutation()
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [leaveError, setLeaveError] = useState<string | null>(null)
  const [renameDraft, setRenameDraft] = useState<string | null>(null)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [leaveDialogOpen, setLeaveDialogOpen] = useState(false)
  const [deleteConfirmation, setDeleteConfirmation] = useState('')

  const errorStatus = getApiErrorStatus(error)
  const errorDetail = getApiErrorDetail(error)
  const hasNoTeam = errorStatus === 404 && errorDetail === 'Not in a team'
  const hasLoadError = Boolean(error) && !hasNoTeam
  const isOwner = Boolean(team && user && team.owner_id === user.id)
  const owner = team?.members.find((member) => member.user_id === team.owner_id)
  const ownerLabel = owner?.display_name?.trim() || owner?.email || '—'
  const isDeleteConfirmed = deleteConfirmation.trim() === team?.name
  const renameName = renameDraft ?? team?.name ?? ''

  const handleCreateTeam = async (name: string) => {
    setSubmitError(null)

    try {
      await createTeam({ name }).unwrap()
      toast.success(t('create_success'))
    } catch (createError) {
      const translated = translateApiError(createError)
      setSubmitError(translated)
      throw createError
    }
  }

  const handleRenameTeam = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!team) {
      return
    }

    const trimmedName = renameName.trim()
    if (!trimmedName || trimmedName === team.name) {
      return
    }

    try {
      await renameTeam({ name: trimmedName }).unwrap()
      setRenameDraft(null)
      toast.success(t('rename_success'))
    } catch (renameError) {
      toast.error(translateApiError(renameError))
    }
  }

  const handleDeleteTeam = async () => {
    if (!isDeleteConfirmed) {
      return
    }

    setDeleteError(null)

    try {
      await deleteTeam().unwrap()
      toast.success(t('delete_team_success'))
      setDeleteDialogOpen(false)
      setDeleteConfirmation('')
    } catch (err) {
      setDeleteError(translateApiError(err))
    }
  }

  const handleLeaveTeam = async () => {
    setLeaveError(null)

    try {
      await leaveTeam().unwrap()
      toast.success(t('leave_team_success'))
      setLeaveDialogOpen(false)
    } catch (err) {
      setLeaveError(translateApiError(err))
    }
  }

  if (isLoading || (isFetching && !team && !hasNoTeam && !hasLoadError)) {
    return (
      <div className={styles.page}>
        <div className={styles.pageHeader}>
          <h1 className={styles.pageTitle}>{t('page_title')}</h1>
          <div className={styles.pageDescription}>{t('loading_description')}</div>
        </div>
        <div className={styles.skeletonColumn}>
          <Skeleton width="100%" height={150} />
          <Skeleton width="100%" height={220} />
          <Skeleton width="100%" height={220} />
        </div>
      </div>
    )
  }

  if (hasLoadError) {
    return (
      <div className={styles.page}>
        <div className={styles.pageHeader}>
          <h1 className={styles.pageTitle}>{t('page_title')}</h1>
          <div className={styles.pageDescription}>{t('page_description')}</div>
        </div>
        <SectionCard label={t('load_error_title')}>
          <InlineAlert>{translateApiError(error)}</InlineAlert>
          <div className={styles.formActions}>
            <Button variant="secondary" onClick={() => void refetch()}>
              {t('common:retry')}
            </Button>
          </div>
        </SectionCard>
      </div>
    )
  }

  if (hasNoTeam || !team) {
    return (
      <div className={styles.page}>
        <div className={styles.pageHeader}>
          <h1 className={styles.pageTitle}>{t('page_title')}</h1>
          <div className={styles.pageDescription}>{t('page_description')}</div>
        </div>

        <SectionCard label={t('create_section')} description={t('create_hint')}>
          {submitError ? <InlineAlert>{submitError}</InlineAlert> : null}
          <EmptyState title={t('no_team_title')} description={t('no_team_description')} />
          <CreateTeamForm isLoading={isCreating} onSubmit={handleCreateTeam} />
        </SectionCard>
      </div>
    )
  }

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>{t('page_title')}</h1>
        <div className={styles.pageDescription}>{t('page_description')}</div>
      </div>

      <SectionCard
        label={t('overview_section')}
        description={t(isOwner ? 'owner_view_description' : 'member_view_description')}
      >
        <div className={styles.overviewGrid}>
          <div className={styles.overviewItem}>
            <div className={styles.overviewLabel}>{t('team_name_label')}</div>
            <div className={styles.overviewValue}>{team.name}</div>
          </div>
          <div className={styles.overviewItem}>
            <div className={styles.overviewLabel}>{t('owner_label')}</div>
            <div className={styles.overviewValue}>{ownerLabel}</div>
          </div>
          <div className={styles.overviewItem}>
            <div className={styles.overviewLabel}>{t('team_members_count')}</div>
            <div className={styles.overviewValue}>{team.member_count}</div>
          </div>
          <div className={styles.overviewItem}>
            <div className={styles.overviewLabel}>{t('team_created_at')}</div>
            <div className={styles.overviewValue}>{formatDate(team.created_at)}</div>
          </div>
        </div>

        {isOwner ? (
          <form className={styles.renameRow} onSubmit={(event) => void handleRenameTeam(event)}>
            <Field label={t('rename_team')} htmlFor="team-rename">
              <Input
                id="team-rename"
                value={renameName}
                onChange={(event) => setRenameDraft(event.target.value)}
                maxLength={100}
              />
            </Field>
            <div className={styles.formActions}>
              <Button
                type="submit"
                size="sm"
                loading={isRenaming}
                disabled={!renameName.trim() || renameName.trim() === team.name}
              >
                {t('save_name')}
              </Button>
            </div>
          </form>
        ) : null}
      </SectionCard>

      <MembersTable members={team.members} ownerId={team.owner_id} canManage={isOwner} />

      {isOwner ? <TeamInvitesSection /> : null}

      <SectionCard
        label={t('danger_section')}
        description={t(isOwner ? 'danger_owner_description' : 'danger_member_description')}
      >
        <div className={styles.dangerActions}>
          {isOwner ? (
            <Button variant="danger" onClick={() => setDeleteDialogOpen(true)}>
              {t('delete_team')}
            </Button>
          ) : (
            <Button variant="danger" onClick={() => setLeaveDialogOpen(true)}>
              {t('leave_team')}
            </Button>
          )}
        </div>
      </SectionCard>

      <FormDialog
        open={deleteDialogOpen}
        onOpenChange={(open) => {
          setDeleteDialogOpen(open)
          if (!open) {
            setDeleteConfirmation('')
            setDeleteError(null)
          }
        }}
        title={t('delete_team_confirm_title')}
        description={t('delete_team_confirm', { name: team.name })}
        actions={
          <div className={styles.dialogActions}>
            <Button variant="secondary" onClick={() => setDeleteDialogOpen(false)}>
              {t('common:cancel')}
            </Button>
            <Button
              variant="danger"
              loading={isDeleting}
              disabled={!isDeleteConfirmed}
              onClick={() => void handleDeleteTeam()}
            >
              {t('delete_team')}
            </Button>
          </div>
        }
      >
        {deleteError ? <InlineAlert>{deleteError}</InlineAlert> : null}
        <Field label={t('delete_team_input_label')} htmlFor="delete-team-name">
          <Input
            id="delete-team-name"
            value={deleteConfirmation}
            onChange={(event) => setDeleteConfirmation(event.target.value)}
            placeholder={t('delete_team_input_placeholder')}
          />
        </Field>
      </FormDialog>

      <FormDialog
        open={leaveDialogOpen}
        onOpenChange={(open) => {
          setLeaveDialogOpen(open)
          if (!open) setLeaveError(null)
        }}
        title={t('leave_team_confirm_title')}
        description={t('leave_team_confirm', { name: team.name })}
        actions={
          <div className={styles.dialogActions}>
            <Button variant="secondary" onClick={() => setLeaveDialogOpen(false)}>
              {t('common:cancel')}
            </Button>
            <Button variant="danger" loading={isLeaving} onClick={() => void handleLeaveTeam()}>
              {t('leave_team')}
            </Button>
          </div>
        }
      >
        {leaveError ? <InlineAlert>{leaveError}</InlineAlert> : null}
      </FormDialog>
    </div>
  )
}
