import { Check, ChevronRight, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/shared/lib/cn'
import { formatRelativeShort } from '@/shared/lib/date'
import { Button } from '@/shared/ui/Button/Button'
import { StatusPill } from '@/shared/ui/StatusPill/StatusPill'
import type { TaskSummary } from '@/features/tasks/model/types'
import { useCancelTaskMutation } from '@/features/tasks/api/tasksApi'
import { PipelineProgress } from '../PipelineProgress'
import { TaskTypeIcon } from '../TaskTypeIcon'
import styles from './TaskRow.module.css'

interface TaskRowProps {
  task: TaskSummary
  batchMode: boolean
  isSelected: boolean
  onToggleSelect: (taskId: string, event?: React.MouseEvent) => void
  onOpenTask: (taskId: string) => void
  onDownload: (task: TaskSummary) => void
  onRetry: (taskId: string) => void
  onRemove: (taskId: string) => void
  onPublish: (taskId: string) => void
  isPublishing?: boolean
  isRetrying?: boolean
  isDownloading?: boolean
}

export function TaskRow({
  task,
  batchMode,
  isSelected,
  onToggleSelect,
  onOpenTask,
  onDownload,
  onRetry,
  onRemove,
  onPublish,
  isPublishing = false,
  isRetrying = false,
  isDownloading = false,
}: TaskRowProps) {
  const { t } = useTranslation(['tasks', 'teams'])
  const [cancelTask, { isLoading: cancelling }] = useCancelTaskMutation()
  const lastSlash = task.file_path.lastIndexOf('/')
  const dir = lastSlash >= 0 ? task.file_path.slice(0, lastSlash + 1) : ''
  const file = lastSlash >= 0 ? task.file_path.slice(lastSlash + 1) : task.file_path
  const canPublish = task.status === 'done' && Boolean(task.project_id)
  const hasReplacementContent =
    task.status === 'done' ||
    task.status === 'published' ||
    task.status === 'failed' ||
    task.status === 'conflict'

  const handleRowClick = (event: React.MouseEvent) => {
    if (event.ctrlKey || event.metaKey || batchMode) {
      onToggleSelect(task.id, event)
      return
    }
    onOpenTask(task.id)
  }

  return (
    <article
      className={cn(styles.row, batchMode && styles.rowBatchMode)}
      role="button"
      tabIndex={0}
      onClick={handleRowClick}
      onKeyDown={(event) => {
        if (event.key !== 'Enter' && event.key !== ' ') {
          return
        }

        event.preventDefault()
        if (batchMode) {
          onToggleSelect(task.id)
          return
        }

        onOpenTask(task.id)
      }}
    >
      <div className={styles.checkboxCell}>
        <button
          type="button"
          className={cn(
            styles.checkbox,
            (batchMode || isSelected) && styles.checkboxVisible,
            isSelected && styles.checkboxSelected,
          )}
          aria-pressed={isSelected}
          onClick={(event) => {
            event.stopPropagation()
            onToggleSelect(task.id, event)
          }}
        >
          <Check size={10} />
        </button>
      </div>

      <div className={styles.path}>
        <span className={styles.typeIcon}>
          <TaskTypeIcon task={task} size={13} />
        </span>
        <span className={styles.pathText}>
          <span className={styles.pathValue}>
            {dir ? <span className={styles.dir}>{dir}</span> : null}
            <span className={styles.file}>{file}</span>
          </span>
          <span className={styles.lang}>RU -&gt; EN</span>
        </span>
      </div>

      <div className={styles.project}>
        <span>{task.project_name ?? t('project_manual')}</span>
        {task.is_team_task && <span className={styles.teamBadge}>{t('teams:team_badge')}</span>}
      </div>

      <div className={styles.statusCell}>
        {task.status === 'running' ? (
          <PipelineProgress currentStage={task.current_stage} startedAt={task.created_at} />
        ) : (
          <StatusPill status={task.status} />
        )}
      </div>

      <div className={styles.time}>{formatRelativeShort(task.completed_at ?? task.updated_at)}</div>

      <div className={styles.tailCell}>
        {canPublish ? (
          <div className={styles.quickActions}>
            <button
              type="button"
              className={styles.quickAction}
              disabled={isDownloading}
              onClick={(event) => {
                event.stopPropagation()
                onDownload(task)
              }}
            >
              {isDownloading ? `${t('actions.download')}…` : t('actions.download')}
            </button>
            <span className={styles.divider} aria-hidden="true" />
            <button
              type="button"
              className={styles.quickAction}
              disabled={isPublishing}
              onClick={(event) => {
                event.stopPropagation()
                onPublish(task.id)
              }}
            >
              {isPublishing ? t('actions.publish') + '…' : t('actions.publish')}
            </button>
          </div>
        ) : null}

        {task.status === 'done' && !task.project_id ? (
          <button
            type="button"
            className={styles.quickActionSingle}
            disabled={isDownloading}
            onClick={(event) => {
              event.stopPropagation()
              onDownload(task)
            }}
          >
            {isDownloading ? `${t('actions.download')}…` : t('actions.download')}
          </button>
        ) : null}

        {task.status === 'published' ? (
          <button
            type="button"
            className={styles.quickActionSingle}
            disabled={isDownloading}
            onClick={(event) => {
              event.stopPropagation()
              onDownload(task)
            }}
          >
            {isDownloading ? `${t('actions.download')}…` : t('actions.download')}
          </button>
        ) : null}

        {task.status === 'failed' ? (
          <button
            type="button"
            className={styles.quickActionSingle}
            disabled={isRetrying}
            onClick={(event) => {
              event.stopPropagation()
              onRetry(task.id)
            }}
          >
            {isRetrying ? `${t('actions.retry')}…` : t('actions.retry')}
          </button>
        ) : null}

        {task.status === 'queued' ? (
          <button
            type="button"
            className={styles.quickActionSingle}
            onClick={(event) => {
              event.stopPropagation()
              onRemove(task.id)
            }}
          >
            {t('actions.remove_from_queue')}
          </button>
        ) : null}

        {task.status === 'conflict' ? (
          <button
            type="button"
            className={styles.quickActionSingle}
            onClick={(event) => {
              event.stopPropagation()
              onOpenTask(task.id)
            }}
          >
            {t('actions.resolve')}
          </button>
        ) : null}

        {(task.status === 'queued' || task.status === 'running') && (
          <Button
            variant="ghost"
            size="sm"
            iconLeft={<X size={13} />}
            loading={cancelling}
            title={t('task.cancel_action')}
            onClick={(e) => {
              e.stopPropagation()
              void cancelTask(task.id)
            }}
          />
        )}

        <span
          className={cn(
            styles.arrow,
            hasReplacementContent ? styles.arrowReplaced : styles.arrowKept,
          )}
        >
          <ChevronRight size={14} />
        </span>
      </div>
    </article>
  )
}
