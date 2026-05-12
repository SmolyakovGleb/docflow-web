import { LoaderCircle } from 'lucide-react'
import { cn } from '@/shared/lib/cn'
import styles from './Spinner.module.css'

interface SpinnerProps {
  size?: number
  className?: string
  label?: string
}

export function Spinner({ size = 16, className, label }: SpinnerProps) {
  return (
    <span
      className={cn(styles.root, className)}
      aria-hidden={label ? undefined : true}
      aria-label={label}
    >
      <LoaderCircle size={size} strokeWidth={2} />
    </span>
  )
}
