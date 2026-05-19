import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { MoreHorizontal, ExternalLink, Play, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useDeleteProjectMutation } from '../../api/projectsApi'
import { formatDate } from '@/shared/lib/date'
import { translateApiError } from '@/shared/lib/errorMessages'
import { toast } from '@/shared/ui/Toast/toast'
import { ValuePair } from '@/shared/ui/ValuePair/ValuePair'
import { DeleteProjectDialog } from '../DeleteProjectDialog'
import type { Project } from '../../model/types'
import styles from './RepositoryRow.module.css'

interface RepositoryRowProps {
  project: Project
  isTeamOwner: boolean
}

function splitRepo(full: string): [string, string] {
  const slash = full.indexOf('/')
  if (slash === -1) return ['', full]
  return [full.slice(0, slash + 1), full.slice(slash + 1)]
}

export function RepositoryRow({ project, isTeamOwner }: RepositoryRowProps) {
  const { t } = useTranslation(['repositories', 'common', 'teams'])
  const navigate = useNavigate()
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleteProject, { isLoading: isDeleting }] = useDeleteProjectMutation()

  const [srcOwner, srcRepo] = splitRepo(project.source_repo)
  const [tgtOwner, tgtRepo] = splitRepo(project.target_repo)

  async function handleDelete() {
    try {
      await deleteProject(project.id).unwrap()
      setDeleteOpen(false)
    } catch (error) {
      toast.error(translateApiError(error))
    }
  }

  return (
    <>
      <tr className={styles.row}>
        {/* Name */}
        <td>
          <Link className={styles.nameLink} to={`/repositories/${project.id}`}>
            <svg
              className={styles.nameIcon}
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            >
              <path d="M3.5 2h6l3 3v9h-9V2z" />
              <path d="M9.5 2v3h3" />
            </svg>
            {project.name}
            {project.is_team_project && (
              <span className={styles.teamBadge}>{t('teams:team_badge')}</span>
            )}
          </Link>
        </td>

        {/* Source → Target */}
        <td>
          <ValuePair
            className={styles.repoPair}
            source={
              <span>
                <span className={styles.repoOwner}>{srcOwner}</span>
                {srcRepo}
              </span>
            }
            target={
              <span>
                <span className={styles.repoOwner}>{tgtOwner}</span>
                {tgtRepo}
              </span>
            }
          />
        </td>

        {/* Branches */}
        <td>
          <ValuePair
            className={styles.branches}
            source={project.source_branch}
            target={project.target_branch}
            variant="chip"
          />
        </td>

        {/* Tasks */}
        <td>
          <Link className={styles.tasksLink} to={`/tasks?project_id=${project.id}`}>
            —
          </Link>
        </td>

        {/* Created */}
        <td className={styles.createdCell}>{formatDate(project.created_at)}</td>

        {/* Actions */}
        <td className={styles.actionsCell}>
          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <button
                type="button"
                className={styles.actionsTrigger}
                aria-label={t('common:actions')}
              >
                <MoreHorizontal size={14} />
              </button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content align="end" sideOffset={4} className={styles.dropdownContent}>
                <DropdownMenu.Item
                  className={styles.menuItem}
                  onSelect={() => void navigate(`/repositories/${project.id}`)}
                >
                  <ExternalLink size={13} className={styles.menuIcon} />
                  {t('repositories:open_project')}
                </DropdownMenu.Item>
                <DropdownMenu.Item
                  className={styles.menuItem}
                  onSelect={() => void navigate(`/tasks?project_id=${project.id}`)}
                >
                  <Play size={13} className={styles.menuIcon} />
                  {t('repositories:trigger_translation')}
                </DropdownMenu.Item>
                {(!project.is_team_project || isTeamOwner) && (
                  <>
                    <DropdownMenu.Separator className={styles.menuDivider} />
                    <DropdownMenu.Item
                      className={styles.menuItemDanger}
                      onSelect={() => setDeleteOpen(true)}
                    >
                      <Trash2 size={13} className={styles.menuIcon} />
                      {t('repositories:delete_project')}
                    </DropdownMenu.Item>
                  </>
                )}
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        </td>
      </tr>

      <DeleteProjectDialog
        open={deleteOpen}
        projectName={project.name}
        loading={isDeleting}
        onOpenChange={setDeleteOpen}
        onConfirm={() => void handleDelete()}
      />
    </>
  )
}
