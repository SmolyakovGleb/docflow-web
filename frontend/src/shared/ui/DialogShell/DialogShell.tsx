import * as Dialog from '@radix-ui/react-dialog'
import type { ReactNode } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/shared/lib/cn'
import styles from './DialogShell.module.css'

interface DialogShellProps {
  open: boolean
  onOpenChange?: ((open: boolean) => void) | undefined
  title: ReactNode
  description?: ReactNode
  children: ReactNode
  footer?: ReactNode
  size?: 'sm' | 'md' | 'lg'
  position?: 'center' | 'top'
  showCloseButton?: boolean
  closeLabel?: string
  preventClose?: boolean
  overlayTestId?: string
  overlayClassName?: string | undefined
  contentClassName?: string | undefined
  headerClassName?: string | undefined
  titleClassName?: string | undefined
  descriptionClassName?: string | undefined
  bodyClassName?: string | undefined
  footerClassName?: string | undefined
  headerActions?: ReactNode
}

export function DialogShell({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  size = 'md',
  position = 'center',
  showCloseButton = false,
  closeLabel = 'Close',
  preventClose = false,
  overlayTestId,
  overlayClassName,
  contentClassName,
  headerClassName,
  titleClassName,
  descriptionClassName,
  bodyClassName,
  footerClassName,
  headerActions,
}: DialogShellProps) {
  const rootProps = onOpenChange ? { onOpenChange } : {}
  const contentProps = preventClose
    ? {
        onEscapeKeyDown: (
          event: Parameters<NonNullable<Dialog.DialogContentProps['onEscapeKeyDown']>>[0],
        ) => event.preventDefault(),
        onInteractOutside: (
          event: Parameters<NonNullable<Dialog.DialogContentProps['onInteractOutside']>>[0],
        ) => event.preventDefault(),
      }
    : {}

  return (
    <Dialog.Root open={open} {...rootProps}>
      <Dialog.Portal>
        <Dialog.Overlay
          className={cn(styles.overlay, overlayClassName)}
          data-testid={overlayTestId}
        />
        <Dialog.Content
          className={cn(styles.content, styles[size], styles[position], contentClassName)}
          {...contentProps}
        >
          <div className={cn(styles.header, headerClassName)}>
            <div className={styles.heading}>
              <Dialog.Title className={cn(styles.title, titleClassName)}>{title}</Dialog.Title>
              {description ? (
                <Dialog.Description className={cn(styles.description, descriptionClassName)}>
                  {description}
                </Dialog.Description>
              ) : null}
            </div>

            {showCloseButton && onOpenChange ? (
              <Dialog.Close asChild>
                <button type="button" className={styles.closeButton} aria-label={closeLabel}>
                  <X size={16} />
                </button>
              </Dialog.Close>
            ) : (
              (headerActions ?? null)
            )}
          </div>

          <div className={cn(styles.body, bodyClassName)}>{children}</div>
          {footer ? <div className={cn(styles.footer, footerClassName)}>{footer}</div> : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
