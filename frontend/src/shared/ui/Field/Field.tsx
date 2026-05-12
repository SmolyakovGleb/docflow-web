import type { ReactNode } from 'react'
import { cn } from '@/shared/lib/cn'
import styles from './Field.module.css'

interface FieldProps {
  label?: ReactNode
  htmlFor?: string
  hint?: ReactNode
  error?: ReactNode
  required?: boolean
  className?: string
  children: ReactNode
}

export function Field({
  label,
  htmlFor,
  hint,
  error,
  required = false,
  className,
  children,
}: FieldProps) {
  return (
    <div className={cn(styles.root, className)}>
      {label && (
        <div className={styles.labelRow}>
          <label className={styles.label} htmlFor={htmlFor}>
            {label}
            {required && <span className={styles.required}> *</span>}
          </label>
        </div>
      )}
      {children}
      {error ? (
        <div className={styles.error}>{error}</div>
      ) : hint ? (
        <div className={styles.hint}>{hint}</div>
      ) : null}
    </div>
  )
}
