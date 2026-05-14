import { Fragment } from 'react'
import { useTranslation } from 'react-i18next'
import { ComboboxInput } from '@/shared/ui/ComboboxInput/ComboboxInput'
import styles from './RepoCombobox.module.css'

interface RepoComboboxProps {
  id: string
  value: string
  onChange: (value: string) => void
  repos: string[]
  loading?: boolean
  placeholder?: string
  error?: boolean
}

export function RepoCombobox({
  id,
  value,
  onChange,
  repos,
  loading = false,
  placeholder,
  error = false,
}: RepoComboboxProps) {
  const { t } = useTranslation('repositories')

  return (
    <ComboboxInput
      id={id}
      value={value}
      onChange={onChange}
      options={repos}
      loading={loading}
      placeholder={placeholder}
      error={error}
      loadingText={t('repos_loading')}
      emptyText={t('repos_empty')}
      renderOption={(repo) => {
        const slash = repo.indexOf('/')
        const owner = slash !== -1 ? repo.slice(0, slash + 1) : ''
        const name = slash !== -1 ? repo.slice(slash + 1) : repo
        return (
          <Fragment>
            <span className={styles.owner}>{owner}</span>
            <span>{name}</span>
          </Fragment>
        )
      }}
    />
  )
}
