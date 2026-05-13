import { skipToken } from '@reduxjs/toolkit/query'
import { ArrowRight, ChevronRight, Copy } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { formatDate, formatRelativeShort } from '@/shared/lib/date'
import { translateApiError } from '@/shared/lib/errorMessages'
import { Button } from '@/shared/ui/Button/Button'
import { ConfirmDialog } from '@/shared/ui/ConfirmDialog/ConfirmDialog'
import { EmptyState } from '@/shared/ui/EmptyState/EmptyState'
import { Field } from '@/shared/ui/Field/Field'
import { RepoLink } from '@/shared/ui/RepoLink/RepoLink'
import { Skeleton } from '@/shared/ui/Skeleton/Skeleton'
import { StatusPill } from '@/shared/ui/StatusPill/StatusPill'
import { toast } from '@/shared/ui/Toast/toast'
import {
  useDeleteProjectMutation,
  useGetProjectQuery,
  useGetProjectTasksQuery,
  useRegenerateSecretMutation,
  useUpdateProjectMutation,
} from '../../api/projectsApi'
import type { Project, ProjectTaskListResponse } from '../../model/types'
import { DeleteProjectDialog } from '../DeleteProjectDialog'
import { EditBranchesDialog } from '../EditBranchesDialog'
import { ExcludePatternsInput } from '../ExcludePatternsInput'
import { WebhookSecretModal } from '../WebhookSecretModal'
import styles from './RepositoryDetailPage.module.css'

function RepositoryDetailSkeleton() {
  return (
    <section className={styles.page}>
      <div className={styles.loadingBlock}>
        <Skeleton width={120} height={14} />
        <Skeleton width={280} height={28} />
        <Skeleton width={360} height={16} />
        <Skeleton variant="rect" height={180} />
        <Skeleton variant="rect" height={160} />
        <Skeleton variant="rect" height={180} />
      </div>
    </section>
  )
}

export function RepositoryDetailPage() {
  const { t } = useTranslation(['repositories', 'common'])
  const navigate = useNavigate()
  const { projectId } = useParams()

  const { data: project, isLoading, error } = useGetProjectQuery(projectId ?? skipToken)
  const { data: tasks, isLoading: isTasksLoading } = useGetProjectTasksQuery(projectId ?? skipToken)

  if (!projectId) {
    return null
  }

  if (isLoading) {
    return <RepositoryDetailSkeleton />
  }

  if (error || !project) {
    return (
      <EmptyState
        title={t('repositories:detail_not_found')}
        description={
          error ? translateApiError(error) : t('repositories:detail_not_found_description')
        }
        actions={<Button onClick={() => void navigate('/repositories')}>{t('common:back')}</Button>}
      />
    )
  }

  return (
    <RepositoryDetailContent
      key={project.id}
      isTasksLoading={isTasksLoading}
      project={project}
      projectId={projectId}
      tasks={tasks}
    />
  )
}

interface RepositoryDetailContentProps {
  project: Project
  projectId: string
  tasks: ProjectTaskListResponse | undefined
  isTasksLoading: boolean
}

function RepositoryDetailContent({
  project,
  projectId,
  tasks,
  isTasksLoading,
}: RepositoryDetailContentProps) {
  const { t } = useTranslation(['repositories', 'common'])
  const navigate = useNavigate()
  const [excludePatternsDraft, setExcludePatternsDraft] = useState(() => project.exclude_patterns)
  const [editBranchesOpen, setEditBranchesOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [confirmSecretOpen, setConfirmSecretOpen] = useState(false)
  const [secretModalOpen, setSecretModalOpen] = useState<string | null>(null)
  const [updateProject, { isLoading: isUpdating }] = useUpdateProjectMutation()
  const [deleteProject, { isLoading: isDeleting }] = useDeleteProjectMutation()
  const [regenerateSecret, { isLoading: isRegenerating }] = useRegenerateSecretMutation()

  async function handleSaveBranches(payload: { source_branch: string; target_branch: string }) {
    try {
      await updateProject({
        projectId,
        data: payload,
      }).unwrap()
      setEditBranchesOpen(false)
      toast.success(t('repositories:branches_saved'))
    } catch (error) {
      toast.error(translateApiError(error))
    }
  }

  async function handleSaveExcludePatterns() {
    try {
      const response = await updateProject({
        projectId,
        data: {
          exclude_patterns: excludePatternsDraft,
        },
      }).unwrap()
      setExcludePatternsDraft(response.exclude_patterns)
      toast.success(t('repositories:exclude_patterns_saved'))
    } catch (error) {
      toast.error(translateApiError(error))
    }
  }

  async function handleRegenerateSecret() {
    try {
      const response = await regenerateSecret(projectId).unwrap()
      setConfirmSecretOpen(false)
      setSecretModalOpen(response.webhook_secret)
    } catch (error) {
      toast.error(translateApiError(error))
    }
  }

  async function handleDeleteProject() {
    try {
      await deleteProject(projectId).unwrap()
      setDeleteOpen(false)
      void navigate('/repositories')
    } catch (error) {
      toast.error(translateApiError(error))
    }
  }

  const totalTasks = tasks?.total ?? 0
  const hasTasks = Boolean(tasks?.items.length)

  return (
    <section className={styles.page}>
      <nav className={styles.breadcrumb} aria-label="breadcrumb">
        <Link className={styles.breadcrumbLink} to="/repositories">
          {t('repositories:title')}
        </Link>
        <ChevronRight className={styles.breadcrumbSep} aria-hidden />
        <span className={styles.breadcrumbCurrent}>{project.name}</span>
      </nav>

      <div className={styles.header}>
        <h1 className={styles.title}>{project.name}</h1>
        <p className={styles.subtitle}>
          {project.source_repo}
          {' -> '}
          {project.target_repo}
        </p>
        <p className={styles.headerMeta}>
          {t('repositories:table_created')}: {formatDate(project.created_at)}
          {' / '}
          {t('repositories:table_tasks')}: {totalTasks}
        </p>
      </div>

      <div className={styles.form}>
        <section className={styles.section}>
          <div className={styles.sectionLabel}>{t('repositories:section_repositories')}</div>

          <div className={styles.row}>
            <Field label={t('repositories:source_repo_label')}>
              <div className={styles.valueBox}>
                <div className={styles.repoLinkWrap}>
                  <RepoLink repo={project.source_repo} />
                </div>
              </div>
            </Field>

            <div className={styles.rowArrow} aria-hidden>
              <ArrowRight size={14} />
            </div>

            <Field label={t('repositories:target_repo_label')}>
              <div className={styles.valueBox}>
                <div className={styles.repoLinkWrap}>
                  <RepoLink repo={project.target_repo} />
                </div>
              </div>
            </Field>
          </div>

          <div className={styles.row}>
            <Field label={t('repositories:source_branch_label')}>
              <div className={styles.valueBox}>
                <span className={styles.monoValue}>{project.source_branch}</span>
              </div>
            </Field>

            <div className={styles.rowArrow} aria-hidden>
              <ArrowRight size={14} />
            </div>

            <Field label={t('repositories:target_branch_label')}>
              <div className={styles.valueBox}>
                <span className={styles.monoValue}>{project.target_branch}</span>
              </div>
            </Field>
          </div>

          <div className={styles.footer}>
            <Button size="sm" variant="secondary" onClick={() => setEditBranchesOpen(true)}>
              {t('repositories:edit_branches')}
            </Button>
          </div>
        </section>

        <section className={styles.section}>
          <div className={styles.sectionLabel}>{t('repositories:section_filters')}</div>

          <Field
            label={
              <>
                {t('repositories:detail_exclude_patterns')}{' '}
                <span className={styles.optional}>
                  - {t('repositories:exclude_patterns_optional')}
                </span>
              </>
            }
            hint={t('repositories:exclude_patterns_hint')}
          >
            <ExcludePatternsInput
              placeholder={t('repositories:exclude_patterns_placeholder')}
              value={excludePatternsDraft}
              onChange={setExcludePatternsDraft}
            />
          </Field>

          <div className={styles.footer}>
            <Button
              size="sm"
              loading={isUpdating}
              variant="secondary"
              onClick={() => void handleSaveExcludePatterns()}
            >
              {t('repositories:save_exclude_patterns')}
            </Button>
          </div>
        </section>

        <section className={styles.section}>
          <div className={styles.sectionLabel}>{t('repositories:detail_webhook')}</div>

          <Field label={t('repositories:webhook_url_label')}>
            <div className={styles.copyField}>
              <span className={styles.copyValue}>{project.webhook_url}</span>
              <button
                type="button"
                className={styles.copyButton}
                onClick={() => {
                  void navigator.clipboard
                    .writeText(project.webhook_url)
                    .then(() => toast.success(t('repositories:url_copy_success')))
                    .catch((error) => toast.error(translateApiError(error)))
                }}
              >
                <Copy size={12} />
                {t('repositories:copy_webhook_url')}
              </button>
            </div>
          </Field>

          <div className={styles.footer}>
            <Button size="sm" variant="danger" onClick={() => setConfirmSecretOpen(true)}>
              {t('repositories:regenerate_secret')}
            </Button>
          </div>
        </section>

        <section className={styles.section}>
          <div className={styles.sectionLabel}>{t('repositories:detail_recent_tasks')}</div>
          <p className={styles.sectionDescription}>
            {hasTasks
              ? `${t('repositories:table_tasks')}: ${totalTasks}`
              : t('repositories:related_tasks_empty')}
          </p>

          {isTasksLoading ? (
            <Skeleton variant="rect" height={92} />
          ) : hasTasks ? (
            <div className={styles.taskList}>
              {tasks?.items.map((task) => (
                <Link key={task.id} className={styles.taskItem} to={`/tasks/${task.id}`}>
                  <div className={styles.taskMain}>
                    <div className={styles.taskPath}>{task.file_path}</div>
                    <div className={styles.taskMeta}>
                      {formatRelativeShort(task.updated_at, { withSuffix: true })}
                    </div>
                  </div>
                  <div className={styles.taskSide}>
                    <StatusPill status={task.status} />
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className={styles.mutedText}>{t('repositories:related_tasks_empty')}</div>
          )}
        </section>

        <section className={styles.section}>
          <div className={styles.sectionLabel}>{t('repositories:detail_danger_zone')}</div>
          <p className={styles.sectionDescription}>
            {t('repositories:delete_confirm_description')}
          </p>

          <div className={styles.footer}>
            <Button variant="danger" size="sm" onClick={() => setDeleteOpen(true)}>
              {t('repositories:delete_project')}
            </Button>
          </div>
        </section>
      </div>

      <EditBranchesDialog
        key={editBranchesOpen ? 'branches-open' : 'branches-closed'}
        open={editBranchesOpen}
        sourceBranch={project.source_branch}
        targetBranch={project.target_branch}
        loading={isUpdating}
        onOpenChange={setEditBranchesOpen}
        onSubmit={(payload) => {
          void handleSaveBranches(payload)
        }}
      />

      <DeleteProjectDialog
        key={deleteOpen ? 'delete-open' : 'delete-closed'}
        open={deleteOpen}
        projectName={project.name}
        loading={isDeleting}
        onOpenChange={setDeleteOpen}
        onConfirm={() => {
          void handleDeleteProject()
        }}
      />

      <ConfirmDialog
        open={confirmSecretOpen}
        confirmText={t('repositories:regenerate_secret')}
        confirmVariant="danger"
        description={t('repositories:regenerate_secret_confirm_description')}
        loading={isRegenerating}
        onConfirm={() => {
          void handleRegenerateSecret()
        }}
        onOpenChange={setConfirmSecretOpen}
        title={t('repositories:regenerate_secret_confirm_title')}
      />

      {secretModalOpen ? (
        <WebhookSecretModal
          open
          webhookSecret={secretModalOpen}
          webhookUrl={project.webhook_url}
          onDone={() => setSecretModalOpen(null)}
        />
      ) : null}
    </section>
  )
}
