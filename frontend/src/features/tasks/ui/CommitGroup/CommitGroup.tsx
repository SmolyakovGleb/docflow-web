import { GitCommitHorizontal, Terminal } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/shared/lib/cn'
import { formatCommitTimestamp } from '@/shared/lib/date'
import { getInitials } from '@/shared/lib/getInitials'
import type { TaskCommitGroup } from '@/features/tasks/lib/groupByCommit'
import type { TaskSummary } from '@/features/tasks/model/types'
import { TaskRow } from '../TaskRow'
import styles from './CommitGroup.module.css'

interface CommitGroupProps {
  group: TaskCommitGroup
  batchMode: boolean
  selectedIds: Set<string>
  onToggleSelect: (taskId: string, event?: React.MouseEvent) => void
  onOpenTask: (taskId: string) => void
  onDownload: (task: TaskSummary) => void
  onRetry: (taskId: string) => void
  onRemove: (taskId: string) => void
  onPublish: (taskId: string) => void
  onPublishGroup: (taskIds: string[]) => void
  publishingIds?: Set<string>
}

export function CommitGroup({
  group,
  batchMode,
  selectedIds,
  onToggleSelect,
  onOpenTask,
  onDownload,
  onRetry,
  onRemove,
  onPublish,
  onPublishGroup,
  publishingIds,
}: CommitGroupProps) {
  const { t } = useTranslation('tasks')
  const publishableIds = group.tasks
    .filter((task) => task.status === 'done' && Boolean(task.project_id))
    .map((task) => task.id)
  const isGroupPublishing = publishableIds.some((id) => publishingIds?.has(id))
  const authorLabel = group.authorName ?? group.authorLogin ?? t('manual_group')
  const message =
    group.commitMessage && group.commitMessage !== 'manual'
      ? group.commitMessage
      : t('manual_group')

  return (
    <section className={styles.group}>
      <header className={cn(styles.header, group.isManual && styles.headerManual)}>
        <span className={styles.iconWrap}>
          {group.isManual ? <Terminal size={14} /> : <GitCommitHorizontal size={14} />}
        </span>
        <span className={styles.message} title={message}>
          {message}
        </span>
        {group.sha ? <span className={styles.sha}>{group.sha.slice(0, 7)}</span> : null}

        <div className={styles.meta}>
          <span className={styles.author}>
            <span className={styles.avatar}>{getInitials(authorLabel)}</span>
            <span>{authorLabel}</span>
          </span>
          <span className={styles.sep} aria-hidden="true" />
          <span>{t('group.files', { count: group.tasks.length })}</span>
          <span className={styles.sep} aria-hidden="true" />
          <span>{formatCommitTimestamp(group.createdAt)}</span>
        </div>

        {publishableIds.length > 0 ? (
          <button
            type="button"
            className={styles.publishAll}
            disabled={isGroupPublishing}
            onClick={() => onPublishGroup(publishableIds)}
          >
            {t('actions.publish_all')}
            <span>{publishableIds.length}</span>
          </button>
        ) : null}
      </header>

      {group.tasks.map((task) => (
        <TaskRow
          key={task.id}
          task={task}
          batchMode={batchMode}
          isSelected={selectedIds.has(task.id)}
          onToggleSelect={onToggleSelect}
          onOpenTask={onOpenTask}
          onDownload={onDownload}
          onRetry={onRetry}
          onRemove={onRemove}
          onPublish={onPublish}
          isPublishing={publishingIds?.has(task.id) ?? false}
        />
      ))}
    </section>
  )
}
