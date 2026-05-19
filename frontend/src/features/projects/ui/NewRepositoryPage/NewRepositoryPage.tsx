import { zodResolver } from '@hookform/resolvers/zod'
import { ArrowRight, FolderGit2 } from 'lucide-react'
import { useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useGetMeQuery } from '@/features/auth/api/authApi'
import { redirectToGithubConnect } from '@/features/auth/lib/redirectToGithubConnect'
import { markOnboardingCompleted } from '@/features/onboarding'
import { useGetMyTeamQuery } from '@/features/teams/api/teamsApi'
import { translateApiError } from '@/shared/lib/errorMessages'
import { Breadcrumbs } from '@/shared/ui/Breadcrumbs/Breadcrumbs'
import { Button } from '@/shared/ui/Button/Button'
import { EmptyState } from '@/shared/ui/EmptyState/EmptyState'
import { Field } from '@/shared/ui/Field/Field'
import { Input } from '@/shared/ui/Input/Input'
import { InlineAlert } from '@/shared/ui/InlineAlert/InlineAlert'
import { SectionCard } from '@/shared/ui/SectionCard/SectionCard'
import { useCreateProjectMutation, useGetGithubReposQuery } from '../../api/projectsApi'
import { type ProjectCreateFormValues, createProjectCreateSchema } from '../../lib/schemas'
import { ExcludePatternsInput } from '../ExcludePatternsInput'
import { RepoCombobox } from '../RepoCombobox'
import { WebhookSecretModal } from '../WebhookSecretModal'
import styles from './NewRepositoryPage.module.css'

interface CreatedProjectSecret {
  webhook_secret: string
  webhook_url: string
}

export function NewRepositoryPage() {
  const { t } = useTranslation(['repositories', 'teams'])
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const {
    data: me,
    isLoading: isMeLoading,
    isFetching: isMeFetching,
  } = useGetMeQuery(undefined, {
    refetchOnMountOrArgChange: true,
    refetchOnFocus: true,
    refetchOnReconnect: true,
  })
  const { data: myTeam } = useGetMyTeamQuery(undefined, { skip: !me })
  const isTeamOwner = Boolean(myTeam && me && myTeam.owner_id === me.id)
  const githubLinked = Boolean(me?.github_linked)
  const isOnboardingFlow = searchParams.get('onboarding') === '1'
  const isGithubStatePending = isMeLoading || (isMeFetching && !me)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [secretModal, setSecretModal] = useState<CreatedProjectSecret | null>(null)
  const [assignToTeam, setAssignToTeam] = useState(false)
  const { data: repos = [], isLoading: isReposLoading } = useGetGithubReposQuery(undefined, {
    skip: !githubLinked,
  })
  const [createProject, { isLoading }] = useCreateProjectMutation()
  const {
    control,
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ProjectCreateFormValues>({
    resolver: zodResolver(createProjectCreateSchema()),
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
      const response = await createProject({
        ...values,
        team_id: isTeamOwner && assignToTeam && myTeam ? myTeam.id : null,
      }).unwrap()
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
      <Breadcrumbs
        className={styles.breadcrumb}
        items={[{ label: t('title'), to: '/repositories' }]}
        current={t('new_title')}
      />

      {!githubLinked ? (
        <EmptyState
          icon={FolderGit2}
          title={t('github_required_title')}
          description={t('github_required_description')}
          actions={
            <>
              <Button
                loading={isGithubStatePending}
                onClick={() => {
                  redirectToGithubConnect()
                }}
              >
                {t('connect_github')}
              </Button>
              <Button variant="secondary" onClick={() => void navigate('/repositories')}>
                {t('back_to_list')}
              </Button>
            </>
          }
        />
      ) : (
        <>
          <div className={styles.header}>
            <h1 className={styles.title}>{t('new_title')}</h1>
            <p className={styles.subtitle}>{t('new_subtitle')}</p>
          </div>

          {submitError ? (
            <InlineAlert className={styles.submitError}>{submitError}</InlineAlert>
          ) : null}

          <form
            className={styles.form}
            onSubmit={(event) => {
              void onSubmit(event)
            }}
            noValidate
          >
            {/* General */}
            <SectionCard label={t('section_general')}>
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
            </SectionCard>

            {/* Repositories */}
            <SectionCard label={t('section_repositories')}>
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
                  <ArrowRight size={14} />
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
                    placeholder={t('branch_placeholder')}
                    error={Boolean(errors.source_branch)}
                    {...register('source_branch')}
                  />
                </Field>

                <div className={styles.rowArrow} aria-hidden>
                  <ArrowRight size={14} />
                </div>

                <Field
                  label={t('target_branch_label')}
                  htmlFor="target-branch"
                  error={errors.target_branch?.message}
                  required
                >
                  <Input
                    id="target-branch"
                    placeholder={t('branch_placeholder')}
                    error={Boolean(errors.target_branch)}
                    {...register('target_branch')}
                  />
                </Field>
              </div>
            </SectionCard>

            {/* Filters */}
            <SectionCard label={t('section_filters')}>
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
            </SectionCard>

            {/* Team assignment — visible only to team owner */}
            {isTeamOwner && myTeam && (
              <SectionCard label={t('teams:team_badge')}>
                <label className={styles.teamToggle}>
                  <input
                    type="checkbox"
                    className={styles.teamToggleCheckbox}
                    checked={assignToTeam}
                    onChange={(e) => setAssignToTeam(e.target.checked)}
                  />
                  <span className={styles.teamToggleText}>
                    <span className={styles.teamToggleLabel}>
                      {t('teams:assign_to_team_label', { name: myTeam.name })}
                    </span>
                    <span className={styles.teamToggleHint}>{t('teams:assign_to_team_hint')}</span>
                  </span>
                </label>
              </SectionCard>
            )}

            <div className={styles.footer}>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => void navigate('/repositories')}
                type="button"
              >
                {t('cancel_create')}
              </Button>
              <Button size="sm" loading={isLoading} type="submit">
                {t('save_project')}
              </Button>
            </div>
          </form>
        </>
      )}

      {secretModal ? (
        <WebhookSecretModal
          open
          webhookSecret={secretModal.webhook_secret}
          webhookUrl={secretModal.webhook_url}
          onDone={() => {
            setSecretModal(null)
            if (isOnboardingFlow) {
              markOnboardingCompleted(me?.id)
              void navigate('/repositories', { replace: true })
              return
            }

            void navigate('/repositories')
          }}
        />
      ) : null}
    </section>
  )
}
