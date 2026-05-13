import { Copy, Download } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { ParsedTaskLogStage, TaskPipelineStage } from '@/features/tasks/model/types'
import styles from '../TaskDetailPage/TaskDetailPage.module.css'
import { LogsStage } from '../LogsStage/LogsStage'

interface LogsViewProps {
  stages: ParsedTaskLogStage[]
  runtime: string
  currentStage?: TaskPipelineStage | null
  onCopy: () => void
  onDownload?: (() => void) | undefined
}

export function LogsView({
  stages,
  runtime,
  currentStage = null,
  onCopy,
  onDownload,
}: LogsViewProps) {
  const { t } = useTranslation('tasks')

  return (
    <section className={styles.logsWrap}>
      <div className={styles.logsToolbar}>
        <span
          className={`${styles.logsRuntime} ${currentStage ? styles.logsRuntimeRunning : ''}`.trim()}
        >
          <span className={styles.runtimeLabel}>{t('logs.runtime')}:</span>
          <span>{runtime}</span>
        </span>
        <div className={styles.logsTools}>
          <button
            type="button"
            className={styles.iconButton}
            aria-label={t('logs.copy')}
            onClick={onCopy}
          >
            <Copy size={13} />
          </button>
          {onDownload ? (
            <button
              type="button"
              className={styles.iconButton}
              aria-label={t('actions.download')}
              onClick={onDownload}
            >
              <Download size={13} />
            </button>
          ) : null}
        </div>
      </div>

      <div className={styles.logsBody}>
        {stages.map((stage) => (
          <LogsStage key={stage.id} stage={stage} isRunning={currentStage === stage.id} />
        ))}
      </div>
    </section>
  )
}
