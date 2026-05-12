import { skipToken } from '@reduxjs/toolkit/query'
import { ArrowLeft } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useParams } from 'react-router-dom'
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
} from '../api/projectsApi'
import { DeleteProjectDialog } from './DeleteProjectDialog'
import { EditBranchesDialog } from './EditBranchesDialog'
import { ExcludePatternsInput } from './ExcludePatternsInput'
import { WebhookSecretModal } from './WebhookSecretModal'
import styles from './RepositoryDetailPage.module.css'
import type { Project, ProjectTaskListResponse } from '../model/types'

function RepositoryDetailSkeleton() {
  return (
    <div className={styles.loadingBlock}>
      <Skeleton width={180} height={14} />
      <Skeleton width={320} height={36} />
      <Skeleton variant="rect" height={160} />
      <Skeleton variant="rect" height={140} />
    </div>
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

  return (
    <section className={styles.page}>
      <header className={styles.header}>
        <div>
          <Link className={styles.backLink} to="/repositories">
            <ArrowLeft size={16} />
            <span>{t('common:back')}</span>
          </Link>
          <h1 className={styles.title}>{project.name}</h1>
          <p className={styles.subtitle}>
            {project.source_repo} → {project.target_repo}
          </p>
        </div>
      </header>

      <div className={styles.grid}>
        <div className={styles.mainColumn}>
          <section className={styles.card}>
            <div className={styles.cardHeader}>
              <div>
                <h2 className={styles.cardTitle}>{t('repositories:table_repositories')}</h2>
                <p className={styles.cardDescription}>
                  {project.source_repo} → {project.target_repo}
                </p>
              </div>
            </div>

            <div className={styles.repoBlock}>
              <RepoLink repo={project.source_repo} />
              <div className={styles.branchLine}>{project.source_branch}</div>
            </div>
            <div className={styles.repoBlock}>
              <RepoLink repo={project.target_repo} />
              <div className={styles.branchLine}>{project.target_branch}</div>
            </div>
          </section>

          <section className={styles.card}>
            <div className={styles.cardHeader}>
              <div>
                <h2 className={styles.cardTitle}>{t('repositories:detail_exclude_patterns')}</h2>
                <p className={styles.cardDescription}>{t('repositories:exclude_patterns_hint')}</p>
              </div>
              <Button
                loading={isUpdating}
                variant="secondary"
                onClick={() => void handleSaveExcludePatterns()}
              >
                {t('repositories:save_exclude_patterns')}
              </Button>
            </div>

            <Field>
              <ExcludePatternsInput
                placeholder={t('repositories:exclude_patterns_placeholder')}
                value={excludePatternsDraft}
                onChange={setExcludePatternsDraft}
              />
            </Field>
          </section>

          <section className={styles.card}>
            <div className={styles.cardHeader}>
              <div>
                <h2 className={styles.cardTitle}>{t('repositories:detail_recent_tasks')}</h2>
                <p className={styles.cardDescription}>{t('repositories:related_tasks_empty')}</p>
              </div>
            </div>

            {isTasksLoading ? (
              <Skeleton variant="rect" height={48} />
            ) : tasks?.items.length ? (
              <div className={styles.taskList}>
                {tasks.items.map((task) => (
                  <div key={task.id} className={styles.taskItem}>
                    <div className={styles.taskPath}>{task.file_path}</div>
                    <StatusPill status={task.status} />
                  </div>
                ))}
              </div>
            ) : (
              <div className={styles.mutedText}>{t('repositories:related_tasks_empty')}</div>
            )}
          </section>
        </div>

        <div className={styles.sideColumn}>
          <section className={styles.card}>
            <div className={styles.cardHeader}>
              <div>
                <h2 className={styles.cardTitle}>{t('repositories:detail_branches')}</h2>
                <p className={styles.cardDescription}>
                  {project.source_branch} → {project.target_branch}
                </p>
              </div>
              <Button variant="secondary" onClick={() => setEditBranchesOpen(true)}>
                {t('repositories:edit_branches')}
              </Button>
            </div>
          </section>

          <section className={styles.card}>
            <div className={styles.cardHeader}>
              <div>
                <h2 className={styles.cardTitle}>{t('repositories:detail_webhook')}</h2>
                <p className={styles.cardDescription}>{project.webhook_url}</p>
              </div>
            </div>

            <div className={styles.sectionActions}>
              <Button
                variant="secondary"
                onClick={() => {
                  void navigator.clipboard
                    .writeText(project.webhook_url)
                    .then(() => toast.success(t('repositories:url_copy_success')))
                    .catch((error) => toast.error(translateApiError(error)))
                }}
              >
                {t('repositories:copy_webhook_url')}
              </Button>
              <Button variant="danger" onClick={() => setConfirmSecretOpen(true)}>
                {t('repositories:regenerate_secret')}
              </Button>
            </div>
          </section>

          <section className={styles.dangerCard}>
            <div className={styles.cardHeader}>
              <div>
                <h2 className={styles.cardTitle}>{t('repositories:detail_danger_zone')}</h2>
                <p className={styles.cardDescription}>
                  {t('repositories:delete_confirm_description')}
                </p>
              </div>
            </div>

            <div className={styles.dangerActions}>
              <Button variant="danger" onClick={() => setDeleteOpen(true)}>
                {t('repositories:delete_project')}
              </Button>
            </div>
          </section>
        </div>
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
