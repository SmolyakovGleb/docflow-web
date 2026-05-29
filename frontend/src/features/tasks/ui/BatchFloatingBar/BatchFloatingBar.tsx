import { ArrowUpFromLine, Download } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/shared/lib/cn'
import { StickyActionBar } from '@/shared/ui/StickyActionBar/StickyActionBar'
import styles from './BatchFloatingBar.module.css'

interface BatchFloatingBarProps {
  selectedCount: number
  selectedDoneCount: number
  hasGithubLinked: boolean
  onDownload: () => void
  onPublish: () => void
  onClose: () => void
}

export function BatchFloatingBar({
  selectedCount,
  selectedDoneCount,
  hasGithubLinked,
  onDownload,
  onPublish,
  onClose,
}: BatchFloatingBarProps) {
  const { t } = useTranslation('tasks')

  return (
    <StickyActionBar
      visible={selectedCount > 0}
      wrapSummary={false}
      closeLabel={t('toolbar.clear_selection')}
      onClose={onClose}
      summary={
        <span className={styles.count}>
          <strong>{selectedCount}</strong> {t('batch.selected_label')}
        </span>
      }
      actions={
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
          {hasGithubLinked ? (
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
          ) : null}
        </div>
      }
    />
  )
}
