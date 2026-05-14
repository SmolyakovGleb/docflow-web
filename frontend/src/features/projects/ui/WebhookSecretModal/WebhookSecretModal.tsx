import { useTranslation } from 'react-i18next'
import { translateApiError } from '@/shared/lib/errorMessages'
import { Button } from '@/shared/ui/Button/Button'
import { CopyField } from '@/shared/ui/CopyField/CopyField'
import { DialogShell } from '@/shared/ui/DialogShell/DialogShell'
import { toast } from '@/shared/ui/Toast/toast'
import styles from './WebhookSecretModal.module.css'

interface WebhookSecretModalProps {
  open: boolean
  webhookSecret: string
  webhookUrl: string
  onDone: () => void
}

export function WebhookSecretModal({
  open,
  webhookSecret,
  webhookUrl,
  onDone,
}: WebhookSecretModalProps) {
  const { t } = useTranslation('repositories')

  return (
    <DialogShell
      open={open}
      title={t('secret_modal_title')}
      size="md"
      preventClose
      overlayTestId="webhook-secret-overlay"
      overlayClassName={styles.overlay}
      contentClassName={styles.content}
      headerClassName={styles.header}
      titleClassName={styles.title}
      bodyClassName={styles.body}
      footerClassName={styles.footer}
      footer={
        <Button size="sm" onClick={onDone}>
          {t('done')}
        </Button>
      }
    >
      <div className={styles.warning}>
        <svg
          className={styles.warningIcon}
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          width={14}
          height={14}
        >
          <path d="M8 3l6 10H2L8 3z" />
          <path d="M8 7v3" />
          <circle cx="8" cy="12.5" r="0.5" fill="currentColor" />
        </svg>
        <div className={styles.warningText}>
          <strong>{t('secret_modal_warning')}</strong> {t('secret_modal_description')}
        </div>
      </div>

      <div className={styles.fieldGroup}>
        <div className={styles.fieldLabel}>{t('secret_label')}</div>
        <CopyField
          value={webhookSecret}
          valueDisplay="input"
          buttonLabel={t('copy_secret')}
          onCopySuccess={() => toast.success(t('secret_copy_success'))}
          onCopyError={(error) => toast.error(translateApiError(error))}
        />
      </div>

      <div className={styles.fieldGroup}>
        <div className={styles.fieldLabel}>{t('webhook_url_label')}</div>
        <CopyField
          value={webhookUrl}
          valueDisplay="input"
          buttonLabel={t('copy_webhook_url')}
          onCopySuccess={() => toast.success(t('url_copy_success'))}
          onCopyError={(error) => toast.error(translateApiError(error))}
        />
      </div>

      <div className={styles.stepsSection}>
        <div className={styles.stepsTitle}>{t('webhook_steps_title')}</div>
        <div className={styles.steps}>
          {[1, 2, 3, 4, 5].map((step) => (
            <div key={step} className={styles.step}>
              <div className={styles.stepNum}>{step}</div>
              <div className={styles.stepText}>{t(`webhook_step_${step}`)}</div>
            </div>
          ))}
        </div>
      </div>
    </DialogShell>
  )
}
