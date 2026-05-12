import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { AuthLayout } from '@/features/auth/ui/AuthLayout'
import { LoginForm } from '@/features/auth/ui/LoginForm'

export default function LoginPage() {
  const { t } = useTranslation('auth')

  return (
    <AuthLayout
      title={t('login_title')}
      subtitle={t('login_subtitle')}
      footer={
        <>
          {t('no_account')} <Link to="/register">{t('to_register')}</Link>
        </>
      }
    >
      <LoginForm />
    </AuthLayout>
  )
}
