import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { translateApiError } from '@/shared/lib/errorMessages'
import { Avatar } from '@/shared/ui/Avatar/Avatar'
import { Button } from '@/shared/ui/Button/Button'
import { ConfirmDialog } from '@/shared/ui/ConfirmDialog/ConfirmDialog'
import { InlineAlert } from '@/shared/ui/InlineAlert/InlineAlert'
import { SectionCard } from '@/shared/ui/SectionCard/SectionCard'
import { toast } from '@/shared/ui/Toast/toast'
import { useRemoveMemberMutation } from '../../api/teamsApi'
import type { TeamMemberRead } from '../../model/types'
import styles from '../TeamSettingsPage/TeamSettingsPage.module.css'

interface MembersTableProps {
  members: TeamMemberRead[]
  ownerId: string
  canManage: boolean
}

function formatJoinedAt(value: string) {
  return new Date(value).toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

export function MembersTable({ members, ownerId, canManage }: MembersTableProps) {
  const { t } = useTranslation('teams')
  const [removeMember, { isLoading }] = useRemoveMemberMutation()
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [target, setTarget] = useState<TeamMemberRead | null>(null)

  const sortedMembers = [...members].sort((left, right) => {
    if (left.user_id === ownerId) {
      return -1
    }

    if (right.user_id === ownerId) {
      return 1
    }

    return left.email.localeCompare(right.email)
  })

  const handleRemoveMember = async () => {
    if (!target) {
      return
    }

    setSubmitError(null)

    try {
      await removeMember(target.user_id).unwrap()
      toast.success(t('remove_member_success'))
      setTarget(null)
    } catch (error) {
      setSubmitError(translateApiError(error))
    }
  }

  return (
    <SectionCard
      label={t('members_section')}
      description={t(canManage ? 'members_description_owner' : 'members_description_member')}
    >
      {submitError ? <InlineAlert>{submitError}</InlineAlert> : null}
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>{t('member_column')}</th>
              <th>{t('member_role')}</th>
              <th>{t('member_date')}</th>
              {canManage ? <th>{t('member_actions')}</th> : null}
            </tr>
          </thead>
          <tbody>
            {sortedMembers.map((member) => {
              const userLabel = member.display_name?.trim() || member.email
              const isOwner = member.user_id === ownerId

              return (
                <tr key={member.user_id}>
                  <td>
                    <div className={styles.memberCell}>
                      <Avatar name={userLabel} size={26} />
                      <div className={styles.memberMeta}>
                        <div className={styles.memberPrimary}>{member.email}</div>
                        <div className={styles.memberSecondary}>
                          {member.display_name?.trim() || t('member_display_name_missing')}
                        </div>
                        <div className={styles.memberTertiary}>
                          {member.github_linked
                            ? t('member_github_connected')
                            : t('member_github_not_connected')}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td>
                    <span
                      className={`${styles.roleBadge} ${
                        isOwner ? styles.roleBadgeOwner : styles.roleBadgeMember
                      }`}
                    >
                      {isOwner ? t('owner_label') : t('member_user')}
                    </span>
                  </td>
                  <td className={styles.mutedText}>{formatJoinedAt(member.joined_at)}</td>
                  {canManage ? (
                    <td>
                      {isOwner ? null : (
                        <div className={styles.actions}>
                          <Button variant="danger" size="sm" onClick={() => setTarget(member)}>
                            {t('remove_member')}
                          </Button>
                        </div>
                      )}
                    </td>
                  ) : null}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <ConfirmDialog
        open={target !== null}
        onOpenChange={(open) => {
          if (!open) {
            setTarget(null)
          }
        }}
        title={t('remove_member_confirm_title')}
        confirmText={t('remove_member')}
        confirmVariant="danger"
        loading={isLoading}
        onConfirm={() => void handleRemoveMember()}
        {...(target
          ? {
              description: t('remove_member_confirm', { email: target.email }),
            }
          : {})}
      />
    </SectionCard>
  )
}
