import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { Project } from '@/features/projects/model/types'
import type { TaskDetail, TaskPublication } from '@/features/tasks/model/types'
import { formatRelativeShort } from '@/shared/lib/date'
import { Avatar } from '@/shared/ui/Avatar/Avatar'
import { Breadcrumbs } from '@/shared/ui/Breadcrumbs/Breadcrumbs'
import { StatusPill } from '@/shared/ui/StatusPill/StatusPill'
import { PublishedHeader } from '../PublishedHeader/PublishedHeader'
import styles from '../TaskDetailPage/TaskDetailPage.module.css'

interface TaskDetailHeaderProps {
  task: TaskDetail
  project?: Project | undefined
  publication?: TaskPublication | undefined
  actions?: ReactNode
  children?: ReactNode
}

function getPathParts(filePath: string) {
  const parts = filePath.split('/')
  const file = parts.pop() ?? filePath

  return {
    dir: parts.length > 0 ? `${parts.join('/')}/` : null,
    file,
  }
}

function getAuthorName(task: TaskDetail) {
  return task.commit_author_name ?? task.commit_author_login ?? null
}

export function TaskDetailHeader({
  task,
  project,
  publication,
  actions,
  children,
}: TaskDetailHeaderProps) {
  const { t } = useTranslation('tasks')
  const path = getPathParts(task.file_path)
  const authorName = getAuthorName(task)
  const updatedAt = task.completed_at ?? task.updated_at
  const projectLabel = project?.name ?? task.project_name ?? t('no_repository')
  const projectMetaTitle = project
    ? `${project.name} · ${project.source_repo} -> ${project.target_repo}`
    : projectLabel

  return (
    <header className={styles.header}>
      <Breadcrumbs
        className={styles.breadcrumb}
        currentClassName={styles.breadcrumbPath}
        items={[{ label: t('title'), to: '/tasks' }]}
        current={
          <>
            {path.dir ? <span className={styles.breadcrumbDir}>{path.dir}</span> : null}
            <span className={styles.breadcrumbFile}>{path.file}</span>
          </>
        }
      />

      <div className={styles.titleRow}>
        <div className={styles.titleBlock}>
          <h1 className={styles.title} title={task.file_path}>
            {path.file}
          </h1>
          <div className={styles.metaRow}>
            <span title={projectMetaTitle}>{projectLabel}</span>
            {task.github_sha ? (
              <span className={styles.commitSha}>{task.github_sha.slice(0, 7)}</span>
            ) : null}
            {authorName ? (
              <span className={styles.author}>
                <Avatar name={authorName} size={18} />
                {authorName}
              </span>
            ) : null}
            <span>{formatRelativeShort(updatedAt, { withSuffix: true })}</span>
          </div>
        </div>

        <div className={styles.actions}>
          <StatusPill status={task.status} className={styles.statusPill} />
          {publication ? <PublishedHeader publication={publication} /> : null}
          {actions}
        </div>
      </div>

      {children}
    </header>
  )
}
