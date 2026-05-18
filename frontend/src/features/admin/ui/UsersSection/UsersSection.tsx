import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ShieldCheck, ShieldOff, Trash2 } from 'lucide-react'
import { Button } from '@/shared/ui/Button/Button'
import { ConfirmDialog } from '@/shared/ui/ConfirmDialog/ConfirmDialog'
import { Skeleton } from '@/shared/ui/Skeleton/Skeleton'
import { toast } from '@/shared/ui/Toast/toast'
import {
  useDeleteAdminUserMutation,
  useGetAdminUsersQuery,
  useUpdateAdminUserMutation,
} from '../../api/adminApi'
import styles from '../AdminPage/AdminPage.module.css'

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

export function UsersSection() {
  const { t } = useTranslation(['admin', 'common'])
  const { data: users = [], isLoading } = useGetAdminUsersQuery()
  const [updateUser] = useUpdateAdminUserMutation()
  const [deleteUser, { isLoading: isDeleting }] = useDeleteAdminUserMutation()
  const [updatingId, setUpdatingId] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; email: string } | null>(null)

  const handleToggleAdmin = async (userId: string, currentIsAdmin: boolean) => {
    setUpdatingId(userId)
    try {
      await updateUser({ userId, payload: { is_admin: !currentIsAdmin } }).unwrap()
    } catch {
      toast.error(t('common:error'))
    } finally {
      setUpdatingId(null)
    }
  }

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return
    try {
      await deleteUser(deleteTarget.id).unwrap()
      setDeleteTarget(null)
    } catch {
      toast.error(t('common:error'))
    }
  }

  return (
    <div className={styles.section}>
      <div className={styles.sectionHeader}>
        <span className={styles.sectionTitle}>
          {t('admin:users_section')}
          <span className={styles.sectionCount}>{users.length}</span>
        </span>
      </div>

      {isLoading ? (
        <div className={styles.empty}>
          <Skeleton width="100%" height={120} />
        </div>
      ) : users.length === 0 ? (
        <div className={styles.empty}>{t('common:no_data')}</div>
      ) : (
        <table className={styles.table}>
          <thead>
            <tr>
              <th>{t('admin:user_email')}</th>
              <th>{t('admin:user_name')}</th>
              <th>{t('admin:user_tasks')}</th>
              <th>{t('admin:user_github')}</th>
              <th>{t('admin:user_created')}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id}>
                <td>
                  <span className={styles.email}>{user.email}</span>
                  {user.is_admin && (
                    <span className={styles.adminPill} style={{ marginLeft: 8 }}>
                      admin
                    </span>
                  )}
                </td>
                <td className={styles.dimText}>{user.display_name ?? '—'}</td>
                <td className={styles.dimText}>{user.task_count}</td>
                <td className={styles.dimText}>{user.github_linked ? '✓' : '—'}</td>
                <td className={styles.dimText}>{formatDate(user.created_at)}</td>
                <td>
                  <div className={styles.actions}>
                    <Button
                      variant="secondary"
                      size="sm"
                      iconLeft={user.is_admin ? <ShieldOff size={13} /> : <ShieldCheck size={13} />}
                      loading={updatingId === user.id}
                      onClick={() => void handleToggleAdmin(user.id, user.is_admin)}
                    >
                      {user.is_admin ? t('admin:demote') : t('admin:promote')}
                    </Button>
                    <Button
                      variant="danger"
                      size="sm"
                      iconLeft={<Trash2 size={13} />}
                      onClick={() => setDeleteTarget({ id: user.id, email: user.email })}
                    >
                      {t('admin:delete_user')}
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null)
        }}
        title={t('admin:delete_user')}
        description={t('admin:delete_user_confirm_full', { email: deleteTarget?.email ?? '' })}
        confirmVariant="danger"
        loading={isDeleting}
        onConfirm={() => void handleDeleteConfirm()}
      />
    </div>
  )
}
