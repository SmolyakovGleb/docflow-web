import { useTranslation } from 'react-i18next'
import { DialogShell } from '../DialogShell/DialogShell'
import { Button } from '../Button/Button'
import styles from './ConfirmDialog.module.css'

interface ConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  confirmText?: string
  cancelText?: string
  confirmVariant?: 'primary' | 'danger'
  loading?: boolean
  onConfirm: () => void
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmText,
  cancelText,
  confirmVariant = 'primary',
  loading = false,
  onConfirm,
}: ConfirmDialogProps) {
  const { t } = useTranslation('common')

  return (
    <DialogShell
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      size="sm"
      overlayClassName={styles.overlay}
      contentClassName={styles.content}
      headerClassName={styles.header}
      titleClassName={styles.title}
      descriptionClassName={styles.description}
      footerClassName={styles.actions}
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            {cancelText ?? t('cancel')}
          </Button>
          <Button variant={confirmVariant} loading={loading} onClick={onConfirm}>
            {confirmText ?? t('confirm')}
          </Button>
        </>
      }
    >
      {null}
    </DialogShell>
  )
}
