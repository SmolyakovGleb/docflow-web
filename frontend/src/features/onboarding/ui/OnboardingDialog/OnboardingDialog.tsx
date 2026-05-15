import { ArrowRight, ArrowUpFromLine, FolderGit2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/shared/ui/Button/Button'
import { GitHubMark } from '@/shared/ui/GitHubMark/GitHubMark'
import { DialogShell } from '@/shared/ui/DialogShell/DialogShell'
import { SectionCard } from '@/shared/ui/SectionCard/SectionCard'
import styles from './OnboardingDialog.module.css'

type OnboardingStep = 1 | 2

interface OnboardingDialogProps {
  open: boolean
  step: OnboardingStep
  onSkip: () => void
  onConnectGithub: () => void
  onCreateProject: () => void
}

const TOTAL_STEPS = 3

export function OnboardingDialog({
  open,
  step,
  onSkip,
  onConnectGithub,
  onCreateProject,
}: OnboardingDialogProps) {
  const { t } = useTranslation('onboarding')
  const currentStep =
    step === 1
      ? {
          titleKey: 'steps.connect.title',
          descriptionKey: 'steps.connect.description',
          noteKey: 'steps.connect.note',
          actionKey: 'steps.connect.action',
          action: onConnectGithub,
        }
      : {
          titleKey: 'steps.project.title',
          descriptionKey: 'steps.project.description',
          noteKey: 'steps.project.note',
          actionKey: 'steps.project.action',
          action: onCreateProject,
        }

  return (
    <DialogShell
      open={open}
      title={t('title')}
      description={t('description')}
      size="md"
      preventClose
      overlayClassName={styles.overlay}
      contentClassName={styles.content}
      headerClassName={styles.header}
      titleClassName={styles.title}
      descriptionClassName={styles.description}
      bodyClassName={styles.body}
      footerClassName={styles.footer}
      footer={
        <>
          <Button variant="ghost" onClick={onSkip}>
            {t('skip')}
          </Button>
          <Button iconRight={<ArrowRight size={14} />} onClick={currentStep.action}>
            {t(currentStep.actionKey)}
          </Button>
        </>
      }
    >
      <div className={styles.stepper} aria-label={t('stepper_label')}>
        {[1, 2, 3].map((stepNumber) => {
          const state = stepNumber < step ? 'done' : stepNumber === step ? 'active' : 'upcoming'

          return (
            <div key={stepNumber} className={styles.stepperItem}>
              <div className={styles.stepperNodeWrap}>
                <div
                  className={styles.stepperNode}
                  data-state={state}
                  aria-current={stepNumber === step ? 'step' : undefined}
                >
                  {stepNumber === 1 ? (
                    <GitHubMark size={14} />
                  ) : stepNumber === 2 ? (
                    <FolderGit2 size={14} />
                  ) : (
                    <ArrowUpFromLine size={14} />
                  )}
                </div>
                {stepNumber < TOTAL_STEPS ? (
                  <div
                    className={styles.stepperLine}
                    data-state={stepNumber < step ? 'done' : 'upcoming'}
                  />
                ) : null}
              </div>
              <div className={styles.stepperText}>
                <div className={styles.stepperLabel}>{t(`stepper.step_${stepNumber}`)}</div>
              </div>
            </div>
          )
        })}
      </div>

      <SectionCard
        className={styles.card}
        label={t('step_label', { current: step, total: TOTAL_STEPS })}
        contentClassName={styles.cardContent}
      >
        <div className={styles.stepHeader}>
          <div className={styles.iconBadge} aria-hidden>
            {step === 1 ? <GitHubMark size={18} /> : <FolderGit2 size={18} />}
          </div>
          <div className={styles.stepTextBlock}>
            <h2 className={styles.cardTitle}>{t(currentStep.titleKey)}</h2>
            <p className={styles.cardDescription}>{t(currentStep.descriptionKey)}</p>
          </div>
        </div>

        <div className={styles.note}>
          <div className={styles.noteTitle}>{t('next_title')}</div>
          <p className={styles.noteText}>{t(currentStep.noteKey)}</p>
        </div>
      </SectionCard>
    </DialogShell>
  )
}
