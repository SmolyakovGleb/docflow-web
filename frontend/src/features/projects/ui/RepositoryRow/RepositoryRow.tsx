import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { MoreHorizontal, ExternalLink, Play, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useDeleteProjectMutation } from '../../api/projectsApi'
import { formatDate } from '@/shared/lib/date'
import { DeleteProjectDialog } from '../DeleteProjectDialog'
import type { Project } from '../../model/types'
import styles from './RepositoryRow.module.css'
import tableStyles from '../RepositoriesPage/RepositoriesPage.module.css'

interface RepositoryRowProps {
  project: Project
}

function splitRepo(full: string): [string, string] {
  const slash = full.indexOf('/')
  if (slash === -1) return ['', full]
  return [full.slice(0, slash + 1), full.slice(slash + 1)]
}

export function RepositoryRow({ project }: RepositoryRowProps) {
  const { t } = useTranslation(['repositories', 'common'])
  const navigate = useNavigate()
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleteProject, { isLoading: isDeleting }] = useDeleteProjectMutation()

  const [srcOwner, srcRepo] = splitRepo(project.source_repo)
  const [tgtOwner, tgtRepo] = splitRepo(project.target_repo)

  async function handleDelete() {
    await deleteProject(project.id).unwrap()
    setDeleteOpen(false)
  }

  return (
    <>
      <tr className={tableStyles.row}>
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
          </Link>
        </td>

        {/* Source → Target */}
        <td>
          <div className={styles.repoPair}>
            <span>
              <span className={styles.repoOwner}>{srcOwner}</span>
              {srcRepo}
            </span>
            <svg
              className={styles.pairArrow}
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            >
              <path d="M3 8h10M9 4l4 4-4 4" />
            </svg>
            <span>
              <span className={styles.repoOwner}>{tgtOwner}</span>
              {tgtRepo}
            </span>
          </div>
        </td>

        {/* Branches */}
        <td>
          <div className={styles.branches}>
            <span className={styles.branchChip}>{project.source_branch}</span>
            <svg
              className={styles.branchArrow}
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            >
              <path d="M3 8h10M9 4l4 4-4 4" />
            </svg>
            <span className={styles.branchChip}>{project.target_branch}</span>
          </div>
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
                <DropdownMenu.Separator className={styles.menuDivider} />
                <DropdownMenu.Item
                  className={styles.menuItemDanger}
                  onSelect={() => setDeleteOpen(true)}
                >
                  <Trash2 size={13} className={styles.menuIcon} />
                  {t('repositories:delete_project')}
                </DropdownMenu.Item>
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
