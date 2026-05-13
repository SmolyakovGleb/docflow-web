import { Copy, Download, Lock } from 'lucide-react'
import { useEffect, useMemo, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { getPlural } from '@/shared/lib/plural'
import styles from '../TaskDetailPage/TaskDetailPage.module.css'
import { QueuedView } from '../QueuedView/QueuedView'

interface DiffEditorProps {
  filePath: string
  originalContent: string
  translatedContent: string
  readOnly?: boolean
  queuedSeconds?: number | null
  diffCount?: number | null
  unsavedCount?: number
  onDownload?: (() => void) | undefined
  onChange?: (value: string) => void
}

function getStats(content: string) {
  const lines = content.length > 0 ? content.split('\n').length : 0
  const linesLabel = `${lines} ${getPlural(lines, 'строка', 'строки', 'строк')}`
  const charsLabel = `${content.length} ${getPlural(content.length, 'символ', 'символа', 'символов')}`
  return { linesLabel, charsLabel }
}

function splitLines(content: string) {
  return content.length > 0 ? content.split('\n') : ['']
}

function getHeadingClass(line: string) {
  return line.trimStart().startsWith('#') ? styles.numberedLineHeading : ''
}

function getChangedLineFlags(left: string, right: string) {
  const leftLines = splitLines(left)
  const rightLines = splitLines(right)
  const length = Math.max(leftLines.length, rightLines.length)

  return Array.from(
    { length },
    (_, index) => (leftLines[index] ?? '') !== (rightLines[index] ?? ''),
  )
}

function copyText(value: string) {
  void navigator.clipboard?.writeText(value)
}

export function DiffEditor({
  filePath: _filePath,
  originalContent,
  translatedContent,
  readOnly = false,
  queuedSeconds = null,
  diffCount = null,
  unsavedCount = 0,
  onDownload,
  onChange,
}: DiffEditorProps) {
  const { t } = useTranslation('tasks')
  const showQueued = typeof queuedSeconds === 'number'
  const originalStats = useMemo(() => getStats(originalContent), [originalContent])
  const translatedStats = useMemo(() => getStats(translatedContent), [translatedContent])
  const originalLines = useMemo(() => splitLines(originalContent), [originalContent])
  const translatedLines = useMemo(() => splitLines(translatedContent), [translatedContent])
  const changedLineFlags = useMemo(
    () => getChangedLineFlags(originalContent, translatedContent),
    [originalContent, translatedContent],
  )
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
      <div className={styles.diffLayout}>
        <div className={styles.diffColumn}>
          <div className={styles.columnHeader}>
            <div className={styles.columnTitle}>
              <span className={styles.diffPill}>
                <Lock size={12} />
                <span className={styles.diffLang}>RU</span>
                <span>· только чтение</span>
              </span>
            </div>
            <div className={styles.columnActions}>
              <button
                type="button"
                className={styles.iconButton}
                aria-label="Скопировать оригинал"
                onClick={() => copyText(originalContent)}
              >
                <Copy size={13} />
              </button>
            </div>
          </div>

          <div className={styles.numberedPane}>
            {originalLines.map((line, index) => (
              <div
                key={`ru-${index + 1}`}
                className={[
                  styles.numberedLine,
                  getHeadingClass(line),
                  changedLineFlags[index] ? styles.numberedLineChanged : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                <span className={styles.lineNumber}>{index + 1}</span>
                <span className={styles.lineContent}>{line || ' '}</span>
              </div>
            ))}
          </div>

          <div className={styles.columnFooter}>
            <span>{originalStats.linesLabel}</span>
            <span className={styles.footerSeparator}>·</span>
            <span>{originalStats.charsLabel}</span>
            <span className={styles.footerSeparator}>·</span>
            <span>RU · оригинал</span>
          </div>
        </div>

        <div className={styles.divider} aria-hidden />

        <div className={styles.diffColumn}>
          <div className={styles.columnHeader}>
            <div className={styles.columnTitle}>
              <span className={styles.diffPill}>
                {readOnly || showQueued ? (
                  <Lock size={12} />
                ) : (
                  <span className={styles.diffPillDot} aria-hidden />
                )}
                <span className={styles.diffLang}>EN</span>
                <span>· {readOnly || showQueued ? 'только чтение' : 'редактируется'}</span>
              </span>
            </div>
            <div className={styles.columnActions}>
              {diffCount !== null ? (
                <span className={styles.summaryText}>
                  {diffCount} изменений · {unsavedCount} несохранённых
                </span>
              ) : null}
              {onDownload && translatedContent ? (
                <button type="button" className={styles.downloadButton} onClick={onDownload}>
                  <Download size={12} />
                  <span>{t('diff.download')}</span>
                </button>
              ) : null}
            </div>
          </div>

          {showQueued ? (
            <QueuedView seconds={queuedSeconds} />
          ) : readOnly ? (
            <div className={styles.numberedPane}>
              {translatedLines.map((line, index) => (
                <div
                  key={`en-${index + 1}`}
                  className={[
                    styles.numberedLine,
                    getHeadingClass(line),
                    changedLineFlags[index] ? styles.numberedLineChanged : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                >
                  <span className={styles.lineNumber}>{index + 1}</span>
                  <span className={styles.lineContent}>{line || ' '}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className={styles.editorShell}>
              <div ref={gutterRef} className={styles.editorGutter} aria-hidden>
                {translatedLines.map((_, index) => (
                  <span key={`gutter-${index + 1}`} className={styles.editorGutterLine}>
                    {index + 1}
                  </span>
                ))}
              </div>
              <textarea
                ref={textareaRef}
                aria-label="EN editor"
                className={styles.editablePane}
                value={translatedContent}
                onChange={(event) => onChange?.(event.target.value)}
              />
            </div>
          )}

          {!showQueued ? (
            <div className={styles.columnFooter}>
              <span>{translatedStats.linesLabel}</span>
              <span className={styles.footerSeparator}>·</span>
              <span>{translatedStats.charsLabel}</span>
              <span className={styles.footerSeparator}>·</span>
              <span>EN · перевод</span>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  )
}
