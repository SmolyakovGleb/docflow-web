import { zodResolver } from '@hookform/resolvers/zod'
import { ArrowLeft, ArrowRight } from 'lucide-react'
import { useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router-dom'
import { translateApiError } from '@/shared/lib/errorMessages'
import { Button } from '@/shared/ui/Button/Button'
import { Field } from '@/shared/ui/Field/Field'
import { Input } from '@/shared/ui/Input/Input'
import { useCreateProjectMutation, useGetGithubReposQuery } from '../api/projectsApi'
import { type ProjectCreateFormValues, projectCreateSchema } from '../lib/schemas'
import { ExcludePatternsInput } from './ExcludePatternsInput'
import { RepoCombobox } from './RepoCombobox'
import { WebhookSecretModal } from './WebhookSecretModal'
import styles from './NewRepositoryPage.module.css'

interface CreatedProjectSecret {
  webhook_secret: string
  webhook_url: string
}

export function NewRepositoryPage() {
  const { t } = useTranslation('repositories')
  const navigate = useNavigate()
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [secretModal, setSecretModal] = useState<CreatedProjectSecret | null>(null)
  const { data: repos = [], isLoading: isReposLoading } = useGetGithubReposQuery()
  const [createProject, { isLoading }] = useCreateProjectMutation()
  const {
    control,
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ProjectCreateFormValues>({
    resolver: zodResolver(projectCreateSchema),
    defaultValues: {
      name: '',
      source_repo: '',
      source_branch: 'main',
      target_repo: '',
      target_branch: 'main',
      exclude_patterns: [],
    },
  })

  const onSubmit = handleSubmit(async (values) => {
    setSubmitError(null)

    try {
      const response = await createProject(values).unwrap()
      setSecretModal({
        webhook_secret: response.webhook_secret,
        webhook_url: response.webhook_url,
      })
    } catch (error) {
      setSubmitError(translateApiError(error) || t('errors.create_failed'))
    }
  })

  return (
    <section className={styles.page}>
      <Link className={styles.backLink} to="/repositories">
        <ArrowLeft size={16} />
        <span>{t('back_to_list')}</span>
      </Link>

      <div className={styles.card}>
        <div className={styles.header}>
          <h1 className={styles.title}>{t('new_title')}</h1>
          <p className={styles.subtitle}>{t('new_subtitle')}</p>
        </div>

        {submitError ? <div className={styles.submitError}>{submitError}</div> : null}

        <form
          className={styles.form}
          onSubmit={(event) => {
            void onSubmit(event)
          }}
          noValidate
        >
          <section className={styles.section}>
            <div className={styles.sectionLabel}>{t('section_general')}</div>
            <Field
              label={t('name_label')}
              htmlFor="project-name"
              error={errors.name?.message}
              required
            >
              <Input
                id="project-name"
                placeholder={t('name_placeholder')}
                error={Boolean(errors.name)}
                {...register('name')}
              />
            </Field>
          </section>

          <section className={styles.section}>
            <div className={styles.sectionLabel}>{t('section_repositories')}</div>

            <div className={styles.row}>
              <Field
                label={t('source_repo_label')}
                htmlFor="source-repo"
                error={errors.source_repo?.message}
                required
              >
                <Controller
                  control={control}
                  name="source_repo"
                  render={({ field }) => (
                    <RepoCombobox
                      id="source-repo"
                      error={Boolean(errors.source_repo)}
                      loading={isReposLoading}
                      placeholder={t('repo_placeholder')}
                      repos={repos}
                      value={field.value}
                      onChange={field.onChange}
                    />
                  )}
                />
              </Field>

              <div className={styles.rowArrow} aria-hidden>
                <ArrowRight size={16} />
              </div>

              <Field
                label={t('target_repo_label')}
                htmlFor="target-repo"
                error={errors.target_repo?.message}
                required
              >
                <Controller
                  control={control}
                  name="target_repo"
                  render={({ field }) => (
                    <RepoCombobox
                      id="target-repo"
                      error={Boolean(errors.target_repo)}
                      loading={isReposLoading}
                      placeholder={t('repo_placeholder')}
                      repos={repos}
                      value={field.value}
                      onChange={field.onChange}
                    />
                  )}
                />
              </Field>
            </div>

            <div className={styles.row}>
              <Field
                label={t('source_branch_label')}
                htmlFor="source-branch"
                error={errors.source_branch?.message}
                required
              >
                <Input
                  id="source-branch"
                  inputClassName="mono"
                  placeholder={t('branch_placeholder')}
                  error={Boolean(errors.source_branch)}
                  {...register('source_branch')}
                />
              </Field>

              <div className={styles.rowArrow} aria-hidden>
                <ArrowRight size={16} />
              </div>

              <Field
                label={t('target_branch_label')}
                htmlFor="target-branch"
                error={errors.target_branch?.message}
                required
              >
                <Input
                  id="target-branch"
                  inputClassName="mono"
                  placeholder={t('branch_placeholder')}
                  error={Boolean(errors.target_branch)}
                  {...register('target_branch')}
                />
              </Field>
            </div>
          </section>

          <section className={styles.section}>
            <div className={styles.sectionLabel}>{t('section_filters')}</div>
            <Field
              label={
                <>
                  {t('exclude_patterns_label')}{' '}
                  <span className={styles.optional}>— {t('exclude_patterns_optional')}</span>
                </>
              }
              error={errors.exclude_patterns?.message}
              hint={t('exclude_patterns_hint')}
            >
              <Controller
                control={control}
                name="exclude_patterns"
                render={({ field }) => (
                  <ExcludePatternsInput
                    error={Boolean(errors.exclude_patterns)}
                    placeholder={t('exclude_patterns_placeholder')}
                    value={field.value}
                    onChange={field.onChange}
                  />
                )}
              />
            </Field>
          </section>

          <div className={styles.footer}>
            <Button variant="ghost" onClick={() => void navigate('/repositories')} type="button">
              {t('cancel_create')}
            </Button>
            <Button loading={isLoading} type="submit">
              {t('save_project')}
            </Button>
          </div>
        </form>
      </div>

      {secretModal ? (
        <WebhookSecretModal
          open
          webhookSecret={secretModal.webhook_secret}
          webhookUrl={secretModal.webhook_url}
          onDone={() => {
            setSecretModal(null)
            void navigate('/repositories')
          }}
        />
      ) : null}
    </section>
  )
}
