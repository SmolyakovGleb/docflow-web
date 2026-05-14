import { useMemo, useState, type ReactNode } from 'react'
import { Input } from '@/shared/ui/Input/Input'
import styles from './ComboboxInput.module.css'

interface ComboboxInputProps {
  id: string
  value: string
  onChange: (value: string) => void
  options: string[]
  loading?: boolean
  placeholder?: string | undefined
  error?: boolean
  loadingText: string
  emptyText: string
  maxOptions?: number
  renderOption?: (option: string) => ReactNode
  filterOption?: (option: string, query: string) => boolean
}

function defaultFilterOption(option: string, query: string) {
  return option.toLowerCase().includes(query)
}

export function ComboboxInput({
  id,
  value,
  onChange,
  options,
  loading = false,
  placeholder,
  error = false,
  loadingText,
  emptyText,
  maxOptions = 8,
  renderOption,
  filterOption = defaultFilterOption,
}: ComboboxInputProps) {
  const [focused, setFocused] = useState(false)
  const normalizedValue = value.trim().toLowerCase()
  const filteredOptions = useMemo(() => {
    if (!normalizedValue) {
      return options.slice(0, maxOptions)
    }

    return options.filter((option) => filterOption(option, normalizedValue)).slice(0, maxOptions)
  }, [filterOption, maxOptions, normalizedValue, options])

  const showDropdown =
    focused && (loading || filteredOptions.length > 0 || Boolean(normalizedValue))

  return (
    <div className={styles.root}>
      <Input
        id={id}
        autoComplete="off"
        error={error}
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
            <div className={styles.empty}>{loadingText}</div>
          ) : filteredOptions.length ? (
            filteredOptions.map((option) => (
              <button
                key={option}
                className={styles.option}
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  onChange(option)
                  setFocused(false)
                }}
              >
                {renderOption ? renderOption(option) : option}
              </button>
            ))
          ) : (
            <div className={styles.empty}>{emptyText}</div>
          )}
        </div>
      ) : null}
    </div>
  )
}
