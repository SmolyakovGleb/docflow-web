import { useDeferredValue, useMemo, useState } from 'react'
import { CheckCircle, FolderGit2, LoaderCircle, Upload } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { Project } from '@/features/projects/model/types'
import { useGetProjectFilesQuery } from '@/features/projects/api/projectsApi'
import {
  useCreateManualRepoTasksMutation,
  useUploadManualTaskMutation,
} from '@/features/tasks/api/tasksApi'
import type { TaskCreateResponse } from '@/features/tasks/model/types'
import { cn } from '@/shared/lib/cn'
import { translateApiError } from '@/shared/lib/errorMessages'
import { Button } from '@/shared/ui/Button/Button'
import { DialogShell } from '@/shared/ui/DialogShell/DialogShell'
import { GitHubMark } from '@/shared/ui/GitHubMark/GitHubMark'
import { Input } from '@/shared/ui/Input/Input'
import { Select } from '@/shared/ui/Select/Select'
import { toast } from '@/shared/ui/Toast/toast'
import styles from './TriggerTranslationDialog.module.css'

const SKIPPED_REASON_KEYS = {
  already_queued: 'tasks:trigger.skipped_reason_already_queued',
  pipeline_running: 'tasks:trigger.skipped_reason_pipeline_running',
  excluded_by_pattern: 'tasks:trigger.skipped_reason_excluded_by_pattern',
} as const

type TriggerTab = 'repo' | 'upload'

interface TriggerTranslationDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  tab: TriggerTab
  onTabChange: (tab: TriggerTab) => void
  projects: Project[]
  githubLinked: boolean
  onConnectGithub: () => void
  onOpenRepositories: () => void
}

const FIXED_LANGUAGES = {
  source: 'RU - русский',
  target: 'EN - английский',
}

interface DialogEmptyStateProps {
  icon: 'github' | 'projects'
  title: string
  description: string
  actionLabel: string
  onAction: () => void
  footnote?: string
  actionVariant?: 'primary' | 'secondary'
}

function DialogEmptyState({
  icon,
  title,
  description,
  actionLabel,
  onAction,
  footnote,
  actionVariant = 'primary',
}: DialogEmptyStateProps) {
  return (
    <section className={styles.emptyState}>
      <div className={styles.emptyIcon}>
        {icon === 'github' ? <GitHubMark size={18} /> : <FolderGit2 size={18} />}
      </div>
      <h2 className={styles.emptyTitle}>{title}</h2>
      <p className={styles.emptyDescription}>{description}</p>
      <div className={styles.emptyActions}>
        <Button
          type="button"
          variant={actionVariant}
          iconLeft={icon === 'github' ? <GitHubMark size={13} /> : undefined}
          onClick={onAction}
        >
          {actionLabel}
        </Button>
      </div>
      {footnote ? <p className={styles.emptyFootnote}>{footnote}</p> : null}
    </section>
  )
}

export function TriggerTranslationDialog({
  open,
  onOpenChange,
  tab,
  onTabChange,
  projects,
  githubLinked,
  onConnectGithub,
  onOpenRepositories,
}: TriggerTranslationDialogProps) {
  const { t } = useTranslation(['tasks', 'common'])
  const [submitResult, setSubmitResult] = useState<TaskCreateResponse | null>(null)

  const [repoProjectId, setRepoProjectId] = useState('')
  const [repoPath, setRepoPath] = useState('')
  const [selectedFiles, setSelectedFiles] = useState<string[]>([])

  const [uploadProjectId, setUploadProjectId] = useState('')
  const [targetPath, setTargetPath] = useState('')
  const [file, setFile] = useState<File | null>(null)

  const deferredRepoPath = useDeferredValue(repoPath.trim())
  const resolvedRepoProjectId = repoProjectId || projects[0]?.id || ''
  const resolvedUploadProjectId = uploadProjectId || projects[0]?.id || ''
  const canFetchRepoFiles =
    tab === 'repo' && Boolean(resolvedRepoProjectId) && Boolean(deferredRepoPath)
  const repoQueryArg = canFetchRepoFiles
    ? { projectId: resolvedRepoProjectId, path: deferredRepoPath }
    : { projectId: '', path: '' }

  const {
    data: repoFiles,
    error: repoFilesError,
    isFetching: isFetchingRepoFiles,
  } = useGetProjectFilesQuery(repoQueryArg, {
    skip: !canFetchRepoFiles,
  })

  const [createManualRepoTasks, { isLoading: isCreatingRepoTasks }] =
    useCreateManualRepoTasksMutation()
  const [uploadManualTask, { isLoading: isUploadingTask }] = useUploadManualTaskMutation()

  const effectiveSelectedFiles = useMemo(() => {
    if (!repoFiles?.items.length) {
      return []
    }

    if (!selectedFiles.length) {
      return repoFiles.items
    }

    const availableFiles = new Set(repoFiles.items)
    const next = selectedFiles.filter((filePath) => availableFiles.has(filePath))
    return next.length > 0 ? next : repoFiles.items
  }, [repoFiles, selectedFiles])

  const repoCountLabel = useMemo(() => {
    if (!deferredRepoPath) {
      return t('tasks:trigger.repo_hint_idle')
    }

    if (isFetchingRepoFiles) {
      return t('tasks:trigger.repo_hint_loading')
    }

    if (repoFilesError) {
      return translateApiError(repoFilesError)
    }

    const count = repoFiles?.items.length ?? 0
    return t('tasks:trigger.repo_hint_found', { count })
  }, [deferredRepoPath, isFetchingRepoFiles, repoFiles?.items.length, repoFilesError, t])

  const handleToggleFile = (filePath: string) => {
    const baseSelection = effectiveSelectedFiles
    setSelectedFiles((current) =>
      (current.length ? current : baseSelection).includes(filePath)
        ? (current.length ? current : baseSelection).filter((item) => item !== filePath)
        : [...(current.length ? current : baseSelection), filePath],
    )
  }

  const handleSubmitRepo = async () => {
    if (!resolvedRepoProjectId || effectiveSelectedFiles.length === 0) {
      return
    }

    try {
      const result = await createManualRepoTasks({
        project_id: resolvedRepoProjectId,
        file_paths: effectiveSelectedFiles,
      }).unwrap()

      toast.success(t('tasks:trigger.created_success', { count: result.created }))
      if (result.skipped.length > 0) {
        setSubmitResult(result)
      } else {
        onOpenChange(false)
      }
    } catch (error) {
      toast.error(translateApiError(error))
    }
  }

  const handleSubmitUpload = async () => {
    if (!targetPath.trim() || !file) {
      return
    }

    const formData = new FormData()
    if (resolvedUploadProjectId) {
      formData.append('project_id', resolvedUploadProjectId)
    }
    formData.append('target_path', targetPath.trim())
    formData.append('file', file)

    try {
      await uploadManualTask(formData).unwrap()
      toast.success(t('tasks:trigger.created_success', { count: 1 }))
      onOpenChange(false)
    } catch (error) {
      toast.error(translateApiError(error))
    }
  }

  const closeAndReset = (nextOpen: boolean) => {
    if (!nextOpen) {
      setRepoProjectId('')
      setRepoPath('')
      setSelectedFiles([])
      setUploadProjectId('')
      setTargetPath('')
      setFile(null)
      setSubmitResult(null)
    }
    onOpenChange(nextOpen)
  }

  const isLoading = isCreatingRepoTasks || isUploadingTask
  const canSubmitRepo = Boolean(resolvedRepoProjectId) && effectiveSelectedFiles.length > 0
  const canSubmitUpload = Boolean(targetPath.trim()) && Boolean(file)
  const showGithubPrompt = tab === 'repo' && !githubLinked
  const showNoProjectsState = tab === 'repo' && !showGithubPrompt && projects.length === 0
  const showForm = !showGithubPrompt && !showNoProjectsState

  return (
    <DialogShell
      open={open}
      onOpenChange={closeAndReset}
      title={t('tasks:trigger.title')}
      description={t('tasks:trigger.footer_hint')}
      descriptionClassName={styles.srOnly}
      size="lg"
      position="top"
      showCloseButton
      closeLabel={t('common:close')}
      overlayClassName={styles.overlay}
      contentClassName={styles.content}
      headerClassName={styles.header}
      titleClassName={styles.title}
      footerClassName={styles.footer}
      footer={
        !submitResult ? (
          <>
            <div className={styles.footerHint}>
              {showForm ? (
                <>
                  <kbd>Enter</kbd>
                  <span>{t('tasks:trigger.submit')}</span>
                  <kbd>Esc</kbd>
                  <span>{t('common:cancel')}</span>
                </>
              ) : null}
            </div>
            <div className={styles.footerActions}>
              <Button type="button" variant="secondary" onClick={() => closeAndReset(false)}>
                {t('common:cancel')}
              </Button>
              {showForm ? (
                <Button
                  type="button"
                  loading={isLoading}
                  disabled={tab === 'repo' ? !canSubmitRepo : !canSubmitUpload}
                  onClick={() => {
                    void (tab === 'repo' ? handleSubmitRepo() : handleSubmitUpload())
                  }}
                >
                  {t('tasks:trigger.submit')}
                </Button>
              ) : null}
            </div>
          </>
        ) : (
          <>
            <div />
            <div className={styles.footerActions}>
              <Button type="button" onClick={() => closeAndReset(false)}>
                {t('common:close')}
              </Button>
            </div>
          </>
        )
      }
    >
      {!submitResult ? (
        <>
          <div className={styles.tabs}>
            <button
              type="button"
              className={cn(styles.tabButton, tab === 'repo' && styles.tabButtonActive)}
              onClick={() => onTabChange('repo')}
            >
              {t('tasks:trigger.repo_tab')}
            </button>
            <button
              type="button"
              className={cn(styles.tabButton, tab === 'upload' && styles.tabButtonActive)}
              onClick={() => onTabChange('upload')}
            >
              {t('tasks:trigger.upload_tab')}
            </button>
          </div>

          {showGithubPrompt ? (
            <div className={styles.body}>
              <DialogEmptyState
                icon="github"
                title={t('tasks:empty.no_github_title')}
                description={t('tasks:empty.no_github_description')}
                actionLabel={t('tasks:empty.link_github')}
                onAction={onConnectGithub}
                footnote={t('tasks:empty.no_github_secondary')}
              />
            </div>
          ) : showNoProjectsState ? (
            <div className={styles.body}>
              <DialogEmptyState
                icon="projects"
                title={t('tasks:empty.no_projects_title')}
                description={t('tasks:empty.no_projects_description')}
                actionLabel={t('tasks:empty.open_repositories')}
                actionVariant="secondary"
                onAction={onOpenRepositories}
              />
            </div>
          ) : tab === 'repo' ? (
            <div className={styles.body}>
              <div className={styles.field}>
                <label className={styles.fieldLabel}>{t('tasks:trigger.project_label')}</label>
                <Select
                  value={resolvedRepoProjectId}
                  onChange={(event) => setRepoProjectId(event.target.value)}
                >
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
                </Select>
              </div>

              <div className={styles.field}>
                <label className={styles.fieldLabel}>{t('tasks:trigger.path_label')}</label>
                <Input
                  inputClassName={styles.monoInput}
                  value={repoPath}
                  onChange={(event) => setRepoPath(event.target.value)}
                  placeholder={t('tasks:trigger.path_placeholder')}
                />
                <div className={styles.fieldHint}>{repoCountLabel}</div>
              </div>

              <div className={styles.fieldRow}>
                <div className={styles.field}>
                  <label className={styles.fieldLabel}>
                    {t('tasks:trigger.source_language_label')}
                  </label>
                  <div className={styles.readonlyField}>{FIXED_LANGUAGES.source}</div>
                </div>
                <div className={styles.field}>
                  <label className={styles.fieldLabel}>
                    {t('tasks:trigger.target_language_label')}
                  </label>
                  <div className={styles.readonlyField}>{FIXED_LANGUAGES.target}</div>
                </div>
              </div>

              <div className={styles.filePicker}>
                <div className={styles.filePickerHeader}>
                  <span>{t('tasks:trigger.files_label')}</span>
                  {isFetchingRepoFiles ? <LoaderCircle size={14} className={styles.spin} /> : null}
                </div>

                {repoFiles?.items.length ? (
                  <div className={styles.fileList}>
                    {repoFiles.items.map((filePath) => {
                      const checked = effectiveSelectedFiles.includes(filePath)
                      return (
                        <label key={filePath} className={styles.fileOption}>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => handleToggleFile(filePath)}
                          />
                          <span>{filePath}</span>
                        </label>
                      )
                    })}
                  </div>
                ) : (
                  <div className={styles.filePlaceholder}>
                    {t('tasks:trigger.files_placeholder')}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className={styles.body}>
              {projects.length > 0 ? (
                <div className={styles.field}>
                  <label className={styles.fieldLabel}>
                    {t('tasks:trigger.project_optional_label')}
                  </label>
                  <Select
                    value={resolvedUploadProjectId}
                    onChange={(event) => setUploadProjectId(event.target.value)}
                  >
                    {projects.map((project) => (
                      <option key={project.id} value={project.id}>
                        {project.name}
                      </option>
                    ))}
                  </Select>
                  <div className={styles.fieldHint}>{t('tasks:trigger.project_optional_hint')}</div>
                </div>
              ) : (
                <div className={styles.inlineNotice}>
                  {t('tasks:trigger.upload_without_project_hint')}
                </div>
              )}

              <div className={styles.field}>
                <label className={styles.fieldLabel}>{t('tasks:trigger.target_path_label')}</label>
                <Input
                  inputClassName={styles.monoInput}
                  value={targetPath}
                  onChange={(event) => setTargetPath(event.target.value)}
                  placeholder={t('tasks:trigger.target_path_placeholder')}
                />
              </div>

              <div className={styles.field}>
                <label className={styles.fieldLabel}>{t('tasks:trigger.file_label')}</label>
                <label className={styles.uploadDropzone}>
                  <input
                    className={styles.fileInput}
                    type="file"
                    accept=".md,text/markdown"
                    onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                  />
                  <Upload size={16} />
                  <span>{file?.name ? file.name : t('tasks:trigger.file_placeholder')}</span>
                </label>
              </div>

              <div className={styles.fieldRow}>
                <div className={styles.field}>
                  <label className={styles.fieldLabel}>
                    {t('tasks:trigger.source_language_label')}
                  </label>
                  <div className={styles.readonlyField}>{FIXED_LANGUAGES.source}</div>
                </div>
                <div className={styles.field}>
                  <label className={styles.fieldLabel}>
                    {t('tasks:trigger.target_language_label')}
                  </label>
                  <div className={styles.readonlyField}>{FIXED_LANGUAGES.target}</div>
                </div>
              </div>
            </div>
          )}
        </>
      ) : (
        <div className={styles.body}>
          <div className={styles.resultBanner}>
            <CheckCircle size={16} />
            <span>{t('tasks:trigger.created_success', { count: submitResult.created })}</span>
          </div>

          <div className={styles.skippedSection}>
            <div className={styles.skippedHeader}>
              <span>{t('tasks:trigger.skipped_section_title')}</span>
              <span className={styles.skippedCount}>{submitResult.skipped.length}</span>
            </div>

            <div className={styles.skippedList}>
              {submitResult.skipped.map((item) => (
                <div key={item.file_path} className={styles.skippedItem}>
                  <span className={styles.skippedPath}>{item.file_path}</span>
                  <span className={styles.skippedReason}>
                    {t(SKIPPED_REASON_KEYS[item.reason])}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </DialogShell>
  )
}
