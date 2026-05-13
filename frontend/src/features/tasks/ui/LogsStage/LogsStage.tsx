import { ChevronDown } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { getPlural } from '@/shared/lib/plural'
import type { ParsedTaskLogStage } from '@/features/tasks/model/types'
import styles from '../TaskDetailPage/TaskDetailPage.module.css'

interface LogsStageProps {
  stage: ParsedTaskLogStage
  isRunning?: boolean
}

export function LogsStage({ stage, isRunning = false }: LogsStageProps) {
  const { t } = useTranslation('tasks')
  const [isOpen, setIsOpen] = useState(true)
  const linesLabel = `${stage.lines.length} ${getPlural(stage.lines.length, 'строка', 'строки', 'строк')}`

  return (
    <section className={styles.logStage}>
      <button
        type="button"
        className={`${styles.logStageHeader} ${styles.logStageToggle} ${isRunning ? styles.logStageHeaderRunning : ''}`.trim()}
        aria-expanded={isOpen}
        onClick={() => setIsOpen((open) => !open)}
      >
        <ChevronDown
          size={12}
          aria-hidden
          className={`${styles.logStageArrow} ${!isOpen ? styles.logStageArrowCollapsed : ''}`.trim()}
        />
        <span className={styles.logStageMark}>{isRunning ? '◯' : '✓'}</span>
        <span className={styles.logStageName}>{t(`pipeline.${stage.id}`)}</span>
        <span className={styles.logStageMeta}>
          {isRunning ? t('pipeline.stage_running') : linesLabel}
        </span>
      </button>
      {isOpen ? (
        <div className={styles.logLines}>
          {stage.lines.map((line, index) => (
            <div key={`${stage.id}-${index + 1}`} className={styles.logLine}>
              {line}
            </div>
          ))}
        </div>
      ) : null}
    </section>
  )
}
