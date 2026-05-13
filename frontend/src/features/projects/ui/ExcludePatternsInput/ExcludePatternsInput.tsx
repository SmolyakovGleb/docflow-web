import { X } from 'lucide-react'
import { useState } from 'react'
import { cn } from '@/shared/lib/cn'
import styles from './ExcludePatternsInput.module.css'

interface ExcludePatternsInputProps {
  value: string[]
  onChange: (value: string[]) => void
  placeholder?: string
  error?: boolean
}

export function ExcludePatternsInput({
  value,
  onChange,
  placeholder,
  error = false,
}: ExcludePatternsInputProps) {
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
    <div className={cn(styles.root, error && styles.error)}>
      {value.map((pattern) => (
        <span key={pattern} className={styles.chip}>
          <span>{pattern}</span>
          <button
            type="button"
            className={styles.remove}
            aria-label={`Remove ${pattern}`}
            onClick={() => onChange(value.filter((item) => item !== pattern))}
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
