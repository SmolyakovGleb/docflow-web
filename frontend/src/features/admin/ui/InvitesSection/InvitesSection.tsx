import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Copy, UserCheck } from 'lucide-react'
import { Button } from '@/shared/ui/Button/Button'
import { ConfirmDialog } from '@/shared/ui/ConfirmDialog/ConfirmDialog'
import { Field } from '@/shared/ui/Field/Field'
import { Input } from '@/shared/ui/Input/Input'
import { Skeleton } from '@/shared/ui/Skeleton/Skeleton'
import { toast } from '@/shared/ui/Toast/toast'
import {
  useCreateInviteTokenMutation,
  useGetInviteTokensQuery,
  useRevokeInviteTokenMutation,
} from '../../api/adminApi'
import styles from '../AdminPage/AdminPage.module.css'

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function InvitesSection() {
  const { t } = useTranslation(['admin', 'common'])
  const { data: tokens = [], isLoading } = useGetInviteTokensQuery()
  const [createToken, { isLoading: isCreating }] = useCreateInviteTokenMutation()
  const [revokeToken] = useRevokeInviteTokenMutation()
  const [expiresInDays, setExpiresInDays] = useState('')
  const [revokeTarget, setRevokeTarget] = useState<{ id: string; token: string } | null>(null)
  const [revokingId, setRevokingId] = useState<string | null>(null)

  const handleCreate = async () => {
    const days = expiresInDays.trim() ? parseInt(expiresInDays, 10) : null
    if (days !== null && days < 1) {
      toast.error(t('admin:invite_expires_min_error'))
      return
    }
    try {
      await createToken({ expires_in_days: days }).unwrap()
      setExpiresInDays('')
    } catch {
      toast.error(t('common:error'))
    }
  }

  const handleCopyLink = async (tokenUuid: string) => {
    const url = `${window.location.origin}/register?invite=${tokenUuid}`
    await navigator.clipboard.writeText(url)
    toast.success(t('admin:invite_copied'))
  }

  const handleRevokeConfirm = async () => {
    if (!revokeTarget) return
    setRevokingId(revokeTarget.id)
    try {
      await revokeToken(revokeTarget.id).unwrap()
      setRevokeTarget(null)
    } catch {
      toast.error(t('common:error'))
    } finally {
      setRevokingId(null)
    }
  }

  const statusClass = (s: string) => {
    if (s === 'active') return styles.statusActive
    if (s === 'used') return styles.statusUsed
    return styles.statusExpired
  }

  const statusLabel = (s: string) => {
    if (s === 'active') return t('admin:invite_status_active')
    if (s === 'used') return t('admin:invite_status_used')
    return t('admin:invite_status_expired')
  }

  return (
    <div className={styles.section}>
      <div className={styles.sectionHeader}>
        <span className={styles.sectionTitle}>
          {t('admin:invites_section')}
          <span className={styles.sectionCount}>{tokens.length}</span>
        </span>
        <div className={styles.createForm}>
          <Field label={t('admin:invite_expires_days')} htmlFor="invite-days">
            <Input
              id="invite-days"
              className={styles.daysInput}
              type="number"
              min={1}
              placeholder={t('admin:invite_expires_never')}
              value={expiresInDays}
              onChange={(e) => setExpiresInDays(e.target.value)}
            />
          </Field>
          <Button
            variant="secondary"
            size="sm"
            iconLeft={<UserCheck size={13} />}
            loading={isCreating}
            onClick={() => void handleCreate()}
          >
            {t('admin:invite_create')}
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className={styles.empty}>
          <Skeleton width="100%" height={120} />
        </div>
      ) : tokens.length === 0 ? (
        <div className={styles.empty}>{t('common:no_data')}</div>
      ) : (
        <table className={styles.table}>
          <thead>
            <tr>
              <th>{t('admin:invite_token')}</th>
              <th>{t('admin:invite_created_by')}</th>
              <th>{t('admin:invite_used_by')}</th>
              <th>{t('admin:invite_status')}</th>
              <th>{t('admin:invite_expires')}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {tokens.map((tok) => (
              <tr key={tok.id}>
                <td>
                  <span className={styles.tokenMono}>{tok.token}</span>
                </td>
                <td className={styles.dimText}>{tok.created_by_email}</td>
                <td className={styles.dimText}>{tok.used_by_email ?? '—'}</td>
                <td>
                  <span className={`${styles.statusBadge} ${statusClass(tok.status)}`}>
                    {statusLabel(tok.status)}
                  </span>
                </td>
                <td className={styles.dimText}>
                  {tok.expires_at ? formatDateTime(tok.expires_at) : '∞'}
                </td>
                <td>
                  <div className={styles.actions}>
                    <Button
                      variant="secondary"
                      size="sm"
                      iconLeft={<Copy size={13} />}
                      onClick={() => void handleCopyLink(tok.token)}
                    >
                      {t('admin:invite_copy')}
                    </Button>
                    {tok.status === 'active' && (
                      <Button
                        variant="danger"
                        size="sm"
                        loading={revokingId === tok.id}
                        onClick={() => setRevokeTarget({ id: tok.id, token: tok.token })}
                      >
                        {t('admin:invite_revoke')}
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <ConfirmDialog
        open={revokeTarget !== null}
        onOpenChange={(open) => {
          if (!open) setRevokeTarget(null)
        }}
        title={t('admin:invite_revoke')}
        description={t('admin:invite_revoke_confirm', {
          token: revokeTarget ? `${revokeTarget.token.slice(0, 8)}` : '',
        })}
        confirmVariant="danger"
        loading={revokingId !== null}
        onConfirm={() => void handleRevokeConfirm()}
      />
    </div>
  )
}
