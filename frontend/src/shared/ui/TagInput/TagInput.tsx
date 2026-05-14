import { X } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/shared/lib/cn'
import styles from './TagInput.module.css'

interface TagInputProps {
  value: string[]
  onChange: (value: string[]) => void
  placeholder?: string | undefined
  error?: boolean
  getRemoveLabel?: (value: string) => string
  className?: string | undefined
}

export function TagInput({
  value,
  onChange,
  placeholder,
  error = false,
  getRemoveLabel,
  className,
}: TagInputProps) {
  const { t } = useTranslation('common')
  const [inputValue, setInputValue] = useState('')

  function commitValue() {
    const nextValue = inputValue.trim()
    if (!nextValue || value.includes(nextValue)) {
      setInputValue('')
      return
    }

    onChange([...value, nextValue])
    setInputValue('')
  }

  return (
    <div className={cn(styles.root, error && styles.error, className)}>
      {value.map((item) => (
        <span key={item} className={styles.chip}>
          <span>{item}</span>
          <button
            type="button"
            className={styles.remove}
            aria-label={getRemoveLabel ? getRemoveLabel(item) : `${t('delete')}: ${item}`}
            onClick={() => onChange(value.filter((current) => current !== item))}
          >
            <X size={12} />
          </button>
        </span>
      ))}
      <input
        className={styles.input}
        value={inputValue}
        placeholder={placeholder}
        onBlur={commitValue}
        onChange={(event) => setInputValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ',') {
            event.preventDefault()
            commitValue()
          }
        }}
      />
    </div>
  )
}
