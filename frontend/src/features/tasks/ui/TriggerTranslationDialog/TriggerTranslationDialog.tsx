import { Fragment, useMemo, useRef, useState } from 'react'
import {
  CheckCircle,
  ChevronRight,
  FileText,
  Folder,
  FolderGit2,
  LoaderCircle,
  Upload,
  X,
} from 'lucide-react'
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

interface UploadFileEntry {
  id: string
  file: File
  targetPath: string
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

function getTreeLevel(allFiles: string[], prefix: string) {
  const foldersSet = new Set<string>()
  const filesAtLevel: string[] = []

  for (const filePath of allFiles) {
    if (!filePath.startsWith(prefix)) continue
    const rel = filePath.slice(prefix.length)
    const slashIdx = rel.indexOf('/')
    if (slashIdx === -1) {
      filesAtLevel.push(filePath)
    } else {
      foldersSet.add(prefix + rel.slice(0, slashIdx + 1))
    }
  }

  return {
    folders: Array.from(foldersSet).sort(),
    filesAtLevel: filesAtLevel.sort(),
  }
}

function buildBreadcrumbs(path: string): { label: string; prefix: string }[] {
  if (!path) return []
  const parts = path.slice(0, -1).split('/')
  return parts.map((part, i) => ({
    label: part,
    prefix: parts.slice(0, i + 1).join('/') + '/',
  }))
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
  const [currentBrowsePath, setCurrentBrowsePath] = useState('')
  const [selectedFiles, setSelectedFiles] = useState<string[]>([])

  const [uploadProjectId, setUploadProjectId] = useState('')
  const [uploadedFiles, setUploadedFiles] = useState<UploadFileEntry[]>([])
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const resolvedRepoProjectId = repoProjectId || projects[0]?.id || ''
  const resolvedUploadProjectId = uploadProjectId
  const canFetchRepoFiles = tab === 'repo' && Boolean(resolvedRepoProjectId)

  const {
    data: repoFiles,
    error: repoFilesError,
    isFetching: isFetchingRepoFiles,
  } = useGetProjectFilesQuery(
    { projectId: resolvedRepoProjectId, path: '' },
    { skip: !canFetchRepoFiles },
  )

  const [createManualRepoTasks, { isLoading: isCreatingRepoTasks }] =
    useCreateManualRepoTasksMutation()
  const [uploadManualTask, { isLoading: isUploadingTask }] = useUploadManualTaskMutation()

  const { folders, filesAtLevel } = useMemo(
    () => getTreeLevel(repoFiles?.items ?? [], currentBrowsePath),
    [repoFiles, currentBrowsePath],
  )

  const breadcrumbs = useMemo(() => buildBreadcrumbs(currentBrowsePath), [currentBrowsePath])

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

  const effectiveSelectedSet = useMemo(
    () => new Set(effectiveSelectedFiles),
    [effectiveSelectedFiles],
  )

  const handleToggleFile = (filePath: string) => {
    const baseSelection = effectiveSelectedFiles
    setSelectedFiles((current) =>
      (current.length ? current : baseSelection).includes(filePath)
        ? (current.length ? current : baseSelection).filter((item) => item !== filePath)
        : [...(current.length ? current : baseSelection), filePath],
    )
  }

  const handleSelectHere = () => {
    const filesHere = (repoFiles?.items ?? []).filter((f) => f.startsWith(currentBrowsePath))
    setSelectedFiles(filesHere)
  }

  const handleRepoProjectChange = (id: string) => {
    setRepoProjectId(id)
    setCurrentBrowsePath('')
    setSelectedFiles([])
  }

  const handleFilesChange = (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return
    const existingNames = new Set(uploadedFiles.map((e) => e.file.name))
    const newEntries: UploadFileEntry[] = Array.from(fileList)
      .filter((f) => !existingNames.has(f.name))
      .map((f, i) => ({
        id: `${Date.now()}-${i}`,
        file: f,
        targetPath: f.name,
      }))
    setUploadedFiles((prev) => [...prev, ...newEntries])
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleTargetPathChange = (id: string, value: string) => {
    setUploadedFiles((prev) =>
      prev.map((entry) => (entry.id === id ? { ...entry, targetPath: value } : entry)),
    )
  }

  const handleRemoveUploadFile = (id: string) => {
    setUploadedFiles((prev) => prev.filter((entry) => entry.id !== id))
  }

  const handleSubmitRepo = async () => {
    if (!resolvedRepoProjectId || effectiveSelectedFiles.length === 0) {
      return
    }

    try {
      const result = await toast.promise(
        createManualRepoTasks({
          project_id: resolvedRepoProjectId,
          file_paths: effectiveSelectedFiles,
        }).unwrap(),
        {
          loading: `${t('tasks:trigger.submit')}...`,
          success: (response) =>
            response.created > 0
              ? t('tasks:trigger.created_success', { count: response.created })
              : null,
          error: (error) => translateApiError(error),
        },
      )

      if (result.skipped.length > 0) {
        setSubmitResult(result)
      } else {
        onOpenChange(false)
      }
    } catch {
      // promise toast already shows the error state
    }
  }

  const handleSubmitUpload = async () => {
    if (uploadedFiles.length === 0) return

    const promises = uploadedFiles.map(({ file, targetPath }) => {
      const effectiveTargetPath = resolvedUploadProjectId ? targetPath.trim() : file.name
      const formData = new FormData()
      if (resolvedUploadProjectId) formData.append('project_id', resolvedUploadProjectId)
      formData.append('target_path', effectiveTargetPath)
      formData.append('file', file)
      return uploadManualTask(formData).unwrap()
    })

    try {
      await toast.promise(Promise.all(promises), {
        loading: `${t('tasks:trigger.submit')}...`,
        success: t('tasks:trigger.created_success', { count: uploadedFiles.length }),
        error: (error) => translateApiError(error),
      })
      onOpenChange(false)
    } catch {
      // promise toast already shows the error state
    }
  }

  const closeAndReset = (nextOpen: boolean) => {
    if (!nextOpen) {
      setRepoProjectId('')
      setCurrentBrowsePath('')
      setSelectedFiles([])
      setUploadProjectId('')
      setUploadedFiles([])
      setSubmitResult(null)
    }
    onOpenChange(nextOpen)
  }

  const isLoading = isCreatingRepoTasks || isUploadingTask
  const canSubmitRepo = Boolean(resolvedRepoProjectId) && effectiveSelectedFiles.length > 0
  const canSubmitUpload =
    uploadedFiles.length > 0 &&
    (!resolvedUploadProjectId || uploadedFiles.every((f) => Boolean(f.targetPath.trim())))
  const showGithubPrompt = tab === 'repo' && !githubLinked
  const showNoProjectsState = tab === 'repo' && !showGithubPrompt && projects.length === 0
  const showForm = !showGithubPrompt && !showNoProjectsState

  const hasBrowserData =
    !isFetchingRepoFiles && !repoFilesError && (repoFiles?.items.length ?? 0) > 0

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
                  onChange={(event) => handleRepoProjectChange(event.target.value)}
                >
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
                </Select>
              </div>

              <div className={styles.field}>
                <label className={styles.fieldLabel}>{t('tasks:trigger.files_label')}</label>
                <div className={styles.browser}>
                  <div className={styles.browserToolbar}>
                    <div className={styles.breadcrumb}>
                      <button
                        type="button"
                        className={cn(
                          styles.breadcrumbSeg,
                          !currentBrowsePath && styles.breadcrumbSegCurrent,
                        )}
                        onClick={() => setCurrentBrowsePath('')}
                      >
                        {t('tasks:trigger.browser_root')}
                      </button>
                      {breadcrumbs.map((crumb, i) => (
                        <Fragment key={crumb.prefix}>
                          <span className={styles.breadcrumbSep}>/</span>
                          <button
                            type="button"
                            className={cn(
                              styles.breadcrumbSeg,
                              i === breadcrumbs.length - 1 && styles.breadcrumbSegCurrent,
                            )}
                            onClick={() => setCurrentBrowsePath(crumb.prefix)}
                          >
                            {crumb.label}
                          </button>
                        </Fragment>
                      ))}
                    </div>
                    {isFetchingRepoFiles ? (
                      <LoaderCircle size={12} className={styles.spin} />
                    ) : null}
                  </div>

                  <div className={styles.browserList}>
                    {isFetchingRepoFiles ? (
                      <div className={styles.browserPlaceholder}>
                        {t('tasks:trigger.repo_hint_loading')}
                      </div>
                    ) : repoFilesError ? (
                      <div className={cn(styles.browserPlaceholder, styles.browserError)}>
                        {translateApiError(repoFilesError)}
                      </div>
                    ) : folders.length === 0 && filesAtLevel.length === 0 ? (
                      <div className={styles.browserPlaceholder}>
                        {t('tasks:trigger.browser_empty')}
                      </div>
                    ) : (
                      <>
                        {folders.map((folder) => (
                          <button
                            key={folder}
                            type="button"
                            className={styles.folderRow}
                            onClick={() => setCurrentBrowsePath(folder)}
                          >
                            <Folder size={13} className={styles.rowIcon} />
                            <span className={styles.rowName}>
                              {folder.slice(currentBrowsePath.length)}
                            </span>
                            <ChevronRight size={11} className={styles.rowArrow} />
                          </button>
                        ))}
                        {filesAtLevel.map((filePath) => (
                          <label key={filePath} className={styles.fileRow}>
                            <input
                              type="checkbox"
                              checked={effectiveSelectedSet.has(filePath)}
                              className={styles.fileCheckbox}
                              onChange={() => handleToggleFile(filePath)}
                            />
                            <FileText size={12} className={styles.rowIcon} />
                            <span className={styles.rowName}>
                              {filePath.slice(currentBrowsePath.length)}
                            </span>
                          </label>
                        ))}
                      </>
                    )}
                  </div>
                </div>

                {hasBrowserData ? (
                  <div className={styles.selectionBar}>
                    <span className={styles.selectionCount}>
                      {t('tasks:trigger.selected_count', {
                        count: effectiveSelectedFiles.length,
                      })}
                    </span>
                    <div className={styles.selectionActions}>
                      {currentBrowsePath ? (
                        <button
                          type="button"
                          className={styles.selectionAction}
                          onClick={handleSelectHere}
                        >
                          {t('tasks:trigger.select_here')}
                        </button>
                      ) : null}
                      {selectedFiles.length > 0 ? (
                        <button
                          type="button"
                          className={styles.selectionAction}
                          onClick={() => setSelectedFiles([])}
                        >
                          {t('tasks:trigger.clear_selection')}
                        </button>
                      ) : null}
                    </div>
                  </div>
                ) : null}
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
          ) : (
            <div className={styles.body}>
              <div className={styles.field}>
                <label className={styles.fieldLabel}>
                  {t('tasks:trigger.project_optional_label')}
                </label>
                <Select
                  value={resolvedUploadProjectId}
                  onChange={(event) => {
                    setUploadProjectId(event.target.value)
                  }}
                >
                  <option value="">{t('tasks:trigger.upload_no_project')}</option>
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
                </Select>
              </div>

              <div className={styles.field}>
                <label className={styles.fieldLabel}>{t('tasks:trigger.file_label')}</label>

                {uploadedFiles.length > 0 ? (
                  <div className={styles.uploadFileList}>
                    {resolvedUploadProjectId ? (
                      <div className={styles.uploadFileListHeader}>
                        <span className={styles.uploadFileListCol}>
                          {t('tasks:trigger.file_label')}
                        </span>
                        <span className={styles.uploadFileListCol}>
                          {t('tasks:trigger.target_path_label')}
                        </span>
                      </div>
                    ) : null}
                    {uploadedFiles.map((entry) => (
                      <div key={entry.id} className={styles.uploadFileRow}>
                        <FileText size={12} className={styles.uploadFileIcon} />
                        <span className={styles.uploadFileName}>{entry.file.name}</span>
                        {resolvedUploadProjectId ? (
                          <input
                            type="text"
                            className={styles.uploadPathInput}
                            value={entry.targetPath}
                            onChange={(e) => handleTargetPathChange(entry.id, e.target.value)}
                            placeholder={t('tasks:trigger.target_path_placeholder')}
                          />
                        ) : null}
                        <button
                          type="button"
                          className={styles.uploadRemoveBtn}
                          aria-label={t('common:delete')}
                          onClick={() => handleRemoveUploadFile(entry.id)}
                        >
                          <X size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : null}

                <label
                  className={cn(
                    styles.uploadDropzone,
                    uploadedFiles.length > 0 && styles.uploadDropzoneCompact,
                  )}
                >
                  <input
                    ref={fileInputRef}
                    className={styles.fileInput}
                    type="file"
                    accept=".md,text/markdown"
                    multiple
                    onChange={(event) => handleFilesChange(event.target.files)}
                  />
                  <Upload size={uploadedFiles.length > 0 ? 14 : 16} />
                  <span>
                    {uploadedFiles.length > 0
                      ? t('tasks:trigger.add_more_files')
                      : t('tasks:trigger.file_placeholder')}
                  </span>
                </label>

                {resolvedUploadProjectId && uploadedFiles.length > 0 ? (
                  <div className={styles.fieldHint}>{t('tasks:trigger.target_path_hint')}</div>
                ) : null}
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
