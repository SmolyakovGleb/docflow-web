import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AuthLogo } from '../AuthLogo'
import styles from './index.module.css'

interface AuthLayoutProps {
  title: string
  subtitle: string
  footer: ReactNode
  children: ReactNode
}

export function AuthLayout({ title, subtitle, footer, children }: AuthLayoutProps) {
  const { t } = useTranslation('auth')

  return (
    <main className={styles.page}>
      <div className={styles.stack}>
        <section className={styles.card}>
          <AuthLogo />
          <h1 className={styles.title}>{title}</h1>
          <p className={styles.subtitle}>{subtitle}</p>
          {children}
          <div className={styles.footer}>{footer}</div>
        </section>

        <div className={styles.legal}>
          {t('legal_prefix')}{' '}
          <Link className={styles.legalLink} to="/terms">
            {t('terms_link')}
          </Link>{' '}
          {t('legal_and')}{' '}
          <Link className={styles.legalLink} to="/privacy">
            {t('privacy_link')}
          </Link>
          .
        </div>
      </div>
    </main>
  )
}
