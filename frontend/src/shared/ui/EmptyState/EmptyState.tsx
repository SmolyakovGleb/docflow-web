import { Inbox } from 'lucide-react'
import type { ComponentType, ReactNode } from 'react'
import { cn } from '@/shared/lib/cn'
import styles from './EmptyState.module.css'

interface EmptyStateProps {
  icon?: ComponentType<{ size?: number }>
  title: string
  description?: string
  actions?: ReactNode
  className?: string | undefined
}

export function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  actions,
  className,
}: EmptyStateProps) {
  return (
    <section className={cn(styles.root, className)}>
      <span className={styles.icon}>
        <Icon size={48} />
      </span>
      <div className={styles.title}>{title}</div>
      {description && <div className={styles.description}>{description}</div>}
      {actions && <div className={styles.actions}>{actions}</div>}
    </section>
  )
}
