import { Fragment, useMemo, useState } from 'react'
import { ChevronRight, FileText, Folder, LoaderCircle } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useGetProjectFilesQuery } from '@/features/projects/api/projectsApi'
import type { Project } from '@/features/projects/model/types'
import { cn } from '@/shared/lib/cn'
import { Button } from '@/shared/ui/Button/Button'
import { DialogShell } from '@/shared/ui/DialogShell/DialogShell'
import { Input } from '@/shared/ui/Input/Input'
import styles from './PublishDialog.module.css'

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

interface PublishDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  task: { file_path: string }
  project?: Project | undefined
  loading: boolean
  onPublish: (commitMessage: string, targetPath: string) => void
}

export function PublishDialog({
  open,
  onOpenChange,
  task,
  project,
  loading,
  onPublish,
}: PublishDialogProps) {
  const { t } = useTranslation(['tasks', 'common'])

  const defaultTargetPath = task.file_path
  const defaultCommitMessage = `Publish translation: ${task.file_path}`

  const [commitMessage, setCommitMessage] = useState(defaultCommitMessage)
  const [browsePath, setBrowsePath] = useState('')
  const [targetPath, setTargetPath] = useState(defaultTargetPath)

  // Reset state when dialog opens or task changes — setState during render is the
  // React-recommended alternative to useEffect for derived/reset state.
  const [prevOpenKey, setPrevOpenKey] = useState<string | null>(null)
  const openKey = open ? task.file_path : null
  if (openKey !== prevOpenKey) {
    setPrevOpenKey(openKey)
    if (open) {
      setCommitMessage(`Publish translation: ${task.file_path}`)
      setBrowsePath('')
      setTargetPath(task.file_path)
    }
  }

  const { data: projectFiles, isFetching: isFetchingFiles } = useGetProjectFilesQuery(
    { projectId: project?.id ?? '', path: '', useTarget: true },
    { skip: !project?.id || !open },
  )

  const { folders, filesAtLevel } = useMemo(
    () => getTreeLevel(projectFiles?.items ?? [], browsePath),
    [projectFiles, browsePath],
  )

  const breadcrumbs = useMemo(() => buildBreadcrumbs(browsePath), [browsePath])

  const handleNavigate = (folderPath: string) => {
    setBrowsePath(folderPath)
    const currentFilename = targetPath.split('/').pop() ?? ''
    setTargetPath(folderPath + currentFilename)
  }

  const handlePickFile = (filePath: string) => {
    setTargetPath(filePath)
    const slashIdx = filePath.lastIndexOf('/')
    setBrowsePath(slashIdx >= 0 ? filePath.slice(0, slashIdx + 1) : '')
  }

  const handleSubmit = () => {
    const effectiveMessage = commitMessage.trim() || defaultCommitMessage
    const effectivePath = targetPath.trim() || defaultTargetPath
    onPublish(effectiveMessage, effectivePath)
  }

  return (
    <DialogShell
      open={open}
      onOpenChange={onOpenChange}
      title={t('tasks:publish_dialog.title')}
      description={t('tasks:publish_dialog.title')}
      descriptionClassName={styles.srOnly}
      position="top"
      showCloseButton
      closeLabel={t('common:close')}
      overlayClassName={styles.overlay}
      contentClassName={styles.content}
      headerClassName={styles.header}
      titleClassName={styles.title}
      bodyClassName={styles.body}
      footerClassName={styles.footer}
      footer={
        <>
          <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
            {t('common:cancel')}
          </Button>
          <Button type="button" loading={loading} onClick={handleSubmit}>
            {t('tasks:actions.publish')}
          </Button>
        </>
      }
    >
      {project ? (
        <div className={styles.field}>
          <label className={styles.fieldLabel}>{t('tasks:publish_dialog.target_path_label')}</label>
          <div className={styles.browser}>
            <div className={styles.browserToolbar}>
              <div className={styles.breadcrumb}>
                <button
                  type="button"
                  className={cn(styles.breadcrumbSeg, !browsePath && styles.breadcrumbSegCurrent)}
                  onClick={() => handleNavigate('')}
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
                      onClick={() => handleNavigate(crumb.prefix)}
                    >
                      {crumb.label}
                    </button>
                  </Fragment>
                ))}
              </div>
              {isFetchingFiles ? <LoaderCircle size={12} className={styles.spin} /> : null}
            </div>

            <div className={styles.browserList}>
              {isFetchingFiles ? (
                <div className={styles.browserPlaceholder}>
                  {t('tasks:trigger.repo_hint_loading')}
                </div>
              ) : folders.length === 0 && filesAtLevel.length === 0 ? (
                <div className={styles.browserPlaceholder}>{t('tasks:trigger.browser_empty')}</div>
              ) : (
                <>
                  {folders.map((folder) => (
                    <button
                      key={folder}
                      type="button"
                      className={styles.folderRow}
                      onClick={() => handleNavigate(folder)}
                    >
                      <Folder size={13} className={styles.rowIcon} />
                      <span className={styles.rowName}>{folder.slice(browsePath.length)}</span>
                      <ChevronRight size={11} className={styles.rowArrow} />
                    </button>
                  ))}
                  {filesAtLevel.map((filePath) => (
                    <button
                      key={filePath}
                      type="button"
                      className={cn(
                        styles.folderRow,
                        targetPath === filePath && styles.fileSelected,
                      )}
                      onClick={() => handlePickFile(filePath)}
                    >
                      <FileText size={12} className={styles.rowIcon} />
                      <span className={styles.rowName}>{filePath.slice(browsePath.length)}</span>
                    </button>
                  ))}
                </>
              )}
            </div>
          </div>

          <Input
            inputClassName={styles.monoInput}
            value={targetPath}
            onChange={(event) => setTargetPath(event.target.value)}
            placeholder={t('tasks:trigger.target_path_placeholder')}
          />
          <div className={styles.fieldHint}>{t('tasks:publish_dialog.target_path_hint')}</div>
        </div>
      ) : null}

      <div className={styles.field}>
        <label className={styles.fieldLabel}>
          {t('tasks:publish_dialog.commit_message_label')}
        </label>
        <Input
          value={commitMessage}
          onChange={(event) => setCommitMessage(event.target.value)}
          placeholder={defaultCommitMessage}
        />
      </div>
    </DialogShell>
  )
}
