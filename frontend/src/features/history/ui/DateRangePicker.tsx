import * as Popover from '@radix-ui/react-popover'
import { CalendarRange, ChevronDown, X } from 'lucide-react'
import { DayPicker, type DateRange } from 'react-day-picker'
import { ru } from 'react-day-picker/locale'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { formatDate } from '@/shared/lib/date'
import { Button } from '@/shared/ui/Button/Button'
import 'react-day-picker/style.css'
import styles from './DateRangePicker.module.css'

interface DateRangePickerProps {
  from: string | null
  to: string | null
  onChange: (value: { from: string | null; to: string | null }) => void
}

function startOfDayIso(date: Date) {
  const value = new Date(date)
  value.setHours(0, 0, 0, 0)
  return value.toISOString()
}

function endOfDayIso(date: Date) {
  const value = new Date(date)
  value.setHours(23, 59, 59, 999)
  return value.toISOString()
}

function getTriggerLabel(from: string | null, to: string | null, fallback: string) {
  if (from && to) {
    return `${formatDate(from)} - ${formatDate(to)}`
  }

  if (from) {
    return `${formatDate(from)} - ...`
  }

  if (to) {
    return `... - ${formatDate(to)}`
  }

  return fallback
}

export function DateRangePicker({ from, to, onChange }: DateRangePickerProps) {
  const { t } = useTranslation('history')
  const [open, setOpen] = useState(false)
  const selected = useMemo<DateRange | undefined>(
    () =>
      from || to
        ? {
            from: from ? new Date(from) : undefined,
            to: to ? new Date(to) : undefined,
          }
        : undefined,
    [from, to],
  )

  const handleSelect = (range: DateRange | undefined) => {
    onChange({
      from: range?.from ? startOfDayIso(range.from) : null,
      to: range?.to ? endOfDayIso(range.to) : null,
    })
  }

  const hasValue = Boolean(from || to)

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button type="button" className={styles.trigger}>
          <CalendarRange size={14} />
          <span className={styles.triggerLabel}>
            {getTriggerLabel(from, to, t('toolbar.all_dates'))}
          </span>
          <ChevronDown size={12} className={styles.triggerChevron} />
        </button>
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Content className={styles.content} align="end" sideOffset={8}>
          <div className={styles.heading}>
            <div className={styles.headingTitle}>{t('toolbar.date_range')}</div>
            {hasValue ? (
              <button
                type="button"
                className={styles.clearIcon}
                onClick={() => onChange({ from: null, to: null })}
                aria-label={t('datepicker.clear')}
              >
                <X size={12} />
              </button>
            ) : null}
          </div>

          <div className={styles.calendar}>
            <DayPicker
              locale={ru}
              mode="range"
              selected={selected}
              onSelect={handleSelect}
              weekStartsOn={1}
              showOutsideDays
              className={styles.dayPicker ?? ''}
            />
          </div>

          <div className={styles.footer}>
            <div className={styles.summary}>
              {from || to
                ? getTriggerLabel(from, to, t('toolbar.all_dates'))
                : t('datepicker.hint')}
            </div>
            <div className={styles.actions}>
              <Button variant="ghost" size="sm" onClick={() => onChange({ from: null, to: null })}>
                {t('datepicker.clear')}
              </Button>
              <Button variant="secondary" size="sm" onClick={() => setOpen(false)}>
                {t('datepicker.close')}
              </Button>
            </div>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
