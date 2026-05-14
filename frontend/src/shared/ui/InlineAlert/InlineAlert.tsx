import { AlertTriangle } from 'lucide-react'
import type { ComponentType, ReactNode } from 'react'
import { cn } from '@/shared/lib/cn'
import styles from './InlineAlert.module.css'

interface InlineAlertProps {
  children: ReactNode
  icon?: ComponentType<{ size?: number }>
  className?: string | undefined
}

export function InlineAlert({ children, icon: Icon = AlertTriangle, className }: InlineAlertProps) {
  return (
    <div className={cn(styles.root, className)} role="alert">
      <Icon size={14} />
      <span>{children}</span>
    </div>
  )
}
