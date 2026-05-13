import { useEffect, useReducer } from 'react'
import { useTranslation } from 'react-i18next'
import styles from './PipelineProgress.module.css'

const STAGE_LABEL_KEYS: Record<string, string> = {
  prepare: 'pipeline.prepare',
  pipeline: 'pipeline.pipeline',
  persist: 'pipeline.persist',
}

interface PipelineProgressProps {
  currentStage: string | null
  updatedAt: string
}

function formatElapsed(updatedAt: string, t: (key: string) => string): string {
  const seconds = Math.max(1, Math.round((Date.now() - new Date(updatedAt).getTime()) / 1000))
  if (seconds < 60) return `${seconds} ${t('units.seconds')}`
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes} ${t('units.minutes')}`
  return `${Math.round(minutes / 60)} ${t('units.hours')}`
}

function formatStageLabel(currentStage: string | null, t: (key: string) => string) {
  if (!currentStage) {
    return t('pipeline.running')
  }

  const stageLabelKey = STAGE_LABEL_KEYS[currentStage]
  if (stageLabelKey) {
    return t(stageLabelKey)
  }

  return currentStage
}

export function PipelineProgress({ currentStage, updatedAt }: PipelineProgressProps) {
  const { t } = useTranslation('tasks')
  const [, tick] = useReducer((value: number) => value + 1, 0)

  useEffect(() => {
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [])

  return (
    <span className={styles.label}>
      <span className={styles.dot} />
      <span>
        {formatStageLabel(currentStage, t)}
        <span className={styles.elapsed}>{formatElapsed(updatedAt, t)}</span>
      </span>
    </span>
  )
}
