import { describe, expect, it } from 'vitest'
import { cn } from '@/shared/lib/cn'

describe('cn', () => {
  it('joins truthy class names', () => {
    expect(cn('root', false && 'hidden', 'active')).toBe('root active')
  })
})
