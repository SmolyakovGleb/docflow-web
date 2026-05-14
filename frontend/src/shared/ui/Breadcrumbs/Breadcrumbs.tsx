import type { ReactNode } from 'react'
import { ChevronRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import { cn } from '@/shared/lib/cn'
import styles from './Breadcrumbs.module.css'

interface BreadcrumbItem {
  label: ReactNode
  to: string
}

interface BreadcrumbsProps {
  items: BreadcrumbItem[]
  current: ReactNode
  ariaLabel?: string
  className?: string | undefined
  currentClassName?: string | undefined
}

export function Breadcrumbs({
  items,
  current,
  ariaLabel = 'breadcrumb',
  className,
  currentClassName,
}: BreadcrumbsProps) {
  return (
    <nav className={cn(styles.root, className)} aria-label={ariaLabel}>
      <ol className={styles.list}>
        {items.map((item) => (
          <li key={item.to} className={styles.item}>
            <Link className={styles.link} to={item.to}>
              {item.label}
            </Link>
            <span className={styles.separator} aria-hidden>
              <ChevronRight size={12} />
            </span>
          </li>
        ))}
        <li className={cn(styles.item, styles.current, currentClassName)}>{current}</li>
      </ol>
    </nav>
  )
}
