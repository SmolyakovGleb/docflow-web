import * as Dialog from '@radix-ui/react-dialog'
import { Trans, useTranslation } from 'react-i18next'
import { Button } from '@/shared/ui/Button/Button'
import styles from '../TaskDetailPage/TaskDetailPage.module.css'

interface RetryConflictDialogData {
  filePath: string
  sourceRepo: string | null
  oldSha: string | null
  newSha: string | null
}

interface RetryConflictDialogProps {
  open: boolean
  data: RetryConflictDialogData | null
  loading?: boolean
  onOpenChange: (open: boolean) => void
  onCreateNew: () => void
  onUseOld: () => void
}

export function RetryConflictDialog({
  open,
  data,
  loading = false,
  onOpenChange,
  onCreateNew,
  onUseOld,
}: RetryConflictDialogProps) {
  const { t } = useTranslation('tasks')

  if (!data) {
    return null
  }

  const repoText = data.sourceRepo ? t('retry_conflict.in_repo', { repo: data.sourceRepo }) : ''

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className={styles.dialogOverlay} />
        <Dialog.Content className={styles.dialogContent}>
          <Dialog.Title className={styles.dialogTitle}>{t('retry_conflict.title')}</Dialog.Title>
          <Dialog.Description className={styles.dialogDescription}>
            <Trans
              t={t}
              i18nKey="retry_conflict.file_changed"
              values={{ filePath: data.filePath, repoText }}
              components={{ code: <code /> }}
            />
          </Dialog.Description>
          <div className={styles.dialogCode}>
            <span>{t('retry_conflict.sha_old', { sha: data.oldSha ?? 'n/a' })}</span>
            <span>{t('retry_conflict.sha_new', { sha: data.newSha ?? 'n/a' })}</span>
          </div>
          <div className={styles.dialogActions}>
            <Button loading={loading} onClick={onCreateNew}>
              {t('retry_conflict.create_new')}
            </Button>
            <Button variant="secondary" loading={loading} onClick={onUseOld}>
              {t('retry_conflict.use_old')}
            </Button>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              {t('retry_conflict.cancel')}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
