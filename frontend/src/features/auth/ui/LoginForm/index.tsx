import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { useLoginMutation } from '@/features/auth/api/authApi'
import { setUser } from '@/features/auth/model/authSlice'
import { type LoginFormValues, loginSchema } from '@/features/auth/lib/schemas'
import { translateApiError } from '@/shared/lib/errorMessages'
import { Button } from '@/shared/ui/Button/Button'
import { Field } from '@/shared/ui/Field/Field'
import { Input } from '@/shared/ui/Input/Input'
import { useAppDispatch } from '@/shared/store/hooks'
import { AuthError } from '../AuthError'
import { PasswordInput } from '../PasswordInput'
import styles from '../AuthForm.module.css'

export function LoginForm() {
  const { t } = useTranslation('auth')
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [login, { isLoading }] = useLoginMutation()
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: '',
      password: '',
    },
  })

  const onSubmit = handleSubmit(async (values) => {
    setSubmitError(null)

    try {
      const user = await login(values).unwrap()
      dispatch(setUser(user))
      void navigate('/tasks')
    } catch (error) {
      setSubmitError(translateApiError(error))
    }
  })

  return (
    <>
      {submitError ? <AuthError message={submitError} /> : null}
      <form
        className={styles.form}
        onSubmit={(event) => {
          void onSubmit(event)
        }}
        noValidate
      >
        <Field label={t('email')} htmlFor="login-email" error={errors.email?.message} required>
          <Input
            id="login-email"
            type="email"
            autoComplete="email"
            placeholder="anna@company.ru"
            error={Boolean(errors.email)}
            aria-invalid={Boolean(errors.email)}
            {...register('email')}
          />
        </Field>

        <Field
          label={t('password')}
          htmlFor="login-password"
          error={errors.password?.message}
          required
        >
          <PasswordInput
            id="login-password"
            autoComplete="current-password"
            placeholder="**********"
            error={Boolean(errors.password)}
            aria-invalid={Boolean(errors.password)}
            {...register('password')}
          />
        </Field>

        <Button className={styles.submit} type="submit" loading={isLoading} fullWidth>
          {t('submit_login')}
        </Button>
      </form>
    </>
  )
}
