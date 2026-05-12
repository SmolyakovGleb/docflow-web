import * as Dialog from '@radix-ui/react-dialog'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/shared/ui/Button/Button'
import { Field } from '@/shared/ui/Field/Field'
import { Input } from '@/shared/ui/Input/Input'
import styles from './DeleteProjectDialog.module.css'

interface EditBranchesDialogProps {
  open: boolean
  sourceBranch: string
  targetBranch: string
  loading?: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (payload: { source_branch: string; target_branch: string }) => void
}

export function EditBranchesDialog({
  open,
  sourceBranch,
  targetBranch,
  loading = false,
  onOpenChange,
  onSubmit,
}: EditBranchesDialogProps) {
  const { t } = useTranslation(['repositories', 'common'])
  const [source, setSource] = useState(sourceBranch)
  const [target, setTarget] = useState(targetBranch)

  if (!open) {
    return null
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className={styles.overlay} />
        <Dialog.Content className={styles.content}>
          <Dialog.Title className={styles.title}>{t('edit_branches')}</Dialog.Title>

          <div className={styles.form}>
            <Field label={t('source_branch_label')} htmlFor="edit-source-branch" required>
              <Input
                id="edit-source-branch"
                inputClassName="mono"
                value={source}
                onChange={(event) => setSource(event.target.value)}
              />
            </Field>

            <Field label={t('target_branch_label')} htmlFor="edit-target-branch" required>
              <Input
                id="edit-target-branch"
                inputClassName="mono"
                value={target}
                onChange={(event) => setTarget(event.target.value)}
              />
            </Field>
          </div>

          <div className={styles.actions}>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              {t('common:cancel')}
            </Button>
            <Button
              loading={loading}
              disabled={!source.trim() || !target.trim()}
              onClick={() =>
                onSubmit({
                  source_branch: source.trim(),
                  target_branch: target.trim(),
                })
              }
            >
              {t('save_branches')}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
