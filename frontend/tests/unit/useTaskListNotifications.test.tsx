import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useTaskListNotifications } from '@/features/tasks/hooks/useTaskListNotifications'

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

function getLatestEventSource() {
  const source = FakeEventSource.instances.at(-1)
  if (!source) {
    throw new Error('Expected EventSource instance to be created')
  }

  return source
}

describe('useTaskListNotifications', () => {
  afterEach(() => {
    FakeEventSource.instances = []
    window.sessionStorage.clear()
    vi.unstubAllGlobals()
  })

  it('opens EventSource for the current task list scope', () => {
    vi.stubGlobal('EventSource', FakeEventSource)

    const { unmount } = renderHook(() =>
      useTaskListNotifications('failed-project-1-docs', {
        status: 'failed',
        projectId: 'project-1',
        search: 'docs',
      }),
    )

    expect(FakeEventSource.instances.length).toBeGreaterThan(0)
    const source = getLatestEventSource()
    expect(source.url).toBe('/api/tasks/events?status=failed&project_id=project-1&search=docs')

    unmount()
    expect(source.close).toHaveBeenCalledOnce()
  })

  it('increments and persists count when server emits task_entered', () => {
    vi.stubGlobal('EventSource', FakeEventSource)

    const { result, unmount } = renderHook(() =>
      useTaskListNotifications('all--', {
        status: null,
        projectId: null,
        search: '',
      }),
    )

    expect(result.current.newTasksCount).toBe(0)

    act(() => {
      const source = getLatestEventSource()
      source.emit('task_entered', { task_id: 'task-1', status: 'queued' })
      source.emit('task_entered', { task_id: 'task-2', status: 'queued' })
    })

    expect(result.current.newTasksCount).toBe(2)

    unmount()

    const remount = renderHook(() =>
      useTaskListNotifications('all--', {
        status: null,
        projectId: null,
        search: '',
      }),
    )

    expect(remount.result.current.newTasksCount).toBe(2)
  })

  it('keeps counts isolated by scope and clears only the active one', () => {
    vi.stubGlobal('EventSource', FakeEventSource)

    const firstScope = renderHook(() =>
      useTaskListNotifications('all--', {
        status: null,
        projectId: null,
        search: '',
      }),
    )

    act(() => {
      getLatestEventSource().emit('task_entered', { task_id: 'task-1', status: 'queued' })
    })

    expect(firstScope.result.current.newTasksCount).toBe(1)
    firstScope.unmount()

    const secondScope = renderHook(() =>
      useTaskListNotifications('failed--', {
        status: 'failed',
        projectId: null,
        search: '',
      }),
    )

    expect(secondScope.result.current.newTasksCount).toBe(0)

    act(() => {
      secondScope.result.current.clearNewTasks()
    })

    expect(secondScope.result.current.newTasksCount).toBe(0)
    secondScope.unmount()

    const firstScopeAgain = renderHook(() =>
      useTaskListNotifications('all--', {
        status: null,
        projectId: null,
        search: '',
      }),
    )

    expect(firstScopeAgain.result.current.newTasksCount).toBe(1)
  })

  it('drops notifications when the corresponding tasks are already visible in the list', () => {
    vi.stubGlobal('EventSource', FakeEventSource)

    const { result, rerender, unmount } = renderHook(
      ({ visibleTaskIds }: { visibleTaskIds: string[] }) =>
        useTaskListNotifications(
          'all--',
          {
            status: null,
            projectId: null,
            search: '',
          },
          visibleTaskIds,
        ),
      {
        initialProps: { visibleTaskIds: [] as string[] },
      },
    )

    act(() => {
      const source = getLatestEventSource()
      source.emit('task_entered', { task_id: 'task-1', status: 'queued' })
      source.emit('task_entered', { task_id: 'task-2', status: 'queued' })
    })

    expect(result.current.newTasksCount).toBe(2)

    rerender({ visibleTaskIds: ['task-1', 'task-2'] })

    expect(result.current.newTasksCount).toBe(0)

    unmount()

    const remount = renderHook(() =>
      useTaskListNotifications('all--', {
        status: null,
        projectId: null,
        search: '',
      }),
    )

    expect(remount.result.current.newTasksCount).toBe(0)
  })
})
