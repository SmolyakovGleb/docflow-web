import { useTranslation } from 'react-i18next'
import type { HealthResponse } from '@/shared/api/healthApi'
import { formatRelativeShort } from '@/shared/lib/date'
import styles from './TaskListFooter.module.css'

interface TaskListFooterProps {
  health: HealthResponse | undefined
  visibleCount: number
  totalCount: number
}

export function TaskListFooter({ health, visibleCount, totalCount }: TaskListFooterProps) {
  const { t } = useTranslation('tasks')
  const pipelineVersion = health?.pipeline_version ? health.pipeline_version.slice(0, 7) : '—'

  return (
    <footer className={styles.footer}>
      <span>{t('footer.pipeline')}</span>
      <span className={styles.sha}>{pipelineVersion}</span>
      <span className={styles.sep} aria-hidden="true" />
      <span>
        {health?.last_webhook_at
          ? t('footer.last_webhook', {
              value: formatRelativeShort(health.last_webhook_at, { withSuffix: true }),
            })
          : t('footer.no_webhook')}
      </span>
      <span className={styles.sep} aria-hidden="true" />
      <span>{t('footer.count', { visible: visibleCount, total: totalCount })}</span>
    </footer>
  )
}
