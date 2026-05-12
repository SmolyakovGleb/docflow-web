import { useTranslation } from 'react-i18next'
import { AuthStageFooter, AuthStagePlaceholder } from '@/features/auth/ui/AuthStagePlaceholder'

export default function RegisterPage() {
  const { t } = useTranslation('auth')

  return (
    <AuthStagePlaceholder
      title={t('register_title')}
      subtitle={t('stage2_register_subtitle')}
      notice={t('stage2_register_notice')}
      footer={<AuthStageFooter prefix={t('have_account')} linkText={t('to_login')} to="/login" />}
    />
  )
}
