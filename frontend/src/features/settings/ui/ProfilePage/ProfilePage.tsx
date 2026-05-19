import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { useLogoutMutation } from '@/features/auth/api/authApi'
import { clearUser, selectUser } from '@/features/auth/model/authSlice'
import { useGetHealthQuery } from '@/shared/api/healthApi'
import { translateApiError } from '@/shared/lib/errorMessages'
import { useAppDispatch, useAppSelector } from '@/shared/store/hooks'
import { Button } from '@/shared/ui/Button/Button'
import { SectionCard } from '@/shared/ui/SectionCard/SectionCard'
import { toast } from '@/shared/ui/Toast/toast'
import { ChangePasswordForm } from './ChangePasswordForm'
import styles from './ProfilePage.module.css'

export function ProfilePage() {
  const { t } = useTranslation(['settings', 'common'])
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  const user = useAppSelector(selectUser)
  const { data: health } = useGetHealthQuery()
  const [logout, { isLoading }] = useLogoutMutation()

  async function handleLogout() {
    try {
      await logout().unwrap()
      dispatch(clearUser())
      void navigate('/login', { replace: true })
    } catch (error) {
      toast.error(translateApiError(error))
    }
  }

  return (
    <>
      <SectionCard
        label={t('profile.account_section')}
        footer={
          <Button
            className={styles.logoutButton}
            loading={isLoading}
            variant="secondary"
            onClick={() => void handleLogout()}
          >
            {t('common:logout')}
          </Button>
        }
      >
        <div className={styles.field}>
          <span className={styles.fieldLabel}>{t('profile.email_label')}</span>
          <span className={styles.fieldValue}>{user?.email}</span>
        </div>
        {user?.display_name ? (
          <div className={styles.field}>
            <span className={styles.fieldLabel}>{t('profile.display_name_label')}</span>
            <span className={styles.fieldValue}>{user.display_name}</span>
          </div>
        ) : null}
      </SectionCard>

      <SectionCard label={t('profile.password_section')}>
        <ChangePasswordForm />
      </SectionCard>

      <SectionCard label={t('profile.pipeline_section')}>
        <div className={styles.field}>
          <span className={styles.fieldLabel}>{t('profile.pipeline_version_label')}</span>
          <span className={styles.fieldValue}>{health?.pipeline_version ?? '—'}</span>
        </div>
      </SectionCard>
    </>
  )
}
