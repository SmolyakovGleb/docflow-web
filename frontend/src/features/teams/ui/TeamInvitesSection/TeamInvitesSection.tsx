import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { translateApiError } from '@/shared/lib/errorMessages'
import { Button } from '@/shared/ui/Button/Button'
import { ConfirmDialog } from '@/shared/ui/ConfirmDialog/ConfirmDialog'
import { CopyField } from '@/shared/ui/CopyField/CopyField'
import { Field } from '@/shared/ui/Field/Field'
import { InlineAlert } from '@/shared/ui/InlineAlert/InlineAlert'
import { Input } from '@/shared/ui/Input/Input'
import { SectionCard } from '@/shared/ui/SectionCard/SectionCard'
import { Skeleton } from '@/shared/ui/Skeleton/Skeleton'
import { toast } from '@/shared/ui/Toast/toast'
import {
  useCreateTeamInviteMutation,
  useGetTeamInvitesQuery,
  useRevokeTeamInviteMutation,
} from '../../api/teamsApi'
import type { TeamInviteRead } from '../../model/types'
import styles from '../TeamSettingsPage/TeamSettingsPage.module.css'

function formatDateTime(value: string | null) {
  if (!value) {
    return null
  }

  return new Date(value).toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function getStatusLabel(status: TeamInviteRead['status'], t: (key: string) => string) {
  if (status === 'used') {
    return t('invite_status_used')
  }

  if (status === 'expired') {
    return t('invite_status_expired')
  }

  return t('invite_status_active')
}

export function TeamInvitesSection() {
  const { t } = useTranslation('teams')
  const { data: invites = [], isLoading, error } = useGetTeamInvitesQuery()
  const [createInvite, { isLoading: isCreating }] = useCreateTeamInviteMutation()
  const [revokeInvite] = useRevokeTeamInviteMutation()
  const [expiresInDays, setExpiresInDays] = useState('')
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [revokeTarget, setRevokeTarget] = useState<TeamInviteRead | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<TeamInviteRead | null>(null)
  const [revokingId, setRevokingId] = useState<string | null>(null)

  const handleCreateInvite = async () => {
    setSubmitError(null)
    const trimmedValue = expiresInDays.trim()
    const days = trimmedValue ? Number(trimmedValue) : null

    if (trimmedValue && (days === null || !Number.isInteger(days) || days < 1)) {
      setSubmitError(t('invite_days_invalid'))
      return
    }

    try {
      await createInvite({ expires_in_days: days }).unwrap()
      setExpiresInDays('')
    } catch (createError) {
      setSubmitError(translateApiError(createError))
    }
  }

  const handleRevokeInvite = async () => {
    if (!revokeTarget) return
    setSubmitError(null)
    setRevokingId(revokeTarget.id)
    try {
      await revokeInvite(revokeTarget.id).unwrap()
      toast.success(t('invite_revoke_success'))
      setRevokeTarget(null)
    } catch (revokeError) {
      setSubmitError(translateApiError(revokeError))
    } finally {
      setRevokingId(null)
    }
  }

  const handleDeleteInvite = async () => {
    if (!deleteTarget) return
    setSubmitError(null)
    setRevokingId(deleteTarget.id)
    try {
      await revokeInvite(deleteTarget.id).unwrap()
      toast.success(t('invite_delete_success'))
      setDeleteTarget(null)
    } catch (deleteError) {
      setSubmitError(translateApiError(deleteError))
    } finally {
      setRevokingId(null)
    }
  }

  return (
    <SectionCard label={t('invites_section')} description={t('invites_description')}>
      {error ? <InlineAlert>{translateApiError(error)}</InlineAlert> : null}
      {submitError ? <InlineAlert>{submitError}</InlineAlert> : null}

      <div className={styles.inviteToolbar}>
        <Field label={t('invite_expires_days')} htmlFor="invite-days">
          <Input
            id="invite-days"
            className={styles.daysInput}
            type="number"
            min={1}
            step={1}
            placeholder={t('invite_expires_never')}
            value={expiresInDays}
            onChange={(event) => setExpiresInDays(event.target.value)}
          />
        </Field>
        <Button
          size="sm"
          variant="secondary"
          loading={isCreating}
          onClick={() => void handleCreateInvite()}
        >
          {t('invite_create')}
        </Button>
      </div>

      {isLoading ? (
        <div className={styles.skeletonColumn}>
          <Skeleton width="100%" height={52} />
          <Skeleton width="100%" height={52} />
        </div>
      ) : invites.length === 0 ? (
        <div className={styles.emptyText}>{t('invites_empty')}</div>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>{t('invite_link')}</th>
                <th>{t('invite_status')}</th>
                <th>{t('invite_created_at')}</th>
                <th>{t('invite_expires_at')}</th>
                <th>{t('invite_actions')}</th>
              </tr>
            </thead>
            <tbody>
              {invites.map((invite) => {
                const inviteUrl = `${window.location.origin}/teams/join?token=${invite.token}`

                return (
                  <tr key={invite.id}>
                    <td className={styles.linkCell}>
                      <CopyField
                        value={inviteUrl}
                        valueDisplay="input"
                        buttonLabel={t('invite_copy')}
                        onCopySuccess={() => toast.success(t('invite_copied'))}
                        onCopyError={() => toast.error(t('common:error'))}
                      />
                    </td>
                    <td>
                      <span
                        className={`${styles.statusBadge} ${
                          invite.status === 'active'
                            ? styles.statusBadgeActive
                            : invite.status === 'used'
                              ? styles.statusBadgeUsed
                              : styles.statusBadgeExpired
                        }`}
                      >
                        {getStatusLabel(invite.status, t)}
                      </span>
                    </td>
                    <td className={styles.mutedText}>{formatDateTime(invite.created_at)}</td>
                    <td className={styles.mutedText}>
                      {formatDateTime(invite.expires_at) ?? t('invite_expires_never')}
                    </td>
                    <td>
                      <div className={styles.actions}>
                        {invite.status === 'active' ? (
                          <Button
                            variant="danger"
                            size="sm"
                            loading={revokingId === invite.id}
                            onClick={() => setRevokeTarget(invite)}
                          >
                            {t('invite_revoke')}
                          </Button>
                        ) : (
                          <Button
                            variant="secondary"
                            size="sm"
                            loading={revokingId === invite.id}
                            onClick={() => setDeleteTarget(invite)}
                          >
                            {t('invite_delete')}
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <ConfirmDialog
        open={revokeTarget !== null}
        onOpenChange={(open) => {
          if (!open) setRevokeTarget(null)
        }}
        title={t('invite_revoke_confirm_title')}
        description={t('invite_revoke_confirm')}
        confirmText={t('invite_revoke')}
        confirmVariant="danger"
        loading={revokingId !== null}
        onConfirm={() => void handleRevokeInvite()}
      />

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null)
        }}
        title={t('invite_delete_confirm_title')}
        description={t('invite_delete_confirm')}
        confirmText={t('invite_delete')}
        confirmVariant="danger"
        loading={revokingId !== null}
        onConfirm={() => void handleDeleteInvite()}
      />
    </SectionCard>
  )
}
