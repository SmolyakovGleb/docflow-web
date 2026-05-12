import { useTranslation } from 'react-i18next'
import { AuthStageFooter, AuthStagePlaceholder } from '@/features/auth/ui/AuthStagePlaceholder'

export default function LoginPage() {
  const { t } = useTranslation('auth')

  return (
    <AuthStagePlaceholder
      title={t('login_title')}
      subtitle={t('stage2_login_subtitle')}
      notice={t('stage2_login_notice')}
      footer={
        <AuthStageFooter prefix={t('no_account')} linkText={t('to_register')} to="/register" />
      }
    />
  )
}
