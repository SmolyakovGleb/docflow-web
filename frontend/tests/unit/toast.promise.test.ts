import { beforeEach, describe, expect, it, vi } from 'vitest'

const { sonnerToastMock } = vi.hoisted(() => ({
  sonnerToastMock: Object.assign(vi.fn(), {
    loading: vi.fn(() => 'toast-id'),
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    dismiss: vi.fn(),
  }),
}))

vi.mock('sonner', () => ({
  toast: sonnerToastMock,
}))

import { toast } from '@/shared/ui/Toast/toast'

describe('toast.promise', () => {
  beforeEach(() => {
    sonnerToastMock.mockClear()
    sonnerToastMock.loading.mockClear()
    sonnerToastMock.success.mockClear()
    sonnerToastMock.error.mockClear()
    sonnerToastMock.info.mockClear()
    sonnerToastMock.dismiss.mockClear()
  })

  it('shows loading and success states', async () => {
    await expect(
      toast.promise(Promise.resolve('done'), {
        loading: 'Loading',
        success: (value) => `Saved ${value}`,
        error: 'Failed',
      }),
    ).resolves.toBe('done')

    expect(sonnerToastMock.loading).toHaveBeenCalledWith('Loading')
    expect(sonnerToastMock.success).toHaveBeenCalledWith('Saved done', { id: 'toast-id' })
    expect(sonnerToastMock.error).not.toHaveBeenCalled()
  })

  it('shows loading and error states', async () => {
    await expect(
      toast.promise(Promise.reject(new Error('boom')), {
        loading: 'Loading',
        success: 'Saved',
        error: (error) => (error instanceof Error ? error.message : 'unknown'),
      }),
    ).rejects.toThrow('boom')

    expect(sonnerToastMock.loading).toHaveBeenCalledWith('Loading')
    expect(sonnerToastMock.error).toHaveBeenCalledWith('boom', { id: 'toast-id' })
    expect(sonnerToastMock.success).not.toHaveBeenCalled()
  })

  it('dismisses the loading toast when error message is suppressed', async () => {
    await expect(
      toast.promise(Promise.reject(new Error('conflict')), {
        loading: 'Loading',
        error: () => null,
      }),
    ).rejects.toThrow('conflict')

    expect(sonnerToastMock.dismiss).toHaveBeenCalledWith('toast-id')
    expect(sonnerToastMock.error).not.toHaveBeenCalled()
  })
})
