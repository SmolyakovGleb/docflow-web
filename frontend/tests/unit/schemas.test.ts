import { describe, expect, it } from 'vitest'
import { loginSchema, registerSchema } from '@/features/auth/lib/schemas'

describe('auth schemas', () => {
  it('accepts valid login payload', () => {
    expect(
      loginSchema.safeParse({
        email: 'anna@company.ru',
        password: 'password1',
      }).success,
    ).toBe(true)
  })

  it('rejects invalid email in login schema', () => {
    expect(
      loginSchema.safeParse({
        email: 'anna',
        password: 'password1',
      }).success,
    ).toBe(false)
  })

  it('accepts valid register payload with optional display name', () => {
    expect(
      registerSchema.safeParse({
        email: 'anna@company.ru',
        password: 'password1',
        display_name: 'Anna Kuznetsova',
      }).success,
    ).toBe(true)
  })

  it('rejects register password without digit', () => {
    expect(
      registerSchema.safeParse({
        email: 'anna@company.ru',
        password: 'password',
      }).success,
    ).toBe(false)
  })

  it('rejects register password shorter than 8 symbols', () => {
    expect(
      registerSchema.safeParse({
        email: 'anna@company.ru',
        password: 'pass1',
      }).success,
    ).toBe(false)
  })
})
