import { Bell } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import styles from './NewTasksBanner.module.css'

interface NewTasksBannerProps {
  count: number
  onRefresh: () => void
}

export function NewTasksBanner({ count, onRefresh }: NewTasksBannerProps) {
  const { t } = useTranslation('tasks')

  if (count === 0) return null

  return (
    <div className={styles.banner}>
      <div className={styles.content}>
        <Bell size={16} />
        <span>{t('banner.new_tasks', { count })}</span>
      </div>
      <button type="button" className={styles.button} onClick={onRefresh}>
        {t('banner.refresh')}
      </button>
    </div>
  )
}
