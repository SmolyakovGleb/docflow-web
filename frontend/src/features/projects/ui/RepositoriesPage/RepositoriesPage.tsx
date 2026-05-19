import { Plus, FolderPlus } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { selectUser } from '@/features/auth/model/authSlice'
import { useGetMyTeamQuery } from '@/features/teams/api/teamsApi'
import { cn } from '@/shared/lib/cn'
import { translateApiError } from '@/shared/lib/errorMessages'
import { useAppSelector } from '@/shared/store/hooks'
import { Button } from '@/shared/ui/Button/Button'
import { EmptyState } from '@/shared/ui/EmptyState/EmptyState'
import { Skeleton } from '@/shared/ui/Skeleton/Skeleton'
import { useGetProjectsQuery } from '../../api/projectsApi'
import { RepositoryRow } from '../RepositoryRow'
import styles from './RepositoriesPage.module.css'

type SourceFilter = 'all' | 'personal' | 'team'

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
  const { t } = useTranslation(['repositories', 'common', 'teams'])
  const navigate = useNavigate()
  const user = useAppSelector(selectUser)
  const { data, isLoading, error, refetch } = useGetProjectsQuery()
  const { data: myTeam } = useGetMyTeamQuery(undefined, { skip: !user })
  const [source, setSource] = useState<SourceFilter>('all')

  const hasTeam = Boolean(myTeam)
  const isTeamOwner = Boolean(myTeam && user && myTeam.owner_id === user.id)

  const filtered = useMemo(() => {
    if (!data) return []
    if (source === 'personal') return data.filter((p) => !p.is_team_project)
    if (source === 'team') return data.filter((p) => p.is_team_project)
    return data
  }, [data, source])

  return (
    <section className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>{t('title')}</h1>
          <p className={styles.subtitle}>{t('subtitle')}</p>
        </div>
        <div className={styles.headerActions}>
          {hasTeam && (
            <div className={styles.sourceFilter}>
              {(['all', 'personal', 'team'] as SourceFilter[]).map((v) => (
                <button
                  key={v}
                  type="button"
                  className={cn(styles.sourceChip, source === v && styles.sourceChipActive)}
                  onClick={() => setSource(v)}
                >
                  {t(`teams:filter_${v}`)}
                </button>
              ))}
            </div>
          )}
          <Button
            size="sm"
            iconLeft={<Plus size={12} />}
            onClick={() => void navigate('/repositories/new')}
          >
            {t('new_project')}
          </Button>
        </div>
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
              {filtered.map((project) => (
                <RepositoryRow key={project.id} project={project} isTeamOwner={isTeamOwner} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
