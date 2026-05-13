import { GitCommitHorizontal } from 'lucide-react'
import { useEffect, useMemo, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/shared/ui/Button/Button'
import { cn } from '@/shared/lib/cn'
import styles from '../TaskDetailPage/TaskDetailPage.module.css'

interface ConflictViewProps {
  base: string
  ours: string
  theirs: string
  value: string
  loading?: boolean
  baseMeta?: {
    badge?: string | null
    text: string
  }
  oursMeta?: {
    badge?: string | null
    text: string
    mutedBadge?: boolean
  }
  theirsMeta?: {
    text: string
  }
  onChange: (value: string) => void
  onUseOurs: () => void
  onUseTheirs: () => void
  onPublish: () => void
}

function splitLines(content: string) {
  return content.length > 0 ? content.split('\n') : ['']
}

function getHeadingClass(line: string) {
  return line.trimStart().startsWith('#') ? styles.numberedLineHeading : ''
}

function getConflictDiffFlags(base: string, ours: string, theirs: string) {
  const baseLines = splitLines(base)
  const ourLines = splitLines(ours)
  const theirLines = splitLines(theirs)
  const length = Math.max(baseLines.length, ourLines.length, theirLines.length)

  return Array.from({ length }, (_, index) => {
    const baseLine = baseLines[index] ?? ''
    const ourLine = ourLines[index] ?? ''
    const theirLine = theirLines[index] ?? ''

    return !(baseLine === ourLine && ourLine === theirLine)
  })
}

export function ConflictView({
  base,
  ours,
  theirs,
  value,
  loading = false,
  baseMeta,
  oursMeta,
  theirsMeta,
  onChange,
  onUseOurs,
  onUseTheirs,
  onPublish,
}: ConflictViewProps) {
  const { t } = useTranslation('tasks')
  const baseLines = useMemo(() => splitLines(base), [base])
  const ourLines = useMemo(() => splitLines(ours), [ours])
  const theirLines = useMemo(() => splitLines(theirs), [theirs])
  const editorLines = useMemo(() => splitLines(value), [value])
  const diffFlags = useMemo(() => getConflictDiffFlags(base, ours, theirs), [base, ours, theirs])
  const gutterRef = useRef<HTMLDivElement | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)

  useEffect(() => {
    const textarea = textareaRef.current
    const gutter = gutterRef.current

    if (!textarea || !gutter) {
      return
    }

    const syncScroll = () => {
      gutter.scrollTop = textarea.scrollTop
    }

    syncScroll()
    textarea.addEventListener('scroll', syncScroll)
    return () => textarea.removeEventListener('scroll', syncScroll)
  }, [])

  return (
    <section className={styles.panel}>
      <div className={styles.conflictView}>
        <div className={styles.conflictColumns}>
          <div className={styles.conflictColumn}>
            <div className={styles.conflictColumnHeader}>
              <div className={styles.conflictColumnTitle}>
                <span className={styles.conflictColumnRole}>{t('conflict.col_base_role')}</span>
                <span>· {t('conflict.col_base_sub')}</span>
              </div>
              <div className={styles.conflictColumnMeta}>
                {baseMeta?.badge ? (
                  <span className={styles.conflictMetaAvatar}>{baseMeta.badge}</span>
                ) : null}
                <span>{baseMeta?.text ?? t('conflict.col_base_meta')}</span>
              </div>
            </div>
            <div className={styles.numberedPane}>
              {baseLines.map((line, index) => (
                <div
                  key={`base-${index + 1}`}
                  className={cn(
                    styles.conflictLine,
                    getHeadingClass(line),
                    diffFlags[index] && styles.conflictLineDiff,
                  )}
                >
                  <span className={styles.lineNumber}>{index + 1}</span>
                  <span className={styles.lineContent}>{line || ' '}</span>
                </div>
              ))}
            </div>
          </div>

          <div className={styles.divider} aria-hidden />

          <div className={styles.conflictColumn}>
            <div className={styles.conflictColumnHeader}>
              <div className={styles.conflictColumnTitle}>
                <span className={styles.conflictColumnRole}>{t('conflict.col_ours_role')}</span>
                <span>· {t('conflict.col_ours_sub')}</span>
              </div>
              <div className={styles.conflictColumnMeta}>
                {oursMeta?.badge ? (
                  <span
                    className={cn(
                      styles.conflictMetaAvatar,
                      oursMeta.mutedBadge && styles.conflictMetaAvatarMuted,
                    )}
                  >
                    {oursMeta.badge}
                  </span>
                ) : null}
                <span>{oursMeta?.text ?? t('conflict.col_ours_meta')}</span>
              </div>
            </div>
            <div className={styles.numberedPane}>
              {ourLines.map((line, index) => (
                <div
                  key={`ours-${index + 1}`}
                  className={cn(
                    styles.conflictLine,
                    getHeadingClass(line),
                    diffFlags[index] && styles.conflictLineDiff,
                  )}
                >
                  <span className={styles.lineNumber}>{index + 1}</span>
                  <span className={styles.lineContent}>{line || ' '}</span>
                </div>
              ))}
            </div>
          </div>

          <div className={styles.divider} aria-hidden />

          <div className={styles.conflictColumn}>
            <div className={styles.conflictColumnHeader}>
              <div className={styles.conflictColumnTitle}>
                <span className={styles.conflictColumnRole}>{t('conflict.col_theirs_role')}</span>
                <span>· {t('conflict.col_theirs_sub')}</span>
              </div>
              <div className={styles.conflictColumnMeta}>
                <GitCommitHorizontal size={11} className={styles.conflictMetaIcon} />
                <span>{theirsMeta?.text ?? t('conflict.col_theirs_meta')}</span>
              </div>
            </div>
            <div className={styles.numberedPane}>
              {theirLines.map((line, index) => (
                <div
                  key={`theirs-${index + 1}`}
                  className={cn(
                    styles.conflictLine,
                    getHeadingClass(line),
                    diffFlags[index] && styles.conflictLineDiff,
                  )}
                >
                  <span className={styles.lineNumber}>{index + 1}</span>
                  <span className={styles.lineContent}>{line || ' '}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className={styles.conflictEditor}>
          <div className={styles.conflictEditorToolbar}>
            <span className={styles.diffPill}>
              <span className={styles.diffPillDot} aria-hidden />
              <span className={styles.diffLang}>EN</span>
              <span>· редактируется</span>
            </span>

            <div className={styles.sourceToggle}>
              <label
                className={cn(styles.sourceOption, value === ours && styles.sourceOptionActive)}
              >
                <input
                  checked={value === ours}
                  className={styles.sourceInput}
                  name="conflict-preset"
                  type="radio"
                  aria-label={t('conflict.use_ours')}
                  onChange={onUseOurs}
                />
                <span className={styles.sourceOptionDot} aria-hidden />
                <span>{t('conflict.use_ours')}</span>
              </label>

              <label
                className={cn(styles.sourceOption, value === theirs && styles.sourceOptionActive)}
              >
                <input
                  checked={value === theirs}
                  className={styles.sourceInput}
                  name="conflict-preset"
                  type="radio"
                  aria-label={t('conflict.use_theirs')}
                  onChange={onUseTheirs}
                />
                <span className={styles.sourceOptionDot} aria-hidden />
                <span>{t('conflict.use_theirs')}</span>
              </label>
            </div>
          </div>

          <div className={styles.editorShell}>
            <div ref={gutterRef} className={styles.editorGutter} aria-hidden>
              {editorLines.map((_, index) => (
                <span key={`conflict-gutter-${index + 1}`} className={styles.editorGutterLine}>
                  {index + 1}
                </span>
              ))}
            </div>
            <textarea
              ref={textareaRef}
              aria-label="Conflict editor"
              className={styles.editablePane}
              value={value}
              onChange={(event) => onChange(event.target.value)}
            />
          </div>

          <div className={styles.conflictEditorBar}>
            <span className={styles.conflictHint}>{t('conflict.editor_hint')}</span>
            <Button loading={loading} onClick={onPublish}>
              {t('actions.publish')}
            </Button>
          </div>
        </div>
      </div>
    </section>
  )
}
