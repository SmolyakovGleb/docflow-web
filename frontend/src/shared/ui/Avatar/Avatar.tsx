import { getInitials } from '@/shared/lib/getInitials'
import styles from './Avatar.module.css'

interface AvatarProps {
  name: string | null | undefined
  size?: 18 | 22 | 26
}

export function Avatar({ name, size = 26 }: AvatarProps) {
  return (
    <span
      className={styles.root}
      style={{ width: size, height: size }}
      aria-label={name ?? 'User avatar'}
      title={name ?? undefined}
    >
      {getInitials(name)}
    </span>
  )
}
