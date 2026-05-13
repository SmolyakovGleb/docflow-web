import { ArrowUpFromLine, FilterX, List, Upload } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import styles from './TaskListEmpty.module.css'

interface TaskListEmptyProps {
  userGithubLinked: boolean
  hasFilters: boolean
  hasProjects: boolean
  onConnectGithub: () => void
  onResetFilters: () => void
  onOpenDialog: () => void
  onOpenUploadDialog: () => void
  onOpenRepositories: () => void
}

function GitHubMark({ size = 22 }: { size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      width={size}
      height={size}
      aria-hidden="true"
    >
      <path d="M12 2C6.48 2 2 6.48 2 12c0 4.42 2.87 8.17 6.84 9.5.5.08.66-.22.66-.48v-1.7c-2.78.6-3.37-1.34-3.37-1.34-.45-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.89 1.52 2.34 1.08 2.91.83.09-.65.35-1.09.63-1.34-2.22-.25-4.55-1.11-4.55-4.94 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.64 0 0 .84-.27 2.75 1.02.8-.22 1.65-.33 2.5-.33s1.7.11 2.5.33c1.91-1.29 2.75-1.02 2.75-1.02.55 1.37.2 2.39.1 2.64.64.7 1.03 1.59 1.03 2.68 0 3.84-2.34 4.69-4.57 4.94.36.31.68.92.68 1.85V21c0 .27.16.57.67.48A10 10 0 0 0 22 12c0-5.52-4.48-10-10-10z" />
    </svg>
  )
}

export function TaskListEmpty({
  userGithubLinked,
  hasFilters,
  hasProjects,
  onConnectGithub,
  onResetFilters,
  onOpenDialog,
  onOpenUploadDialog,
  onOpenRepositories,
}: TaskListEmptyProps) {
  const { t } = useTranslation('tasks')

  if (!userGithubLinked) {
    return (
      <section className={styles.state}>
        <div className={styles.icon}>
          <GitHubMark />
        </div>
        <h2 className={styles.title}>{t('empty.no_github_title')}</h2>
        <p className={styles.description}>{t('empty.no_github_description')}</p>
        <div className={styles.actions}>
          <button type="button" className={styles.primaryButton} onClick={onConnectGithub}>
            <GitHubMark size={13} />
            {t('empty.link_github')}
          </button>
          <button type="button" className={styles.outlineButton} onClick={onOpenUploadDialog}>
            <Upload size={13} />
            {t('empty.upload_manual')}
          </button>
        </div>
        <p className={styles.subtext}>{t('empty.no_github_secondary')}</p>
      </section>
    )
  }

  if (hasFilters) {
    return (
      <section className={styles.state}>
        <div className={styles.icon}>
          <FilterX size={22} />
        </div>
        <h2 className={styles.title}>{t('empty.filtered_title')}</h2>
        <p className={styles.description}>{t('empty.filtered_description')}</p>
        <div className={styles.actions}>
          <button type="button" className={styles.secondaryButton} onClick={onResetFilters}>
            {t('empty.reset_filters')}
          </button>
        </div>
      </section>
    )
  }

  return (
    <section className={styles.state}>
      <div className={styles.icon}>
        <List size={22} />
      </div>
      <h2 className={styles.title}>{t('empty.no_tasks_title')}</h2>
      <p className={styles.description}>
        {t(hasProjects ? 'empty.no_tasks_description' : 'empty.no_projects_manual_description')}
      </p>
      <div className={styles.actions}>
        <button
          type="button"
          className={styles.primaryButton}
          onClick={hasProjects ? onOpenDialog : onOpenUploadDialog}
        >
          <ArrowUpFromLine size={13} />
          {t('trigger_translation')}
        </button>
        {!hasProjects ? (
          <button type="button" className={styles.secondaryButton} onClick={onOpenRepositories}>
            {t('empty.open_repositories')}
          </button>
        ) : null}
      </div>
    </section>
  )
}
