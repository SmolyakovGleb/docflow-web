import { ArrowUpFromLine, FilterX, List, Upload } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/shared/ui/Button/Button'
import { EmptyState } from '@/shared/ui/EmptyState/EmptyState'
import { GitHubMark } from '@/shared/ui/GitHubMark/GitHubMark'
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
      <div className={styles.wrap}>
        <EmptyState
          icon={GitHubMark}
          className={styles.state}
          title={t('empty.no_github_title')}
          description={t('empty.no_github_description')}
          actions={
            <>
              <Button type="button" iconLeft={<GitHubMark size={13} />} onClick={onConnectGithub}>
                {t('empty.link_github')}
              </Button>
              <Button
                type="button"
                variant="secondary"
                iconLeft={<Upload size={13} />}
                onClick={onOpenUploadDialog}
              >
                {t('empty.upload_manual')}
              </Button>
            </>
          }
        />
        <p className={styles.subtext}>{t('empty.no_github_secondary')}</p>
      </div>
    )
  }

  if (hasFilters) {
    return (
      <EmptyState
        icon={FilterX}
        className={styles.state}
        title={t('empty.filtered_title')}
        description={t('empty.filtered_description')}
        actions={
          <Button type="button" variant="secondary" onClick={onResetFilters}>
            {t('empty.reset_filters')}
          </Button>
        }
      />
    )
  }

  return (
    <EmptyState
      icon={List}
      className={styles.state}
      title={t('empty.no_tasks_title')}
      description={t(
        hasProjects ? 'empty.no_tasks_description' : 'empty.no_projects_manual_description',
      )}
      actions={
        <>
          <Button
            type="button"
            iconLeft={<ArrowUpFromLine size={13} />}
            onClick={hasProjects ? onOpenDialog : onOpenUploadDialog}
          >
            {t('trigger_translation')}
          </Button>
          {!hasProjects ? (
            <Button type="button" variant="secondary" onClick={onOpenRepositories}>
              {t('empty.open_repositories')}
            </Button>
          ) : null}
        </>
      }
    />
  )
}
