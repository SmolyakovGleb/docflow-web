import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/shared/ui/Button/Button'
import { Skeleton } from '@/shared/ui/Skeleton/Skeleton'
import { StatusPill } from '@/shared/ui/StatusPill/StatusPill'
import { Select } from '@/shared/ui/Select/Select'
import type { TaskStatus } from '@/features/tasks/model/types'
import { useGetAdminTasksQuery, useGetAdminUsersQuery } from '../../api/adminApi'
import type { AdminTasksQuery } from '../../model/types'
import styles from '../AdminPage/AdminPage.module.css'

const TASKS_LIMIT = 50

// Must match tasks_status_check constraint in DB
const TASK_STATUS_OPTIONS: TaskStatus[] = [
  'queued',
  'running',
  'done',
  'failed',
  'published',
  'conflict',
]

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function renderPath(filePath: string) {
  const idx = filePath.lastIndexOf('/')
  if (idx === -1) return <span>{filePath}</span>
  return (
    <>
      <span className={styles.monoPathDir}>{filePath.slice(0, idx + 1)}</span>
      <span>{filePath.slice(idx + 1)}</span>
    </>
  )
}

export function TasksSection() {
  const { t } = useTranslation(['admin', 'tasks', 'common'])
  const { data: users = [] } = useGetAdminUsersQuery()
  const [query, setQuery] = useState<AdminTasksQuery>({ limit: TASKS_LIMIT, offset: 0 })

  const { data, isLoading } = useGetAdminTasksQuery(query)
  const items = data?.items ?? []
  const total = data?.total ?? 0
  const page = Math.floor((query.offset ?? 0) / TASKS_LIMIT)
  const totalPages = Math.ceil(total / TASKS_LIMIT)

  const setFilter = (key: keyof AdminTasksQuery, value: string) => {
    setQuery((prev) => ({ ...prev, [key]: value || undefined, offset: 0 }))
  }

  return (
    <div className={styles.section}>
      <div className={styles.sectionHeader}>
        <span className={styles.sectionTitle}>
          {t('admin:tasks_section')}
          <span className={styles.sectionCount}>{total}</span>
        </span>
        <div className={styles.toolbar}>
          <Select
            aria-label={t('admin:filter_all_users')}
            value={query.user_id ?? ''}
            onChange={(e) => setFilter('user_id', e.target.value)}
          >
            <option value="">{t('admin:filter_all_users')}</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.email}
              </option>
            ))}
          </Select>
          <Select
            aria-label={t('admin:filter_all_statuses')}
            value={query.status ?? ''}
            onChange={(e) => setFilter('status', e.target.value)}
          >
            <option value="">{t('admin:filter_all_statuses')}</option>
            {TASK_STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {t(`tasks:status.${s}`)}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {isLoading ? (
        <div className={styles.empty}>
          <Skeleton width="100%" height={120} />
        </div>
      ) : items.length === 0 ? (
        <div className={styles.empty}>{t('common:no_data')}</div>
      ) : (
        <table className={styles.table}>
          <thead>
            <tr>
              <th>{t('admin:task_file')}</th>
              <th>{t('admin:task_status')}</th>
              <th>{t('admin:task_user')}</th>
              <th>{t('admin:task_project')}</th>
              <th>{t('admin:task_created')}</th>
            </tr>
          </thead>
          <tbody>
            {items.map((task) => (
              <tr key={task.id}>
                <td>
                  <span className={styles.monoPath}>{renderPath(task.file_path)}</span>
                </td>
                <td>
                  <StatusPill status={task.status as TaskStatus} />
                </td>
                <td className={styles.dimText}>{task.user_email}</td>
                <td className={styles.dimText}>{task.project_name ?? '—'}</td>
                <td className={styles.dimText}>{formatDateTime(task.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {totalPages > 1 && (
        <div
          className={styles.sectionHeader}
          style={{ borderTop: '1px solid var(--border-soft)', borderBottom: 'none' }}
        >
          <span className={styles.dimText}>
            {page + 1} / {totalPages}
          </span>
          <div className={styles.actions}>
            <Button
              variant="secondary"
              size="sm"
              disabled={page === 0}
              onClick={() => setQuery((p) => ({ ...p, offset: (page - 1) * TASKS_LIMIT }))}
            >
              ←
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={page + 1 >= totalPages}
              onClick={() => setQuery((p) => ({ ...p, offset: (page + 1) * TASKS_LIMIT }))}
            >
              →
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
