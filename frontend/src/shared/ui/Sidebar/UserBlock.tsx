import { Avatar } from '@/shared/ui/Avatar/Avatar'
import { selectUser } from '@/features/auth/model/authSlice'
import { useAppSelector } from '@/shared/store/hooks'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import styles from './Sidebar.module.css'

export function UserBlock() {
  const { t } = useTranslation('nav')
  const navigate = useNavigate()
  const user = useAppSelector(selectUser)

  if (!user) {
    return null
  }

  const userLabel = user.display_name?.trim() || user.email
  const githubStatus = user.github_linked ? t('github_connected') : t('github_disconnected')

  return (
    <button
      className={styles.userButton}
      type="button"
      onClick={() => void navigate('/settings/profile')}
    >
      <Avatar name={userLabel} size={26} />
      <span className={styles.userMeta}>
        <span className={styles.userName}>{userLabel}</span>
        {user.is_admin && <span className={styles.adminBadge}>{t('admin_badge')}</span>}
        <span className={styles.userStatus}>
          <span
            className={user.github_linked ? styles.githubDot : styles.githubDotOff}
            aria-hidden
          />
          <span>{githubStatus}</span>
        </span>
      </span>
    </button>
  )
}
