import { forwardRef, useState, type InputHTMLAttributes } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/shared/lib/cn'
import styles from './Input.module.css'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  error?: boolean
  wrapperClassName?: string
  inputClassName?: string
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { type = 'text', error = false, wrapperClassName, inputClassName, className, disabled, ...props },
  ref,
) {
  const { t } = useTranslation('common')
  const [visible, setVisible] = useState(false)
  const isPassword = type === 'password'
  const resolvedType = isPassword && visible ? 'text' : type

  return (
    <div
      className={cn(
        styles.root,
        error && styles.error,
        disabled && styles.disabled,
        wrapperClassName,
        className,
      )}
    >
      <input
        ref={ref}
        type={resolvedType}
        className={cn(styles.input, inputClassName)}
        disabled={disabled}
        {...props}
      />
      {isPassword && (
        <button
          type="button"
          className={styles.toggle}
          aria-label={visible ? t('hide_password') : t('show_password')}
          onClick={() => setVisible((current) => !current)}
        >
          {visible ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      )}
    </div>
  )
})
