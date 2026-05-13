import { Plus, FolderPlus } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { translateApiError } from '@/shared/lib/errorMessages'
import { Button } from '@/shared/ui/Button/Button'
import { EmptyState } from '@/shared/ui/EmptyState/EmptyState'
import { Skeleton } from '@/shared/ui/Skeleton/Skeleton'
import { useGetProjectsQuery } from '../../api/projectsApi'
import { RepositoryRow } from '../RepositoryRow'
import styles from './RepositoriesPage.module.css'

function RepositoriesTableSkeleton() {
  const { t } = useTranslation('repositories')
  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>{t('table_name')}</th>
            <th>{t('table_repositories')}</th>
            <th>{t('table_branches')}</th>
            <th>{t('table_tasks')}</th>
            <th>{t('table_created')}</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: 4 }).map((_, index) => (
            <tr key={index}>
              <td>
                <Skeleton width={140} />
              </td>
              <td>
                <Skeleton width="100%" />
              </td>
              <td>
                <Skeleton width={100} />
              </td>
              <td>
                <Skeleton width={24} />
              </td>
              <td>
                <Skeleton width={100} />
              </td>
              <td>
                <Skeleton width={72} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function RepositoriesPage() {
  const { t } = useTranslation(['repositories', 'common'])
  const navigate = useNavigate()
  const { data, isLoading, error, refetch } = useGetProjectsQuery()

  return (
    <section className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>{t('title')}</h1>
          <p className={styles.subtitle}>{t('subtitle')}</p>
        </div>
        <Button
          size="sm"
          iconLeft={<Plus size={12} />}
          onClick={() => void navigate('/repositories/new')}
        >
          {t('new_project')}
        </Button>
      </header>

      {isLoading ? (
        <RepositoriesTableSkeleton />
      ) : error ? (
        <EmptyState
          title={t('load_error_title')}
          description={translateApiError(error)}
          actions={
            <Button variant="secondary" onClick={() => void refetch()}>
              {t('common:retry')}
            </Button>
          }
        />
      ) : !data?.length ? (
        <EmptyState
          icon={FolderPlus}
          title={t('empty_title')}
          description={t('empty_description')}
          actions={
            <Button
              iconLeft={<FolderPlus size={16} />}
              onClick={() => void navigate('/repositories/new')}
            >
              {t('new_project')}
            </Button>
          }
        />
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>{t('table_name')}</th>
                <th>{t('table_repositories')}</th>
                <th>{t('table_branches')}</th>
                <th>{t('table_tasks')}</th>
                <th>{t('table_created')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {data.map((project) => (
                <RepositoryRow key={project.id} project={project} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
