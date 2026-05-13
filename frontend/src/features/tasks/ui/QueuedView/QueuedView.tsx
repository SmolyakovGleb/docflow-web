import { Clock3 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import styles from '../TaskDetailPage/TaskDetailPage.module.css'

interface QueuedViewProps {
  seconds: number
}

export function QueuedView({ seconds }: QueuedViewProps) {
  const { t } = useTranslation('tasks')
  const [remaining, setRemaining] = useState(seconds)

  useEffect(() => {
    const id = setTimeout(() => setRemaining(seconds), 0)
    return () => clearTimeout(id)
  }, [seconds])

  useEffect(() => {
    if (remaining <= 0) return undefined
    const id = setTimeout(() => setRemaining((value) => Math.max(0, value - 1)), 1000)
    return () => clearTimeout(id)
  }, [remaining])

  return (
    <div className={styles.queuedState}>
      <Clock3 className={styles.queuedIcon} />
      <div className={styles.queuedTitle}>{t('queued.title')}</div>
      <div className={styles.queuedDescription}>{t('queued.description')}</div>
      <div className={styles.queuedCountdown}>{t('queued.starts_in', { seconds: remaining })}</div>
    </div>
  )
}
