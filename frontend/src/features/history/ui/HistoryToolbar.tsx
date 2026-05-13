import { FilterX } from 'lucide-react'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import type { Project } from '@/features/projects/model/types'
import type { HistoryUserOption } from '../model/types'
import { DateRangePicker } from './DateRangePicker'
import styles from './HistoryToolbar.module.css'

interface HistoryToolbarProps {
  projects: Project[]
  userOptions: HistoryUserOption[]
  selectedProjectId: string | null
  selectedPublishedBy: string | null
  from: string | null
  to: string | null
  totalCount: number
  onProjectChange: (projectId: string | null) => void
  onPublishedByChange: (userId: string | null) => void
  onDateRangeChange: (value: { from: string | null; to: string | null }) => void
  onReset: () => void
}

export function HistoryToolbar({
  projects,
  userOptions,
  selectedProjectId,
  selectedPublishedBy,
  from,
  to,
  totalCount,
  onProjectChange,
  onPublishedByChange,
  onDateRangeChange,
  onReset,
}: HistoryToolbarProps) {
  const { t } = useTranslation('history')
  const hasFilters = Boolean(selectedProjectId || selectedPublishedBy || from || to)
  const projectOptions = useMemo(
    () => [...projects].sort((a, b) => a.name.localeCompare(b.name)),
    [projects],
  )

  return (
    <header className={styles.header}>
      <div className={styles.main}>
        <div>
          <h1 className={styles.title}>{t('title')}</h1>
          <p className={styles.subtitle}>{t('subtitle')}</p>
        </div>
        <div className={styles.total}>{t('results', { count: totalCount })}</div>
      </div>

      <div className={styles.filters}>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>{t('toolbar.project')}</span>
          <select
            aria-label={t('toolbar.project')}
            className={styles.select}
            value={selectedProjectId ?? ''}
            onChange={(event) => onProjectChange(event.target.value || null)}
          >
            <option value="">{t('toolbar.all_projects')}</option>
            {projectOptions.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
        </label>

        <label className={styles.field}>
          <span className={styles.fieldLabel}>{t('toolbar.user')}</span>
          <select
            aria-label={t('toolbar.user')}
            className={styles.select}
            value={selectedPublishedBy ?? ''}
            onChange={(event) => onPublishedByChange(event.target.value || null)}
          >
            <option value="">{t('toolbar.all_users')}</option>
            {userOptions.map((user) => (
              <option key={user.id} value={user.id}>
                {user.label}
              </option>
            ))}
          </select>
        </label>

        <div className={styles.field}>
          <span className={styles.fieldLabel}>{t('toolbar.date_range')}</span>
          <DateRangePicker from={from} to={to} onChange={onDateRangeChange} />
        </div>

        {hasFilters ? (
          <button type="button" className={styles.reset} onClick={onReset}>
            <FilterX size={14} />
            {t('toolbar.reset')}
          </button>
        ) : null}
      </div>
    </header>
  )
}
