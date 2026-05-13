import { useTranslation } from 'react-i18next'
import { cn } from '@/shared/lib/cn'
import type { TaskStatus, TaskSummary } from '@/features/tasks/model/types'
import styles from './StatusTabs.module.css'

type TabKey = 'all' | 'queued' | 'running' | 'done' | 'failed' | 'published'

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
  { key: 'published', status: 'published', labelKey: 'tabs.published' },
]

interface StatusTabsProps {
  activeTab: TabKey
  tasks: TaskSummary[]
  onTabChange: (status: TaskStatus | null) => void
}

function getCount(tasks: TaskSummary[], status: TaskStatus | null) {
  return status ? tasks.filter((t) => t.status === status).length : tasks.length
}

export function StatusTabs({ activeTab, tasks, onTabChange }: StatusTabsProps) {
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
          <span className={styles.count}>{getCount(tasks, tab.status)}</span>
        </button>
      ))}
    </div>
  )
}
