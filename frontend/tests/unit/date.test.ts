import { describe, expect, it } from 'vitest'
import { formatDate, formatDateTime } from '@/shared/lib/date'

describe('formatDate', () => {
  it('formats ISO string in Russian', () => {
    expect(formatDate('2026-05-08T10:00:00Z')).toBe('8 мая 2026')
  })
})

describe('formatDateTime', () => {
  it('includes day, month, year and time', () => {
    expect(formatDateTime('2026-05-08T10:30:00Z')).toMatch(/8 мая 2026, \d{2}:30/)
  })
})
