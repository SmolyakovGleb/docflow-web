import { Link } from 'react-router-dom'
import { cn } from '@/shared/lib/cn'
import styles from './Wordmark.module.css'

interface WordmarkProps {
  to?: string
  variant?: 'auth' | 'sidebar'
  className?: string | undefined
}

export function Wordmark({ to, variant = 'auth', className }: WordmarkProps) {
  const content = (
    <>
      <span
        className={cn(styles.glyph, styles[`glyph${variant === 'auth' ? 'Auth' : 'Sidebar'}`])}
        aria-hidden
      >
        <span />
        <span />
        <span />
      </span>
      <span>DocFlow</span>
    </>
  )

  if (to) {
    return (
      <Link className={cn(styles.root, styles[variant], className)} to={to} aria-label="DocFlow">
        {content}
      </Link>
    )
  }

  return <div className={cn(styles.root, styles[variant], className)}>{content}</div>
}
