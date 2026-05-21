import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { selectUser } from '@/features/auth/model/authSlice'
import { redirectToGithubConnect } from '@/features/auth/lib/redirectToGithubConnect'
import { useGetProjectsQuery } from '@/features/projects/api/projectsApi'
import {
  useDeleteTaskMutation,
  useGetTasksQuery,
  useLazyGetTaskQuery,
  usePublishTaskMutation,
  useRetryTaskMutation,
} from '@/features/tasks/api/tasksApi'
import { downloadMd } from '@/features/tasks/lib/downloadMd'
import { PublishDialog } from '../PublishDialog/PublishDialog'
import { useTaskListNotifications } from '@/features/tasks/hooks/useTaskListNotifications'
import { useTaskFilters } from '@/features/tasks/hooks/useTaskFilters'
import { groupByCommit } from '@/features/tasks/lib/groupByCommit'
import {
  clearSelection,
  selectRange,
  setBatchMode,
  setSelectedTaskIds,
  toggleTask,
} from '@/features/tasks/model/uiSlice'
import type { TaskSummary } from '@/features/tasks/model/types'
import { useGetHealthQuery } from '@/shared/api/healthApi'
import { translateApiError } from '@/shared/lib/errorMessages'
import { useAppDispatch, useAppSelector } from '@/shared/store/hooks'
import { ConfirmDialog } from '@/shared/ui/ConfirmDialog/ConfirmDialog'
import { toast } from '@/shared/ui/Toast/toast'
import { BatchFloatingBar } from '../BatchFloatingBar'
import { CommitGroup } from '../CommitGroup'
import { NewTasksBanner } from '../NewTasksBanner'
import { StatusTabs } from '../StatusTabs'
import { TaskListEmpty, TaskListError } from '../TaskListEmpty'
import { TaskListFooter } from '../TaskListFooter'
import { TaskListHeader } from '../TaskListHeader'
import { TaskListSkeleton } from '../TaskListSkeleton'
import { TaskListToolbar } from '../TaskListToolbar'
import { TriggerTranslationDialog } from '../TriggerTranslationDialog'
import styles from './TaskListPage.module.css'

const EMPTY_TASKS: TaskSummary[] = []
type TriggerDialogTab = 'repo' | 'upload'

export function TaskListPage() {
  const { t } = useTranslation(['tasks', 'common'])
  const navigate = useNavigate()
  const dispatch = useAppDispatch()
  const user = useAppSelector(selectUser)
  const selectedTaskIds = useAppSelector((state) => state.tasksUI.selectedTaskIds)
  const batchMode = useAppSelector((state) => state.tasksUI.batchMode)

  const { filters, setFilters, resetFilters } = useTaskFilters()
  const [isDialogOpen, setDialogOpen] = useState(false)
  const [dialogTab, setDialogTab] = useState<TriggerDialogTab>('repo')
  const [taskToRemove, setTaskToRemove] = useState<TaskSummary | null>(null)
  const [pendingPublishTask, setPendingPublishTask] = useState<TaskSummary | null>(null)
  const [publishDialogOpen, setPublishDialogOpen] = useState(false)
  const [publishingIds, setPublishingIds] = useState<Set<string>>(new Set())

  const { data: projects = [] } = useGetProjectsQuery()
  const {
    data: tasksResponse,
    isLoading,
    isFetching,
    error,
    refetch,
  } = useGetTasksQuery({
    status: filters.status,
    project_id: filters.projectId,
    search: filters.search,
    limit: 50,
    offset: 0,
  })
  const { data: health } = useGetHealthQuery(undefined, { pollingInterval: 30000 })
  const [fetchTask] = useLazyGetTaskQuery()
  const [publishTask] = usePublishTaskMutation()
  const [retryTask] = useRetryTaskMutation()
  const [deleteTask, { isLoading: isDeletingTask }] = useDeleteTaskMutation()

  const tasks = tasksResponse?.items ?? EMPTY_TASKS
  const visibleTaskIds = useMemo(() => tasks.map((task) => task.id), [tasks])
  const selectedIdsSet = useMemo(() => new Set(selectedTaskIds), [selectedTaskIds])
  const groups = useMemo(() => groupByCommit(tasks), [tasks])
  const hasActiveFilters = Boolean(filters.status || filters.projectId || filters.search)
  const hasGithubLinked = Boolean(user?.github_linked)
  const showToolbar =
    hasGithubLinked && (isLoading || Boolean(error) || tasks.length > 0 || hasActiveFilters)
  const showFooter = !isLoading && !error && tasks.length > 0

  const bannerScopeKey = JSON.stringify({
    status: filters.status,
    projectId: filters.projectId,
    search: filters.search,
  })
  const { newTasksCount, clearNewTasks } = useTaskListNotifications(
    bannerScopeKey,
    {
      status: filters.status,
      projectId: filters.projectId,
      search: filters.search,
    },
    visibleTaskIds,
    true,
  )

  // Active tab derived from filter status
  const activeTab =
    filters.status === 'queued' ||
    filters.status === 'running' ||
    filters.status === 'done' ||
    filters.status === 'failed' ||
    filters.status === 'conflict' ||
    filters.status === 'published'
      ? filters.status
      : 'all'

  const selectedDoneCount = tasks.filter(
    (task) => selectedIdsSet.has(task.id) && task.status === 'done' && Boolean(task.project_id),
  ).length

  // Keep selection in sync when the task list changes (filter change / refetch).
  useEffect(() => {
    if (!selectedTaskIds.length) return
    if (!tasks.length) {
      dispatch(clearSelection())
      return
    }
    const visibleIds = new Set(tasks.map((t) => t.id))
    const next = selectedTaskIds.filter((id) => visibleIds.has(id))
    if (next.length !== selectedTaskIds.length) {
      dispatch(setSelectedTaskIds(next))
    }
  }, [dispatch, tasks, selectedTaskIds])

  const lastSelectedIdxRef = useRef(-1)

  const handleToggleSelect = useCallback(
    (taskId: string, event?: React.MouseEvent) => {
      const flatTasks = groups.flatMap((g) => g.tasks)
      const currentIdx = flatTasks.findIndex((t) => t.id === taskId)

      if (event?.shiftKey && lastSelectedIdxRef.current >= 0 && batchMode) {
        const start = Math.min(lastSelectedIdxRef.current, currentIdx)
        const end = Math.max(lastSelectedIdxRef.current, currentIdx)
        const rangeIds = flatTasks.slice(start, end + 1).map((t) => t.id)
        dispatch(selectRange(rangeIds))
      } else {
        if ((event?.ctrlKey || event?.metaKey) && !batchMode) {
          dispatch(setBatchMode(true))
        }
        dispatch(toggleTask(taskId))
      }
      lastSelectedIdxRef.current = currentIdx
    },
    [batchMode, dispatch, groups],
  )

  const handleToggleBatchMode = () => {
    if (batchMode) {
      dispatch(clearSelection())
    } else {
      dispatch(setBatchMode(true))
    }
  }

  const handleDownload = async (task: TaskSummary) => {
    try {
      const detail = await fetchTask(task.id).unwrap()
      if (!detail.translated_content) {
        toast.error(t('download_missing'))
        return
      }
      downloadMd(task.file_path, detail.translated_content)
    } catch (err) {
      toast.error(translateApiError(err))
    }
  }

  const handleRetry = async (taskId: string) => {
    try {
      await toast.promise(retryTask({ taskId }).unwrap(), {
        loading: `${t('actions.retry')}...`,
        success: t('actions.retry_success'),
        error: (error) => translateApiError(error),
      })
    } catch {
      // promise toast already shows the error state
    }
  }

  const handlePublish = (taskId: string) => {
    const task = tasks.find((item) => item.id === taskId) ?? null
    if (!task) return
    setPendingPublishTask(task)
    setPublishDialogOpen(true)
  }

  const handlePublishConfirmed = async (commitMessage: string, targetPath: string) => {
    if (!pendingPublishTask) return
    const { id: taskId } = pendingPublishTask
    setPublishDialogOpen(false)
    setPublishingIds((prev) => new Set([...prev, taskId]))
    try {
      await toast.promise(publishTask({ taskId, commitMessage, targetPath }).unwrap(), {
        loading: `${t('actions.publish')}...`,
        success: t('actions.publish_success'),
        error: (error) => translateApiError(error),
      })
    } catch {
      // promise toast already shows the error state
    } finally {
      setPublishingIds((prev) => {
        const next = new Set(prev)
        next.delete(taskId)
        return next
      })
      setPendingPublishTask(null)
    }
  }

  const handleRemove = async () => {
    if (!taskToRemove) {
      return
    }

    try {
      await deleteTask(taskToRemove.id).unwrap()
      toast.success(t('actions.remove_success'))
      setTaskToRemove(null)
    } catch (err) {
      toast.error(translateApiError(err))
    }
  }

  const handlePublishGroup = async (taskIds: string[]) => {
    if (!taskIds.length) return
    setPublishingIds((prev) => new Set([...prev, ...taskIds]))
    const results = await Promise.allSettled(
      taskIds.map((id) => publishTask({ taskId: id }).unwrap()),
    )
    const successCount = results.filter((r) => r.status === 'fulfilled').length
    const failCount = results.length - successCount
    if (successCount > 0) toast.success(t('actions.publish_group_success', { count: successCount }))
    if (failCount > 0) toast.error(t('actions.publish_group_failed', { count: failCount }))
    setPublishingIds((prev) => {
      const next = new Set(prev)
      taskIds.forEach((id) => next.delete(id))
      return next
    })
  }

  const handleBatchPublish = async () => {
    const ids = tasks
      .filter(
        (task) => selectedIdsSet.has(task.id) && task.status === 'done' && Boolean(task.project_id),
      )
      .map((task) => task.id)
    await handlePublishGroup(ids)
  }

  const handleSearchChange = useCallback(
    (value: string) => {
      setFilters({ search: value })
    },
    [setFilters],
  )

  return (
    <section className={styles.page}>
      <TaskListHeader
        searchValue={filters.search}
        onSearchChange={handleSearchChange}
        onTriggerTranslation={() => {
          setDialogTab(hasGithubLinked && projects.length > 0 ? 'repo' : 'upload')
          setDialogOpen(true)
        }}
      />

      <StatusTabs
        activeTab={activeTab}
        tasks={tasks}
        counts={tasksResponse?.status_counts}
        onTabChange={(status) => setFilters({ status })}
      />

      <NewTasksBanner
        count={newTasksCount}
        onRefresh={() => {
          clearNewTasks()
          window.scrollTo({ top: 0, behavior: 'smooth' })
          void refetch()
        }}
      />

      {showToolbar ? (
        <TaskListToolbar
          batchMode={batchMode}
          health={health}
          projects={projects}
          selectedProjectId={filters.projectId}
          showSelectionToggle={tasks.length > 0}
          totalCount={tasksResponse?.total ?? tasks.length}
          onToggleBatchMode={handleToggleBatchMode}
          onProjectChange={(projectId) => setFilters({ projectId })}
        />
      ) : null}

      {isLoading ? (
        <TaskListSkeleton />
      ) : error ? (
        <TaskListError isRetrying={isFetching} onRetry={() => void refetch()} />
      ) : tasks.length === 0 ? (
        <TaskListEmpty
          userGithubLinked={hasGithubLinked}
          hasFilters={hasActiveFilters}
          hasProjects={projects.length > 0}
          onConnectGithub={() => {
            redirectToGithubConnect()
          }}
          onResetFilters={resetFilters}
          onOpenDialog={() => {
            setDialogTab('repo')
            setDialogOpen(true)
          }}
          onOpenUploadDialog={() => {
            setDialogTab('upload')
            setDialogOpen(true)
          }}
          onOpenRepositories={() => void navigate('/repositories')}
        />
      ) : (
        <div className={styles.list}>
          {groups.map((group) => (
            <CommitGroup
              key={group.id}
              group={group}
              batchMode={batchMode}
              selectedIds={selectedIdsSet}
              publishingIds={publishingIds}
              onToggleSelect={handleToggleSelect}
              onOpenTask={(taskId) => void navigate(`/tasks/${taskId}`)}
              onDownload={(task) => void handleDownload(task)}
              onRetry={(taskId) => void handleRetry(taskId)}
              onRemove={(taskId) => {
                const task = tasks.find((item) => item.id === taskId) ?? null
                setTaskToRemove(task)
              }}
              onPublish={(taskId) => handlePublish(taskId)}
              onPublishGroup={(taskIds) => void handlePublishGroup(taskIds)}
            />
          ))}
        </div>
      )}

      {showFooter ? (
        <TaskListFooter
          health={health}
          visibleCount={tasks.length}
          totalCount={tasksResponse?.total ?? 0}
        />
      ) : null}

      <BatchFloatingBar
        selectedCount={selectedTaskIds.length}
        selectedDoneCount={selectedDoneCount}
        onDownload={() => {
          const selected = tasks.filter((task) => selectedIdsSet.has(task.id))
          void Promise.all(selected.map((task) => handleDownload(task)))
        }}
        onPublish={() => void handleBatchPublish()}
        onClose={() => dispatch(clearSelection())}
      />

      <TriggerTranslationDialog
        open={isDialogOpen}
        onOpenChange={(nextOpen) => {
          setDialogOpen(nextOpen)
          if (!nextOpen) {
            setDialogTab('repo')
          }
        }}
        tab={dialogTab}
        onTabChange={setDialogTab}
        projects={projects}
        githubLinked={hasGithubLinked}
        onConnectGithub={() => {
          redirectToGithubConnect()
        }}
        onOpenRepositories={() => void navigate('/repositories')}
      />

      {pendingPublishTask ? (
        <PublishDialog
          open={publishDialogOpen}
          onOpenChange={(open) => {
            setPublishDialogOpen(open)
            if (!open) setPendingPublishTask(null)
          }}
          task={pendingPublishTask}
          project={projects.find((p) => p.id === pendingPublishTask.project_id)}
          loading={publishingIds.has(pendingPublishTask.id)}
          onPublish={(commitMessage, targetPath) =>
            void handlePublishConfirmed(commitMessage, targetPath)
          }
        />
      ) : null}

      <ConfirmDialog
        open={Boolean(taskToRemove)}
        onOpenChange={(open) => {
          if (!open) {
            setTaskToRemove(null)
          }
        }}
        title={t('remove_from_queue.title')}
        description={t('remove_from_queue.description', { file: taskToRemove?.file_path ?? '' })}
        confirmText={t('actions.remove_from_queue')}
        confirmVariant="danger"
        loading={isDeletingTask}
        onConfirm={() => void handleRemove()}
      />
    </section>
  )
}
