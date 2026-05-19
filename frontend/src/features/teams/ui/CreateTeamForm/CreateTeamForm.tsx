import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/shared/ui/Button/Button'
import { Field } from '@/shared/ui/Field/Field'
import { Input } from '@/shared/ui/Input/Input'
import styles from '../TeamSettingsPage/TeamSettingsPage.module.css'

interface CreateTeamFormProps {
  isLoading: boolean
  onSubmit: (name: string) => Promise<void>
}

export function CreateTeamForm({ isLoading, onSubmit }: CreateTeamFormProps) {
  const { t } = useTranslation('teams')
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const trimmedName = name.trim()

    if (!trimmedName) {
      setError(t('team_name_required'))
      return
    }

    setError(null)

    try {
      await onSubmit(trimmedName)
      setName('')
    } catch {
      // Parent handles request error state.
    }
  }

  return (
    <form className={styles.form} onSubmit={(event) => void handleSubmit(event)} noValidate>
      <Field label={t('team_name_label')} htmlFor="team-name" error={error} required>
        <Input
          id="team-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder={t('team_name_label')}
          error={Boolean(error)}
          maxLength={100}
        />
      </Field>
      <div className={styles.formActions}>
        <Button type="submit" size="sm" loading={isLoading}>
          {t('create_team')}
        </Button>
      </div>
    </form>
  )
}
