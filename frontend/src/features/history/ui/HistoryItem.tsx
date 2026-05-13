import { ArrowRight, ArrowUpRight, Clock3, FileText } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { Avatar } from '@/shared/ui/Avatar/Avatar'
import { RepoLink } from '@/shared/ui/RepoLink/RepoLink'
import { formatDateTime, formatRelativeShort } from '@/shared/lib/date'
import type { HistoryPublication } from '../model/types'
import styles from './HistoryItem.module.css'

interface HistoryItemProps {
  item: HistoryPublication
}

function shortSha(value: string) {
  return value.slice(0, 7)
}

function getAuthorLabel(item: HistoryPublication) {
  return item.published_by.display_name ?? item.published_by.email
}

export function HistoryItem({ item }: HistoryItemProps) {
  const { t } = useTranslation('history')
  const authorLabel = getAuthorLabel(item)

  return (
    <article className={styles.card}>
      <header className={styles.header}>
        <div className={styles.author}>
          <Avatar name={authorLabel} size={26} />
          <div className={styles.authorMeta}>
            <div className={styles.authorName}>{authorLabel}</div>
            <div className={styles.authorSubline}>
              <span className={styles.metaWithIcon}>
                <Clock3 size={12} />
                <time title={formatDateTime(item.published_at)}>
                  {formatRelativeShort(item.published_at, { withSuffix: true })}
                </time>
              </span>
              <span className={styles.divider} />
              <code className={styles.sha}>{shortSha(item.commit_sha)}</code>
            </div>
          </div>
        </div>

        <a
          className={styles.commitLink}
          href={item.commit_url}
          target="_blank"
          rel="noreferrer noopener"
          aria-label={`${t('item.view_commit')} ${shortSha(item.commit_sha)}`}
        >
          {t('item.view_commit')}
          <ArrowUpRight size={13} />
        </a>
      </header>

      <div className={styles.paths}>
        <div className={styles.pathCard}>
          <div className={styles.pathLabel}>{t('item.source_path')}</div>
          <div className={styles.pathValue}>
            <FileText size={13} />
            <code>{item.file_path ?? item.target_path}</code>
          </div>
        </div>

        <div className={styles.arrow}>
          <ArrowRight size={14} />
        </div>

        <div className={styles.pathCard}>
          <div className={styles.pathLabel}>{t('item.target_path')}</div>
          <div className={styles.pathValue}>
            <FileText size={13} />
            <code>{item.target_path}</code>
          </div>
        </div>
      </div>

      <footer className={styles.footer}>
        <div className={styles.repos}>
          {item.source_repo ? (
            <RepoLink repo={item.source_repo} />
          ) : (
            <span className={styles.repoFallback}>{t('item.unknown_repo')}</span>
          )}
          <span className={styles.repoArrow}>
            <ArrowRight size={12} />
          </span>
          <RepoLink repo={item.target_repo} />
        </div>

        {item.can_open_task ? (
          <Link to={`/tasks/${item.task_id}`} className={styles.taskLink}>
            {t('item.open_task')}
          </Link>
        ) : (
          <span className={styles.taskUnavailable}>{t('item.task_unavailable')}</span>
        )}
      </footer>
    </article>
  )
}
