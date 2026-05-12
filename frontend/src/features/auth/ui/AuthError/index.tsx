import { AlertTriangle } from 'lucide-react'
import styles from './index.module.css'

interface AuthErrorProps {
  message: string
}

export function AuthError({ message }: AuthErrorProps) {
  return (
    <div className={styles.root} role="alert">
      <AlertTriangle size={14} />
      <span>{message}</span>
    </div>
  )
}
