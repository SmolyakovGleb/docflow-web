import { Inbox, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import styles from './EmptyState.module.css'

interface EmptyStateProps {
  icon?: LucideIcon
  title: string
  description?: string
  actions?: ReactNode
}

export function EmptyState({ icon: Icon = Inbox, title, description, actions }: EmptyStateProps) {
  return (
    <section className={styles.root}>
      <span className={styles.icon}>
        <Icon size={32} />
      </span>
      <div className={styles.title}>{title}</div>
      {description && <div className={styles.description}>{description}</div>}
      {actions && <div className={styles.actions}>{actions}</div>}
    </section>
  )
}
