import * as Dialog from '@radix-ui/react-dialog'
import { useTranslation } from 'react-i18next'
import { Button } from '@/shared/ui/Button/Button'
import styles from '../TaskDetailPage/TaskDetailPage.module.css'

interface PublishConflictDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onOpenConflict: () => void
}

export function PublishConflictDialog({
  open,
  onOpenChange,
  onOpenConflict,
}: PublishConflictDialogProps) {
  const { t } = useTranslation('tasks')

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className={styles.dialogOverlay} />
        <Dialog.Content className={styles.dialogContent}>
          <Dialog.Title className={styles.dialogTitle}>{t('publish_conflict.title')}</Dialog.Title>
          <Dialog.Description className={styles.dialogDescription}>
            {t('publish_conflict.description', { tab: t('detail_tabs.conflict') })}
          </Dialog.Description>
          <div className={styles.dialogActions}>
            <Button onClick={onOpenConflict}>{t('publish_conflict.open_conflict')}</Button>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              {t('publish_conflict.close')}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
