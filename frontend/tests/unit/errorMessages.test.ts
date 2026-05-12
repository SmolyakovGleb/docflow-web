import { describe, expect, it } from 'vitest'
import { translateBackendError } from '@/shared/lib/errorMessages'

describe('translateBackendError', () => {
  it('translates known backend message', () => {
    expect(translateBackendError('Email already registered')).toBe('Email уже зарегистрирован')
  })

  it('falls back to generic message for unknown backend error', () => {
    expect(translateBackendError('Unexpected backend error')).toBe('Что-то пошло не так')
  })
})
