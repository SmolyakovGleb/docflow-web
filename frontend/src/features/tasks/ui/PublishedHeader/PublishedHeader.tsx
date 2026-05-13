import { ArrowUpRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { TaskPublication } from '@/features/tasks/model/types'
import { formatRelativeShort } from '@/shared/lib/date'
import styles from '../TaskDetailPage/TaskDetailPage.module.css'

interface PublishedHeaderProps {
  publication: TaskPublication
}

function getCommitUrl(publication: TaskPublication) {
  return `https://github.com/${publication.target_repo}/commit/${publication.commit_sha}`
}

export function PublishedHeader({ publication }: PublishedHeaderProps) {
  const { t } = useTranslation('tasks')
  const timeLabel = formatRelativeShort(publication.published_at, { withSuffix: true })

  return (
    <a
      className={styles.publishedLink}
      href={getCommitUrl(publication)}
      target="_blank"
      rel="noreferrer noopener"
      aria-label={`${publication.target_repo} ${t('published_label')}`}
    >
      <span>
        {t('published_label')} {timeLabel} ·
      </span>
      <span className={styles.publishedCommit}>{publication.commit_sha.slice(0, 7)}</span>
      <ArrowUpRight size={12} aria-hidden />
    </a>
  )
}
