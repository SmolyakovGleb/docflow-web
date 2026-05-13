import { ChevronRight } from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import type { Project } from '@/features/projects/model/types'
import type { TaskDetail, TaskPublication, TaskStatus } from '@/features/tasks/model/types'
import { formatRelativeShort } from '@/shared/lib/date'
import { cn } from '@/shared/lib/cn'
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

function getInitials(value: string | null) {
  if (!value) {
    return 'DF'
  }

  const chunks = value
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((chunk) => chunk[0]?.toUpperCase() ?? '')
    .join('')

  return chunks || value.slice(0, 2).toUpperCase()
}

function getStatusClass(status: TaskStatus) {
  switch (status) {
    case 'queued':
      return styles.statusQueued
    case 'running':
      return styles.statusRunning
    case 'done':
      return styles.statusDone
    case 'failed':
      return styles.statusFailed
    case 'conflict':
      return styles.statusConflict
    case 'published':
      return styles.statusPublished
    default:
      return ''
  }
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
      <nav className={styles.breadcrumb} aria-label="breadcrumb">
        <Link className={styles.breadcrumbLink} to="/tasks">
          Задачи
        </Link>
        <span className={styles.breadcrumbSeparator}>
          <ChevronRight size={12} aria-hidden />
        </span>
        <span className={styles.breadcrumbPath}>
          {path.dir ? <span className={styles.breadcrumbDir}>{path.dir}</span> : null}
          <span className={styles.breadcrumbFile}>{path.file}</span>
        </span>
      </nav>

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
                <span className={styles.authorAvatar}>{getInitials(authorName)}</span>
                {authorName}
              </span>
            ) : null}
            <span>{formatRelativeShort(updatedAt, { withSuffix: true })}</span>
          </div>
        </div>

        <div className={styles.actions}>
          <span className={cn(styles.statusBadge, getStatusClass(task.status))}>
            <span className={styles.statusDot} aria-hidden />
            <span>{t(`status.${task.status}`)}</span>
          </span>
          {publication ? <PublishedHeader publication={publication} /> : null}
          {actions}
        </div>
      </div>

      {children}
    </header>
  )
}
