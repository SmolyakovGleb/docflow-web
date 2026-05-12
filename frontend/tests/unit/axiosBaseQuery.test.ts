import { http, HttpResponse } from 'msw'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createAppStore } from '@/shared/store'
import { axiosBaseQuery } from '@/shared/api/axiosBaseQuery'
import { server } from '../msw/server'

const assignMock = vi.fn()

describe('axiosBaseQuery', () => {
  afterEach(() => {
    assignMock.mockReset()
  })

  it('returns result data on success', async () => {
    server.use(
      http.get('/api/test-success', () =>
        HttpResponse.json({
          ok: true,
        }),
      ),
    )

    const baseQuery = axiosBaseQuery()
    const store = createAppStore()
    const result = await baseQuery(
      { url: '/test-success' },
      { dispatch: store.dispatch } as never,
      undefined,
    )

    expect(result).toEqual({
      data: {
        ok: true,
      },
    })
  })

  it('returns rtk query error shape on failure', async () => {
    server.use(
      http.get('/api/test-error', () =>
        HttpResponse.json(
          {
            detail: 'Broken',
          },
          { status: 500 },
        ),
      ),
    )

    const baseQuery = axiosBaseQuery()
    const store = createAppStore()
    const result = await baseQuery({ url: '/test-error' }, { dispatch: store.dispatch } as never, {
      skipAuthRedirect: true,
    })

    expect(result).toEqual({
      error: {
        status: 500,
        data: {
          detail: 'Broken',
        },
      },
    })
  })

  it('clears auth state and redirects on non-bootstrap 401', async () => {
    server.use(
      http.get('/api/test-401', () =>
        HttpResponse.json(
          {
            detail: 'Not authenticated',
          },
          { status: 401 },
        ),
      ),
    )

    const baseQuery = axiosBaseQuery()
    const store = createAppStore()

    Object.defineProperty(window, 'location', {
      configurable: true,
      value: {
        ...window.location,
        pathname: '/tasks',
        assign: assignMock,
      },
    })

    await baseQuery({ url: '/test-401' }, { dispatch: store.dispatch } as never, undefined)

    expect(store.getState().auth.isAuthenticated).toBe(false)
    expect(assignMock).toHaveBeenCalledWith('/login')
  })
})
