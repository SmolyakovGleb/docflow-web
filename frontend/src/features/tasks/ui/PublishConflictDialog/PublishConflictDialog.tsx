import { useTranslation } from 'react-i18next'
import { ConfirmDialog } from '@/shared/ui/ConfirmDialog/ConfirmDialog'

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
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('publish_conflict.title')}
      description={t('publish_conflict.description', { tab: t('detail_tabs.conflict') })}
      confirmText={t('publish_conflict.open_conflict')}
      cancelText={t('publish_conflict.close')}
      onConfirm={onOpenConflict}
    />
  )
}
