import type { CSSProperties } from 'react'
import { cn } from '@/shared/lib/cn'
import styles from './Skeleton.module.css'

type SkeletonVariant = 'line' | 'circle' | 'rect'

interface SkeletonProps {
  variant?: SkeletonVariant
  width?: number | string
  height?: number | string
  className?: string
}

export function Skeleton({
  variant = 'line',
  width = variant === 'line' ? '100%' : 40,
  height = variant === 'line' ? 12 : 40,
  className,
}: SkeletonProps) {
  const style: CSSProperties = { width, height }
  return <span aria-hidden className={cn(styles.root, styles[variant], className)} style={style} />
}
