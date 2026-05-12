import { useTranslation } from 'react-i18next'
import { Spinner } from '@/shared/ui/Spinner/Spinner'
import styles from './Splash.module.css'

export function Splash() {
  const { t } = useTranslation('common')

  return (
    <main className={styles.page}>
      <section className={styles.card}>
        <div className={styles.wordmark}>
          <span className={styles.glyph} aria-hidden>
            <span />
            <span />
            <span />
          </span>
          <span>DocFlow</span>
        </div>

        <div className={styles.status}>
          <Spinner size={16} />
          <span>{t('loading')}</span>
        </div>
      </section>
    </main>
  )
}
