import { z } from 'zod'
import i18n from '@/shared/lib/i18n'

const emailSchema = z
  .string()
  .trim()
  .min(1, i18n.t('auth:validation.email_required'))
  .email(i18n.t('auth:validation.email_invalid'))

const loginPasswordSchema = z.string().min(1, i18n.t('auth:validation.password_required'))

const registerPasswordSchema = z
  .string()
  .min(1, i18n.t('auth:validation.password_required'))
  .min(8, i18n.t('auth:validation.password_min_length'))
  .regex(/\d/, i18n.t('auth:errors.password_digit_required'))

export const loginSchema = z.object({
  email: emailSchema,
  password: loginPasswordSchema,
})

export const registerSchema = z.object({
  email: emailSchema,
  display_name: z.string().trim().optional(),
  password: registerPasswordSchema,
})

export type LoginFormValues = z.infer<typeof loginSchema>
export type RegisterFormValues = z.infer<typeof registerSchema>
