import { act, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { useTaskDetailTab } from '@/features/tasks/hooks/useTaskDetailTab'

function makeWrapper(initialPath: string) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <MemoryRouter initialEntries={[initialPath]}>{children}</MemoryRouter>
  }
}

describe('useTaskDetailTab', () => {
  it('returns the status-based default tab when query param is missing', () => {
    const { result } = renderHook(() => useTaskDetailTab('failed'), {
      wrapper: makeWrapper('/tasks/1'),
    })

    expect(result.current.activeTab).toBe('logs')
  })

  it('falls back from conflict tab when status is no longer conflict', () => {
    const conflictView = renderHook(() => useTaskDetailTab('conflict'), {
      wrapper: makeWrapper('/tasks/1?tab=conflict'),
    })
    expect(conflictView.result.current.activeTab).toBe('conflict')

    const publishedView = renderHook(() => useTaskDetailTab('published'), {
      wrapper: makeWrapper('/tasks/1?tab=conflict'),
    })
    expect(publishedView.result.current.activeTab).toBe('diff')
  })

  it('normalizes invalid tab changes to the default allowed tab', () => {
    const { result } = renderHook(() => useTaskDetailTab('done'), {
      wrapper: makeWrapper('/tasks/1'),
    })

    act(() => {
      result.current.setActiveTab('conflict')
    })

    expect(result.current.activeTab).toBe('diff')
  })
})
