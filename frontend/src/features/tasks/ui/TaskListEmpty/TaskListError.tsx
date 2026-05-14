import { WifiOff } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/shared/ui/Button/Button'
import { EmptyState } from '@/shared/ui/EmptyState/EmptyState'
import styles from './TaskListEmpty.module.css'

interface TaskListErrorProps {
  isRetrying: boolean
  onRetry: () => void
}

export function TaskListError({ isRetrying, onRetry }: TaskListErrorProps) {
  const { t } = useTranslation('tasks')

  return (
    <EmptyState
      icon={WifiOff}
      className={styles.state}
      title={t('load_error_title')}
      description={t('load_error_description')}
      actions={
        <Button type="button" variant="secondary" onClick={onRetry} loading={isRetrying}>
          {isRetrying ? t('common:loading') : t('common:retry')}
        </Button>
      }
    />
  )
}
