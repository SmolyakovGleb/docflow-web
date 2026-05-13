import * as Popover from '@radix-ui/react-popover'
import { Check, ChevronDown, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Project } from '@/features/projects/model/types'
import { cn } from '@/shared/lib/cn'
import styles from './ProjectFilterPopover.module.css'

interface ProjectFilterPopoverProps {
  projects: Project[]
  selectedId: string | null
  totalCount: number
  projectCounts: Record<string, number>
  onChange: (projectId: string | null) => void
}

export function ProjectFilterPopover({
  projects,
  selectedId,
  totalCount,
  projectCounts,
  onChange,
}: ProjectFilterPopoverProps) {
  const { t } = useTranslation('tasks')
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)

  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    return normalizedQuery
      ? projects.filter((project) => project.name.toLowerCase().includes(normalizedQuery))
      : projects
  }, [projects, query])

  const selected = projects.find((project) => project.id === selectedId)

  const handleSelect = (id: string | null) => {
    onChange(id)
    setOpen(false)
    setQuery('')
  }

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button type="button" className={cn(styles.trigger, open && styles.triggerOpen)}>
          <span className={styles.triggerLabel}>
            {selected ? selected.name : t('toolbar.all_projects')}
          </span>
          <ChevronDown size={12} />
        </button>
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Content className={styles.content} align="end" sideOffset={6}>
          <div className={styles.search}>
            <Search size={12} />
            <input
              value={query}
              autoFocus
              placeholder={t('toolbar.search_projects')}
              onChange={(e) => setQuery(e.target.value)}
              className={styles.searchInput}
            />
          </div>

          <div className={styles.list}>
            <button
              type="button"
              className={cn(styles.option, !selectedId && styles.optionSelected)}
              onClick={() => handleSelect(null)}
            >
              <Check size={12} className={styles.check} />
              <span>{t('toolbar.all_projects')}</span>
              <span className={styles.meta}>{totalCount}</span>
            </button>

            {projects.length > 0 ? <div className={styles.divider} /> : null}

            {filtered.map((project) => (
              <button
                key={project.id}
                type="button"
                className={cn(styles.option, project.id === selectedId && styles.optionSelected)}
                onClick={() => handleSelect(project.id)}
              >
                <Check size={12} className={styles.check} />
                <span>{project.name}</span>
                <span className={styles.meta}>{projectCounts[project.id] ?? 0}</span>
              </button>
            ))}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
