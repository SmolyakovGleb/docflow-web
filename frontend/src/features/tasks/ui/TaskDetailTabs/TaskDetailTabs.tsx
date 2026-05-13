import { AlertTriangle } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/shared/lib/cn'
import type { TaskDetailTab } from '@/features/tasks/model/types'
import styles from '../TaskDetailPage/TaskDetailPage.module.css'

interface TaskDetailTabsProps {
  activeTab: TaskDetailTab
  tabs: TaskDetailTab[]
  meta?: Partial<Record<TaskDetailTab, string | null>>
  onChange: (tab: TaskDetailTab) => void
}

export function TaskDetailTabs({ activeTab, tabs, meta, onChange }: TaskDetailTabsProps) {
  const { t } = useTranslation('tasks')

  return (
    <div className={styles.tabs} role="tablist" aria-label="Task detail tabs">
      {tabs.map((tab) => (
        <button
          key={tab}
          type="button"
          role="tab"
          aria-selected={activeTab === tab}
          className={cn(styles.tab, activeTab === tab && styles.tabActive)}
          onClick={() => onChange(tab)}
        >
          {tab === 'conflict' ? (
            <span className={styles.tabConflictIcon}>
              <AlertTriangle size={12} />
            </span>
          ) : null}
          <span>{t(`detail_tabs.${tab}`)}</span>
          {meta?.[tab] ? <span className={styles.tabCount}>{meta[tab]}</span> : null}
        </button>
      ))}
    </div>
  )
}
