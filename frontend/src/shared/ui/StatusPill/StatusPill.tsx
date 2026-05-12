import { AlertTriangle, CheckCircle, Clock, GitMerge, XCircle, type LucideIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { TaskStatus } from '@/features/tasks/model/types'
import { cn } from '@/shared/lib/cn'
import styles from './StatusPill.module.css'

const STATUS_ICON: Partial<Record<TaskStatus, LucideIcon>> = {
  queued: Clock,
  done: CheckCircle,
  failed: XCircle,
  published: GitMerge,
  conflict: AlertTriangle,
}

interface StatusPillProps {
  status: TaskStatus
  className?: string
}

export function StatusPill({ status, className }: StatusPillProps) {
  const { t } = useTranslation('tasks')
  const Icon = STATUS_ICON[status]

  return (
    <span className={cn(styles.root, styles[status], className)}>
      <span className={styles.iconSlot}>
        {status === 'running' ? (
          <span className={styles.pulseDot} />
        ) : (
          Icon && <Icon size={11} strokeWidth={2} />
        )}
      </span>
      <span>{t(`status.${status}`)}</span>
    </span>
  )
}
