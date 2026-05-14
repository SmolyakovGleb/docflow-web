import { ChevronDown } from 'lucide-react'
import { forwardRef, type ReactNode, type SelectHTMLAttributes } from 'react'
import { cn } from '@/shared/lib/cn'
import styles from './Select.module.css'

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  error?: boolean
  wrapperClassName?: string | undefined
  selectClassName?: string | undefined
  icon?: ReactNode
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  {
    error = false,
    wrapperClassName,
    selectClassName,
    icon = <ChevronDown size={12} />,
    className,
    disabled,
    children,
    ...props
  },
  ref,
) {
  return (
    <div className={cn(styles.wrap, wrapperClassName, className)}>
      <select
        ref={ref}
        className={cn(
          styles.select,
          error && styles.error,
          disabled && styles.disabled,
          selectClassName,
        )}
        disabled={disabled}
        {...props}
      >
        {children}
      </select>
      <span className={styles.icon} aria-hidden>
        {icon}
      </span>
    </div>
  )
})
