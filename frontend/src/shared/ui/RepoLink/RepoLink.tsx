import { GitBranch } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/shared/lib/cn'
import styles from './RepoLink.module.css'

interface RepoLinkProps {
  repo: string
  href?: string
  className?: string
}

export function RepoLink({ repo, href, className }: RepoLinkProps) {
  const { t } = useTranslation('common')

  return (
    <a
      className={cn(styles.root, className)}
      href={href ?? `https://github.com/${repo}`}
      target="_blank"
      rel="noreferrer noopener"
      aria-label={`${t('view_on_github')}: ${repo}`}
    >
      <GitBranch size={12} className={styles.icon} />
      <span>{repo}</span>
    </a>
  )
}
