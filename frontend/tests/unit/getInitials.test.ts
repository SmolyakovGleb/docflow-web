import { describe, expect, it } from 'vitest'
import { getInitials } from '@/shared/lib/getInitials'

describe('getInitials', () => {
  it('returns initials for a single name', () => {
    expect(getInitials('Anna')).toBe('AN')
  })

  it('returns initials for first and last name', () => {
    expect(getInitials('Anna Kuznetsova')).toBe('AK')
  })

  it('normalizes lowercase names', () => {
    expect(getInitials('anna kuznetsova')).toBe('AK')
  })

  it('keeps compact initials as is', () => {
    expect(getInitials('AK')).toBe('AK')
  })

  it('falls back to question mark', () => {
    expect(getInitials('')).toBe('?')
  })
})
