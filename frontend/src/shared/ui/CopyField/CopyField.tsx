import { Copy } from 'lucide-react'
import { cn } from '@/shared/lib/cn'
import styles from './CopyField.module.css'

interface CopyFieldProps {
  value: string
  buttonLabel: string
  onCopySuccess?: () => void
  onCopyError?: (error: unknown) => void
  valueDisplay?: 'input' | 'text'
  wrap?: boolean
  className?: string | undefined
}

async function copyText(value: string) {
  await navigator.clipboard.writeText(value)
}

export function CopyField({
  value,
  buttonLabel,
  onCopySuccess,
  onCopyError,
  valueDisplay = 'text',
  wrap = false,
  className,
}: CopyFieldProps) {
  return (
    <div className={cn(styles.root, className)}>
      {valueDisplay === 'input' ? (
        <input className={styles.valueInput} readOnly value={value} />
      ) : (
        <span className={cn(styles.valueText, wrap && styles.valueTextWrap)}>{value}</span>
      )}

      <button
        type="button"
        className={styles.button}
        onClick={() => {
          void copyText(value).then(onCopySuccess).catch(onCopyError)
        }}
      >
        <Copy size={12} />
        {buttonLabel}
      </button>
    </div>
  )
}
