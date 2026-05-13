import { ArrowUpFromLine, Download, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/shared/lib/cn'
import styles from './BatchFloatingBar.module.css'

interface BatchFloatingBarProps {
  selectedCount: number
  selectedDoneCount: number
  onDownload: () => void
  onPublish: () => void
  onClose: () => void
}

export function BatchFloatingBar({
  selectedCount,
  selectedDoneCount,
  onDownload,
  onPublish,
  onClose,
}: BatchFloatingBarProps) {
  const { t } = useTranslation('tasks')

  return (
    <div className={cn(styles.bar, selectedCount > 0 && styles.barVisible)}>
      <span className={styles.count}>
        <strong>{selectedCount}</strong> {t('batch.selected_label')}
      </span>
      <span className={styles.divider} aria-hidden="true" />
      <div className={styles.actions}>
        <button
          type="button"
          className={styles.actionButton}
          aria-label={t('batch.download')}
          onClick={onDownload}
        >
          <Download size={13} />
          <span>{t('batch.download')}</span>
          <span className={styles.actionCount}>{selectedCount}</span>
        </button>
        <button
          type="button"
          className={cn(styles.actionButton, styles.actionButtonPrimary)}
          aria-label={t('batch.publish_ready', { count: selectedDoneCount })}
          disabled={selectedDoneCount === 0}
          onClick={onPublish}
        >
          <ArrowUpFromLine size={13} />
          <span>{t('batch.publish_action')}</span>
          <span className={styles.actionCount}>{selectedDoneCount}</span>
        </button>
      </div>
      <button
        type="button"
        className={styles.closeButton}
        aria-label={t('toolbar.clear_selection')}
        onClick={onClose}
      >
        <X size={12} />
      </button>
    </div>
  )
}
