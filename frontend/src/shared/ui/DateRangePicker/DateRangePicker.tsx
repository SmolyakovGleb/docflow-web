import * as Popover from '@radix-ui/react-popover'
import { CalendarRange, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { DayPicker, type DateRange } from 'react-day-picker'
import type { Locale } from 'react-day-picker'
import { ru } from 'react-day-picker/locale'
import { cn } from '@/shared/lib/cn'
import { formatDate } from '@/shared/lib/date'
import { Button } from '@/shared/ui/Button/Button'
import 'react-day-picker/style.css'
import styles from './DateRangePicker.module.css'

export interface DateRangePickerValue {
  from: string | null
  to: string | null
}

interface DateRangePickerLabels {
  placeholder: string
  title: string
  clear: string
  close: string
  hint: string
}

interface DateRangePickerProps {
  from: string | null
  to: string | null
  labels: DateRangePickerLabels
  onChange: (value: DateRangePickerValue) => void
  locale?: Locale
  align?: 'start' | 'center' | 'end'
  className?: string
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

function getTriggerLabel(from: string | null, to: string | null, placeholder: string) {
  if (from && to) {
    return `${formatDate(from)} - ${formatDate(to)}`
  }

  if (from) {
    return `${formatDate(from)} - ...`
  }

  if (to) {
    return `... - ${formatDate(to)}`
  }

  return placeholder
}

export function DateRangePicker({
  from,
  to,
  labels,
  onChange,
  locale = ru,
  align = 'end',
  className,
}: DateRangePickerProps) {
  const [open, setOpen] = useState(false)
  const hasValue = Boolean(from || to)
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

  const triggerLabel = getTriggerLabel(from, to, labels.placeholder)

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          className={cn(styles.trigger, hasValue && styles.triggerActive, className)}
        >
          <CalendarRange size={14} />
          <span className={styles.triggerLabel}>{triggerLabel}</span>
        </button>
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Content className={styles.content} align={align} sideOffset={8}>
          <div className={styles.heading}>
            <div className={styles.headingTitle}>{labels.title}</div>
            {hasValue ? (
              <button
                type="button"
                className={styles.clearIcon}
                onClick={() => onChange({ from: null, to: null })}
                aria-label={labels.clear}
              >
                <X size={12} />
              </button>
            ) : null}
          </div>

          <div className={styles.calendar}>
            <DayPicker
              locale={locale}
              mode="range"
              selected={selected}
              onSelect={handleSelect}
              weekStartsOn={1}
              showOutsideDays
              className={styles.dayPicker || ''}
            />
          </div>

          <div className={styles.footer}>
            <div className={styles.summary}>{hasValue ? triggerLabel : labels.hint}</div>
            <div className={styles.actions}>
              <Button variant="ghost" size="sm" onClick={() => onChange({ from: null, to: null })}>
                {labels.clear}
              </Button>
              <Button variant="secondary" size="sm" onClick={() => setOpen(false)}>
                {labels.close}
              </Button>
            </div>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
