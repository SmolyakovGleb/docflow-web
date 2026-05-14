import { skipToken } from '@reduxjs/toolkit/query'
import { Download, RefreshCw, Upload } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useBlocker, useNavigate, useParams } from 'react-router-dom'
import { useGetProjectsQuery } from '@/features/projects/api/projectsApi'
import type { Project } from '@/features/projects/model/types'
import {
  useCreateManualRepoTasksMutation,
  useGetTaskLogQuery,
  useGetTaskQuery,
  useLazyGetTaskQuery,
  usePublishTaskMutation,
  useRetryTaskMutation,
  useUpdateTaskMutation,
} from '@/features/tasks/api/tasksApi'
import { useDirty } from '@/features/tasks/hooks/useDirty'
import { useSSE } from '@/features/tasks/hooks/useSSE'
import { useTaskDetailTab } from '@/features/tasks/hooks/useTaskDetailTab'
import { downloadMd } from '@/features/tasks/lib/downloadMd'
import { parseLogs } from '@/features/tasks/lib/parseLogs'
import {
  getAvailableTaskDetailTabs,
  type TaskDetail,
  type TaskDetailTab,
  type TaskPipelineStage,
} from '@/features/tasks/model/types'
import { useGetAnalyticsStatsQuery } from '@/shared/api/analyticsApi'
import type { AxiosBaseQueryError } from '@/shared/api/axiosBaseQuery'
import { formatRelativeShort } from '@/shared/lib/date'
import { getPlural } from '@/shared/lib/plural'
import { translateApiError } from '@/shared/lib/errorMessages'
import { Button } from '@/shared/ui/Button/Button'
import { EmptyState } from '@/shared/ui/EmptyState/EmptyState'
import { Skeleton } from '@/shared/ui/Skeleton/Skeleton'
import { toast } from '@/shared/ui/Toast/toast'
import { ConflictView } from '../ConflictView/ConflictView'
import { DiffEditor } from '../DiffEditor/DiffEditor'
import { DiffSaveBar } from '../DiffSaveBar/DiffSaveBar'
import { LogsView } from '../LogsView/LogsView'
import { PublishConflictDialog } from '../PublishConflictDialog/PublishConflictDialog'
import { RetryConflictDialog } from '../RetryConflictDialog/RetryConflictDialog'
import { TaskDetailHeader } from '../TaskDetailHeader/TaskDetailHeader'
import { TaskDetailTabs } from '../TaskDetailTabs/TaskDetailTabs'
import styles from './TaskDetailPage.module.css'

function formatSeconds(totalSeconds: number) {
  if (totalSeconds < 60) {
    return `${totalSeconds} с`
  }

  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes} мин ${seconds} с`
}

function formatRuntime(task: TaskDetail, liveElapsedSeconds: number | null) {
  if (liveElapsedSeconds !== null) {
    return formatSeconds(liveElapsedSeconds)
  }

  const start = new Date(task.created_at).getTime()
  const end = new Date(task.completed_at ?? task.updated_at).getTime()
  return formatSeconds(Math.max(1, Math.round((end - start) / 1000)))
}

function getProjectById(projects: Project[], projectId: string | null) {
  if (!projectId) {
    return undefined
  }

  return projects.find((project) => project.id === projectId)
}

function getFileName(filePath: string) {
  return filePath.split('/').at(-1) ?? filePath
}

function getInitials(value: string | null) {
  if (!value) {
    return null
  }

  const chunks = value
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((chunk) => chunk[0]?.toUpperCase() ?? '')
    .join('')

  return chunks || value.slice(0, 2).toUpperCase()
}

function downloadText(filename: string, content: string, type = 'text/plain;charset=utf-8') {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')

  anchor.href = url
  anchor.download = filename

  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

function getQueuedSeconds(avgDuration: number | null | undefined) {
  return Math.max(5, Math.round(avgDuration ?? 30))
}

function formatChangeCount(count: number) {
  return `${count} ${getPlural(count, 'изменение', 'изменения', 'изменений')}`
}

function formatStageCount(count: number) {
  return `${count} ${getPlural(count, 'этап', 'этапа', 'этапов')}`
}

function countChangedLines(left: string, right: string) {
  if (!right.trim()) {
    return 0
  }

  const leftLines = left.split('\n')
  const rightLines = right.split('\n')
  const length = Math.max(leftLines.length, rightLines.length)
  let changed = 0

  for (let index = 0; index < length; index += 1) {
    if ((leftLines[index] ?? '') !== (rightLines[index] ?? '')) {
      changed += 1
    }
  }

  return changed
}

function toPipelineStage(value: string | null): TaskPipelineStage | null {
  if (value === 'prepare' || value === 'pipeline' || value === 'persist') {
    return value
  }

  return null
}

function isConflictError(error: unknown): error is AxiosBaseQueryError {
  return Boolean(
    error &&
    typeof error === 'object' &&
    'status' in error &&
    (error as AxiosBaseQueryError).status === 409,
  )
}

function getRetryConflictData(error: unknown) {
  if (!isConflictError(error) || !error.data || typeof error.data !== 'object') {
    return null
  }

  const data = error.data as {
    source_diff?: {
      old_sha?: string | null
      new_sha?: string | null
    }
  }

  if (!data.source_diff) {
    return null
  }

  return {
    oldSha: data.source_diff.old_sha ?? null,
    newSha: data.source_diff.new_sha ?? null,
  }
}

function TaskDetailSkeleton() {
  return (
    <section className={styles.page}>
      <header className={styles.header} aria-hidden>
        <div className={styles.skeletonBreadcrumb}>
          <Skeleton width={170} height={12} />
        </div>

        <div className={styles.skeletonTitleRow}>
          <div className={styles.skeletonTitleBlock}>
            <Skeleton width="min(420px, 72%)" height={28} />

            <div className={styles.skeletonMetaRow}>
              <Skeleton width={112} height={12} />
              <Skeleton width={58} height={20} />
              <div className={styles.skeletonAuthor}>
                <Skeleton variant="circle" width={18} height={18} />
                <Skeleton width={92} height={12} />
              </div>
              <Skeleton width={84} height={12} />
            </div>
          </div>

          <div className={styles.skeletonActions}>
            <Skeleton width={88} height={28} />
            <Skeleton width={124} height={28} />
          </div>
        </div>

        <div className={styles.skeletonTabs}>
          <Skeleton width={74} height={12} />
          <Skeleton width={88} height={12} />
          <Skeleton width={68} height={12} />
        </div>
      </header>

      <section className={styles.panel} aria-hidden>
        <div className={styles.diffLayout}>
          <div className={styles.diffColumn}>
            <div className={styles.columnHeader}>
              <Skeleton width={126} height={14} />
              <Skeleton variant="circle" width={18} height={18} />
            </div>
            <div className={styles.skeletonPane}>
              {Array.from({ length: 12 }).map((_, index) => (
                <div key={`left-${index}`} className={styles.skeletonLine}>
                  <Skeleton width={24} height={12} />
                  <Skeleton width={`${52 + ((index * 7) % 34)}%`} height={12} />
                </div>
              ))}
            </div>
            <div className={styles.columnFooter}>
              <Skeleton width={156} height={12} />
            </div>
          </div>

          <div className={styles.divider} aria-hidden />

          <div className={styles.diffColumn}>
            <div className={styles.columnHeader}>
              <Skeleton width={144} height={14} />
              <Skeleton width={110} height={12} />
            </div>
            <div className={styles.skeletonPane}>
              {Array.from({ length: 12 }).map((_, index) => (
                <div key={`right-${index}`} className={styles.skeletonLine}>
                  <Skeleton width={24} height={12} />
                  <Skeleton width={`${48 + ((index * 9) % 38)}%`} height={12} />
                </div>
              ))}
            </div>
            <div className={styles.columnFooter}>
              <Skeleton width={164} height={12} />
            </div>
          </div>
        </div>
      </section>
    </section>
  )
}

interface TaskDetailContentProps {
  task: TaskDetail
  project?: Project | undefined
  taskLog: string | undefined
  queuedSeconds: number
  activeTab: TaskDetailTab
  onTabChange: (tab: TaskDetailTab) => void
  onRefresh: () => Promise<unknown>
}

function TaskDetailContent({
  task,
  project,
  taskLog,
  queuedSeconds,
  activeTab,
  onTabChange,
  onRefresh,
}: TaskDetailContentProps) {
  const { t } = useTranslation(['tasks', 'common'])
  const navigate = useNavigate()
  const [fetchTask] = useLazyGetTaskQuery()
  const [updateTask, { isLoading: isSaving }] = useUpdateTaskMutation()
  const [retryTask, { isLoading: isRetrying }] = useRetryTaskMutation()
  const [publishTask, { isLoading: isPublishing }] = usePublishTaskMutation()
  const [createManualRepoTasks, { isLoading: isCreatingNewTask }] =
    useCreateManualRepoTasksMutation()

  const [liveStage, setLiveStage] = useState<TaskPipelineStage | null>(null)
  const [liveElapsedSeconds, setLiveElapsedSeconds] = useState<number | null>(null)
  const [diffDraft, setDiffDraft] = useState<string | null>(null)
  const [conflictDraft, setConflictDraft] = useState<string | null>(null)
  const [retryConflictOpen, setRetryConflictOpen] = useState(false)
  const [retryConflictData, setRetryConflictData] = useState<{
    filePath: string
    sourceRepo: string | null
    oldSha: string | null
    newSha: string | null
  } | null>(null)
  const [publishConflictOpen, setPublishConflictOpen] = useState(false)

  const baseDiffContent = task.translated_content ?? ''
  const baseConflictContent = task.conflict_theirs ?? task.translated_content ?? ''
  const baseConflictOurs = task.conflict_ours ?? task.translated_content ?? ''
  const baseConflictBase = task.conflict_base ?? task.original_content
  const diffContent = diffDraft ?? baseDiffContent
  const resolvedConflictDraft = conflictDraft ?? baseConflictContent
  const isDiffEditable = task.status === 'done' || task.status === 'failed'
  const isDiffDirty = isDiffEditable && diffDraft !== null
  const isConflictDirty = task.status === 'conflict' && conflictDraft !== null
  const hasDirtyChanges = isDiffDirty || isConflictDirty
  const blocker = useBlocker(hasDirtyChanges)

  useDirty(hasDirtyChanges)

  // Live elapsed time counter for running tasks.
  useEffect(() => {
    if (task.status !== 'running') {
      return undefined
    }

    const start = new Date(task.created_at).getTime()
    const update = () => setLiveElapsedSeconds(Math.max(1, Math.round((Date.now() - start) / 1000)))
    const timeoutId = setTimeout(update, 0)
    const intervalId = setInterval(update, 1000)

    return () => {
      clearTimeout(timeoutId)
      clearInterval(intervalId)
    }
  }, [task.status, task.created_at])

  useEffect(() => {
    if (blocker.state !== 'blocked') {
      return
    }

    if (window.confirm(t('unsaved_changes.confirm_navigation'))) {
      blocker.proceed()
      return
    }

    blocker.reset()
  }, [blocker, t])

  useSSE({
    taskId: task.id,
    status: task.status,
    onStageUpdate: (event) => setLiveStage(event.stage),
    onStatusChange: () => {
      setLiveStage(null)
      setDiffDraft(null)
      setConflictDraft(null)

      void onRefresh()
    },
  })

  const fallbackLogStage = task.status === 'running' ? null : ('pipeline' as const)

  const parsedLogs = useMemo(
    () => parseLogs(taskLog ?? null, [], { liveStage, fallbackStage: fallbackLogStage }),
    [fallbackLogStage, taskLog, liveStage],
  )

  const diffCount = useMemo(() => {
    if (!baseDiffContent.trim() && !diffContent.trim()) {
      return null
    }

    return countChangedLines(task.original_content, diffContent)
  }, [baseDiffContent, diffContent, task.original_content])

  const unsavedDiffCount = useMemo(() => {
    if (!isDiffDirty) {
      return 0
    }

    return countChangedLines(baseDiffContent, diffContent)
  }, [baseDiffContent, diffContent, isDiffDirty])

  const currentStage = liveStage ?? toPipelineStage(task.current_stage)
  const latestPublication = task.publications.at(-1)
  const tabs = getAvailableTaskDetailTabs(task.status)
  const activeLogsTab = activeTab === 'logs'
  const shouldShowEmptyLogs = activeLogsTab && parsedLogs.length === 0
  const rawLogText = taskLog ?? ''
  const fileName = getFileName(task.file_path)
  const authorName = task.commit_author_name ?? task.commit_author_login ?? null
  const authorInitials = getInitials(authorName)
  const tabMeta = {
    diff: diffCount ? formatChangeCount(diffCount) : null,
    logs: parsedLogs.length ? formatStageCount(parsedLogs.length) : null,
    conflict: null,
  } as const

  async function refreshTaskAndOpenConflictIfNeeded() {
    const refreshed = await fetchTask(task.id).unwrap()
    if (refreshed.status === 'conflict') {
      onTabChange('conflict')
    }
    // fetchTask updates the shared RTK Query cache — no second request needed.
  }

  async function handleSaveDiff() {
    try {
      await updateTask({ taskId: task.id, translated_content: diffContent }).unwrap()
      setDiffDraft(null)
      toast.success(t('diff.save_success'))
      await onRefresh()
    } catch (saveError) {
      toast.error(translateApiError(saveError))
    }
  }

  async function handleRetry(force = false) {
    try {
      await retryTask({ taskId: task.id, force }).unwrap()
      setRetryConflictOpen(false)
      setRetryConflictData(null)
      setLiveStage(null)
      setDiffDraft(null)
      setConflictDraft(null)
      toast.success(t('actions.retry_success'))
      await onRefresh()
    } catch (retryError) {
      const conflictData = getRetryConflictData(retryError)
      if (conflictData) {
        setRetryConflictData({
          filePath: task.file_path,
          sourceRepo: project?.source_repo ?? null,
          oldSha: conflictData.oldSha,
          newSha: conflictData.newSha,
        })
        setRetryConflictOpen(true)
        return
      }

      toast.error(translateApiError(retryError))
    }
  }

  async function handleCreateNewTask() {
    if (!task.project_id) {
      return
    }

    try {
      const response = await createManualRepoTasks({
        project_id: task.project_id,
        file_paths: [task.file_path],
      }).unwrap()

      const createdTaskId = response.task_ids[0]
      const existingTaskId =
        response.skipped.find((item) => item.existing_task_id)?.existing_task_id ?? null

      setRetryConflictOpen(false)
      setRetryConflictData(null)

      if (createdTaskId) {
        void navigate(`/tasks/${createdTaskId}`)
        return
      }

      if (existingTaskId) {
        toast.info(t('retry_conflict.open_existing'))
        void navigate(`/tasks/${existingTaskId}`)
        return
      }

      toast.error(t('retry_conflict.create_failed'))
    } catch (createError) {
      toast.error(translateApiError(createError))
    }
  }

  async function handlePublish(content: string) {
    try {
      if (content !== (task.translated_content ?? '')) {
        await updateTask({ taskId: task.id, translated_content: content }).unwrap()
      }

      await publishTask(task.id).unwrap()
      setDiffDraft(null)
      setConflictDraft(null)
      toast.success(t('actions.publish_success'))
      await onRefresh()
    } catch (publishError) {
      if (isConflictError(publishError)) {
        setPublishConflictOpen(true)
        await refreshTaskAndOpenConflictIfNeeded()
        return
      }

      toast.error(translateApiError(publishError))
    }
  }

  const headerActions = (
    <>
      {(task.status === 'done' || task.status === 'failed' || task.status === 'published') &&
      diffContent ? (
        <Button
          size="sm"
          variant="secondary"
          iconLeft={<Download size={14} />}
          onClick={() => downloadMd(task.file_path, diffContent)}
        >
          {t('diff.download')}
        </Button>
      ) : null}

      {task.status === 'failed' ? (
        <Button
          size="sm"
          variant="secondary"
          iconLeft={<RefreshCw size={14} />}
          loading={isRetrying}
          onClick={() => void handleRetry()}
        >
          {t('actions.retry')}
        </Button>
      ) : null}

      {task.status === 'done' ? (
        <Button
          size="sm"
          iconLeft={<Upload size={14} />}
          loading={isPublishing}
          onClick={() => void handlePublish(diffContent)}
        >
          {t('actions.publish')}
        </Button>
      ) : null}
    </>
  )

  return (
    <>
      <TaskDetailHeader
        task={task}
        project={project}
        publication={latestPublication}
        actions={headerActions}
      >
        <TaskDetailTabs activeTab={activeTab} tabs={tabs} meta={tabMeta} onChange={onTabChange} />
      </TaskDetailHeader>

      <div className={styles.body}>
        {activeTab === 'diff' ? (
          <DiffEditor
            filePath={task.file_path}
            originalContent={task.original_content}
            translatedContent={
              task.status === 'queued' || task.status === 'running'
                ? ''
                : task.status === 'published'
                  ? (task.translated_content ?? '')
                  : diffContent
            }
            readOnly={!isDiffEditable}
            queuedSeconds={task.status === 'queued' ? queuedSeconds : null}
            diffCount={diffCount}
            unsavedCount={unsavedDiffCount}
            onDownload={diffContent ? () => downloadMd(task.file_path, diffContent) : undefined}
            onChange={(value) => setDiffDraft(value === baseDiffContent ? null : value)}
          />
        ) : null}

        {activeLogsTab && !shouldShowEmptyLogs ? (
          <LogsView
            stages={parsedLogs}
            runtime={formatRuntime(task, task.status === 'running' ? liveElapsedSeconds : null)}
            currentStage={task.status === 'running' ? currentStage : null}
            onCopy={() => {
              void navigator.clipboard.writeText(rawLogText)
            }}
            onDownload={
              rawLogText.trim()
                ? () =>
                    downloadText(`${fileName.replace(/\.md$/i, '') || 'task'}-logs.txt`, rawLogText)
                : undefined
            }
          />
        ) : null}

        {shouldShowEmptyLogs ? (
          <div className={styles.empty}>
            <EmptyState title={t('empty_logs_title')} description={t('empty_logs_description')} />
          </div>
        ) : null}

        {activeTab === 'conflict' && task.status === 'conflict' ? (
          <ConflictView
            base={baseConflictBase}
            ours={baseConflictOurs}
            theirs={baseConflictContent}
            value={resolvedConflictDraft}
            loading={isSaving || isPublishing}
            baseMeta={{
              badge: authorInitials,
              text:
                authorName && task.github_sha
                  ? `${authorName} · commit ${task.github_sha.slice(0, 7)}`
                  : (authorName ?? t('conflict.col_base_meta')),
            }}
            oursMeta={{
              badge: 'AI',
              mutedBadge: true,
              text: `DocFlow AI · ${formatRelativeShort(task.updated_at, { withSuffix: true })}`,
            }}
            theirsMeta={{
              text:
                project?.target_repo && task.target_file_sha
                  ? `${project.target_repo} · commit ${task.target_file_sha.slice(0, 7)}`
                  : (project?.target_repo ?? t('conflict.col_theirs_meta')),
            }}
            onChange={(value) => setConflictDraft(value === baseConflictContent ? null : value)}
            onUseOurs={() =>
              setConflictDraft(baseConflictOurs === baseConflictContent ? null : baseConflictOurs)
            }
            onUseTheirs={() => setConflictDraft(null)}
            onPublish={() => void handlePublish(resolvedConflictDraft)}
          />
        ) : null}
      </div>

      <DiffSaveBar
        visible={Boolean(activeTab === 'diff' && isDiffDirty)}
        loading={isSaving}
        count={Math.max(unsavedDiffCount, 1)}
        onSave={() => void handleSaveDiff()}
        onDiscard={() => setDiffDraft(null)}
      />

      <RetryConflictDialog
        open={retryConflictOpen}
        data={retryConflictData}
        loading={isRetrying || isCreatingNewTask}
        onOpenChange={setRetryConflictOpen}
        onCreateNew={() => void handleCreateNewTask()}
        onUseOld={() => void handleRetry(true)}
      />

      <PublishConflictDialog
        open={publishConflictOpen}
        onOpenChange={setPublishConflictOpen}
        onOpenConflict={() => {
          setPublishConflictOpen(false)
          if (task.status === 'conflict') {
            onTabChange('conflict')
          }
        }}
      />
    </>
  )
}

export function TaskDetailPage() {
  const { t } = useTranslation(['tasks', 'common'])
  const navigate = useNavigate()
  const { taskId } = useParams()
  const { data: projects = [] } = useGetProjectsQuery()
  const { data: analytics } = useGetAnalyticsStatsQuery()
  const { data: task, isLoading, error, refetch } = useGetTaskQuery(taskId ?? skipToken)
  const { data: taskLog } = useGetTaskLogQuery(taskId ?? skipToken)

  const { activeTab, setActiveTab } = useTaskDetailTab(task?.status)
  const project = useMemo(
    () => getProjectById(projects, task?.project_id ?? null),
    [projects, task],
  )

  useEffect(() => {
    if (task?.status !== 'queued') {
      return undefined
    }

    const id = setInterval(() => {
      void refetch()
    }, 3000)

    return () => clearInterval(id)
  }, [task?.status, refetch])

  if (!taskId) {
    return null
  }

  if (isLoading) {
    return <TaskDetailSkeleton />
  }

  if (error || !task) {
    return (
      <section className={styles.page}>
        <div className={styles.empty}>
          <EmptyState
            title={t('not_found_title')}
            description={error ? translateApiError(error) : t('not_found_description')}
            actions={<Button onClick={() => void navigate('/tasks')}>{t('common:back')}</Button>}
          />
        </div>
      </section>
    )
  }

  return (
    <section className={styles.page}>
      <TaskDetailContent
        task={task}
        project={project}
        taskLog={taskLog}
        queuedSeconds={getQueuedSeconds(analytics?.avg_duration_seconds)}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        onRefresh={refetch}
      />
    </section>
  )
}
