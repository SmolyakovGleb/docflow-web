import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import {
  CheckCircle,
  ChevronRight,
  FileText,
  Folder,
  FolderGit2,
  FolderInput,
  LoaderCircle,
  Search,
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
import {
  buildBreadcrumbs,
  filesUnder,
  filterFiles,
  folderSelectionState,
  getTreeLevel,
  type FolderSelectionState,
} from '@/features/tasks/lib/repoFileSelection'
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

const TRANSLATABLE_RE = /\.(md|ya?ml)$/i

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

function TristateCheckbox({
  state,
  onChange,
  ariaLabel,
}: {
  state: FolderSelectionState
  onChange: () => void
  ariaLabel: string
}) {
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = state === 'partial'
  }, [state])
  return (
    <input
      ref={ref}
      type="checkbox"
      className={styles.fileCheckbox}
      checked={state === 'all'}
      aria-label={ariaLabel}
      onClick={(event) => event.stopPropagation()}
      onChange={onChange}
    />
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
  const [currentBrowsePath, setCurrentBrowsePath] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set())

  const [uploadProjectId, setUploadProjectId] = useState('')
  const [uploadedFiles, setUploadedFiles] = useState<UploadFileEntry[]>([])
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const folderInputRef = useRef<HTMLInputElement | null>(null)

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

  const allFiles = useMemo(() => repoFiles?.items ?? [], [repoFiles])

  // Default to "whole repository selected" whenever a new file list loads
  // (new project / first fetch); keeps the one-click bulk-translate flow.
  // Done during render (React-recommended "adjust state on prop change" pattern).
  const [selectionSource, setSelectionSource] = useState<readonly string[] | null>(null)
  if (selectionSource !== allFiles) {
    setSelectionSource(allFiles)
    setSelectedFiles(new Set(allFiles))
  }

  const { folders, filesAtLevel } = useMemo(
    () => getTreeLevel(allFiles, currentBrowsePath),
    [allFiles, currentBrowsePath],
  )

  const breadcrumbs = useMemo(() => buildBreadcrumbs(currentBrowsePath), [currentBrowsePath])

  const trimmedQuery = searchQuery.trim()
  const searchResults = useMemo(
    () => (trimmedQuery ? filterFiles(allFiles, trimmedQuery) : []),
    [allFiles, trimmedQuery],
  )

  const selectedFilePaths = useMemo(() => Array.from(selectedFiles), [selectedFiles])

  const toggleFile = (filePath: string) => {
    setSelectedFiles((prev) => {
      const next = new Set(prev)
      if (next.has(filePath)) next.delete(filePath)
      else next.add(filePath)
      return next
    })
  }

  const toggleFolder = (prefix: string) => {
    const under = filesUnder(allFiles, prefix)
    const state = folderSelectionState(selectedFiles, allFiles, prefix)
    setSelectedFiles((prev) => {
      const next = new Set(prev)
      if (state === 'all') under.forEach((filePath) => next.delete(filePath))
      else under.forEach((filePath) => next.add(filePath))
      return next
    })
  }

  const selectAll = () => setSelectedFiles(new Set(allFiles))
  const clearSelection = () => setSelectedFiles(new Set())

  const handleRepoProjectChange = (id: string) => {
    setRepoProjectId(id)
    setCurrentBrowsePath('')
    setSearchQuery('')
    // selection is reset to "all" by the effect once new files load
  }

  const addFiles = (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return
    // Folder picks (webkitdirectory) return the whole tree — keep only translatable files.
    const incoming = Array.from(fileList).filter((file) => TRANSLATABLE_RE.test(file.name))
    if (incoming.length === 0) return

    setUploadedFiles((prev) => {
      // Dedupe by full relative path so identical filenames in different folders
      // (e.g. many index.md) are all kept.
      const existingPaths = new Set(prev.map((entry) => entry.targetPath))
      const additions: UploadFileEntry[] = []
      incoming.forEach((file, index) => {
        const path = file.webkitRelativePath || file.name
        if (existingPaths.has(path)) return
        existingPaths.add(path)
        additions.push({ id: `${Date.now()}-${index}-${path}`, file, targetPath: path })
      })
      return [...prev, ...additions]
    })
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
    if (!resolvedRepoProjectId || selectedFilePaths.length === 0) {
      return
    }

    try {
      const result = await toast.promise(
        createManualRepoTasks({
          project_id: resolvedRepoProjectId,
          file_paths: selectedFilePaths,
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
        closeAndReset(false)
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
      closeAndReset(false)
    } catch {
      // promise toast already shows the error state
    }
  }

  const closeAndReset = (nextOpen: boolean) => {
    if (!nextOpen) {
      setRepoProjectId('')
      setCurrentBrowsePath('')
      setSearchQuery('')
      setSelectedFiles(new Set())
      setUploadProjectId('')
      setUploadedFiles([])
      setSubmitResult(null)
    }
    onOpenChange(nextOpen)
  }

  const isLoading = isCreatingRepoTasks || isUploadingTask
  const canSubmitRepo = Boolean(resolvedRepoProjectId) && selectedFiles.size > 0
  const canSubmitUpload =
    uploadedFiles.length > 0 &&
    (!resolvedUploadProjectId || uploadedFiles.every((f) => Boolean(f.targetPath.trim())))
  const showGithubPrompt = tab === 'repo' && !githubLinked
  const showNoProjectsState = tab === 'repo' && !showGithubPrompt && projects.length === 0
  const showForm = !showGithubPrompt && !showNoProjectsState

  const hasBrowserData = !isFetchingRepoFiles && !repoFilesError && allFiles.length > 0
  const allSelected = selectedFiles.size === allFiles.length && allFiles.length > 0

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

                {hasBrowserData ? (
                  <input
                    type="text"
                    className={styles.searchInput}
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder={t('tasks:trigger.search_placeholder')}
                  />
                ) : null}

                <div className={styles.browser}>
                  {!trimmedQuery ? (
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
                  ) : (
                    <div className={styles.browserToolbar}>
                      <Search size={12} className={styles.rowIcon} />
                      <span className={styles.breadcrumbSeg}>
                        {t('tasks:trigger.search_results_label')}
                      </span>
                    </div>
                  )}

                  <div className={styles.browserList}>
                    {isFetchingRepoFiles ? (
                      <div className={styles.browserPlaceholder}>
                        {t('tasks:trigger.repo_hint_loading')}
                      </div>
                    ) : repoFilesError ? (
                      <div className={cn(styles.browserPlaceholder, styles.browserError)}>
                        {translateApiError(repoFilesError)}
                      </div>
                    ) : trimmedQuery ? (
                      searchResults.length === 0 ? (
                        <div className={styles.browserPlaceholder}>
                          {t('tasks:trigger.search_no_matches', { query: trimmedQuery })}
                        </div>
                      ) : (
                        searchResults.map((filePath) => (
                          <label key={filePath} className={styles.fileRow}>
                            <input
                              type="checkbox"
                              checked={selectedFiles.has(filePath)}
                              className={styles.fileCheckbox}
                              onChange={() => toggleFile(filePath)}
                            />
                            <FileText size={12} className={styles.rowIcon} />
                            <span className={styles.rowName}>{filePath}</span>
                          </label>
                        ))
                      )
                    ) : folders.length === 0 && filesAtLevel.length === 0 ? (
                      <div className={styles.browserPlaceholder}>
                        {t('tasks:trigger.browser_empty')}
                      </div>
                    ) : (
                      <>
                        {folders.map((folder) => {
                          const folderName = folder.slice(currentBrowsePath.length)
                          return (
                            <div key={folder} className={styles.folderRow}>
                              <TristateCheckbox
                                state={folderSelectionState(selectedFiles, allFiles, folder)}
                                ariaLabel={t('tasks:trigger.select_folder_aria', {
                                  folder: folderName,
                                })}
                                onChange={() => toggleFolder(folder)}
                              />
                              <button
                                type="button"
                                className={styles.folderNav}
                                onClick={() => setCurrentBrowsePath(folder)}
                              >
                                <Folder size={13} className={styles.rowIcon} />
                                <span className={styles.rowName}>{folderName}</span>
                                <ChevronRight size={11} className={styles.rowArrow} />
                              </button>
                            </div>
                          )
                        })}
                        {filesAtLevel.map((filePath) => (
                          <label key={filePath} className={styles.fileRow}>
                            <input
                              type="checkbox"
                              checked={selectedFiles.has(filePath)}
                              className={styles.fileCheckbox}
                              onChange={() => toggleFile(filePath)}
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
                      {t('tasks:trigger.selected_count', { count: selectedFiles.size })}
                    </span>
                    <div className={styles.selectionActions}>
                      {!allSelected ? (
                        <button
                          type="button"
                          className={styles.selectionAction}
                          onClick={selectAll}
                        >
                          {t('tasks:trigger.select_all')}
                        </button>
                      ) : null}
                      {selectedFiles.size > 0 ? (
                        <button
                          type="button"
                          className={styles.selectionAction}
                          onClick={clearSelection}
                        >
                          {t('tasks:trigger.deselect_all')}
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
                        <span className={styles.uploadFileName}>
                          {entry.file.webkitRelativePath || entry.file.name}
                        </span>
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
                    accept=".md,.yaml,.yml,text/markdown,text/yaml,application/yaml,application/x-yaml"
                    multiple
                    onChange={(event) => {
                      addFiles(event.target.files)
                      event.target.value = ''
                    }}
                  />
                  <Upload size={uploadedFiles.length > 0 ? 14 : 16} />
                  <span>
                    {uploadedFiles.length > 0
                      ? t('tasks:trigger.add_more_files')
                      : t('tasks:trigger.file_placeholder')}
                  </span>
                </label>

                <button
                  type="button"
                  className={styles.selectFolderButton}
                  onClick={() => folderInputRef.current?.click()}
                >
                  <FolderInput size={13} />
                  {t('tasks:trigger.select_folder_upload')}
                </button>
                <input
                  ref={(el) => {
                    folderInputRef.current = el
                    if (el) el.setAttribute('webkitdirectory', '')
                  }}
                  className={styles.fileInput}
                  type="file"
                  multiple
                  onChange={(event) => {
                    addFiles(event.target.files)
                    event.target.value = ''
                  }}
                />

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
