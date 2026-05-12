import type { ButtonHTMLAttributes, ElementType, ReactNode } from 'react'
import { cn } from '@/shared/lib/cn'
import { Spinner } from '../Spinner/Spinner'
import styles from './Button.module.css'

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
type ButtonSize = 'sm' | 'md' | 'lg'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  as?: ElementType
  variant?: ButtonVariant
  size?: ButtonSize
  iconLeft?: ReactNode
  iconRight?: ReactNode
  loading?: boolean
  fullWidth?: boolean
}

export function Button({
  as,
  variant = 'primary',
  size = 'md',
  iconLeft,
  iconRight,
  loading = false,
  fullWidth = false,
  className,
  children,
  disabled,
  type = 'button',
  ...props
}: ButtonProps) {
  const Component: ElementType = as ?? 'button'
  const isButton = Component === 'button'
  const isDisabled = Boolean(disabled) || loading
  const componentProps: Record<string, unknown> = {
    className: cn(
      styles.root,
      styles[variant],
      styles[size],
      fullWidth && styles.fullWidth,
      isDisabled && styles.disabled,
      className,
    ),
    'aria-busy': loading || undefined,
    ...props,
  }

  if (isButton) {
    componentProps.type = type
    componentProps.disabled = isDisabled
  }

  return (
    <Component {...componentProps}>
      <span className={styles.content}>
        {(iconLeft || loading) && (
          <span className={styles.slot}>{loading ? <Spinner size={16} /> : iconLeft}</span>
        )}
        <span>{children}</span>
        {iconRight && !loading && <span className={styles.slot}>{iconRight}</span>}
      </span>
    </Component>
  )
}
