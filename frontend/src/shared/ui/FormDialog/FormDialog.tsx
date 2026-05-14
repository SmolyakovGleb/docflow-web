import type { ReactNode } from 'react'
import { cn } from '@/shared/lib/cn'
import { DialogShell } from '@/shared/ui/DialogShell/DialogShell'
import styles from './FormDialog.module.css'

interface FormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: ReactNode
  size?: 'sm' | 'md'
  children: ReactNode
  actions: ReactNode
  contentClassName?: string | undefined
}

export function FormDialog({
  open,
  onOpenChange,
  title,
  description,
  size = 'sm',
  children,
  actions,
  contentClassName,
}: FormDialogProps) {
  return (
    <DialogShell
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      size={size}
      overlayClassName={styles.overlay}
      contentClassName={cn(styles.content, styles[size], contentClassName)}
      headerClassName={styles.header}
      titleClassName={styles.title}
      descriptionClassName={styles.description}
      bodyClassName={styles.body}
      footerClassName={styles.actions}
      footer={actions}
    >
      {children}
    </DialogShell>
  )
}
