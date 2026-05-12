import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { AuthLayout } from '@/features/auth/ui/AuthLayout'
import { RegisterForm } from '@/features/auth/ui/RegisterForm'

export default function RegisterPage() {
  const { t } = useTranslation('auth')

  return (
    <AuthLayout
      title={t('register_title')}
      subtitle={t('register_subtitle')}
      footer={
        <>
          {t('have_account')} <Link to="/login">{t('to_login')}</Link>
        </>
      }
    >
      <RegisterForm />
    </AuthLayout>
  )
}
