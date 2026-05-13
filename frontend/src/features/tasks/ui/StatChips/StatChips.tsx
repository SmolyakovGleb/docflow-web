import { useTranslation } from 'react-i18next'
import { useGetAnalyticsStatsQuery } from '@/shared/api/analyticsApi'
import { cn } from '@/shared/lib/cn'
import styles from './StatChips.module.css'

export function StatChips() {
  const { t } = useTranslation('tasks')
  const { data } = useGetAnalyticsStatsQuery(undefined, { pollingInterval: 60000 })

  return (
    <div className={styles.chips}>
      <div className={styles.chip}>
        <span className={styles.number}>
          <span className={styles.pulse} />
          {data?.running ?? 0}
        </span>
        <span className={styles.label}>{t('stats.running')}</span>
      </div>
      <div className={styles.chip}>
        <span className={styles.number}>{data?.done ?? 0}</span>
        <span className={styles.label}>{t('stats.ready')}</span>
      </div>
      <div className={styles.chip}>
        <span className={cn(styles.number, styles.numberBright)}>{data?.failed ?? 0}</span>
        <span className={styles.label}>{t('stats.failed')}</span>
      </div>
      <div className={styles.chip}>
        <span className={styles.number}>{data?.published ?? 0}</span>
        <span className={styles.label}>{t('stats.published')}</span>
      </div>
    </div>
  )
}
