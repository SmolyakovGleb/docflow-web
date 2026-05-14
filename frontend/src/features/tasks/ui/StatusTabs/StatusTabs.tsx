import { useTranslation } from 'react-i18next'
import { cn } from '@/shared/lib/cn'
import type { TaskStatus, TaskSummary } from '@/features/tasks/model/types'
import styles from './StatusTabs.module.css'

type TabKey = 'all' | 'queued' | 'running' | 'done' | 'failed' | 'conflict' | 'published'

interface TabConfig {
  key: TabKey
  status: TaskStatus | null
  labelKey: string
}

const TAB_ORDER: TabConfig[] = [
  { key: 'all', status: null, labelKey: 'tabs.all' },
  { key: 'queued', status: 'queued', labelKey: 'tabs.queued' },
  { key: 'running', status: 'running', labelKey: 'tabs.running' },
  { key: 'done', status: 'done', labelKey: 'tabs.ready_to_publish' },
  { key: 'failed', status: 'failed', labelKey: 'tabs.failed' },
  { key: 'conflict', status: 'conflict', labelKey: 'tabs.conflict' },
  { key: 'published', status: 'published', labelKey: 'tabs.published' },
]

interface StatusTabsProps {
  activeTab: TabKey
  tasks: TaskSummary[]
  counts?: Partial<Record<TaskStatus, number>> | undefined
  onTabChange: (status: TaskStatus | null) => void
}

function getCount(
  tasks: TaskSummary[],
  counts: Partial<Record<TaskStatus, number>> | undefined,
  status: TaskStatus | null,
) {
  if (counts) {
    if (status) {
      return counts[status] ?? 0
    }

    return Object.values(counts).reduce((sum, value) => sum + (value ?? 0), 0)
  }

  return status ? tasks.filter((task) => task.status === status).length : tasks.length
}

export function StatusTabs({ activeTab, tasks, counts, onTabChange }: StatusTabsProps) {
  const { t } = useTranslation('tasks')

  return (
    <div className={styles.tabs}>
      {TAB_ORDER.map((tab) => (
        <button
          key={tab.key}
          type="button"
          className={cn(styles.tab, activeTab === tab.key && styles.tabActive)}
          onClick={() => onTabChange(tab.status)}
        >
          <span>{t(tab.labelKey)}</span>
          <span className={styles.count}>{getCount(tasks, counts, tab.status)}</span>
        </button>
      ))}
    </div>
  )
}
