import { useTranslation } from 'react-i18next'
import { Spinner } from '@/shared/ui/Spinner/Spinner'
import { Wordmark } from '@/shared/ui/Wordmark/Wordmark'
import styles from './Splash.module.css'

export function Splash() {
  const { t } = useTranslation('common')

  return (
    <main className={styles.page}>
      <section className={styles.card}>
        <Wordmark variant="auth" className={styles.wordmark} />

        <div className={styles.status}>
          <Spinner size={16} />
          <span>{t('loading')}</span>
        </div>
      </section>
    </main>
  )
}
