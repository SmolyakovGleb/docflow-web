import { Skeleton } from '@/shared/ui/Skeleton/Skeleton'
import styles from './TaskListSkeleton.module.css'

export function TaskListSkeleton() {
  return (
    <div className={styles.list}>
      {Array.from({ length: 3 }).map((_, groupIndex) => (
        <section key={groupIndex} className={styles.group}>
          <div className={styles.groupHeader}>
            <div className={styles.groupMeta}>
              <Skeleton variant="circle" width={18} height={18} />
              <Skeleton width={260} />
              <Skeleton width={52} />
            </div>
            <div className={styles.groupSide}>
              <Skeleton width={120} />
              <Skeleton width={72} />
            </div>
          </div>
          {Array.from({ length: 2 }).map((__, rowIndex) => (
            <div key={rowIndex} className={styles.row}>
              <div className={styles.rowMain}>
                <Skeleton variant="circle" width={16} height={16} />
                <Skeleton width="68%" />
              </div>
              <Skeleton width={120} />
              <Skeleton width={108} height={28} />
              <Skeleton width={64} />
            </div>
          ))}
        </section>
      ))}
    </div>
  )
}
