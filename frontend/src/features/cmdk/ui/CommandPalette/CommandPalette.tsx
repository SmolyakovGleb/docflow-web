import {
  BarChart3,
  BookOpen,
  FileText,
  FolderOpen,
  FolderPlus,
  History,
  List,
  Search,
  Settings,
} from 'lucide-react'
import { Command } from 'cmdk'
import { useMemo, useState, type ComponentType } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { close, selectCmdkOpen } from '@/features/cmdk/model/cmdkSlice'
import type { CmdkIconKey, CmdkItem } from '@/features/cmdk/model/types'
import { useAppDispatch, useAppSelector } from '@/shared/store/hooks'
import { DialogShell } from '@/shared/ui/DialogShell/DialogShell'
import { useCmdkData } from '../../hooks/useCmdkData'
import styles from './CommandPalette.module.css'

const ICONS: Record<CmdkIconKey, ComponentType<{ size?: number }>> = {
  task: FileText,
  project: FolderOpen,
  tasks: List,
  newProject: FolderPlus,
  repositories: FolderOpen,
  history: History,
  analytics: BarChart3,
  dictionaries: BookOpen,
  settings: Settings,
}

export function CommandPalette() {
  const { t } = useTranslation('cmdk')
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  const isOpen = useAppSelector(selectCmdkOpen)
  const [query, setQuery] = useState('')
  const { groups, hasQuery, isEmpty, isFetching, isLoading } = useCmdkData({
    query,
    enabled: isOpen,
  })

  const visibleGroups = useMemo(() => groups.filter((group) => group.items.length > 0), [groups])

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      setQuery('')
      dispatch(close())
    }
  }

  function handleSelect(item: CmdkItem) {
    setQuery('')
    dispatch(close())
    void navigate(item.to)
  }

  return (
    <DialogShell
      open={isOpen}
      onOpenChange={handleOpenChange}
      title={t('title')}
      description={t('description')}
      size="lg"
      position="top"
      showCloseButton
      closeLabel={t('close')}
      overlayClassName={styles.overlay}
      contentClassName={styles.content}
      headerClassName={styles.header}
      titleClassName={styles.title}
      descriptionClassName={styles.description}
      bodyClassName={styles.body}
      footerClassName={styles.footer}
      footer={
        <div className={styles.hints}>
          <span>{t('hint_select')}</span>
          <span>{t('hint_close')}</span>
        </div>
      }
    >
      <Command className={styles.command} label={t('title')} loop shouldFilter={false}>
        <div className={styles.searchRow}>
          <Search className={styles.searchIcon} size={16} aria-hidden />
          <Command.Input
            className={styles.input}
            value={query}
            onValueChange={setQuery}
            placeholder={t('placeholder')}
          />
        </div>

        <Command.List className={styles.list}>
          {isLoading ? <div className={styles.state}>{t('loading')}</div> : null}
          {!isLoading && isEmpty ? (
            <Command.Empty className={styles.state}>
              {t(hasQuery ? 'empty_search' : 'empty')}
            </Command.Empty>
          ) : null}

          {visibleGroups.map((group) => (
            <Command.Group
              key={group.key}
              className={styles.group}
              heading={t(`groups.${group.key}`)}
            >
              {group.items.map((item) => {
                const Icon = ICONS[item.icon]

                return (
                  <Command.Item
                    key={item.id}
                    className={styles.item}
                    value={[item.title, item.subtitle ?? '', ...item.keywords].join(' ')}
                    onSelect={() => handleSelect(item)}
                  >
                    <span className={styles.itemIcon} aria-hidden>
                      <Icon size={14} />
                    </span>
                    <span className={styles.itemText}>
                      <span className={styles.itemTitle}>{item.title}</span>
                      {item.subtitle ? (
                        <span className={styles.itemSubtitle}>{item.subtitle}</span>
                      ) : null}
                    </span>
                  </Command.Item>
                )
              })}
            </Command.Group>
          ))}

          {!isLoading && isFetching && !isEmpty ? (
            <div className={styles.fetching}>{t('refreshing')}</div>
          ) : null}
        </Command.List>
      </Command>
    </DialogShell>
  )
}
