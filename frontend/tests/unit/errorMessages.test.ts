import { describe, expect, it } from 'vitest'
import { translateApiError, translateBackendError } from '@/shared/lib/errorMessages'

describe('translateBackendError', () => {
  it('translates known backend message', () => {
    expect(translateBackendError('Email already registered')).toBe('Email уже зарегистрирован')
  })

  it('returns raw message for unknown backend error', () => {
    expect(translateBackendError('Unexpected backend error')).toBe('Unexpected backend error')
  })

  it('translates rate limited api errors by status code', () => {
    expect(
      translateApiError({
        status: 429,
        data: {
          detail: 'Rate limit exceeded',
        },
      }),
    ).toBe('Слишком много попыток, попробуйте позже')
  })
})
