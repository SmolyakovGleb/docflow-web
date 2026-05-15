import { FileClock } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/shared/ui/Button/Button'
import styles from './PageInDevelopmentPage.module.css'

interface PageInDevelopmentPageProps {
  title: string
  description?: string
}

export default function PageInDevelopmentPage({ title, description }: PageInDevelopmentPageProps) {
  const { t } = useTranslation('common')
  const navigate = useNavigate()

  return (
    <main className={styles.page}>
      <section className={styles.card}>
        <span className={styles.icon} aria-hidden>
          <FileClock size={28} />
        </span>
        <h1 className={styles.title}>{title}</h1>
        <p className={styles.description}>{description ?? t('page_in_development_description')}</p>
        <Button
          variant="secondary"
          onClick={() => {
            void navigate(-1)
          }}
        >
          {t('back')}
        </Button>
      </section>
    </main>
  )
}
