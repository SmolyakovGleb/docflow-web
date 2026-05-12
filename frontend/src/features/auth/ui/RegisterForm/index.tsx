import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { useRegisterMutation } from '@/features/auth/api/authApi'
import { setUser } from '@/features/auth/model/authSlice'
import { type RegisterFormValues, registerSchema } from '@/features/auth/lib/schemas'
import { translateApiError } from '@/shared/lib/errorMessages'
import { Button } from '@/shared/ui/Button/Button'
import { Field } from '@/shared/ui/Field/Field'
import { Input } from '@/shared/ui/Input/Input'
import { useAppDispatch } from '@/shared/store/hooks'
import { AuthError } from '../AuthError'
import { PasswordInput } from '../PasswordInput'
import styles from '../AuthForm.module.css'

export function RegisterForm() {
  const { t } = useTranslation('auth')
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [registerUser, { isLoading }] = useRegisterMutation()
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      email: '',
      display_name: '',
      password: '',
    },
  })

  const onSubmit = handleSubmit(async (values) => {
    setSubmitError(null)

    try {
      const user = await registerUser({
        email: values.email,
        password: values.password,
        display_name: values.display_name?.trim() ? values.display_name.trim() : null,
      }).unwrap()
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
        <Field label={t('email')} htmlFor="register-email" error={errors.email?.message} required>
          <Input
            id="register-email"
            type="email"
            autoComplete="email"
            placeholder="anna@company.ru"
            error={Boolean(errors.email)}
            aria-invalid={Boolean(errors.email)}
            {...register('email')}
          />
        </Field>

        <Field
          label={
            <>
              {t('display_name')}{' '}
              <span className={styles.optional}>- {t('display_name_optional')}</span>
            </>
          }
          htmlFor="register-display-name"
          error={errors.display_name?.message}
        >
          <Input
            id="register-display-name"
            autoComplete="name"
            placeholder={t('display_name_placeholder')}
            error={Boolean(errors.display_name)}
            aria-invalid={Boolean(errors.display_name)}
            {...register('display_name')}
          />
        </Field>

        <Field
          label={t('password')}
          htmlFor="register-password"
          hint={t('password_hint')}
          error={errors.password?.message}
          required
        >
          <PasswordInput
            id="register-password"
            autoComplete="new-password"
            placeholder={t('password_placeholder')}
            error={Boolean(errors.password)}
            aria-invalid={Boolean(errors.password)}
            {...register('password')}
          />
        </Field>

        <Button className={styles.submit} type="submit" loading={isLoading} fullWidth>
          {t('submit_register')}
        </Button>
      </form>
    </>
  )
}
