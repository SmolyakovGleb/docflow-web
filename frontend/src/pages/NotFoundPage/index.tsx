import { CircleAlert } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/shared/ui/Button/Button'
import styles from './NotFoundPage.module.css'

export default function NotFoundPage() {
  const { t } = useTranslation('notFound')
  const navigate = useNavigate()

  return (
    <main className={styles.page}>
      <section className={styles.card}>
        <span className={styles.icon} aria-hidden>
          <CircleAlert size={28} />
        </span>
        <div className={styles.code}>{t('code')}</div>
        <h1 className={styles.title}>{t('title')}</h1>
        <p className={styles.description}>{t('description')}</p>
        <Button
          variant="secondary"
          onClick={() => {
            void navigate('/tasks')
          }}
        >
          {t('home_action')}
        </Button>
      </section>
    </main>
  )
}
