import * as Dialog from '@radix-ui/react-dialog'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ConfirmDialog } from '@/shared/ui/ConfirmDialog/ConfirmDialog'
import { Button } from '@/shared/ui/Button/Button'
import { Field } from '@/shared/ui/Field/Field'
import { Input } from '@/shared/ui/Input/Input'
import styles from './DeleteProjectDialog.module.css'

interface DeleteProjectDialogProps {
  open: boolean
  projectName: string
  loading?: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
}

export function DeleteProjectDialog({
  open,
  projectName,
  loading = false,
  onOpenChange,
  onConfirm,
}: DeleteProjectDialogProps) {
  const { t } = useTranslation(['repositories', 'common'])
  const [step, setStep] = useState<'confirm' | 'typeName'>('confirm')
  const [typedName, setTypedName] = useState('')

  if (!open) {
    return null
  }

  if (step === 'confirm') {
    return (
      <ConfirmDialog
        open
        confirmText={t('repositories:delete_project')}
        confirmVariant="danger"
        description={t('repositories:delete_confirm_description')}
        onConfirm={() => setStep('typeName')}
        onOpenChange={onOpenChange}
        title={t('repositories:delete_confirm_title')}
      />
    )
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className={styles.overlay} />
        <Dialog.Content className={styles.content}>
          <Dialog.Title className={styles.title}>{t('repositories:delete_project')}</Dialog.Title>
          <Dialog.Description className={styles.description}>
            {t('repositories:delete_type_name_hint')}
          </Dialog.Description>

          <div className={styles.form}>
            <Field
              label={t('repositories:delete_type_name_label')}
              htmlFor="delete-project-name"
              required
            >
              <Input
                id="delete-project-name"
                value={typedName}
                onChange={(event) => setTypedName(event.target.value)}
              />
            </Field>
          </div>

          <div className={styles.actions}>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              {t('common:cancel')}
            </Button>
            <Button
              variant="danger"
              loading={loading}
              disabled={typedName.trim() !== projectName}
              onClick={onConfirm}
            >
              {t('repositories:delete_project')}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
