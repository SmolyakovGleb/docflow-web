import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { RepoLink } from '@/shared/ui/RepoLink/RepoLink'
import { formatDate } from '@/shared/lib/date'
import type { Project } from '../model/types'
import styles from './RepositoriesPage.module.css'

interface RepositoryRowProps {
  project: Project
}

export function RepositoryRow({ project }: RepositoryRowProps) {
  const { t } = useTranslation('repositories')
  return (
    <tr className={styles.row}>
      <td>
        <Link className={styles.nameLink} to={`/repositories/${project.id}`}>
          {project.name}
        </Link>
      </td>
      <td>
        <div className={styles.repoPair}>
          <RepoLink repo={project.source_repo} />
          <span className={styles.arrow}>→</span>
          <RepoLink repo={project.target_repo} />
        </div>
      </td>
      <td>
        {project.source_branch} → {project.target_branch}
      </td>
      <td className={styles.mutedCell}>—</td>
      <td>{formatDate(project.created_at)}</td>
      <td>
        <Link className={styles.openLink} to={`/repositories/${project.id}`}>
          {t('open_project')}
        </Link>
      </td>
    </tr>
  )
}
