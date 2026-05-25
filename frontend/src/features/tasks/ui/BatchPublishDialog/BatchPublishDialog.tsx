import { useState } from 'react'
import { Pencil } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/shared/ui/Button/Button'
import { DialogShell } from '@/shared/ui/DialogShell/DialogShell'
import { Input } from '@/shared/ui/Input/Input'
import { FilePathPickerDialog } from '../FilePathPickerDialog/FilePathPickerDialog'
import styles from './BatchPublishDialog.module.css'

export interface BatchPublishItem {
  taskId: string
  filePath: string
  projectId: string
  targetRepo: string
  targetBranch: string
}

interface BatchPublishDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  items: BatchPublishItem[]
  loading: boolean
  onPublish: (commitMessage: string, pathOverrides: Record<string, string>) => void
}

export function BatchPublishDialog({
  open,
  onOpenChange,
  items,
  loading,
  onPublish,
}: BatchPublishDialogProps) {
  const { t } = useTranslation(['tasks', 'common'])

  const taskCount = items.length
  const defaultMessage = t('tasks:batch_publish_dialog.default_message', { count: taskCount })

  const [commitMessage, setCommitMessage] = useState('')
  const [pathOverrides, setPathOverrides] = useState<Record<string, string>>({})
  const [editingItem, setEditingItem] = useState<BatchPublishItem | null>(null)

  const [prevOpen, setPrevOpen] = useState(false)
  if (open !== prevOpen) {
    setPrevOpen(open)
    if (open) {
      setCommitMessage('')
      setPathOverrides({})
      setEditingItem(null)
    }
  }

  const handleSubmit = () => {
    onPublish(commitMessage.trim() || defaultMessage, pathOverrides)
  }

  // Group items by repo/branch for display
  const groups = items.reduce<
    Record<string, { repo: string; branch: string; items: BatchPublishItem[] }>
  >((acc, item) => {
    const key = `${item.targetRepo}/${item.targetBranch}`
    if (!acc[key]) acc[key] = { repo: item.targetRepo, branch: item.targetBranch, items: [] }
    acc[key].items.push(item)
    return acc
  }, {})

  return (
    <>
      <DialogShell
        open={open}
        onOpenChange={onOpenChange}
        title={t('tasks:batch_publish_dialog.title', { count: taskCount })}
        size="sm"
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
        <div className={styles.section}>
          <span className={styles.sectionLabel}>{t('tasks:publish_dialog.target_path_label')}</span>
          {Object.values(groups).map(({ repo, branch, items: groupItems }) => (
            <div key={`${repo}/${branch}`} className={styles.repoGroup}>
              <div className={styles.repoHeader}>
                <span className={styles.repoName}>{repo}</span>
                <span className={styles.repoBranch}>{branch}</span>
              </div>
              <div className={styles.fileList}>
                {groupItems.map((item) => {
                  const effectivePath = pathOverrides[item.taskId] ?? item.filePath
                  const isOverridden = Boolean(pathOverrides[item.taskId])
                  return (
                    <button
                      key={item.taskId}
                      type="button"
                      className={styles.fileRow}
                      onClick={() => setEditingItem(item)}
                    >
                      <span className={styles.filePath}>
                        {isOverridden ? (
                          <>
                            <span className={styles.filePathOld}>{item.filePath}</span>
                            <span className={styles.filePathArrow}>→</span>
                            <span className={styles.filePathNew}>{effectivePath}</span>
                          </>
                        ) : (
                          effectivePath
                        )}
                      </span>
                      <Pencil size={11} className={styles.editIcon} />
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>

        <div className={styles.field}>
          <label className={styles.fieldLabel}>
            {t('tasks:publish_dialog.commit_message_label')}
          </label>
          <Input
            value={commitMessage}
            onChange={(e) => setCommitMessage(e.target.value)}
            placeholder={defaultMessage}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSubmit()
            }}
          />
        </div>
      </DialogShell>

      {editingItem && (
        <FilePathPickerDialog
          open={editingItem !== null}
          onOpenChange={(isOpen) => {
            if (!isOpen) setEditingItem(null)
          }}
          projectId={editingItem.projectId}
          initialPath={pathOverrides[editingItem.taskId] ?? editingItem.filePath}
          onConfirm={(newPath) => {
            setPathOverrides((prev) => ({ ...prev, [editingItem.taskId]: newPath }))
            setEditingItem(null)
          }}
        />
      )}
    </>
  )
}
