import { ArrowUpFromLine, Search } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { StatChips } from '../StatChips'
import styles from './TaskListHeader.module.css'

interface TaskListHeaderProps {
  searchValue: string
  onSearchChange: (value: string) => void
  onTriggerTranslation: () => void
}

export function TaskListHeader({
  searchValue,
  onSearchChange,
  onTriggerTranslation,
}: TaskListHeaderProps) {
  const { t } = useTranslation('tasks')
  const [input, setInput] = useState(searchValue)
  const syncedRef = useRef(searchValue)
  const callbackRef = useRef(onSearchChange)

  useEffect(() => {
    callbackRef.current = onSearchChange
  }, [onSearchChange])

  useEffect(() => {
    const id = setTimeout(() => {
      if (input !== syncedRef.current) {
        syncedRef.current = input
        callbackRef.current(input)
      }
    }, 300)
    return () => clearTimeout(id)
  }, [input])

  useEffect(() => {
    if (searchValue !== syncedRef.current) {
      syncedRef.current = searchValue
      setInput(searchValue)
    }
  }, [searchValue])

  return (
    <header className={styles.header}>
      <div className={styles.main}>
        <div>
          <h1 className={styles.title}>{t('title')}</h1>
          <p className={styles.subtitle}>{t('subtitle')}</p>
        </div>
        <StatChips />
      </div>

      <div className={styles.actions}>
        <label className={styles.search}>
          <Search size={14} />
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={t('search_placeholder')}
            className={styles.searchInput}
          />
          <span className={styles.searchKbd}>Ctrl K</span>
        </label>

        <button type="button" className={styles.triggerButton} onClick={onTriggerTranslation}>
          <ArrowUpFromLine size={13} />
          {t('trigger_translation')}
        </button>
      </div>
    </header>
  )
}
