import { WifiOff } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import styles from './TaskListEmpty.module.css'

interface TaskListErrorProps {
  isRetrying: boolean
  onRetry: () => void
}

export function TaskListError({ isRetrying, onRetry }: TaskListErrorProps) {
  const { t } = useTranslation('tasks')

  return (
    <section className={styles.state}>
      <div className={styles.icon}>
        <WifiOff size={22} />
      </div>
      <h2 className={styles.title}>{t('load_error_title')}</h2>
      <p className={styles.description}>{t('load_error_description')}</p>
      <div className={styles.actions}>
        <button
          type="button"
          className={styles.secondaryButton}
          onClick={onRetry}
          disabled={isRetrying}
        >
          {isRetrying ? t('common:loading') : t('common:retry')}
        </button>
      </div>
    </section>
  )
}
