import { Square } from 'lucide-react'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import type { Project } from '@/features/projects/model/types'
import type { TaskSummary } from '@/features/tasks/model/types'
import type { HealthResponse } from '@/shared/api/healthApi'
import { cn } from '@/shared/lib/cn'
import { ProjectFilterPopover } from '../ProjectFilterPopover'
import styles from './TaskListToolbar.module.css'

interface TaskListToolbarProps {
  batchMode: boolean
  health: HealthResponse | undefined
  tasks: TaskSummary[]
  projects: Project[]
  selectedProjectId: string | null
  showSelectionToggle: boolean
  onToggleBatchMode: () => void
  onProjectChange: (projectId: string | null) => void
}

export function TaskListToolbar({
  batchMode,
  health,
  tasks,
  projects,
  selectedProjectId,
  showSelectionToggle,
  onToggleBatchMode,
  onProjectChange,
}: TaskListToolbarProps) {
  const { t } = useTranslation('tasks')
  const isWebhookActive = Boolean(health?.last_webhook_at)
  const projectCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const task of tasks) {
      if (task.project_id) {
        counts[task.project_id] = (counts[task.project_id] ?? 0) + 1
      }
    }
    return counts
  }, [tasks])

  return (
    <div className={styles.toolbar}>
      <div className={styles.left}>
        {showSelectionToggle ? (
          <button
            type="button"
            className={cn(styles.chip, styles.selectChip, batchMode && styles.selectChipActive)}
            onClick={onToggleBatchMode}
          >
            <Square size={12} />
            <span>{batchMode ? t('toolbar.clear_selection') : t('toolbar.select')}</span>
          </button>
        ) : null}

        <div
          className={cn(
            styles.webhook,
            isWebhookActive ? styles.webhookActive : styles.webhookInactive,
          )}
        >
          <span
            className={cn(
              styles.webhookDot,
              isWebhookActive ? styles.webhookDotActive : styles.webhookDotInactive,
            )}
          />
          <span>{t(isWebhookActive ? 'toolbar.webhook_active' : 'toolbar.webhook_inactive')}</span>
        </div>
      </div>

      <div className={styles.right}>
        <ProjectFilterPopover
          projects={projects}
          selectedId={selectedProjectId}
          totalCount={tasks.length}
          projectCounts={projectCounts}
          onChange={onProjectChange}
        />
      </div>
    </div>
  )
}
