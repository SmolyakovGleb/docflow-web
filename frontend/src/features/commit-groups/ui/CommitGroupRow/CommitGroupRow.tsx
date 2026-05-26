import { useTranslation } from 'react-i18next'
import { GitCommitHorizontal, Loader2 } from 'lucide-react'
import { Button } from '@/shared/ui/Button/Button'
import {
  useConfirmCommitGroupMutation,
  useCancelCommitGroupMutation,
} from '../../api/commitGroupsApi'
import type { CommitGroup } from '../../model/types'
import styles from './CommitGroupRow.module.css'

interface Props {
  group: CommitGroup
}

export function CommitGroupRow({ group }: Props) {
  const { t } = useTranslation('tasks')
  const [confirm, { isLoading: confirming }] = useConfirmCommitGroupMutation()
  const [cancel, { isLoading: cancelling }] = useCancelCommitGroupMutation()

  return (
    <div className={styles.row}>
      <div className={styles.icon}>
        <GitCommitHorizontal size={13} />
      </div>
      <div className={styles.body}>
        <span className={styles.sha}>{group.github_sha?.slice(0, 7)}</span>
        <span className={styles.message}>{group.commit_message ?? '—'}</span>
        <span className={styles.meta}>
          {t('commit_group.files_count', { count: group.file_paths.length })}
          {' · '}
          <span className={styles.pending}>{t('commit_group.pending_label')}</span>
        </span>
      </div>
      <div className={styles.actions}>
        {group.status === 'processing' ? (
          <Loader2 size={15} className={styles.spinner} />
        ) : (
          <>
            <Button
              variant="secondary"
              size="sm"
              loading={confirming}
              onClick={() => void confirm(group.id)}
            >
              {t('commit_group.confirm_action')}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              loading={cancelling}
              onClick={() => void cancel(group.id)}
            >
              {t('commit_group.cancel_action')}
            </Button>
          </>
        )}
      </div>
    </div>
  )
}
