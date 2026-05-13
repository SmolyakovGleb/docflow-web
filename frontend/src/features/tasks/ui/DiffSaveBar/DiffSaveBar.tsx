import { useTranslation } from 'react-i18next'
import { getPlural } from '@/shared/lib/plural'
import { Button } from '@/shared/ui/Button/Button'
import styles from '../TaskDetailPage/TaskDetailPage.module.css'

interface DiffSaveBarProps {
  visible: boolean
  loading?: boolean
  count?: number
  onSave: () => void
  onDiscard: () => void
}

export function DiffSaveBar({
  visible,
  loading = false,
  count = 1,
  onSave,
  onDiscard,
}: DiffSaveBarProps) {
  const { t } = useTranslation('tasks')

  if (!visible) {
    return null
  }

  return (
    <div className={styles.saveBar}>
      <div className={styles.saveMeta}>
        <strong>{count}</strong>{' '}
        {getPlural(
          count,
          'несохранённое изменение',
          'несохранённых изменения',
          'несохранённых изменений',
        )}
      </div>
      <div className={styles.saveActions}>
        <Button size="sm" variant="secondary" onClick={onDiscard}>
          {t('diff.discard')}
        </Button>
        <Button size="sm" loading={loading} onClick={onSave}>
          {t('diff.save')}
        </Button>
      </div>
    </div>
  )
}
