import { skipToken } from '@reduxjs/toolkit/query'
import { ArrowRight } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { formatDate, formatRelativeShort } from '@/shared/lib/date'
import { translateApiError } from '@/shared/lib/errorMessages'
import { Breadcrumbs } from '@/shared/ui/Breadcrumbs/Breadcrumbs'
import { Button } from '@/shared/ui/Button/Button'
import { ConfirmDialog } from '@/shared/ui/ConfirmDialog/ConfirmDialog'
import { CopyField } from '@/shared/ui/CopyField/CopyField'
import { EmptyState } from '@/shared/ui/EmptyState/EmptyState'
import { Field } from '@/shared/ui/Field/Field'
import { RepoLink } from '@/shared/ui/RepoLink/RepoLink'
import { SectionCard } from '@/shared/ui/SectionCard/SectionCard'
import { Skeleton } from '@/shared/ui/Skeleton/Skeleton'
import { StatusPill } from '@/shared/ui/StatusPill/StatusPill'
import { toast } from '@/shared/ui/Toast/toast'
import {
  useDeleteProjectMutation,
  useGetProjectQuery,
  useGetProjectTasksQuery,
  usePauseProjectMutation,
  useRegenerateSecretMutation,
  useResumeProjectMutation,
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
  const [limitValue, setLimitValue] = useState(String(project.webhook_file_limit))
  const [thresholdValue, setThresholdValue] = useState(String(project.incremental_threshold))
  const [editBranchesOpen, setEditBranchesOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [confirmSecretOpen, setConfirmSecretOpen] = useState(false)
  const [secretModalOpen, setSecretModalOpen] = useState<string | null>(null)
  const [updateProject, { isLoading: isUpdating }] = useUpdateProjectMutation()
  const [deleteProject, { isLoading: isDeleting }] = useDeleteProjectMutation()
  const [regenerateSecret, { isLoading: isRegenerating }] = useRegenerateSecretMutation()
  const [pauseProject, { isLoading: pausing }] = usePauseProjectMutation()
  const [resumeProject, { isLoading: resuming }] = useResumeProjectMutation()

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

  async function handleSaveThreshold() {
    const parsed = Number(thresholdValue)
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 100) {
      toast.error(t('repositories:incremental_threshold_invalid'))
      return
    }
    try {
      const response = await updateProject({
        projectId,
        data: { incremental_threshold: parsed },
      }).unwrap()
      setThresholdValue(String(response.incremental_threshold))
      toast.success(t('repositories:incremental_threshold_saved'))
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
  const hasTasks = Boolean(tasks?.items?.length)

  return (
    <section className={styles.page}>
      <Breadcrumbs
        className={styles.breadcrumb}
        items={[{ label: t('repositories:title'), to: '/repositories' }]}
        current={project.name}
      />

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
        <SectionCard
          label={t('repositories:section_repositories')}
          footer={
            <Button size="sm" variant="secondary" onClick={() => setEditBranchesOpen(true)}>
              {t('repositories:edit_branches')}
            </Button>
          }
        >
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
        </SectionCard>

        <SectionCard
          label={t('repositories:section_filters')}
          footer={
            <Button
              size="sm"
              loading={isUpdating}
              variant="secondary"
              onClick={() => void handleSaveExcludePatterns()}
            >
              {t('repositories:save_exclude_patterns')}
            </Button>
          }
        >
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
        </SectionCard>

        <SectionCard
          label={t('repositories:detail_webhook')}
          footer={
            <Button size="sm" variant="danger" onClick={() => setConfirmSecretOpen(true)}>
              {t('repositories:regenerate_secret')}
            </Button>
          }
        >
          <Field label={t('repositories:webhook_url_label')}>
            <CopyField
              value={project.webhook_url}
              wrap
              buttonLabel={t('repositories:copy_webhook_url')}
              onCopySuccess={() => toast.success(t('repositories:url_copy_success'))}
              onCopyError={(error) => toast.error(translateApiError(error))}
            />
          </Field>
        </SectionCard>

        <SectionCard label={t('repositories:pipeline_title')}>
          <div className={styles.pipelineRow}>
            <label className={styles.pipelineLabel}>{t('repositories:webhook_file_limit')}</label>
            <input
              className={styles.pipelineInput}
              type="number"
              min={1}
              max={1000}
              value={limitValue}
              onChange={(e) => setLimitValue(e.target.value)}
            />
            <Button
              variant="secondary"
              size="sm"
              loading={isUpdating}
              onClick={() =>
                void updateProject({
                  projectId,
                  data: { webhook_file_limit: Number(limitValue) },
                })
              }
            >
              {t('common:save')}
            </Button>
            <span className={styles.hint}>{t('repositories:webhook_file_limit_hint')}</span>
          </div>
          <div className={styles.pipelineRow}>
            {project.pipeline_paused ? (
              <>
                <span className={styles.pausedBadge}>
                  {t('repositories:pipeline_paused_label')}
                </span>
                <Button
                  variant="secondary"
                  loading={resuming}
                  onClick={() => void resumeProject(project.id)}
                >
                  {t('repositories:resume_pipeline')}
                </Button>
              </>
            ) : (
              <Button
                variant="ghost"
                loading={pausing}
                onClick={() => void pauseProject(project.id)}
              >
                {t('repositories:pause_pipeline')}
              </Button>
            )}
          </div>
        </SectionCard>

        <SectionCard label={t('repositories:incremental_section_title')}>
          <div className={styles.pipelineRow}>
            <label className={styles.pipelineLabel}>
              {t('repositories:incremental_threshold')}
            </label>
            <input
              className={styles.pipelineInput}
              type="number"
              min={1}
              max={100}
              value={thresholdValue}
              onChange={(e) => setThresholdValue(e.target.value)}
            />
            <Button
              variant="secondary"
              size="sm"
              loading={isUpdating}
              onClick={() => void handleSaveThreshold()}
            >
              {t('common:save')}
            </Button>
            <span className={styles.hint}>
              {t('repositories:incremental_threshold_hint', { n: thresholdValue })}
            </span>
          </div>
        </SectionCard>

        <SectionCard
          label={t('repositories:detail_recent_tasks')}
          description={
            hasTasks
              ? `${t('repositories:table_tasks')}: ${totalTasks}`
              : t('repositories:related_tasks_empty')
          }
        >
          {isTasksLoading ? (
            <Skeleton variant="rect" height={92} />
          ) : hasTasks ? (
            <div className={styles.taskList}>
              {tasks?.items?.map((task) => (
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
        </SectionCard>

        <SectionCard
          label={t('repositories:detail_danger_zone')}
          description={t('repositories:delete_confirm_description')}
          footer={
            <Button variant="danger" size="sm" onClick={() => setDeleteOpen(true)}>
              {t('repositories:delete_project')}
            </Button>
          }
        />
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
          mode="regenerate"
          webhookSecret={secretModalOpen}
          webhookUrl={project.webhook_url}
          onDone={() => setSecretModalOpen(null)}
        />
      ) : null}
    </section>
  )
}
