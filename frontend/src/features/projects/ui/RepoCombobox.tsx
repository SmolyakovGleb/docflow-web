import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Input } from '@/shared/ui/Input/Input'
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
  const [focused, setFocused] = useState(false)

  const normalizedValue = value.trim().toLowerCase()
  const filteredRepos = useMemo(() => {
    if (!normalizedValue) {
      return repos.slice(0, 8)
    }

    return repos.filter((repo) => repo.toLowerCase().includes(normalizedValue)).slice(0, 8)
  }, [normalizedValue, repos])

  const showDropdown = focused && (loading || filteredRepos.length > 0 || Boolean(normalizedValue))

  return (
    <div className={styles.root}>
      <Input
        id={id}
        autoComplete="off"
        error={error}
        inputClassName="mono"
        placeholder={placeholder}
        value={value}
        onBlur={() => {
          window.setTimeout(() => setFocused(false), 120)
        }}
        onChange={(event) => onChange(event.target.value)}
        onFocus={() => setFocused(true)}
      />
      {showDropdown ? (
        <div className={styles.dropdown}>
          {loading ? (
            <div className={styles.empty}>{t('repos_loading')}</div>
          ) : filteredRepos.length ? (
            filteredRepos.map((repo) => (
              <button
                key={repo}
                className={styles.option}
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  onChange(repo)
                  setFocused(false)
                }}
              >
                {repo}
              </button>
            ))
          ) : (
            <div className={styles.empty}>{t('repos_empty')}</div>
          )}
        </div>
      ) : null}
    </div>
  )
}
