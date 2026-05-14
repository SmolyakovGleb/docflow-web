import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/shared/ui/Button/Button'
import { Field } from '@/shared/ui/Field/Field'
import { FormDialog } from '@/shared/ui/FormDialog/FormDialog'
import { Input } from '@/shared/ui/Input/Input'
import { ConfirmDialog } from '@/shared/ui/ConfirmDialog/ConfirmDialog'

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
  if (!open) {
    return null
  }

  return (
    <OpenDeleteProjectDialog
      projectName={projectName}
      loading={loading}
      onOpenChange={onOpenChange}
      onConfirm={onConfirm}
    />
  )
}

interface OpenDeleteProjectDialogProps {
  projectName: string
  loading: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
}

function OpenDeleteProjectDialog({
  projectName,
  loading,
  onOpenChange,
  onConfirm,
}: OpenDeleteProjectDialogProps) {
  const { t } = useTranslation(['repositories', 'common'])
  const [step, setStep] = useState<'confirm' | 'typeName'>('confirm')
  const [typedName, setTypedName] = useState('')

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
    <FormDialog
      open
      onOpenChange={onOpenChange}
      title={t('repositories:delete_project')}
      description={t('repositories:delete_type_name_hint')}
      actions={
        <>
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
        </>
      }
    >
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
    </FormDialog>
  )
}
