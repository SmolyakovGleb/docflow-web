import { act, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { Provider } from 'react-redux'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useSSE } from '@/features/tasks/hooks/useSSE'
import { createAppStore, type AppStore } from '@/shared/store'

type Listener = (event: MessageEvent<string>) => void

class FakeEventSource {
  static instances: FakeEventSource[] = []

  url: string
  listeners = new Map<string, Set<Listener>>()
  close = vi.fn(() => {})

  constructor(url: string) {
    this.url = url
    FakeEventSource.instances.push(this)
  }

  addEventListener(type: string, listener: EventListenerOrEventListenerObject) {
    const callback = listener as Listener
    const handlers = this.listeners.get(type) ?? new Set<Listener>()
    handlers.add(callback)
    this.listeners.set(type, handlers)
  }

  removeEventListener(type: string, listener: EventListenerOrEventListenerObject) {
    const callback = listener as Listener
    this.listeners.get(type)?.delete(callback)
  }

  emit(type: string, payload: unknown) {
    const event = { data: JSON.stringify(payload) } as MessageEvent<string>
    this.listeners.get(type)?.forEach((listener) => listener(event))
  }
}

function makeWrapper(store: AppStore) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <Provider store={store}>{children}</Provider>
  }
}

describe('useSSE', () => {
  afterEach(() => {
    FakeEventSource.instances = []
    vi.unstubAllGlobals()
  })

  it('opens an EventSource only for running tasks and closes it on cleanup', () => {
    vi.stubGlobal('EventSource', FakeEventSource)
    const store = createAppStore()

    const { rerender, unmount } = renderHook(
      (status: 'queued' | 'running') => useSSE({ taskId: 'task-1', status }),
      {
        initialProps: 'queued',
        wrapper: makeWrapper(store),
      },
    )

    expect(FakeEventSource.instances).toHaveLength(0)

    rerender('running')

    expect(FakeEventSource.instances).toHaveLength(1)
    const source = FakeEventSource.instances[0]
    expect(source?.url).toBe('/api/tasks/task-1/events')

    unmount()

    expect(source?.close).toHaveBeenCalledOnce()
  })

  it('keeps the EventSource open until status_change and invalidates the task cache', () => {
    vi.stubGlobal('EventSource', FakeEventSource)
    const store = createAppStore()
    const dispatchSpy = vi.spyOn(store, 'dispatch')
    const onLogLine = vi.fn()
    const onStageUpdate = vi.fn()
    const onStatusChange = vi.fn()

    renderHook(
      () =>
        useSSE({
          taskId: 'task-42',
          status: 'running',
          onLogLine,
          onStageUpdate,
          onStatusChange,
        }),
      {
        wrapper: makeWrapper(store),
      },
    )

    const source = FakeEventSource.instances[0]
    if (!source) {
      throw new Error('Expected EventSource instance to be created')
    }

    act(() => {
      source.emit('log_line', { line: 'pipeline log' })
      source.emit('stage_update', { stage: 'pipeline', index: 2, total: 3 })
    })

    expect(source.close).not.toHaveBeenCalled()
    expect(onLogLine).toHaveBeenCalledWith('pipeline log')
    expect(onStageUpdate).toHaveBeenCalledWith({ stage: 'pipeline', index: 2, total: 3 })

    act(() => {
      source.emit('status_change', { status: 'done' })
    })

    expect(onStatusChange).toHaveBeenCalledWith({ status: 'done' })
    expect(source.close).toHaveBeenCalledOnce()
    expect(dispatchSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'api/invalidateTags',
        payload: ['Task', { type: 'Task', id: 'task-42' }],
      }),
    )
  })
})
