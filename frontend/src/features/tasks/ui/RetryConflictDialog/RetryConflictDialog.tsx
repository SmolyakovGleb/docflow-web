import { Trans, useTranslation } from 'react-i18next'
import { Button } from '@/shared/ui/Button/Button'
import { FormDialog } from '@/shared/ui/FormDialog/FormDialog'
import styles from './RetryConflictDialog.module.css'

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
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('retry_conflict.title')}
      description={
        <Trans
          t={t}
          i18nKey="retry_conflict.file_changed"
          values={{ filePath: data.filePath, repoText }}
          components={{ code: <code /> }}
        />
      }
      size="md"
      actions={
        <>
          <Button loading={loading} onClick={onCreateNew}>
            {t('retry_conflict.create_new')}
          </Button>
          <Button variant="secondary" loading={loading} onClick={onUseOld}>
            {t('retry_conflict.use_old')}
          </Button>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t('retry_conflict.cancel')}
          </Button>
        </>
      }
    >
      <div className={styles.code}>
        <span>{t('retry_conflict.sha_old', { sha: data.oldSha ?? 'n/a' })}</span>
        <span>{t('retry_conflict.sha_new', { sha: data.newSha ?? 'n/a' })}</span>
      </div>
    </FormDialog>
  )
}
