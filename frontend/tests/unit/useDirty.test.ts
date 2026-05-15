import { renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useDirty } from '@/shared/hooks/useDirty'

describe('useDirty', () => {
  it('prevents beforeunload when dirty', () => {
    renderHook(() => useDirty(true))

    const event = new Event('beforeunload', { cancelable: true })
    const result = window.dispatchEvent(event)

    expect(result).toBe(false)
    expect(event.defaultPrevented).toBe(true)
  })

  it('does not prevent beforeunload when clean', () => {
    renderHook(() => useDirty(false))

    const event = new Event('beforeunload', { cancelable: true })
    const result = window.dispatchEvent(event)

    expect(result).toBe(true)
    expect(event.defaultPrevented).toBe(false)
  })
})
