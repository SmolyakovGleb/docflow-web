import { AlertTriangle } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { TaskStatus } from '@/features/tasks/model/types'
import { cn } from '@/shared/lib/cn'
import styles from './StatusPill.module.css'

interface StatusPillProps {
  status: TaskStatus
  className?: string | undefined
}

export function StatusPill({ status, className }: StatusPillProps) {
  const { t } = useTranslation('tasks')
  const showIndicator = status === 'running' || status === 'conflict'

  return (
    <span
      className={cn(styles.root, styles[status], showIndicator && styles.withIndicator, className)}
    >
      {showIndicator ? (
        <span className={styles.iconSlot}>
          {status === 'running' ? (
            <span className={styles.pulseDot} />
          ) : (
            <AlertTriangle size={11} strokeWidth={1.8} />
          )}
        </span>
      ) : null}
      <span>{t(`status.${status}`)}</span>
    </span>
  )
}
